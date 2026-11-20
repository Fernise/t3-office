/**
 * Optional compact agent companion: a status-only overview reachable from the office HUD. It never replaces the
 * full-screen office (that stays the home screen), never controls agents and, in a shared visit, only ever reads
 * the minimal fields of the shared contract (name, provider, status, area).
 *
 * Integration API for add-ons (install / alerts), all optional:
 *  - the open panel contains `<div class="companion-addons" data-companion-addons>`; listen for window CustomEvent
 *    `office-companion-open` (detail.slot) and append controls there;
 *  - window CustomEvent `office-companion-change` fires when the agent list/statuses/freshness change
 *    (detail: CompanionChange) whether or not the panel is open; it carries only id, name, provider, status;
 *  - the panel's "App & alerts" button dispatches `new Event('office-app-tools')`.
 */
import { PROVIDERS, type Status } from './data';
import type { AgentSource, Thread } from './source';
import { mountHudAction } from './hud-actions';
import { api, ApiError } from './building-api';
import { locale } from './i18n';
import { loadSummary, totals, type SummaryRow } from './building-summary';
import type { Floor, OfficeSnapshot } from './building-api';
import { rememberView, forgetView, rememberedView, updateRememberedFilter, type ViewFilter } from './remembered-view';
import './companion.css';

export const STALE_MS = 15_000;
export const OFFLINE_MS = 45_000;
const ORDER: Status[] = ['failed', 'waiting', 'running', 'completed', 'idle'];
export type CompanionFilter = 'all' | Status;
export interface CompanionChange {
  shared: boolean;
  state: 'live' | 'stale' | 'offline';
  counts: Record<Status, number>;
  agents: { id: string; name: string; provider: string; status: Status }[];
}

const T = locale({
  en: {
    open: 'Agents', title: 'Agent companion', summary: 'Agent summary', filter: 'Filter by status', all: 'All', close: 'Back to office', back: 'Back to list',
    focus: 'Show in office', tools: 'App & alerts', empty: 'No agents to show.', gone: 'This agent is no longer available.',
    status: { running: 'Running', waiting: 'Waiting', failed: 'Failed', completed: 'Completed', idle: 'Idle' } as Record<Status, string>,
    live: 'Live', stale: (s: number) => `Stale · last update ${s}s ago`, offline: 'Offline · agent list cleared until the connection returns',
    updated: (s: number) => `Updated ${s}s ago`, provider: 'Provider', area: 'Area', model: 'Model', task: 'Title', last: 'Last activity', ago: (s: number) => `${s}s ago`,
    tools_: 'Tool calls', context: 'Context used', sub: 'Sub-agent', shared: 'Published activity · status only', demo: 'Demo · simulated agents', published: 'Use my published agents', connectHint: 'To see your real agents here, connect your home computer once: Friends & characters → Sharing → Home computer.', signIn: 'Sign in through Friends & characters first, then publish activity from your home computer.', connecting: 'Opening your published office…', connectFailed: 'Could not open your published office. Check the connection and try again.',
    row: (n: string, p: string, s: string) => `${n}, ${p}, ${s}. Show details`,
    views: 'View', thisOffice: 'This office', building: 'Building', buildingHint: 'Every office you can see. Offices needing attention come first.', loadingBuilding: 'Loading building…', signInBuilding: 'Sign in through Friends & characters to see your building.', buildingFailed: 'Building unavailable. Trying again shortly.', you: 'Your office', presenceOnly: 'Presence only', online: 'Online', offlineShort: 'Offline', noCounts: 'Activity not shared', noOffices: 'No offices yet. Invite a friend from Friends & characters.', openOffice: (n: string) => `${n}: show agents`, idleAll: 'All quiet',
    remember: 'Open this view when I start the app', remembered: 'This view opens when you start the app.', rememberSignIn: 'Sign in to remember this view.', rememberFailed: 'Could not remember this view. Try again.',
  },
  de: {
    open: 'Agenten', title: 'Agenten-Begleiter', summary: 'Agenten-Übersicht', filter: 'Nach Status filtern', all: 'Alle', close: 'Zurück zum Büro', back: 'Zurück zur Liste',
    focus: 'Im Büro zeigen', tools: 'App & Hinweise', empty: 'Keine Agenten.', gone: 'Dieser Agent ist nicht mehr verfügbar.',
    status: { running: 'Läuft', waiting: 'Wartet', failed: 'Fehlgeschlagen', completed: 'Fertig', idle: 'Untätig' } as Record<Status, string>,
    live: 'Live', stale: (s: number) => `Veraltet · letzte Aktualisierung vor ${s}s`, offline: 'Offline · Liste geleert, bis die Verbindung zurück ist',
    updated: (s: number) => `Aktualisiert vor ${s}s`, provider: 'Anbieter', area: 'Bereich', model: 'Modell', task: 'Titel', last: 'Letzte Aktivität', ago: (s: number) => `vor ${s}s`,
    tools_: 'Werkzeugaufrufe', context: 'Kontext belegt', sub: 'Unter-Agent', shared: 'Veröffentlichte Aktivität · nur Status', demo: 'Demo · simulierte Agenten', published: 'Meine veröffentlichten Agenten verwenden', connectHint: 'Um deine echten Agenten hier zu sehen, verbinde einmal deinen Heimcomputer: Freunde & Charaktere → Teilen → Heimcomputer.', signIn: 'Melde dich zuerst unter Freunde & Charaktere an und veröffentliche Aktivität vom eigenen Computer.', connecting: 'Dein veröffentlichtes Büro wird geöffnet…', connectFailed: 'Dein veröffentlichtes Büro konnte nicht geöffnet werden. Prüfe die Verbindung.',
    row: (n: string, p: string, s: string) => `${n}, ${p}, ${s}. Details anzeigen`,
    views: 'Ansicht', thisOffice: 'Dieses Büro', building: 'Gebäude', buildingHint: 'Alle Büros, die du sehen darfst. Büros, die Aufmerksamkeit brauchen, zuerst.', loadingBuilding: 'Gebäude wird geladen…', signInBuilding: 'Melde dich über Freunde & Charaktere an, um dein Gebäude zu sehen.', buildingFailed: 'Gebäude nicht verfügbar. Neuer Versuch gleich.', you: 'Dein Büro', presenceOnly: 'Nur Anwesenheit', online: 'Online', offlineShort: 'Offline', noCounts: 'Aktivität nicht geteilt', noOffices: 'Noch keine Büros. Lade jemanden über Freunde & Charaktere ein.', openOffice: (n: string) => `${n}: Agenten zeigen`, idleAll: 'Alles ruhig',
    remember: 'Diese Ansicht beim App-Start öffnen', remembered: 'Diese Ansicht öffnet sich beim App-Start.', rememberSignIn: 'Melde dich an, um diese Ansicht zu merken.', rememberFailed: 'Ansicht konnte nicht gemerkt werden. Bitte erneut versuchen.',
  },
});

interface Options {
  shared: boolean;
  demo?: boolean;
  /** The published office being viewed (shared mode); enables the optional remembered phone view. */
  floorId?: string | null;
  /** existing office focus callback; the companion closes first */
  focusAgent: (id: string) => void;
  /** local sources without their own freshness contract (T3) */
  freshness?: () => { updatedAt: number; offline: boolean } | undefined;
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = '') => {
  const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e;
};
const emptyCounts = (): Record<Status, number> => ({ running: 0, waiting: 0, failed: 0, completed: 0, idle: 0 });

export function installCompanion(source: AgentSource, opts: Options) {
  const launcher = el('button', 'companion-launcher', T.open);
  launcher.type = 'button'; launcher.setAttribute('aria-haspopup', 'dialog'); launcher.setAttribute('aria-label', T.open);
  mountHudAction(launcher, 2);

  let panel: HTMLElement | undefined;
  let filter: CompanionFilter = 'all';
  // A remembered view for this office brings its status filter back.
  { const saved = opts.shared && opts.floorId ? rememberedView() : null; if (saved && saved.floor === opts.floorId) filter = saved.filter as CompanionFilter; }
  let selected: string | null = null;
  let opener: HTMLElement | null = null;
  let inerted: [HTMLElement, boolean][] = [];
  let lastSig = '', lastChange = '';
  let timer: ReturnType<typeof setInterval> | undefined;
  let refs: { summary: HTMLElement; chips: HTMLElement; fresh: HTMLElement; list: HTMLElement; detail: HTMLElement; msg: HTMLElement } | undefined;

  const state = () => {
    const f = source.freshness?.() ?? opts.freshness?.();
    if (!f) return { state: 'live' as const, age: 0 };
    if (!Number.isFinite(f.updatedAt)) return { state: 'offline' as const, age: 0 };
    const age = Math.max(0, Date.now() - f.updatedAt);
    return { state: f.offline || age >= OFFLINE_MS ? 'offline' as const : age >= STALE_MS ? 'stale' as const : 'live' as const, age: Math.round(age / 1000) };
  };
  const agents = (st: ReturnType<typeof state>): Thread[] => st.state === 'offline' ? [] : [...source.threads()].sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  const counts = (list: Thread[]) => { const c = emptyCounts(); for (const t of list) c[t.status]++; return c; };

  const emitChange = (st: ReturnType<typeof state>, list: Thread[]) => {
    const detail: CompanionChange = { shared: opts.shared, state: st.state, counts: counts(list), agents: list.map((t) => ({ id: t.id, name: t.name, provider: t.provider, status: t.status })) };
    const sig = JSON.stringify(detail);
    if (sig === lastChange) return;
    lastChange = sig; window.dispatchEvent(new CustomEvent('office-companion-change', { detail }));
  };

  const detailFor = (t: Thread | undefined) => {
    const d = refs!.detail; d.replaceChildren();
    d.hidden = !selected; panel!.classList.toggle('has-detail', !!selected);
    if (!selected) return;
    const back = el('button', 'companion-back', '← ' + T.back); back.type = 'button';
    back.addEventListener('click', () => closeDetail());
    d.append(back);
    if (!t) { d.removeAttribute('aria-labelledby'); d.setAttribute('aria-label', T.gone); d.append(el('p', 'companion-note', T.gone)); return; }
    d.setAttribute('aria-labelledby', 'companion-detail-title'); d.removeAttribute('aria-label');
    const h = el('h2', '', t.name); h.id = 'companion-detail-title';
    const badge = el('span', `companion-badge s-${t.status}`, T.status[t.status]);
    const dl = el('dl', 'companion-facts');
    const add = (k: string, v: string) => { dl.append(el('dt', '', k), el('dd', '', v)); };
    add(T.provider, PROVIDERS[t.provider]?.label ?? t.provider);
    if (t.workArea) add(T.area, t.workArea);
    // Shared visits use only the minimal contract above; local-only details are never read there.
    if (!opts.shared) {
      if (t.title) add(T.task, t.title);
      if (t.model) add(T.model, t.model);
      if (t.lastActiveAt) add(T.last, T.ago(Math.max(0, Math.round((Date.now() - t.lastActiveAt) / 1000))));
      add(T.tools_, String(t.toolCalls)); add(T.context, `${Math.round(t.context)}%`);
      if (t.parentId) add('', T.sub);
    }
    const focus = el('button', 'companion-focus', T.focus); focus.type = 'button';
    focus.addEventListener('click', () => { const id = t.id; close(false); requestAnimationFrame(() => opts.focusAgent(id)); });
    d.append(h, badge, dl);
    if (opts.shared) d.append(el('p', 'companion-note', T.shared));
    d.append(focus);
  };

  const closeDetail = () => {
    const id = selected; selected = null; render(true);
    (refs!.list.querySelector<HTMLElement>(`[data-id="${CSS.escape(id ?? '')}"]`) ?? refs!.chips.querySelector<HTMLElement>('[aria-pressed=true]'))?.focus();
  };

  // Building-wide summary (optional second view). Counts only; never agent names from other offices.
  let view: 'office' | 'building' = 'office', summaryTimer: ReturnType<typeof setInterval> | undefined, summaryBusy = false;
  let buildingEl: HTMLElement | undefined, officeEl: HTMLElement | undefined, viewBtns: HTMLButtonElement[] = [];
  // Your own live agents only when this screen really shows them (local T3), never the simulated demo.
  const ownFloor = () => opts.shared || opts.demo ? null : 'own';
  const goToOffice = (row: SummaryRow) => {
    if (row.isOwner && (!opts.shared || opts.floorId === row.id)) return setView('office');
    if (opts.shared && opts.floorId === row.id) return setView('office');
    const url = new URL('/', location.origin); url.searchParams.set('source', 'shared'); url.searchParams.set('floor', row.id); url.searchParams.set('companion', '1');
    const language = new URLSearchParams(location.search).get('lang'); if (language === 'en' || language === 'de') url.searchParams.set('lang', language);
    location.assign(url);
  };
  const countText = (c: Record<Status, number>) => { const parts = ORDER.filter((s) => s !== 'idle' && c[s]).map((s) => `${c[s]} ${T.status[s]}`); return parts.join(' · ') || T.idleAll; };
  const renderSummary = (rows: SummaryRow[] | 'loading' | 'signed-out' | 'failed') => {
    if (!buildingEl) return;
    const list = buildingEl.querySelector<HTMLElement>('.companion-building-list')!, line = buildingEl.querySelector<HTMLElement>('.companion-building-total')!;
    const focusId = (document.activeElement as HTMLElement | null)?.dataset?.office;
    if (typeof rows === 'string') { line.textContent = ''; list.replaceChildren(el('p', 'companion-note', rows === 'loading' ? T.loadingBuilding : rows === 'signed-out' ? T.signInBuilding : T.buildingFailed)); return; }
    line.textContent = rows.length ? countText(totals(rows)) : '';
    list.replaceChildren(...(rows.length ? rows.map((r) => {
      const dot = r.counts?.failed ? 's-failed' : r.counts?.waiting ? 's-waiting' : r.online && r.scope !== 'presence' ? 's-running' : 's-idle';
      const b = el('button', `companion-office ${dot}${r.counts && (r.counts.failed || r.counts.waiting) ? ' needs-attention' : ''}${r.online ? '' : ' is-offline'}`); b.type = 'button'; b.dataset.office = r.id;
      const info = el('span', 'companion-info'); info.append(el('span', 'companion-name', r.isOwner ? `${r.name} · ${T.you}` : r.name), el('small', '', r.isOwner ? '' : r.ownerName));
      const state = r.scope === 'presence' ? `${T.presenceOnly} · ${r.online ? T.online : T.offlineShort}` : !r.online ? T.offlineShort : r.counts ? countText(r.counts) : T.noCounts;
      b.append(el('span', 'companion-dot'), info, el('span', 'companion-office-state', state));
      b.setAttribute('aria-label', `${T.openOffice(r.isOwner ? `${r.name} (${T.you})` : r.name)}. ${state}`);
      b.addEventListener('click', () => goToOffice(r));
      return b;
    }) : [el('p', 'companion-note', T.noOffices)]));
    if (focusId) buildingEl.querySelector<HTMLElement>(`[data-office="${CSS.escape(focusId)}"]`)?.focus();
  };
  const refreshSummary = async (first = false) => {
    if (summaryBusy || view !== 'building') return; summaryBusy = true; if (first) renderSummary('loading');
    try {
      const rows = await loadSummary({
        floors: async () => (await api<{ floors: Floor[] }>('/floors')).floors,
        office: (id) => api<OfficeSnapshot>(`/offices/${encodeURIComponent(id)}`),
        localOwn: () => ownFloor() ? agents(state()).map((t) => ({ status: t.status })) : undefined,
      });
      if (view === 'building') renderSummary(rows);
    } catch (error) { if (view === 'building') renderSummary(error instanceof ApiError && error.status === 401 ? 'signed-out' : 'failed'); }
    finally { summaryBusy = false; }
  };
  const setView = (next: 'office' | 'building') => {
    view = next; if (!officeEl || !buildingEl) return;
    officeEl.hidden = next !== 'office'; buildingEl.hidden = next !== 'building';
    for (const b of viewBtns) b.setAttribute('aria-pressed', String(b.dataset.view === next));
    clearInterval(summaryTimer); summaryTimer = undefined;
    if (next === 'building') { void refreshSummary(true); summaryTimer = setInterval(() => void refreshSummary(), 10_000); }
    else render(true);
  };

  let rowsSig = '';
  const render = (force = false) => {
    if (!panel || !refs) return;
    const st = state(); const list = agents(st); const c = counts(list);
    refs.fresh.className = `companion-fresh is-${st.state}`;
    refs.fresh.textContent = st.state === 'live' ? (source.freshness || opts.freshness ? T.updated(st.age) : T.live) : st.state === 'stale' ? T.stale(st.age) : T.offline;
    const chipSig = `${filter}|${ORDER.map((s) => c[s]).join(',')}|${list.length}`;
    const selectedThread = !opts.shared && selected ? list.find(t => t.id === selected) : undefined;
    const detailSig = selectedThread ? JSON.stringify([selectedThread.model, selectedThread.toolCalls, selectedThread.context, selectedThread.lastActiveAt]) : '';
    const sig = `${chipSig}|${selected}|${list.map((t) => `${t.id}:${t.name}:${t.status}:${t.provider}:${opts.shared ? '' : t.title}:${t.workArea}`).join(';')}|${st.state}|${detailSig}`;
    const smallDetail = !!selected && matchMedia('(max-width: 899px)').matches;
    panel.querySelector<HTMLElement>(':scope > header')!.inert = smallDetail;
    panel.querySelector<HTMLElement>('.companion-body')!.inert = smallDetail;
    refs.msg.inert = !!selected;
    if (!force && sig === rowsSig) return;
    const active = document.activeElement as HTMLElement | null;
    const keepFocus = active && panel.contains(active) ? (active.dataset.id ? `[data-id="${CSS.escape(active.dataset.id)}"]` : active.dataset.filter ? `[data-filter="${active.dataset.filter}"]` : active.matches('.companion-back') ? '.companion-back' : active.matches('.companion-focus') ? '.companion-focus' : '') : '';
    rowsSig = sig;
    refs.summary.textContent = st.state === 'offline' ? T.offline : ORDER.map((s) => `${c[s]} ${T.status[s]}`).join(' · ');
    refs.chips.replaceChildren(...(['all', ...ORDER] as CompanionFilter[]).map((f) => {
      const b = el('button', `companion-chip${f === 'all' ? '' : ' s-' + f}`, `${f === 'all' ? T.all : T.status[f]} ${f === 'all' ? list.length : c[f]}`);
      b.type = 'button'; b.dataset.filter = f; b.setAttribute('aria-pressed', String(filter === f));
      b.addEventListener('click', () => { filter = f; if (opts.floorId) updateRememberedFilter(opts.floorId, f as ViewFilter); render(true); (refs!.chips.querySelector(`[data-filter="${f}"]`) as HTMLElement | null)?.focus(); });
      return b;
    }));
    const shown = list.filter((t) => filter === 'all' || t.status === filter);
    refs.list.replaceChildren(...(shown.length ? shown.map((t) => {
      const b = el('button', `companion-row s-${t.status}`); b.type = 'button'; b.dataset.id = t.id; b.setAttribute('aria-haspopup', 'dialog');
      b.setAttribute('aria-label', T.row(t.name, PROVIDERS[t.provider]?.label ?? t.provider, T.status[t.status]));
      const n = el('span', 'companion-name', t.name); const p = el('small', '', `${PROVIDERS[t.provider]?.label ?? t.provider}${t.workArea ? ' · ' + t.workArea : ''}`);
      const info = el('span', 'companion-info'); info.append(n, p);
      b.append(el('span', 'companion-dot'), info, el('span', 'companion-badge', T.status[t.status]));
      b.addEventListener('click', () => { selected = t.id; render(true); refs!.detail.querySelector<HTMLElement>('.companion-back')?.focus(); });
      return b;
    }) : [el('p', 'companion-note', st.state === 'offline' ? T.offline : T.empty)]));
    refs.list.dataset.state = st.state;
    detailFor(selected ? list.find((t) => t.id === selected) : undefined);
    if (keepFocus) panel.querySelector<HTMLElement>(keepFocus)?.focus();
    emitChange(st, list);
  };

  const trap = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (selected) closeDetail(); else close(true); return; }
    if (e.key !== 'Tab' || !panel) return;
    const items = [...panel.querySelectorAll<HTMLElement>('button, a[href], input, select, [tabindex="0"]')].filter((n) => !n.closest('[hidden], [inert]') && getComputedStyle(n).visibility !== 'hidden' && !(n as HTMLButtonElement).disabled);
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
  };

  const open = () => {
    if (panel) return;
    window.dispatchEvent(new Event('office-building-close'));
    opener = document.activeElement as HTMLElement | null;
    panel = el('section', 'companion'); panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-label', T.title);
    const head = el('header'); const h = el('h1', '', T.title);
    const closeBtn = el('button', 'companion-close', '← ' + T.close); closeBtn.type = 'button'; closeBtn.addEventListener('click', () => close(true));
    head.append(closeBtn, h);
    const summary = el('p', 'companion-summary'); summary.setAttribute('role', 'status'); summary.setAttribute('aria-live', 'polite'); summary.setAttribute('aria-label', T.summary);
    const fresh = el('p', 'companion-fresh');
    const chips = el('div', 'companion-chips'); chips.setAttribute('role', 'group'); chips.setAttribute('aria-label', T.filter);
    const list = el('div', 'companion-list'); const detail = el('section', 'companion-detail'); detail.hidden = true; detail.setAttribute('aria-labelledby', 'companion-detail-title');
    const msg = el('div', 'companion-addons'); msg.dataset.companionAddons = '';
    const tools = el('button', 'companion-tools', T.tools); tools.type = 'button';
    tools.addEventListener('click', () => window.dispatchEvent(new Event('office-app-tools')));
    msg.append(tools);
    const body = el('div', 'companion-body');
    if (opts.demo) {
      const demo = el('section', 'companion-demo'); demo.append(el('strong', '', T.demo), el('p', '', T.connectHint));
      const connect = el('button', '', T.published), notice = el('p', 'companion-note'); notice.setAttribute('role', 'status');
      connect.type = 'button'; connect.addEventListener('click', async () => {
        connect.disabled = true; notice.textContent = T.connecting;
        try {
          const me = await api<{ office: { id: string } }>('/session');
          const url = new URL('/', location.origin); url.searchParams.set('source', 'shared'); url.searchParams.set('floor', me.office.id); url.searchParams.set('companion', '1');
          const language = new URLSearchParams(location.search).get('lang'); if (language === 'en' || language === 'de') url.searchParams.set('lang', language);
          location.assign(url);
        } catch (error) { notice.textContent = error instanceof ApiError && error.status === 401 ? T.signIn : T.connectFailed; connect.disabled = false; }
      });
      demo.append(connect, notice); body.append(demo);
    }
    // Two views: this office (default) and the building-wide summary.
    const switcher = el('div', 'companion-views'); switcher.setAttribute('role', 'group'); switcher.setAttribute('aria-label', T.views);
    viewBtns = (['office', 'building'] as const).map((v) => { const b = el('button', '', v === 'office' ? T.thisOffice : T.building); b.type = 'button'; b.dataset.view = v; b.setAttribute('aria-pressed', String(v === 'office')); b.addEventListener('click', () => { setView(v); b.focus(); }); return b; });
    switcher.append(...viewBtns);
    officeEl = el('div', 'companion-office-view'); buildingEl = el('div', 'companion-building'); buildingEl.hidden = true;
    buildingEl.append(el('p', 'companion-note', T.buildingHint), el('p', 'companion-building-total'), el('div', 'companion-building-list'));
    body.append(switcher, officeEl, buildingEl);
    officeEl.append(summary, fresh, chips, list);
    if (opts.shared && opts.floorId) {
      // Optional: reopen this published office's agents on the next app start (phone-friendly), bound to this account.
      const floor = opts.floorId, row = el('label', 'companion-remember'), box = el('input'), note = el('p', 'companion-note');
      box.type = 'checkbox'; box.checked = rememberedView()?.floor === floor; note.setAttribute('role', 'status'); note.textContent = box.checked ? T.remembered : '';
      box.addEventListener('change', async () => {
        if (!box.checked) { forgetView(); note.textContent = ''; return; }
        box.disabled = true;
        try { await rememberView(floor, filter as ViewFilter); note.textContent = T.remembered; }
        catch (error) { box.checked = false; note.textContent = error instanceof ApiError && error.status === 401 ? T.rememberSignIn : T.rememberFailed; }
        finally { box.disabled = false; }
      });
      row.append(box, document.createTextNode(T.remember)); officeEl.append(row, note);
    }
    panel.append(head, body, detail, msg);
    refs = { summary, chips, fresh, list, detail, msg };
    // Everything behind the panel is inert and the scene is not drawn (see main loop) while it is open.
    inerted = [...document.body.children].filter((n): n is HTMLElement => n instanceof HTMLElement && n !== panel && !n.matches('dialog.app-tools')).map((n) => [n, n.inert]);
    for (const [n] of inerted) n.inert = true;
    document.body.append(panel); document.body.classList.add('companion-open');
    panel.addEventListener('keydown', trap);
    selected = null; rowsSig = ''; render(true);
    window.dispatchEvent(new CustomEvent('office-companion-open', { detail: { slot: msg, shared: opts.shared } }));
    timer = setInterval(() => render(), 1000);
    (refs.chips.querySelector('[aria-pressed=true]') as HTMLElement | null)?.focus();
  };

  const close = (restoreFocus: boolean) => {
    if (!panel) return;
    clearInterval(timer); timer = undefined; clearInterval(summaryTimer); summaryTimer = undefined; view = 'office'; buildingEl = officeEl = undefined; viewBtns = [];
    panel.remove(); panel = undefined; refs = undefined;
    for (const [n, was] of inerted) n.inert = was;
    inerted = []; document.body.classList.remove('companion-open');
    if (restoreFocus) (opener && opener.isConnected ? opener : launcher).focus();
    opener = null;
  };

  launcher.addEventListener('click', open);
  window.addEventListener('office-building-open', () => close(false));
  window.addEventListener('office-companion-close', () => close(true));
  // Status changes must reach add-ons even while the panel is closed; one cheap poll, no rendering.
  const bg = setInterval(() => { if (!panel) { const st = state(); emitChange(st, agents(st)); } }, 2000);
  window.addEventListener('pagehide', () => { clearInterval(bg); clearInterval(timer); }, { once: true });
  return { open, close: () => close(true) };
}
