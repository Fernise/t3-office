/**
 * Building-wide agent summary for the companion: one row per office you can see, offices needing attention first.
 *
 * Reads only the endpoints the office already uses (/floors, /offices/:id), so every permission rule applies as is:
 * presence-only floors show online/offline and nothing else; activity floors show status counts (never agent names
 * here); your own floor can use your local live agents (this screen only). At most MAX snapshots are read per refresh.
 */
import type { Floor, OfficeSnapshot } from './building-api';
import type { Status } from './data';

export const MAX_SUMMARY_FLOORS = 12;
export type Counts = Record<Status, number>;
export interface SummaryRow {
  id: string; name: string; ownerName: string; isOwner: boolean;
  scope: 'owner' | 'activity' | 'presence'; online: boolean;
  /** null when not visible (presence-only, offline or not loaded) */
  counts: Counts | null;
}
export const emptyCounts = (): Counts => ({ running: 0, waiting: 0, failed: 0, completed: 0, idle: 0 });
const STATUSES: Status[] = ['running', 'waiting', 'failed', 'completed', 'idle'];
export function countAgents(agents: { status: string }[]): Counts {
  const c = emptyCounts(); for (const a of agents) if ((STATUSES as string[]).includes(a.status)) c[a.status as Status]++; return c;
}
const attention = (r: SummaryRow) => r.counts ? r.counts.failed + r.counts.waiting : 0;
const active = (r: SummaryRow) => r.counts ? r.counts.running : 0;
/** Attention (failed + waiting) first, then running, then online, your own floor before others on ties, then name. */
export function rankRows(rows: SummaryRow[]): SummaryRow[] {
  return [...rows].sort((a, b) => attention(b) - attention(a) || (b.counts?.failed ?? 0) - (a.counts?.failed ?? 0) || active(b) - active(a)
    || Number(b.online) - Number(a.online) || Number(b.isOwner) - Number(a.isOwner) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}
export interface SummaryDeps {
  floors: () => Promise<Floor[]>;
  office: (id: string) => Promise<OfficeSnapshot>;
  /** Your own live agents when this screen shows your own office (not shared); otherwise undefined. */
  localOwn?: () => { status: string }[] | undefined;
}
export async function loadSummary(deps: SummaryDeps): Promise<SummaryRow[]> {
  const floors = await deps.floors();
  const rows = floors.map((f): SummaryRow => ({ id: f.id, name: f.name, ownerName: f.ownerName, isOwner: f.isOwner, scope: f.isOwner ? 'owner' : f.scope === 'activity' ? 'activity' : 'presence', online: f.online, counts: null }));
  let read = 0;
  for (const row of rows) {
    if (row.isOwner) { const local = deps.localOwn?.(); if (local) { row.counts = countAgents(local); row.online = true; continue; } }
    if (row.scope === 'presence' || !row.online || read >= MAX_SUMMARY_FLOORS) continue;
    read++;
    try {
      const snap = await deps.office(row.id);
      // The snapshot is authorized again by the server; a downgraded grant or paused office simply shows no counts.
      const visible = snap.office.online && (row.isOwner || snap.office.scope === 'activity');
      row.online = snap.office.online; row.counts = visible ? countAgents(snap.agents) : null;
    } catch { row.counts = null; }
  }
  return rankRows(rows);
}
/** Building totals across visible offices, for the summary line. */
export function totals(rows: SummaryRow[]): Counts {
  const c = emptyCounts(); for (const r of rows) if (r.counts) for (const s of STATUSES) c[s] += r.counts[s]; return c;
}
