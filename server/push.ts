/** Local-server equivalent of cloud/push.ts: optional Web Push for the signed-in owner's own agent status changes, generic payloads only. */
import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { isAllowedPushEndpoint, validateSubscriptionKeys, vapidFrom, validateVapid, sendPush, type PushKind, type Vapid } from '../src/webpush.ts';
import { transitions, ALERT_COOLDOWN_MS, ALERT_HISTORY, parseQuiet, inQuietHours, type AgentState } from '../src/alert-rules.ts';

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
  // Per-device alert controls (same columns as Worker migration 0009) and the recent-alerts log.
  const subColumns = new Set((db.prepare('PRAGMA table_info(push_subscriptions)').all() as { name: string }[]).map(c => c.name));
  for (const [name, type] of [['quiet_start', 'INTEGER'], ['quiet_end', 'INTEGER'], ['tz', 'TEXT'], ['own', 'INTEGER NOT NULL DEFAULT 1']]) if (!subColumns.has(name)) db.exec(`ALTER TABLE push_subscriptions ADD COLUMN ${name} ${type}`);
  db.exec('CREATE TABLE IF NOT EXISTS push_log(id TEXT PRIMARY KEY,user TEXT NOT NULL REFERENCES users(id),at INTEGER NOT NULL,kind TEXT NOT NULL,sent INTEGER NOT NULL,held INTEGER NOT NULL); CREATE INDEX IF NOT EXISTS push_log_user ON push_log(user,at);');
  const logAlert = (user: string, kind: PushKind, sent: number, held: number) => {
    db.prepare('INSERT INTO push_log VALUES(?,?,?,?,?,?)').run(randomUUID(), user, now(), kind, sent, held);
    db.prepare('DELETE FROM push_log WHERE user=? AND id NOT IN(SELECT id FROM push_log WHERE user=? ORDER BY at DESC,rowid DESC LIMIT ?)').run(user, user, ALERT_HISTORY);
  };
  const limited = (key: string, max: number, windowMs: number) => {
    const window = Math.floor(now() / windowMs), rate = db.prepare('SELECT window,count FROM push_rate WHERE user=?').get(key) as { window: number; count: number } | undefined;
    const used = rate && rate.window === window ? rate.count + 1 : 1;
    db.prepare('INSERT INTO push_rate VALUES(?,?,?) ON CONFLICT(user) DO UPDATE SET window=excluded.window,count=excluded.count').run(key, window, used);
    return used > max;
  };
  const vapid = options.vapid === undefined ? vapidFrom(process.env) : options.vapid;
  const sessionLive = `EXISTS(SELECT 1 FROM sessions s WHERE s.token=p.session AND s.user=p.user AND s.expires>?)`;
  const count = (user: string) => Number((db.prepare('SELECT COUNT(*) n FROM push_subscriptions p WHERE p.user=? AND ' + sessionLive).get(user, now()) as { n: number }).n);

  async function route(c: PushRouteContext): Promise<boolean> {
    if (!['/push/config', '/push/subscriptions', '/push/settings', '/push/test', '/push/history'].includes(c.route)) return false;
    if (c.route === '/push/history') {
      if (c.method !== 'GET') c.fail(405, 'Method not allowed.');
      c.reply(200, { alerts: db.prepare('SELECT at,kind,sent,held FROM push_log WHERE user=? ORDER BY at DESC,rowid DESC LIMIT ?').all(c.user.id, ALERT_HISTORY) });
      return true;
    }
    if (c.route === '/push/config') {
      if (c.method !== 'GET') c.fail(405, 'Method not allowed.');
      const configured = vapid && await validateVapid(vapid);
      c.reply(200, { enabled: !!configured, publicKey: configured ? vapid.publicKey : null, subscriptions: count(c.user.id) });
      return true;
    }
    if (c.method !== 'POST' && c.method !== 'DELETE') c.fail(405, 'Method not allowed.');
    const input = await c.body();
    if (!c.live()) c.fail(401, 'Session expired.');
    if (c.method === 'POST' && c.route === '/push/settings') {
      if (typeof input.endpoint !== 'string' || input.endpoint.length > 1024) c.fail(400, 'Invalid subscription.');
      if ((input.finished !== undefined && typeof input.finished !== 'boolean') || (input.own !== undefined && typeof input.own !== 'boolean')) c.fail(400, 'Invalid alert choice.');
      const setQuiet = 'quiet' in input, quiet = setQuiet ? parseQuiet(input.quiet) : null;
      if (quiet === undefined) c.fail(400, 'Invalid quiet hours.');
      if (limited('push-settings:' + c.user.id, 60, 3_600_000)) c.fail(429, 'Too many alert changes. Try again later.');
      const row = db.prepare('SELECT finished,own,quiet_start,quiet_end,tz FROM push_subscriptions WHERE endpoint=? AND user=?').get(input.endpoint, c.user.id) as { finished: number; own: number; quiet_start: number | null; quiet_end: number | null; tz: string | null } | undefined;
      if (!row || !c.live()) c.fail(404, 'This device has no alerts registered.');
      db.prepare('UPDATE push_subscriptions SET finished=?,own=?,quiet_start=?,quiet_end=?,tz=? WHERE endpoint=? AND user=?').run(
        input.finished === undefined ? row.finished : input.finished ? 1 : 0, input.own === undefined ? row.own : input.own ? 1 : 0,
        setQuiet ? quiet?.start ?? null : row.quiet_start, setQuiet ? quiet?.end ?? null : row.quiet_end, setQuiet ? quiet?.tz ?? null : row.tz, input.endpoint, c.user.id);
      c.reply(200, { ok: true });
      return true;
    }
    if (c.method === 'POST' && c.route === '/push/test') {
      if (typeof input.endpoint !== 'string' || input.endpoint.length > 1024) c.fail(400, 'Invalid subscription.');
      if (!vapid || !await validateVapid(vapid)) c.fail(503, 'Background alerts are not configured on this server.');
      if (limited('push-test:' + c.user.id, 5, 600_000)) c.fail(429, 'Please wait a few minutes before sending another test.');
      const row = db.prepare('SELECT id,endpoint,p256dh,auth FROM push_subscriptions WHERE endpoint=? AND user=?').get(input.endpoint, c.user.id) as { id: string; endpoint: string; p256dh: string; auth: string } | undefined;
      if (!row || !c.live()) c.fail(404, 'This device has no alerts registered.');
      const authorized = () => c.live() && !!db.prepare('SELECT 1 FROM push_subscriptions WHERE id=? AND user=?').get(row.id, c.user.id);
      const outcome = await sendPush({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } }, 'test', vapid, options.transport, { timeoutMs: options.timeoutMs, authorized });
      if (outcome === 'gone') db.prepare('DELETE FROM push_subscriptions WHERE id=?').run(row.id);
      logAlert(c.user.id, 'test', outcome === 'sent' ? 1 : 0, 0);
      c.reply(200, { ok: true, delivered: outcome === 'sent', gone: outcome === 'gone' });
      return true;
    }
    if (c.route !== '/push/subscriptions') c.fail(405, 'Method not allowed.');
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
    if (input.own !== undefined && typeof input.own !== 'boolean') c.fail(400, 'Invalid alert choice.');
    const quiet = parseQuiet(input.quiet);
    if (quiet === undefined) c.fail(400, 'Invalid quiet hours.');
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
    db.prepare('INSERT INTO push_subscriptions(id,endpoint,user,session,p256dh,auth,finished,created,own,quiet_start,quiet_end,tz) VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(endpoint) DO UPDATE SET user=excluded.user,session=excluded.session,p256dh=excluded.p256dh,auth=excluded.auth,finished=excluded.finished,created=excluded.created,own=excluded.own,quiet_start=excluded.quiet_start,quiet_end=excluded.quiet_end,tz=excluded.tz')
      .run(randomUUID(), input.endpoint, c.user.id, c.session, keys.p256dh, keys.auth, input.finished ? 1 : 0, now(), input.own === false ? 0 : 1, quiet?.start ?? null, quiet?.end ?? null, quiet?.tz ?? null);
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
        const rows = db.prepare('SELECT id,endpoint,p256dh,auth,quiet_start,quiet_end,tz FROM push_subscriptions WHERE user=? AND own=1 AND (?=\'attention\' OR finished=1)').all(user.id, kind) as { id: string; endpoint: string; p256dh: string; auth: string; quiet_start: number | null; quiet_end: number | null; tz: string | null }[];
        if (!rows.length) return;
        const claimed = db.prepare('INSERT INTO push_state(user,last,kind) VALUES(?,?,?) ON CONFLICT(user) DO UPDATE SET last=excluded.last,kind=excluded.kind WHERE push_state.last<=? OR (excluded.kind=\'attention\' AND push_state.kind=\'finished\') RETURNING last').get(user.id, now(), kind, now() - ALERT_COOLDOWN_MS);
        if (!claimed) return;
        let sent = 0, held = 0;
        for (const row of rows) {
          // Quiet hours hold the alert for this device; nothing is sent to its push service.
          if (row.quiet_start !== null && row.quiet_end !== null && row.tz && inQuietHours({ start: row.quiet_start, end: row.quiet_end, tz: row.tz }, now())) { held++; continue; }
          const authorized = () => !!(live() && db.prepare('SELECT 1 FROM push_subscriptions p JOIN offices o ON o.owner=p.user AND o.paused=0 WHERE p.id=? AND ' + sessionLive).get(row.id, now()));
          if (!authorized()) continue;
          const outcome = await sendPush({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } }, kind, vapid, options.transport, { timeoutMs: options.timeoutMs, authorized });
          if (outcome === 'sent') sent++;
          if (outcome === 'gone') db.prepare('DELETE FROM push_subscriptions WHERE id=?').run(row.id);
          else if (outcome === 'misconfigured') console.error(JSON.stringify({ event: 'push-misconfigured' }));
        }
        if (sent || held) logAlert(user.id, kind, sent, held);
      } catch { console.error(JSON.stringify({ event: 'push-failed' })); }
    })();
  }
  return { route, notify, enabled: !!vapid };
}
