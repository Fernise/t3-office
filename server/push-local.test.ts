/** Local Node API Web Push scenarios: synthetic accounts, temporary SQLite state, fake push service (no network, no secrets). */
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { createBuildingHandler } from './building.ts';
import { b64u } from '../src/webpush.ts';

async function vapid() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']) as unknown as { publicKey: CryptoKey; privateKey: CryptoKey };
  return { publicKey: b64u(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey) as ArrayBuffer)), privateKey: (await crypto.subtle.exportKey('jwk', pair.privateKey)).d!, subject: 'mailto:ops@example.test' };
}
async function browserKeys() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as unknown as { publicKey: CryptoKey };
  return { p256dh: b64u(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey) as ArrayBuffer)), auth: b64u(crypto.getRandomValues(new Uint8Array(16))) };
}
async function fixture(configured = true) {
  let clock = Date.now(), status = 201, onSend: (() => Promise<void>) | null = null;
  const calls: { url: string; body: Uint8Array }[] = [];
  const api = createBuildingHandler({ dbPath: ':memory:', now: () => clock, push: { vapid: configured ? await vapid() : null, transport: async (req) => { calls.push({ url: req.url, body: new Uint8Array(await req.arrayBuffer()) }); await onSend?.(); return new Response(null, { status }); }, timeoutMs: 500 } });
  const server = createServer(api.handle); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  type Client = { cookie?: string };
  const request = async (path: string, method = 'GET', input?: unknown, client: Client = {}, extra: Record<string, string> = {}) => {
    const headers: Record<string, string> = { ...(input === undefined ? {} : { 'content-type': 'application/json' }), ...extra };
    if (client.cookie) headers.cookie = client.cookie;
    const res = await fetch(`${base}/api/building${path}`, { method, headers, body: input === undefined ? undefined : JSON.stringify(input) });
    const data = await res.json() as any; const cookie = res.headers.get('set-cookie'); if (cookie && !/Max-Age=0/i.test(cookie)) client.cookie = cookie.split(';')[0];
    return { status: res.status, data };
  };
  const register = async (handle: string) => { const client: Client = {}; const r = await request('/register', 'POST', { handle, name: handle, password: 'correct-horse-battery' }, client); assert.equal(r.status, 201); return { client, user: r.data.user as { id: string }, office: r.data.office as { id: string } }; };
  const until = async (fn: () => boolean) => { const t = Date.now(); while (!fn()) { if (Date.now() - t > 3000) throw new Error('timed out'); await new Promise((r) => setTimeout(r, 15)); } };
  return { request, register, calls, until, quiet: () => new Promise((r) => setTimeout(r, 200)), advance: (ms: number) => { clock += ms; }, setStatus: (s: number) => { status = s; }, onSend: (fn: (() => Promise<void>) | null) => { onSend = fn; }, close: async () => { server.closeAllConnections(); await new Promise((r) => server.close(r)); api.close(); } };
}
const ep = (n: string) => `https://fcm.googleapis.com/fcm/send/local-${n}`;

test('local push: opt-in validation, generic alerts, baseline, cooldown and account scoping', async () => {
  const f = await fixture();
  try {
    const owner = await f.register('owner'), guest = await f.register('guest'), other = await f.register('other');
    const sub = async (who: typeof owner, endpoint: unknown, extra = {}) => f.request('/push/subscriptions', 'POST', { endpoint, keys: await browserKeys(), ...extra }, who.client);
    const key = (await f.request('/publisher-tokens', 'POST', {}, owner.client)).data.token as string;
    const publish = (agents: [string, string][]) => f.request('/publish', 'POST', { agents: agents.map(([id, status]) => ({ id, provider: 'codex', status, title: 'NEVER_SHARE' })) }, {}, { authorization: 'Bearer ' + key });
    assert.equal((await f.request('/push/config', 'GET', undefined, {})).status, 401);
    assert.equal((await f.request('/push/config', 'GET', undefined, {}, { authorization: 'Bearer ' + key })).status, 401);
    assert.equal((await f.request('/push/subscriptions', 'POST', { endpoint: ep('k'), keys: await browserKeys() }, {}, { authorization: 'Bearer ' + key })).status, 401);
    assert.deepEqual((await f.request('/push/config', 'GET', undefined, owner.client)).data.subscriptions, 0);
    for (const bad of ['http://fcm.googleapis.com/x', 'https://127.0.0.1/x', 'https://localhost/x', 'https://169.254.169.254/x', 'https://fcm.googleapis.com.evil.test/x', 5, null]) assert.equal((await sub(owner, bad)).status, 400, String(bad));
    assert.equal((await sub(owner, ep('a'), { actorId: other.user.id })).status, 409);
    assert.equal((await f.request('/push/subscriptions', 'POST', { endpoint: ep('a'), keys: { p256dh: 'AAAA', auth: 'AAAA' } }, owner.client)).status, 400);
    assert.equal((await f.request('/push/subscriptions', 'POST', { endpoint: ep('a'), keys: await browserKeys() }, owner.client, { origin: 'https://evil.test' })).status, 403);
    const A = ep('a'), originalKeys = await browserKeys(); assert.equal((await f.request('/push/subscriptions', 'POST', { endpoint: A, keys: originalKeys }, owner.client)).status, 200);
    for (let i = 0; i < 4; i++) assert.equal((await sub(owner, ep('x' + i))).status, 200);
    assert.equal((await sub(owner, ep('over'))).status, 409);
    for (let i = 0; i < 4; i++) await f.request('/push/subscriptions', 'DELETE', { endpoint: ep('x' + i) }, owner.client);
    // baseline / unchanged / new agent: silent; a real change: one generic push
    await publish([['a1', 'running']]); await publish([['a1', 'running'], ['a2', 'waiting']]); await publish([['a1', 'running'], ['a2', 'waiting']]); await f.quiet(); assert.equal(f.calls.length, 0);
    await publish([['a1', 'waiting'], ['a2', 'waiting']]); await f.until(() => f.calls.length === 1);
    assert.equal(f.calls[0].url, A); assert.ok(f.calls[0].body.length < 200); assert.ok(!Buffer.from(f.calls[0].body).toString('latin1').includes('a1'));
    await publish([['a1', 'running'], ['a2', 'waiting']]); await publish([['a1', 'failed'], ['a2', 'waiting']]); await f.quiet(); assert.equal(f.calls.length, 1, 'cooldown coalesces');
    f.advance(61_000); await publish([['a1', 'running'], ['a2', 'waiting']]); await publish([['a1', 'failed'], ['a2', 'waiting']]); await f.until(() => f.calls.length === 2);
    // reconnect after stale snapshot is baseline only
    f.advance(120_000); await publish([['a1', 'running'], ['a2', 'failed']]); await f.quiet(); assert.equal(f.calls.length, 2);
    // guest with an activity grant gets nothing; cannot remove the owner's subscription; account switch moves the endpoint
    const inv = await f.request('/invites', 'POST', { scope: 'activity' }, owner.client); await f.request('/accept', 'POST', { token: inv.data.token }, guest.client);
    const G = ep('guest'); await sub(guest, G); f.advance(61_000); await publish([['a1', 'running'], ['a2', 'failed']]); await publish([['a1', 'waiting'], ['a2', 'failed']]); await f.until(() => f.calls.length === 3); assert.ok(f.calls.every((c) => c.url !== G));
    await f.request('/push/subscriptions', 'DELETE', { endpoint: A }, guest.client); assert.equal((await f.request('/push/config', 'GET', undefined, owner.client)).data.subscriptions, 1);
    f.calls.length = 0; assert.equal((await sub(other, A)).status, 409, 'endpoint URL alone cannot transfer another browser subscription'); assert.equal((await f.request('/push/subscriptions', 'POST', { endpoint: A, keys: originalKeys }, other.client)).status, 200); f.advance(61_000); await publish([['a1', 'running'], ['a2', 'failed']]); await publish([['a1', 'waiting'], ['a2', 'failed']]); await f.quiet(); assert.equal(f.calls.length, 0, 'previous account no longer pushes to the switched browser');
    await f.request('/push/subscriptions', 'DELETE', { endpoint: A }, other.client); await f.request('/push/subscriptions', 'DELETE', { endpoint: G }, guest.client);
  } finally { await f.close(); }
});

test('local push: expiry removal, delivery rechecks and logout cleanup', async () => {
  const f = await fixture();
  try {
    const owner = await f.register('owner'); const key = (await f.request('/publisher-tokens', 'POST', {}, owner.client)).data as { id: string; token: string };
    const publish = (agents: [string, string][]) => f.request('/publish', 'POST', { agents: agents.map(([id, status]) => ({ id, provider: 'codex', status })) }, {}, { authorization: 'Bearer ' + key.token });
    const subs = async () => (await f.request('/push/config', 'GET', undefined, owner.client)).data.subscriptions as number;
    const swing = async () => { f.advance(61_000); await publish([['a', 'running']]); await publish([['a', 'waiting']]); };
    for (const [code, kept] of [[410, 0], [404, 0], [400, 1], [401, 1], [403, 1], [413, 1], [503, 1]] as const) {
      f.calls.length = 0; f.setStatus(code); await f.request('/push/subscriptions', 'POST', { endpoint: ep('s' + code), keys: await browserKeys() }, owner.client); await swing(); await f.until(() => f.calls.length >= (code === 503 ? 2 : 1)); await f.quiet();
      assert.equal(await subs(), kept, String(code)); assert.equal(f.calls.length, code === 503 ? 2 : 1); await f.request('/push/subscriptions', 'DELETE', { endpoint: ep('s' + code) }, owner.client);
    }
    f.setStatus(201);
    for (const e of ['p1', 'p2']) await f.request('/push/subscriptions', 'POST', { endpoint: ep(e), keys: await browserKeys() }, owner.client);
    f.calls.length = 0; f.onSend(async () => { f.onSend(null); await f.request('/office', 'POST', { paused: true }, owner.client); }); await swing(); await f.until(() => f.calls.length >= 1); await f.quiet(); assert.equal(f.calls.length, 1, 'pause stops later sends');
    await f.request('/office', 'POST', { paused: false }, owner.client);
    f.calls.length = 0; f.onSend(async () => { f.onSend(null); await f.request('/publisher-tokens/' + key.id, 'DELETE', {}, owner.client); }); await swing(); await f.until(() => f.calls.length >= 1); await f.quiet(); assert.equal(f.calls.length, 1, 'key revocation stops later sends');
    const key2 = (await f.request('/publisher-tokens', 'POST', {}, owner.client)).data.token; key.token = key2;
    f.calls.length = 0; f.advance(61_000); await publish([['a', 'running']]); await f.request('/logout', 'POST', {}, owner.client); await publish([['a', 'waiting']]); await f.quiet(); assert.equal(f.calls.length, 0);
  } finally { await f.close(); }
});

test('local push: unconfigured server is unsupported and refuses subscriptions', async () => {
  const f = await fixture(false);
  try {
    const owner = await f.register('solo');
    assert.deepEqual((await f.request('/push/config', 'GET', undefined, owner.client)).data, { enabled: false, publicKey: null, subscriptions: 0 });
    assert.equal((await f.request('/push/subscriptions', 'POST', { endpoint: ep('z'), keys: await browserKeys() }, owner.client)).status, 503);
  } finally { await f.close(); }
});

test('local push: attention bypasses an informational completion cooldown', async () => {
 const f=await fixture();try {
  const owner=await f.register('priority');
  const key=(await f.request('/publisher-tokens','POST',{},owner.client)).data as {token:string};
  await f.request('/push/subscriptions','POST',{endpoint:ep('priority'),keys:await browserKeys(),finished:true},owner.client);
  const publish=(status:string)=>f.request('/publish','POST',{agents:[{id:'p',provider:'codex',status}]},{},{authorization:'Bearer '+key.token});
  await publish('running');await publish('completed');await f.until(()=>f.calls.length===1);await publish('failed');await f.until(()=>f.calls.length===2);assert.equal(f.calls.length,2);
 }finally{await f.close();}
});
