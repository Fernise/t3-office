/** Local-server equivalent of cloud/push.ts: optional Web Push for the signed-in owner's own agent status changes, generic payloads only. */
import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { isAllowedPushEndpoint, validateSubscriptionKeys, vapidFrom, validateVapid, sendPush, type PushKind, type Vapid } from '../src/webpush.ts';
import { transitions, ALERT_COOLDOWN_MS, type AgentState } from '../src/alert-rules.ts';

export const MAX_SUBSCRIPTIONS = 5;
export interface PushOptions { vapid?: Vapid | null; transport?: (req: Request) => Promise<Response>; timeoutMs?: number }
type Body = Record<string, unknown>;
export interface PushRouteContext {
  route: string; method: string; user: { id: string }; session: string; body: () => Promise<Body>;
  /** True while the credential that made this request is still valid (re-evaluated, not cached). */
  live: () => boolean; reply: (status: number, data: unknown) => void; fail: (status: number, message: string) => never;
}
export function pushSupport(db: DatabaseSync, now: () => number, options: PushOptions = {}) {
  db.exec(`CREATE TABLE IF NOT EXISTS push_subscriptions(id TEXT PRIMARY KEY,endpoint TEXT NOT NULL UNIQUE,user TEXT NOT NULL REFERENCES users(id),session TEXT NOT NULL,p256dh TEXT NOT NULL,auth TEXT NOT NULL,finished INTEGER NOT NULL DEFAULT 0,created INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS push_user ON push_subscriptions(user);
    CREATE TABLE IF NOT EXISTS push_state(user TEXT PRIMARY KEY REFERENCES users(id),last INTEGER NOT NULL,kind TEXT NOT NULL DEFAULT 'attention');
    CREATE TABLE IF NOT EXISTS push_rate(user TEXT PRIMARY KEY,window INTEGER NOT NULL,count INTEGER NOT NULL);`);
  if (!(db.prepare('PRAGMA table_info(push_state)').all() as { name: string }[]).some(c => c.name === 'kind')) db.exec("ALTER TABLE push_state ADD COLUMN kind TEXT NOT NULL DEFAULT 'attention'");
  const vapid = options.vapid === undefined ? vapidFrom(process.env) : options.vapid;
  const sessionLive = `EXISTS(SELECT 1 FROM sessions s WHERE s.token=p.session AND s.user=p.user AND s.expires>?)`;
  const count = (user: string) => Number((db.prepare('SELECT COUNT(*) n FROM push_subscriptions p WHERE p.user=? AND ' + sessionLive).get(user, now()) as { n: number }).n);

  async function route(c: PushRouteContext): Promise<boolean> {
    if (c.route !== '/push/config' && c.route !== '/push/subscriptions') return false;
    if (c.route === '/push/config') {
      if (c.method !== 'GET') c.fail(405, 'Method not allowed.');
      const configured = vapid && await validateVapid(vapid);
      c.reply(200, { enabled: !!configured, publicKey: configured ? vapid.publicKey : null, subscriptions: count(c.user.id) });
      return true;
    }
    if (c.method !== 'POST' && c.method !== 'DELETE') c.fail(405, 'Method not allowed.');
    const input = await c.body();
    if (!c.live()) c.fail(401, 'Session expired.');
    if (c.method === 'DELETE') {
      if (typeof input.endpoint !== 'string' || input.endpoint.length > 1024) c.fail(400, 'Invalid subscription.');
      db.prepare('DELETE FROM push_subscriptions WHERE endpoint=? AND user=?').run(input.endpoint, c.user.id);
      c.reply(200, { ok: true });
      return true;
    }
    if (!vapid || !await validateVapid(vapid)) c.fail(503, 'Background alerts are not configured on this server.');
    if (!isAllowedPushEndpoint(input.endpoint)) c.fail(400, 'That push service is not supported.');
    const keys = await validateSubscriptionKeys(input.keys);
    if (!keys) c.fail(400, 'Invalid subscription keys.');
    if (input.finished !== undefined && typeof input.finished !== 'boolean') c.fail(400, 'Invalid alert choice.');
    const window = Math.floor(now() / 3_600_000), rate = db.prepare('SELECT window,count FROM push_rate WHERE user=?').get(c.user.id) as { window: number; count: number } | undefined;
    const used = rate && rate.window === window ? rate.count + 1 : 1;
    db.prepare('INSERT INTO push_rate VALUES(?,?,?) ON CONFLICT(user) DO UPDATE SET window=excluded.window,count=excluded.count').run(c.user.id, window, used);
    if (used > 20) c.fail(429, 'Too many alert changes. Try again later.');
    // Re-check after the asynchronous key validation: the session may have ended meanwhile.
    if (!c.live()) c.fail(401, 'Session expired.');
    db.prepare('DELETE FROM push_subscriptions WHERE user=? AND session NOT IN(SELECT token FROM sessions WHERE user=? AND expires>?)').run(c.user.id, c.user.id, now());
    const existing = db.prepare('SELECT user,p256dh,auth FROM push_subscriptions WHERE endpoint=?').get(input.endpoint) as { user: string; p256dh: string; auth: string } | undefined;
    if (existing && existing.user !== c.user.id && (existing.p256dh !== keys.p256dh || existing.auth !== keys.auth)) c.fail(409, 'Subscription belongs to another browser account.');
    const others = Number((db.prepare('SELECT COUNT(*) n FROM push_subscriptions WHERE user=? AND endpoint<>?').get(c.user.id, input.endpoint) as { n: number }).n);
    if (others >= MAX_SUBSCRIPTIONS) c.fail(409, 'Alert limit reached.');
    db.prepare('INSERT INTO push_subscriptions VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(endpoint) DO UPDATE SET user=excluded.user,session=excluded.session,p256dh=excluded.p256dh,auth=excluded.auth,finished=excluded.finished,created=excluded.created')
      .run(randomUUID(), input.endpoint, c.user.id, c.session, keys.p256dh, keys.auth, input.finished ? 1 : 0, now());
    c.reply(200, { ok: true });
    return true;
  }

  /** After an accepted publish. `previous` must be the stored snapshot only if it was fresh; otherwise null (baseline). */
  function notify(user: { id: string }, previous: AgentState[] | null, next: AgentState[], live: () => boolean): Promise<void> {
    if (!vapid) return Promise.resolve();
    const t = transitions(previous, next);
    if (!t.attention && !t.finished) return Promise.resolve();
    const kind: PushKind = t.attention ? 'attention' : 'finished';
    return (async () => {
      try {
        db.prepare('DELETE FROM push_subscriptions WHERE user=? AND NOT EXISTS(SELECT 1 FROM sessions s WHERE s.token=push_subscriptions.session AND s.user=push_subscriptions.user AND s.expires>?)').run(user.id, now());
        const rows = db.prepare('SELECT id,endpoint,p256dh,auth FROM push_subscriptions WHERE user=? AND (?=\'attention\' OR finished=1)').all(user.id, kind) as { id: string; endpoint: string; p256dh: string; auth: string }[];
        if (!rows.length) return;
        const claimed = db.prepare('INSERT INTO push_state(user,last,kind) VALUES(?,?,?) ON CONFLICT(user) DO UPDATE SET last=excluded.last,kind=excluded.kind WHERE push_state.last<=? OR (excluded.kind=\'attention\' AND push_state.kind=\'finished\') RETURNING last').get(user.id, now(), kind, now() - ALERT_COOLDOWN_MS);
        if (!claimed) return;
        for (const row of rows) {
          const authorized = () => !!(live() && db.prepare('SELECT 1 FROM push_subscriptions p JOIN offices o ON o.owner=p.user AND o.paused=0 WHERE p.id=? AND ' + sessionLive).get(row.id, now()));
          if (!authorized()) continue;
          const outcome = await sendPush({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } }, kind, vapid, options.transport, { timeoutMs: options.timeoutMs, authorized });
          if (outcome === 'gone') db.prepare('DELETE FROM push_subscriptions WHERE id=?').run(row.id);
          else if (outcome === 'misconfigured') console.error(JSON.stringify({ event: 'push-misconfigured' }));
        }
      } catch { console.error(JSON.stringify({ event: 'push-failed' })); }
    })();
  }
  return { route, notify, enabled: !!vapid };
}
