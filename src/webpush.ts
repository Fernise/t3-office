/** Web Push primitives on WebCrypto only (Workers and Node): RFC 8291 aes128gcm encryption, RFC 8292 VAPID, endpoint allowlist. No DOM or Node imports. */
const enc = new TextEncoder();
export const b64u = (bytes: Uint8Array): string => { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
export function unb64u(value: string): Uint8Array {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]*$/.test(value) || value.length % 4 === 1) throw new Error('Invalid base64url.');
  const s = atob(value.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((value.length + 3) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}
const cat = (...parts: Uint8Array[]): Uint8Array => { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let i = 0; for (const p of parts) { out.set(p, i); i += p.length; } return out; };
const bytes = (v: ArrayBuffer | Uint8Array): Uint8Array<ArrayBuffer> => new Uint8Array(v instanceof Uint8Array ? v : new Uint8Array(v)) as Uint8Array<ArrayBuffer>;

/** Browser push services only. Exact hosts or a dot-bounded suffix; HTTPS on 443, no credentials. Everything else (IPs, localhost, internal names) is refused before any request is made. */
const PUSH_HOSTS = ['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com'];
const PUSH_SUFFIXES = ['.push.services.mozilla.com', '.push.apple.com', '.notify.windows.com'];
export function isAllowedPushEndpoint(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 1024 || /[\u0000- \u007f\\]/.test(value)) return false;
  let url: URL;
  try { url = new URL(value); } catch { return false; }
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || url.hash) return false;
  const host = url.hostname.toLowerCase();
  if (host.endsWith('.')) return false;
  return PUSH_HOSTS.includes(host) || PUSH_SUFFIXES.some((s) => host.length > s.length && host.endsWith(s) && !host.slice(0, -s.length).includes('..'));
}
export interface PushKeys { p256dh: string; auth: string }
/** Validates the browser-supplied key material: 65-byte uncompressed P-256 point actually on the curve, 16-byte auth secret. */
export async function validateSubscriptionKeys(keys: unknown): Promise<PushKeys | null> {
  if (!keys || typeof keys !== 'object') return null;
  const { p256dh, auth } = keys as Record<string, unknown>;
  try {
    if (typeof p256dh !== 'string' || typeof auth !== 'string') return null;
    const point = unb64u(p256dh), secret = unb64u(auth);
    if (point.length !== 65 || point[0] !== 4 || secret.length !== 16) return null;
    await crypto.subtle.importKey('raw', bytes(point), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
    return { p256dh, auth };
  } catch { return null; }
}

const hkdf = async (ikm: Uint8Array, salt: Uint8Array, info: Uint8Array, bits: number) => bytes(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: bytes(salt), info: bytes(info) }, await crypto.subtle.importKey('raw', bytes(ikm), 'HKDF', false, ['deriveBits']), bits));
const importPrivate = async (d: Uint8Array, pub: Uint8Array, algorithm: 'ECDH' | 'ECDSA') => crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', d: b64u(d), x: b64u(pub.slice(1, 33)), y: b64u(pub.slice(33, 65)), ext: true }, { name: algorithm, namedCurve: 'P-256' }, false, algorithm === 'ECDH' ? ['deriveBits'] : ['sign']);

/** RFC 8291 section 3-4: a single aes128gcm record. `fixed` is for the RFC test vector only. */
export async function encryptPayload(plaintext: Uint8Array, keys: PushKeys, fixed?: { salt: Uint8Array; privateKey: Uint8Array; publicKey: Uint8Array }): Promise<Uint8Array> {
  if (plaintext.length > 3000) throw new Error('Payload too large.');
  const ua = unb64u(keys.p256dh), auth = unb64u(keys.auth);
  let asPublic: Uint8Array, asPrivate: CryptoKey;
  if (fixed) { asPublic = fixed.publicKey; asPrivate = await importPrivate(fixed.privateKey, fixed.publicKey, 'ECDH'); }
  else { const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as unknown as { publicKey: CryptoKey; privateKey: CryptoKey }; asPublic = bytes(await crypto.subtle.exportKey('raw', pair.publicKey) as ArrayBuffer); asPrivate = pair.privateKey; }
  const uaKey = await crypto.subtle.importKey('raw', bytes(ua), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const secret = bytes(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey } as never, asPrivate, 256));
  const ikm = await hkdf(secret, auth, cat(enc.encode('WebPush: info\0'), ua, asPublic), 256);
  const salt = fixed?.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(ikm, salt, enc.encode('Content-Encoding: aes128gcm\0'), 128), nonce = await hkdf(ikm, salt, enc.encode('Content-Encoding: nonce\0'), 96);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const body = bytes(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, bytes(cat(plaintext, Uint8Array.of(2)))));
  const header = new Uint8Array(21); header.set(salt, 0); new DataView(header.buffer).setUint32(16, 4096); header[20] = 65;
  return cat(header, asPublic, body);
}

export interface Vapid { publicKey: string; privateKey: string; subject: string }
/** True when the three deployment secrets are present and well-formed; otherwise Web Push stays disabled rather than failing at send time. */
export function vapidFrom(env: { VAPID_PUBLIC_KEY?: string; VAPID_PRIVATE_KEY?: string; VAPID_SUBJECT?: string }): Vapid | null {
  try {
    const { VAPID_PUBLIC_KEY: publicKey, VAPID_PRIVATE_KEY: privateKey, VAPID_SUBJECT: subject } = env;
    if (!publicKey || !privateKey || !subject || unb64u(publicKey).length !== 65 || unb64u(privateKey).length !== 32 || !/^(mailto:[^\s@]+@[^\s@]+|https:\/\/[^\s/]+[^\s]*)$/.test(subject)) return null;
    return { publicKey, privateKey, subject };
  } catch { return null; }
}
const checkedVapid = new WeakMap<Vapid, Promise<boolean>>();
/** Validate the configured pair by signing and verifying locally. A malformed/mismatched setup never sends. */
export function validateVapid(vapid: Vapid): Promise<boolean> {
  let checked = checkedVapid.get(vapid);
  if (!checked) {
    checked = (async () => {
      try {
        const pub = unb64u(vapid.publicKey), priv = unb64u(vapid.privateKey);
        const key = await importPrivate(priv, pub, 'ECDSA');
        const verify = await crypto.subtle.importKey('raw', bytes(pub), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
        const message = enc.encode('T3 Office VAPID configuration check');
        const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, message);
        return await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, verify, signature, message);
      } catch { return false; }
    })();
    checkedVapid.set(vapid, checked);
  }
  return checked;
}
/** RFC 8292 ES256 JWT (WebCrypto signs ECDSA as raw r||s, which is the JWS form) bound to the push service origin, valid 12 hours. */
export async function vapidAuthorization(endpoint: string, vapid: Vapid, nowMs = Date.now()): Promise<string> {
  const part = (v: unknown) => b64u(enc.encode(JSON.stringify(v)));
  const input = `${part({ typ: 'JWT', alg: 'ES256' })}.${part({ aud: new URL(endpoint).origin, exp: Math.floor(nowMs / 1000) + 12 * 3600, sub: vapid.subject })}`;
  const key = await importPrivate(unb64u(vapid.privateKey), unb64u(vapid.publicKey), 'ECDSA');
  const sig = bytes(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(input)));
  return `vapid t=${input}.${b64u(sig)}, k=${vapid.publicKey}`;
}

/** Generic, privacy-preserving payloads only: a kind from a fixed list, never task text, names, paths or provider data. */
export type PushKind = 'attention' | 'finished';
export const pushPayload = (kind: PushKind) => enc.encode(JSON.stringify({ v: 1, kind }));

export type PushOutcome = 'sent' | 'gone' | 'rejected' | 'retry' | 'cancelled' | 'misconfigured';
export interface PushTarget { endpoint: string; keys: PushKeys }
/**
 * One bounded delivery: endpoint re-validated, redirects never followed, 5-second timeout, one retry for 5xx/429/network errors.
 * 404/410 mean the subscription expired; other 4xx mean it is unusable. `transport` lets tests/Workers inject a Fetcher.
 */
export async function sendPush(target: PushTarget, kind: PushKind, vapid: Vapid, transport: (req: Request) => Promise<Response> = (r) => fetch(r), options: { timeoutMs?: number; attempts?: number; authorized?: () => Promise<boolean> | boolean } = {}): Promise<PushOutcome> {
  if (!isAllowedPushEndpoint(target.endpoint)) return 'rejected';
  if (!await validateVapid(vapid)) return 'misconfigured';
  const body = await encryptPayload(pushPayload(kind), target.keys);
  const attempts = options.attempts ?? 2;
  for (let i = 0; i < attempts; i++) {
    try {
      const request = new Request(target.endpoint, { method: 'POST', redirect: 'manual', body: bytes(body), headers: { 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: '600', Urgency: 'normal', Topic: 'office-attention', Authorization: await vapidAuthorization(target.endpoint, vapid) }, signal: AbortSignal.timeout(options.timeoutMs ?? 5000) });
      if (options.authorized && !await options.authorized()) return 'cancelled';
      const res = await transport(request);
      void res.body?.cancel().catch(() => {});
      if (res.status >= 200 && res.status < 300) return 'sent';
      if (res.status === 404 || res.status === 410) return 'gone';
      if (res.status === 429 || res.status >= 500) { if (i + 1 < attempts) await new Promise((r) => setTimeout(r, 250)); continue; }
      return 'misconfigured';
    } catch { if (i + 1 < attempts) await new Promise((r) => setTimeout(r, 250)); }
  }
  return 'retry';
}
