/** Pure alert decisions shared by the Worker, the local server and the foreground watcher, so every path agrees on what counts as news. */
export type AgentState = { id: string; status: string };
export interface Transitions { attention: boolean; finished: boolean }
/**
 * `previous` is null for an initial snapshot, a reconnect, an offline gap or any state the caller cannot trust:
 * that only sets a baseline and never alerts. Only agents present in both snapshots whose status changed count.
 * waiting/failed need attention; completed is informational.
 */
export function transitions(previous: readonly AgentState[] | null, next: readonly AgentState[]): Transitions {
  const out = { attention: false, finished: false };
  if (!previous) return out;
  const before = new Map(previous.map((a) => [a.id, a.status]));
  for (const a of next) {
    const was = before.get(a.id);
    if (was === undefined || was === a.status) continue;
    if (a.status === 'waiting' || a.status === 'failed') out.attention = true;
    else if (a.status === 'completed') out.finished = true;
  }
  return out;
}
export const ALERT_COOLDOWN_MS = 60_000;
export const NOTICE = { attention: 'An agent needs attention', finished: 'An agent finished' } as const;

/** Quiet hours for one device: minutes after local midnight in an IANA time zone. start === end means off; start > end wraps midnight. */
export interface QuietHours { start: number; end: number; tz: string }
const minute = (v: unknown) => Number.isInteger(v) && (v as number) >= 0 && (v as number) < 1440;
const zoneOk = (tz: string) => { try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; } };
/** null = quiet hours off; undefined = invalid input (callers answer 400). */
export function parseQuiet(v: unknown): QuietHours | null | undefined {
  if (v === null || v === undefined) return null;
  const q = v as QuietHours;
  if (typeof q !== 'object' || !minute(q.start) || !minute(q.end) || typeof q.tz !== 'string' || q.tz.length > 64 || !zoneOk(q.tz)) return undefined;
  return { start: q.start, end: q.end, tz: q.tz };
}
export function localMinutes(now: number, tz: string): number {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(now));
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
    return (get('hour') % 24) * 60 + get('minute');
  } catch { const d = new Date(now); return d.getUTCHours() * 60 + d.getUTCMinutes(); }
}
export function inQuietHours(q: QuietHours | null | undefined, now: number): boolean {
  if (!q || q.start === q.end) return false;
  const m = localMinutes(now, q.tz);
  return q.start < q.end ? m >= q.start && m < q.end : m >= q.start || m < q.end;
}
/** Alerts kept per account (server) or per browser (foreground) for the "Recent alerts" list. */
export const ALERT_HISTORY = 20;
