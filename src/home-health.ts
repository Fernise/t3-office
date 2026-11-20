/** Connection health for "Sharing → Home computer", derived only from your own office summary and your key count. */
export type HomeHealth = 'unknown' | 'paused' | 'connected' | 'stale' | 'waiting' | 'no-key';
export const LIVE_MS = 45_000;
export interface OwnFloor { paused?: boolean; online: boolean; updatedAt: number | null; agentCount: number }
export function homeHealth(own: OwnFloor | undefined, keys: number | null, now: number): { state: HomeHealth; ageSeconds: number | null; agents: number } {
  if (!own) return { state: 'unknown', ageSeconds: null, agents: 0 };
  const age = own.updatedAt === null ? null : Math.max(0, Math.round((now - own.updatedAt) / 1000));
  if (own.paused) return { state: 'paused', ageSeconds: age, agents: 0 };
  if (own.updatedAt !== null && own.online && now - own.updatedAt < LIVE_MS) return { state: 'connected', ageSeconds: age, agents: own.agentCount };
  if (own.updatedAt !== null) return { state: 'stale', ageSeconds: age, agents: 0 };
  return { state: keys === 0 ? 'no-key' : 'waiting', ageSeconds: null, agents: 0 };
}
