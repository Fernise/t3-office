/** Foreground alerts for shared floors the viewer currently holds an activity grant for. Works only while a page is open; background push covers the owner's own office. */
import { transitions, ALERT_COOLDOWN_MS, type AgentState } from './alert-rules';
export interface WatchFloor { id: string; isOwner: boolean; scope: string; online: boolean }
export interface WatchSnapshot { office: { online: boolean; scope?: string }; agents: AgentState[] }
export interface WatchDeps {
  floors: () => Promise<WatchFloor[]>; office: (id: string) => Promise<WatchSnapshot>;
  notify: (kind: 'attention' | 'finished') => void; now?: () => number;
  /** Include the viewer's own office (only when no background push covers it). */
  includeFinished?: () => boolean;
  /** Binds every poll and final notice to the account that explicitly opted in. */
  authorized?: () => Promise<boolean>;
  includeOwn?: () => boolean; onSignedOut?: () => void; isSignedOutError?: (e: unknown) => boolean;
  /** Shared offices the person chose not to be alerted about on this device. */
  muted?: () => readonly string[];
}
const MAX_FLOORS = 8;
export function createWatcher(deps: WatchDeps) {
  const now = deps.now ?? Date.now;
  const baselines = new Map<string, AgentState[]>();
  let lastKind: 'attention' | 'finished' | undefined;
  let lastNotice = -Infinity, lastPoll = -Infinity, generation = 0, inflight = false;
  /** One poll. Authorization is re-read from the server every time, so a revoked or downgraded grant simply stops appearing. */
  async function poll(version: number): Promise<void> {
    if (now() - lastPoll > 45_000) baselines.clear();
    lastPoll = now();
    if (deps.authorized && !await deps.authorized()) { baselines.clear(); return; }
    if (version !== generation) return;
    let floors: WatchFloor[];
    try { floors = await deps.floors(); } catch (e) { baselines.clear(); if (deps.isSignedOutError?.(e)) deps.onSignedOut?.(); return; }
    const muted = new Set(deps.muted?.() ?? []);
    const eligible = floors.filter((f) => f.online && !muted.has(f.id) && ((!f.isOwner && f.scope === 'activity') || (f.isOwner && deps.includeOwn?.()))).slice(0, MAX_FLOORS);
    for (const id of [...baselines.keys()]) if (!eligible.some((f) => f.id === id)) baselines.delete(id);
    let attention = false, finished = false;
    for (const f of eligible) {
      let snap: WatchSnapshot;
      try { snap = await deps.office(f.id); } catch { baselines.delete(f.id); continue; }
      if (version !== generation) return;
      const visible = snap.office.online && (f.isOwner || snap.office.scope === 'activity');
      if (!visible) { baselines.delete(f.id); continue; }
      const t = transitions(baselines.get(f.id) ?? null, snap.agents);
      baselines.set(f.id, snap.agents.map((a) => ({ id: a.id, status: a.status })));
      attention ||= t.attention; finished ||= t.finished;
    }
    if (version !== generation) return;
    if (deps.includeFinished && !deps.includeFinished()) finished = false;
    if ((attention || finished) && (now() - lastNotice >= ALERT_COOLDOWN_MS || (attention && lastKind === 'finished'))) {
      if (deps.authorized && !await deps.authorized()) { baselines.clear(); return; }
      if (version !== generation) return;
      lastNotice = now(); lastKind = attention ? 'attention' : 'finished'; deps.notify(lastKind);
    }
  }
  async function tick(): Promise<void> {
    if (inflight) return;
    inflight = true;
    try { await poll(generation); } catch { baselines.clear(); } finally { inflight = false; }
  }
  return { tick, reset: () => { generation++; baselines.clear(); lastPoll = -Infinity; }, size: () => baselines.size };
}
