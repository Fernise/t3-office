/** `npm run home`: key storage, plain-language publish answers, loopback-only reader and a real Worker round trip. Synthetic data only (no T3 data is read). */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { explainPublish, saveKey, loadKey, keyIsPrivate, step, startLocalReader, KEY_PATTERN } from './home.mjs';
import { cloudFixture } from './cloud-test-harness.mjs';

const KEY = 'k'.repeat(43);

test('home: publish answers are explained and only a bad key stops the command', () => {
  assert.equal(explainPublish(200).ok, true);
  for (const [status, fatal, words] of [[401, true, /new key/], [409, false, /paused/], [429, false, /slow down/], [503, false, /maintenance/], [500, false, /HTTP 500/]]) {
    const r = explainPublish(status); assert.equal(r.ok, false); assert.equal(r.fatal, fatal, String(status)); assert.match(r.message, words);
  }
});

test('home: key is validated and stored owner-only', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'office-home-key-'));
  try {
    const file = join(dir, 'nested', 'publisher.key');
    await assert.rejects(saveKey(file, 'not-a-key'), /publisher key/);
    assert.equal(await loadKey(file), null);
    await saveKey(file, KEY); assert.equal(await loadKey(file), KEY); assert.ok(KEY_PATTERN.test(KEY));
    if (process.platform !== 'win32') { assert.equal((await stat(file)).mode & 0o777, 0o600); assert.equal((await stat(join(dir, 'nested'))).mode & 0o077, 0); assert.equal(await keyIsPrivate(file), true); }
    const loose = join(dir, 'loose.key'); await writeFile(loose, 'garbage\n', { mode: 0o644 });
    assert.equal(await loadKey(loose), null);
    if (process.platform !== 'win32') assert.equal(await keyIsPrivate(loose), false);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('home: local reader listens on loopback only and serves nothing but the T3 API', async () => {
  const reader = await startLocalReader();
  try {
    assert.equal(new URL(reader.url).hostname, '127.0.0.1');
    for (const path of ['/', '/index.html', '/api/building/session', '/.env']) assert.equal((await fetch(new URL(path, reader.url))).status, 404, path);
    assert.equal((await fetch(new URL('/api/t3/threads', reader.url), { method: 'POST' })).status, 404, 'read-only');
  } finally { await reader.close(); }
});

test('home: step publishes only filtered fields and explains failures (fake services)', async () => {
  const server = new URL('https://building.example/'), source = new URL('http://127.0.0.1:9/');
  const sent = [];
  const threads = { threads: [{ id: 'secret-thread-id', provider: 'codex', status: 'waiting', title: 'NEVER_SHARE', path: '/Users/x' }, { id: 't2', provider: 'nope', status: 'running' }] };
  const fetcher = (status) => async (url, init) => {
    if (String(url).startsWith(source.origin)) return new Response(JSON.stringify(threads), { status: 200 });
    sent.push(JSON.parse(init.body)); return new Response('{}', { status });
  };
  const ok = await step({ server, source, token: KEY, salt: 'salt', fetcher: fetcher(200) });
  assert.equal(ok.ok, true); assert.equal(ok.local.agents.length, 1);
  assert.deepEqual(Object.keys(sent[0].agents[0]).sort(), ['id', 'provider', 'status']); assert.ok(!JSON.stringify(sent).includes('NEVER_SHARE') && !JSON.stringify(sent).includes('secret-thread-id'));
  assert.equal((await step({ server, source, token: KEY, salt: 'salt', fetcher: fetcher(401) })).fatal, true);
  assert.equal((await step({ server, source, token: KEY, salt: 'salt', fetcher: fetcher(409) })).fatal, false);
  const down = await step({ server, source, token: KEY, salt: 'salt', fetcher: async (url) => { if (String(url).startsWith(source.origin)) throw new Error('no T3'); throw new Error('offline'); } });
  assert.equal(down.ok, false); assert.equal(down.fatal, false); assert.equal(down.local.available, false); assert.match(down.message, /reach the building server/);
});

test('home: real Worker round trip, paused office and revoked key', async () => {
  const f = await cloudFixture();
  try {
    const owner = f.jar(); const reg = await f.call(owner, '/register', 'POST', { handle: 'home_owner', name: 'Home', password: 'synthetic-cloud-password' });
    const key = (await f.call(owner, '/publisher-tokens', 'POST', {})).data;
    const server = new URL(f.origin + '/'), source = new URL('http://127.0.0.1:9/');
    const fetcher = async (url, init) => String(url).startsWith(source.origin)
      ? new Response(JSON.stringify({ threads: [{ id: 'h1', provider: 'claude', status: 'waiting' }, { id: 'h2', provider: 'codex', status: 'running' }] }))
      : f.mf.dispatchFetch(String(url), init);
    const first = await step({ server, source, token: key.token, salt: 'home-salt', fetcher });
    assert.equal(first.ok, true, first.message);
    const own = (await f.call(owner, '/floors')).data.floors.find((x) => x.isOwner);
    assert.equal(own.online, true); assert.equal(own.agentCount, 2);
    await f.call(owner, '/office', 'POST', { paused: true });
    const paused = await step({ server, source, token: key.token, salt: 'home-salt', fetcher }); assert.equal(paused.status, 409); assert.equal(paused.fatal, false);
    await f.call(owner, '/office', 'POST', { paused: false }); await f.db.prepare('DELETE FROM publish_rate').run();
    assert.equal((await step({ server, source, token: key.token, salt: 'home-salt', fetcher })).ok, true);
    await f.call(owner, `/publisher-tokens/${key.id}`, 'DELETE', {});
    const revoked = await step({ server, source, token: key.token, salt: 'home-salt', fetcher }); assert.equal(revoked.status, 401); assert.equal(revoked.fatal, true);
    assert.ok(reg.data.user.id);
  } finally { await f.close(); }
});
