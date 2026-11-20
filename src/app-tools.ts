/** Optional "App & alerts" dialog: install, update and alert controls. Opens only on the `office-app-tools` window event (or #app-tools); never on its own, never a permission prompt on load. */
import { S } from './i18n/app-tools';
import { initPwa, onPwaChange, pwa, applyUpdate, promptInstall, swSupported, isIos, getRegistration, whenPwaReady } from './pwa';
import { createAlerts, type AlertEnv, type Pref, type Result, type AlertIntent, type AlertRecord } from './alerts';
import { parseQuiet, inQuietHours, ALERT_HISTORY } from './alert-rules';
import { createWatcher } from './alert-watch';
import { api, ApiError, type Floor, type OfficeSnapshot } from './building-api';
import './app-tools.css';

const KEY = 'office.alerts';
const pref = {
  get(): Pref | null { try { const v = JSON.parse(localStorage.getItem(KEY) ?? 'null'); return v && typeof v.actor === 'string' ? { actor: v.actor, push: !!v.push, finished: !!v.finished, own: v.own !== false, quiet: parseQuiet(v.quiet) ?? null, muted: Array.isArray(v.muted) ? v.muted.filter((m: unknown) => typeof m === 'string').slice(0, 50) : [] } : null; } catch { return null; } },
  set(p: Pref | null) { try { if (p) localStorage.setItem(KEY, JSON.stringify(p)); else localStorage.removeItem(KEY); } catch { /* storage unavailable: alerts just are not remembered */ } },
};
/** Alerts shown (or held) by this page, for "Recent alerts". Kind and time only. */
const LOG = 'office.alerts.log';
function localLog(): AlertRecord[] { try { const v = JSON.parse(localStorage.getItem(LOG) ?? '[]'); return Array.isArray(v) ? v.filter((r) => r && typeof r.at === 'number' && typeof r.kind === 'string').slice(0, ALERT_HISTORY) : []; } catch { return []; } }
function record(kind: string, held: boolean) { try { localStorage.setItem(LOG, JSON.stringify([{ at: Date.now(), kind, sent: held ? 0 : 1, held: held ? 1 : 0 }, ...localLog()].slice(0, ALERT_HISTORY))); } catch { /* not remembered */ } }
async function show(kind: 'attention' | 'finished' | 'test') {
  const options = { body: S.notices[kind], tag: 'office-attention', icon: '/icons/icon-192.png' };
  const reg = getRegistration(); if (reg) await reg.showNotification('T3 Office', options); else new Notification('T3 Office', options);
}
async function showNotice(kind: 'attention' | 'finished') {
  const p = pref.get();
  if (!p || (kind === 'finished' && !p.finished) || Notification.permission !== 'granted') return;
  if (inQuietHours(p.quiet, Date.now())) { record(kind, true); return; }
  try { await show(kind); record(kind, false); } catch { /* the notification is a courtesy only */ }
}
let timer: ReturnType<typeof setInterval> | undefined;
const watcher = createWatcher({
  floors: async () => (await api<{ floors: Floor[] }>('/floors')).floors,
  office: (id) => api<OfficeSnapshot>(`/offices/${encodeURIComponent(id)}`),
  notify: (k) => void showNotice(k),
  includeOwn: () => pref.get()?.push === false && pref.get()?.own !== false,
  muted: () => pref.get()?.muted ?? [],
  includeFinished: () => pref.get()?.finished === true,
  authorized: async () => {
    const expected = pref.get();
    if (!expected || Notification.permission !== 'granted') return false;
    const me = await env.session();
    if (!me || me.id !== expected.actor) { void alerts.reconcile().then(r => { last = r; render(); }); return false; }
    return pref.get()?.actor === expected.actor;
  },
  isSignedOutError: (e) => e instanceof ApiError && e.status === 401,
  onSignedOut: () => void alerts.reconcile().then(render),
});
const env: AlertEnv = {
  support: () => !window.isSecureContext || !swSupported() ? 'insecure' : !('Notification' in window) ? 'unsupported' : isIos() && !pwa.standalone ? 'needs-install' : 'ok',
  permission: () => Notification.permission,
  requestPermission: () => Notification.requestPermission(),
  push: () => {
    const reg = getRegistration(); if (!reg || !('PushManager' in window)) return null;
    const wrap = (s: PushSubscription): import('./alerts').PushSub => { const j = s.toJSON(); return { endpoint: s.endpoint, keys: { p256dh: j.keys?.p256dh ?? '', auth: j.keys?.auth ?? '' }, unsubscribe: () => s.unsubscribe() }; };
    return { get: async () => { const s = await reg.pushManager.getSubscription(); return s ? wrap(s) : null; }, subscribe: async (k) => wrap(await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: k as BufferSource })) };
  },
  pref,
  session: async () => { try { return (await api<{ user: { id: string } }>('/session')).user; } catch (e) { if (e instanceof ApiError && e.status === 401) return null; throw e; } },
  config: async () => { await whenPwaReady; return api('/push/config'); },
  register: async (b) => { await api('/push/subscriptions', 'POST', b); },
  unregister: async (endpoint) => { await api('/push/subscriptions', 'DELETE', { endpoint }); },
  settings: async (b) => { await api('/push/settings', 'POST', b); },
  test: (endpoint) => api<{ delivered: boolean }>('/push/test', 'POST', { endpoint }),
  history: async () => (await api<{ alerts: AlertRecord[] }>('/push/history')).alerts,
  showLocal: async (kind) => { if (Notification.permission !== 'granted') return false; await show(kind); record(kind, false); return true; },
  startWatcher: () => { if (!timer) { void watcher.tick(); timer = setInterval(() => void watcher.tick(), 20_000); } },
  stopWatcher: () => { clearInterval(timer); timer = undefined; watcher.reset(); },
};
const alerts = createAlerts(env);

let dialog: HTMLDialogElement | null = null, last: Result | null = null, busy = false, preparing = false;
// Settings shown while alerts are on: shared offices you can be alerted about, server alert history, last message.
let offices: { id: string; name: string }[] | null = null, serverHistory: AlertRecord[] = [], controlNote = '';
async function loadControls() {
  if (!pref.get()) return;
  try { offices = (await api<{ floors: Floor[] }>('/floors')).floors.filter((f) => !f.isOwner && f.scope === 'activity').map((f) => ({ id: f.id, name: f.name })); } catch { offices = []; }
  try { serverHistory = pref.get()?.push && env.history ? await env.history() : []; } catch { serverHistory = []; }
  render();
}
let intent: AlertIntent | undefined;
async function prepareIntent() {
  preparing = true; intent = undefined; render();
  try { const me = await env.session(); if (me) intent = { actor: me.id, config: await env.config() }; } catch { /* retry on next open */ }
  preparing = false; render();
}
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, attrs: Record<string, string> = {}) => { const e = document.createElement(tag); if (text) e.textContent = text; for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };
const section = (title: string, ...kids: Node[]) => { const s = el('section'); s.append(el('h2', title), ...kids); return s; };
const para = (text: string, role?: string) => el('p', text, role ? { role } : {});
const button = (text: string, onClick: () => void, disabled = false) => { const b = el('button', text, { type: 'button' }); b.disabled = disabled || busy; b.addEventListener('click', onClick); return b; };
const noticeText = (n: Result['notice']) => n === 'dismissed' ? S.dismissed : n === 'denied' ? S.denied : n === 'signedOut' ? S.signedOut : n === 'accountChanged' ? S.accountChanged : n === 'failed' ? S.failed : '';
const stateText = (r: Result) => ({ insecure: S.unsupported, unsupported: S.unsupported, 'needs-install': S.iosNeedsInstall, denied: S.denied, 'signed-out': S.signedOut, off: S.stateOff, 'on-push': S.stateOn, 'on-foreground': S.stateOnForeground })[r.state];

function render() {
  if (!dialog) return;
  const r = last ?? alerts.status(), root = dialog;
  const focused = root.contains(document.activeElement) ? document.activeElement as HTMLElement : null;
  const focusLabel = focused?.getAttribute('aria-label') ?? focused?.textContent;
  const focusId = focused?.id;
  const head = el('header'); head.append(el('h1', S.title), button('×', () => dialog?.close(), false)); head.lastElementChild!.setAttribute('aria-label', S.close); (head.lastElementChild as HTMLButtonElement).disabled = false;
  const install = pwa.standalone ? [para(S.installed)] : pwa.canInstall ? [button(S.installBtn, async () => { await promptInstall(); render(); })] : [para(!window.isSecureContext ? S.installInsecure : isIos() ? S.installIos : S.installMenu)];
  const update = pwa.updateReady ? [para(S.updateReady), button(S.reload, applyUpdate)] : [para(S.upToDate)];
  const notice = noticeText(r.notice);
  const canToggle = !['insecure', 'unsupported', 'needs-install'].includes(r.state);
  const on = r.state === 'on-push' || r.state === 'on-foreground';
  const finished = el('input', undefined, { type: 'checkbox', id: 'app-alerts-finished' }); finished.checked = r.finished; finished.disabled = on || busy || !canToggle;
  const label = el('label'); label.append(finished, document.createTextNode(S.finishedLabel)); label.setAttribute('for', 'app-alerts-finished');
  const act = async (fn: () => Promise<Result>) => { busy = true; render(); try { last = await fn(); } catch { last = { ...alerts.status(), notice: 'failed' }; } busy = false; render(); if (last.state === 'on-push' || last.state === 'on-foreground') void loadControls(); };
  const toggle = on ? button(S.off, () => void act(() => alerts.disable())) : button(S.on, () => void act(() => alerts.enable(finished.checked, intent)), preparing || !canToggle || r.state === 'denied');
  const status = para(busy ? S.working : [stateText(r), notice && notice !== stateText(r) ? notice : ''].filter(Boolean).join(' '), 'status');
  const controls = on ? alertControls(r) : [];
  root.replaceChildren(head, section(S.appHead, ...install, para(S.onlineNote)), section(S.updateHead, ...update), section(S.alertsHead, para(S.alertsIntro), ...(canToggle && !on ? [label] : []), toggle, status, para(S.scopeNote)), ...controls);
  if (focused) {
    const controls = [...root.querySelectorAll<HTMLButtonElement | HTMLInputElement>('button, input')].filter(e => !e.disabled);
    (controls.find(e => focusId ? e.id === focusId : (e.getAttribute('aria-label') ?? e.textContent) === focusLabel) ?? (toggle.disabled ? head.querySelector('button') : toggle))?.focus({ preventScroll: true });
  }
}
/** Per-device choices, a test button and recent alerts; shown only while alerts are on. */
function alertControls(r: Result): HTMLElement[] {
  const p = pref.get(); if (!p) return [];
  const change = async (c: Parameters<typeof alerts.update>[0]) => { busy = true; controlNote = ''; render(); const ok = await alerts.update(c); controlNote = ok ? '' : S.saveFailed; busy = false; render(); };
  const check = (id: string, text: string, checked: boolean, onChange: (v: boolean) => void, hint?: string) => {
    const box = el('input', undefined, { type: 'checkbox', id }) as HTMLInputElement; box.checked = checked; box.disabled = busy;
    box.addEventListener('change', () => onChange(box.checked));
    const lab = el('label', undefined, { for: id, class: 'app-check' }); lab.append(box, document.createTextNode(text));
    return hint ? [lab, el('p', hint, { class: 'app-hint' })] : [lab];
  };
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const minutes = (v: string) => { const [h, m] = v.split(':').map(Number); return h * 60 + m; };
  const hhmm = (n: number) => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
  const quiet = p.quiet ?? { start: 22 * 60, end: 7 * 60, tz };
  const from = el('input', undefined, { type: 'time', id: 'app-quiet-from', value: hhmm(quiet.start), 'aria-label': S.quietFrom }) as HTMLInputElement;
  const to = el('input', undefined, { type: 'time', id: 'app-quiet-to', value: hhmm(quiet.end), 'aria-label': S.quietTo }) as HTMLInputElement;
  for (const t of [from, to]) { t.disabled = busy || !p.quiet; t.addEventListener('change', () => { if (from.value && to.value) void change({ quiet: { start: minutes(from.value), end: minutes(to.value), tz } }); }); }
  const times = el('div', undefined, { class: 'app-quiet' }); times.append(el('span', S.quietFrom), from, el('span', S.quietTo), to);
  const settings = section(S.controlsHead,
    ...check('app-alerts-own', S.ownLabel, p.own !== false, (v) => void change({ own: v }), p.push ? S.ownHintPush : S.ownHintForeground),
    ...check('app-alerts-finished', S.finishedLabel, p.finished, (v) => void change({ finished: v })),
    ...check('app-alerts-quiet', S.quietLabel, !!p.quiet, (v) => void change({ quiet: v ? { ...quiet, tz } : null }), S.quietHint(tz)), times);
  const shared = section(S.sharedHead, ...(offices === null ? [para(S.sharedLoading)] : offices.length ? offices.flatMap((o) => check(`app-mute-${o.id}`, o.name, !(p.muted ?? []).includes(o.id), (v) => void change({ muted: v ? (p.muted ?? []).filter((m) => m !== o.id) : [...(p.muted ?? []), o.id] }))) : [para(S.sharedNone)]));
  const testBtn = button(S.testBtn, async () => { busy = true; controlNote = ''; render(); const res = await alerts.test(); controlNote = res === 'sent' ? S.testSent : res === 'shown' ? S.testShown : S.testFailed; busy = false; render(); if (res === 'sent') setTimeout(() => void loadControls(), 1500); });
  const items = [...serverHistory.map((h) => ({ ...h, here: false })), ...localLog().map((h) => ({ ...h, here: true }))].sort((a, b) => b.at - a.at).slice(0, 10);
  const list = el('ul', undefined, { class: 'app-history' });
  list.append(...items.map((h) => el('li', `${new Date(h.at).toLocaleString()} · ${S.kinds[h.kind] ?? h.kind} · ${h.held && !h.sent ? S.historyHeld : h.here ? S.historyHere : S.historyDevices(h.sent)}${h.held && h.sent ? ` · ${S.historyHeld}` : ''}`)));
  const history = section(S.historyHead, ...(items.length ? [list] : [para(S.historyNone)]));
  return [settings, shared, section(S.testHead, testBtn, para(controlNote, 'status')), history];
}
function open() {
  if (!dialog) { dialog = el('dialog', undefined, { class: 'app-tools', 'aria-label': S.title }); document.body.append(dialog); dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog!.close(); }); onPwaChange(render); }
  last = null; offices = null; controlNote = ''; void prepareIntent(); render(); if (!dialog.open) dialog.showModal();
  void alerts.reconcile().then((r) => { last = r; render(); void loadControls(); });
}
/** A small, non-blocking banner when a new version is waiting; the person decides when to reload. */
let banner: HTMLElement | null = null;
function updateBanner() {
  if (!pwa.updateReady || banner) return;
  banner = el('div', undefined, { class: 'app-update', role: 'status' });
  banner.append(el('span', S.updateBanner), button(S.reload, applyUpdate), button(S.later, () => banner?.remove()));
  document.body.append(banner);
}
/** Called once from entry.ts. Registers the service worker (no prompts) and wires the opt-in dialog. */
export function initAppTools() {
  initPwa({ dev: import.meta.env.DEV });
  onPwaChange(updateBanner);
  addEventListener('office-app-tools', open);
  (window as unknown as { openOfficeAppTools?: () => void }).openOfficeAppTools = open;
  if (location.hash === '#app-tools') open();
  if (window.top === window && pref.get()) void alerts.reconcile(); // keeps an existing opt-in honest (account, permission); never prompts
  addEventListener('focus', () => { if (dialog?.open) void prepareIntent(); });
  if (window.top === window) navigator.serviceWorker?.addEventListener('message', (e) => { if (e.data?.type === 'push-subscription-changed' && pref.get()) void alerts.reconcile(); });
}
