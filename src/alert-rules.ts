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
