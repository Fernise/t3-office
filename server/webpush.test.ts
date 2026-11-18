import { test } from 'node:test';
import assert from 'node:assert/strict';
import { b64u, unb64u, encryptPayload, isAllowedPushEndpoint, validateSubscriptionKeys, vapidFrom, vapidAuthorization, validateVapid, sendPush } from '../src/webpush.ts';
import { transitions } from '../src/alert-rules.ts';

const RFC = {
  plain: 'When I grow up, I want to be a watermelon', auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  uaPublic: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw', asPublic: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8', salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  expected: 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN'
};
test('encryption reproduces the RFC 8291 section 5 vector', async () => {
  const out = await encryptPayload(new TextEncoder().encode(RFC.plain), { p256dh: RFC.uaPublic, auth: RFC.auth }, { salt: unb64u(RFC.salt), privateKey: unb64u(RFC.asPrivate), publicKey: unb64u(RFC.asPublic) });
  assert.equal(b64u(out), RFC.expected);
});
test('endpoint allowlist accepts browser push services only', () => {
  for (const ok of ['https://fcm.googleapis.com/fcm/send/abc', 'https://updates.push.services.mozilla.com/wpush/v2/abc', 'https://web.push.apple.com/QAbc', 'https://wns2-par02p.notify.windows.com/w/?token=x', 'https://a.push.services.mozilla.com/x']) assert.equal(isAllowedPushEndpoint(ok), true, ok);
  for (const bad of ['http://fcm.googleapis.com/x', 'https://127.0.0.1/x', 'https://localhost/x', 'https://[::1]/x', 'https://169.254.169.254/x', 'https://fcm.googleapis.com.evil.test/x', 'https://evilfcm.googleapis.com/x', 'https://evil.com/fcm.googleapis.com', 'https://user:pw@fcm.googleapis.com/x', 'https://fcm.googleapis.com:8443/x', 'https://fcm.googleapis.com\\@evil.test/x', 'https://notify.windows.com/x', 'https://push.apple.com/x', 'https://fcm.googleapis.com./x', 'ftp://fcm.googleapis.com/x', '', 'https://fcm.googleapis.com/x y', 42 as unknown as string, 'https://fcm.googleapis.com/' + 'a'.repeat(1100)]) assert.equal(isAllowedPushEndpoint(bad), false, String(bad).slice(0, 60));
});
test('subscription keys must be a real P-256 point and a 16-byte secret', async () => {
  assert.ok(await validateSubscriptionKeys({ p256dh: RFC.uaPublic, auth: RFC.auth }));
  const offCurve = b64u(Uint8Array.from([4, ...new Uint8Array(64).fill(1)]));
  for (const keys of [null, {}, { p256dh: offCurve, auth: RFC.auth }, { p256dh: RFC.uaPublic, auth: 'AAAA' }, { p256dh: 'AAAA', auth: RFC.auth }, { p256dh: 5, auth: RFC.auth }]) assert.equal(await validateSubscriptionKeys(keys), null);
});
async function vapidPair() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']) as unknown as { publicKey: CryptoKey; privateKey: CryptoKey };
  const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  return { pair, vapid: { publicKey: b64u(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))), privateKey: jwk.d!, subject: 'mailto:ops@example.test' } };
}
test('VAPID header is a verifiable ES256 JWT bound to the push origin', async () => {
  const { pair, vapid } = await vapidPair();
  const header = await vapidAuthorization('https://fcm.googleapis.com/fcm/send/x', vapid, 1_000_000_000_000);
  const m = header.match(/^vapid t=([\w-]+)\.([\w-]+)\.([\w-]+), k=([\w-]+)$/)!;
  assert.ok(m); assert.equal(m[4], vapid.publicKey);
  const claims = JSON.parse(new TextDecoder().decode(unb64u(m[2])));
  assert.deepEqual(claims, { aud: 'https://fcm.googleapis.com', exp: 1_000_000_000 + 43200, sub: 'mailto:ops@example.test' });
  assert.ok(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pair.publicKey, unb64u(m[3]) as Uint8Array<ArrayBuffer>, new TextEncoder().encode(`${m[1]}.${m[2]}`)));
  assert.equal(vapidFrom({}), null); assert.equal(vapidFrom({ VAPID_PUBLIC_KEY: vapid.publicKey, VAPID_PRIVATE_KEY: vapid.privateKey, VAPID_SUBJECT: 'ops@example.test' }), null);
  assert.ok(vapidFrom({ VAPID_PUBLIC_KEY: vapid.publicKey, VAPID_PRIVATE_KEY: vapid.privateKey, VAPID_SUBJECT: 'mailto:ops@example.test' }));
});
test('delivery is bounded: no redirects followed, expiry reported, one retry, internal endpoints never fetched', async () => {
  const { vapid } = await vapidPair(), target = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: RFC.uaPublic, auth: RFC.auth } };
  const calls: Request[] = [];
  const reply = (...statuses: (number | 'throw')[]) => async (r: Request) => { calls.push(r); const s = statuses[Math.min(calls.length - 1, statuses.length - 1)]; if (s === 'throw') throw new Error('network'); return new Response(null, { status: s as number }); };
  assert.equal(await sendPush(target, 'attention', vapid, reply(201)), 'sent');
  assert.equal(calls[0].redirect, 'manual'); assert.equal(calls[0].headers.get('content-encoding'), 'aes128gcm'); assert.equal(calls[0].headers.get('topic'), 'office-attention');
  const sentBody = new Uint8Array(await calls[0].arrayBuffer()); assert.ok(sentBody.length < 200); assert.ok(!new TextDecoder('latin1').decode(sentBody).includes('attention'));
  for (const [status, outcome] of [[410, 'gone'], [404, 'gone'], [400, 'misconfigured'], [401, 'misconfigured'], [403, 'misconfigured'], [413, 'misconfigured'], [302, 'misconfigured'], [301, 'misconfigured']] as const) { calls.length = 0; assert.equal(await sendPush(target, 'attention', vapid, reply(status)), outcome); assert.equal(calls.length, 1); }
  calls.length = 0; assert.equal(await sendPush(target, 'attention', vapid, reply(503, 201)), 'sent'); assert.equal(calls.length, 2);
  calls.length = 0; assert.equal(await sendPush(target, 'attention', vapid, reply(500)), 'retry'); assert.equal(calls.length, 2);
  calls.length = 0; assert.equal(await sendPush(target, 'attention', vapid, reply('throw')), 'retry'); assert.equal(calls.length, 2);
  calls.length = 0; assert.equal(await sendPush({ ...target, endpoint: 'https://169.254.169.254/latest' }, 'attention', vapid, reply(201)), 'rejected'); assert.equal(calls.length, 0);
  calls.length = 0; const slow = async (r: Request) => { calls.push(r); return new Promise<Response>((_, reject) => r.signal.addEventListener('abort', () => reject(new Error('aborted')))); };
  const t0 = Date.now(); assert.equal(await sendPush(target, 'attention', vapid, slow, { timeoutMs: 40 }), 'retry'); assert.ok(Date.now() - t0 < 1500);
});
test('alert transitions: initial/reconnect baselines, new agents and repeats never alert', () => {
  const s = (...a: [string, string][]) => a.map(([id, status]) => ({ id, status }));
  assert.deepEqual(transitions(null, s(['a', 'waiting'])), { attention: false, finished: false });
  assert.deepEqual(transitions(s(['a', 'running']), s(['a', 'running'], ['b', 'waiting'])), { attention: false, finished: false });
  assert.deepEqual(transitions(s(['a', 'running']), s(['a', 'waiting'])), { attention: true, finished: false });
  assert.deepEqual(transitions(s(['a', 'running']), s(['a', 'failed'])), { attention: true, finished: false });
  assert.deepEqual(transitions(s(['a', 'waiting']), s(['a', 'waiting'])), { attention: false, finished: false });
  assert.deepEqual(transitions(s(['a', 'running']), s(['a', 'completed'])), { attention: false, finished: true });
  assert.deepEqual(transitions(s(['a', 'waiting']), s(['a', 'running'])), { attention: false, finished: false });
  assert.deepEqual(transitions(s(['a', 'running']), []), { attention: false, finished: false });
});

test('delivery rechecks authorization before retrying', async () => {
  const pair = await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
  const signing = await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign']);
  const privateKey = await crypto.subtle.exportKey('jwk',signing.privateKey);
  const vapid = {publicKey:b64u(new Uint8Array(await crypto.subtle.exportKey('raw',signing.publicKey))),privateKey:privateKey.d!,subject:'mailto:ops@example.test'};
  const target = {endpoint:'https://fcm.googleapis.com/fcm/send/retry-guard',keys:{p256dh:b64u(new Uint8Array(await crypto.subtle.exportKey('raw',pair.publicKey))),auth:b64u(new Uint8Array(16))}};
  let calls=0, allowed=true;
  const outcome=await sendPush(target,'attention',vapid,async()=>{calls++;allowed=false;return new Response(null,{status:503});},{authorized:()=>allowed});
  assert.equal(outcome,'cancelled');assert.equal(calls,1,'revoked consent cannot send a second request');
});

test('mismatched VAPID keys are rejected before network delivery', async () => {
 const a=(await vapidPair()).vapid,b=(await vapidPair()).vapid;
 assert.equal(await validateVapid(a),true);
 const mismatched={...a,privateKey:b.privateKey};assert.equal(await validateVapid(mismatched),false);
 let calls=0;assert.equal(await sendPush({endpoint:'https://fcm.googleapis.com/fcm/send/bad-config',keys:{p256dh:RFC.uaPublic,auth:RFC.auth}},'attention',mismatched,async()=>{calls++;return new Response(null,{status:201});}),'misconfigured');assert.equal(calls,0);
});
