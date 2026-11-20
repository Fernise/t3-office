/**
 * Optional remembered phone view: when the person ticks "Open this view when I start the app" in the agent companion
 * of a published office, the app reopens that office's companion (with the same status filter) on the next launch.
 *
 * Office-first stays the default: nothing is remembered unless explicitly chosen, the restore happens at most once
 * per browser session (so "← Your floor" and normal navigation are never bounced back), and it is bound to the
 * account that chose it. Access is re-checked by the normal shared-office load; a refused floor just shows its error.
 */
import { api, ApiError } from './building-api';

const KEY = 'office.companion.view.v1';
const ONCE = 'office.companion.view.restored';
const FILTERS = ['all', 'failed', 'waiting', 'running', 'completed', 'idle'] as const;
export type ViewFilter = typeof FILTERS[number];
export interface RememberedView { actor: string; floor: string; filter: ViewFilter; at: number }

const valid = (v: unknown): v is RememberedView => {
  const r = v as RememberedView;
  return !!r && typeof r.actor === 'string' && /^[\w-]{1,100}$/.test(r.floor) && FILTERS.includes(r.filter) && typeof r.at === 'number';
};
export function rememberedView(): RememberedView | null {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? 'null'); return valid(v) ? v : null; } catch { return null; }
}
export function forgetView() { try { localStorage.removeItem(KEY); } catch { /* storage unavailable */ } }
/** Remember `floor` for the signed-in account. Throws ApiError(401) when signed out, so the caller can say so. */
export async function rememberView(floor: string, filter: ViewFilter): Promise<void> {
  const me = await api<{ user: { id: string } }>('/session');
  try { localStorage.setItem(KEY, JSON.stringify({ actor: me.user.id, floor, filter, at: Date.now() } satisfies RememberedView)); } catch { /* storage unavailable: nothing remembered */ }
}
/** Keeps the saved filter in step with the panel, only for the remembered floor. */
export function updateRememberedFilter(floor: string, filter: ViewFilter) {
  const v = rememberedView(); if (!v || v.floor !== floor || v.filter === filter) return;
  try { localStorage.setItem(KEY, JSON.stringify({ ...v, filter })); } catch { /* ignore */ }
}
/** URL of the remembered view, keeping only the language choice. */
export function viewUrl(v: RememberedView, from: URL = new URL(location.href)): URL {
  const url = new URL('/', from.origin); url.searchParams.set('source', 'shared'); url.searchParams.set('floor', v.floor); url.searchParams.set('companion', '1');
  const lang = from.searchParams.get('lang'); if (lang === 'en' || lang === 'de') url.searchParams.set('lang', lang);
  return url;
}
/** Plain home launch (no source, floor, view or building parameters): the only place a restore may happen. */
export const isPlainHome = (url: URL) => url.pathname === '/' && [...url.searchParams.keys()].every((k) => k === 'lang' || k === 'theme') && !url.hash;

/**
 * Called once at startup before the office loads. Returns true when it navigated away.
 * A different or signed-out account drops the saved view; a network problem keeps it but opens the office as usual.
 */
export async function restoreRememberedView(): Promise<boolean> {
  let first = true;
  try { first = sessionStorage.getItem(ONCE) === null; sessionStorage.setItem(ONCE, '1'); } catch { /* no session storage: treat as first */ }
  const saved = rememberedView();
  if (!first || !saved || !isPlainHome(new URL(location.href))) return false;
  try {
    const me = await api<{ user: { id: string } }>('/session');
    if (me.user.id !== saved.actor) { forgetView(); return false; }
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) forgetView();
    return false;
  }
  location.replace(viewUrl(saved));
  return true;
}
