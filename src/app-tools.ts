/** Optional "App & alerts" dialog: install, update and alert controls. Opens only on the `office-app-tools` window event (or #app-tools); never on its own, never a permission prompt on load. */
import { S } from './i18n/app-tools';
import { initPwa, onPwaChange, pwa, applyUpdate, promptInstall, swSupported, isIos, getRegistration, whenPwaReady } from './pwa';
import { createAlerts, type AlertEnv, type Pref, type Result, type AlertIntent } from './alerts';
import { createWatcher } from './alert-watch';
import { api, ApiError, type Floor, type OfficeSnapshot } from './building-api';
import './app-tools.css';

const KEY = 'office.alerts';
const pref = {
  get(): Pref | null { try { const v = JSON.parse(localStorage.getItem(KEY) ?? 'null'); return v && typeof v.actor === 'string' ? { actor: v.actor, push: !!v.push, finished: !!v.finished } : null; } catch { return null; } },
  set(p: Pref | null) { try { if (p) localStorage.setItem(KEY, JSON.stringify(p)); else localStorage.removeItem(KEY); } catch { /* storage unavailable: alerts just are not remembered */ } },
};
async function showNotice(kind: 'attention' | 'finished') {
  if (!pref.get() || (kind === 'finished' && !pref.get()?.finished) || Notification.permission !== 'granted') return;
  const options = { body: S.notices[kind], tag: 'office-attention', icon: '/icons/icon-192.png' };
  try { const reg = getRegistration(); if (reg) return await reg.showNotification('T3 Office', options); new Notification('T3 Office', options); } catch { /* the notification is a courtesy only */ }
}
let timer: ReturnType<typeof setInterval> | undefined;
const watcher = createWatcher({
  floors: async () => (await api<{ floors: Floor[] }>('/floors')).floors,
  office: (id) => api<OfficeSnapshot>(`/offices/${encodeURIComponent(id)}`),
  notify: (k) => void showNotice(k),
  includeOwn: () => pref.get()?.push === false,
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
  startWatcher: () => { if (!timer) { void watcher.tick(); timer = setInterval(() => void watcher.tick(), 20_000); } },
  stopWatcher: () => { clearInterval(timer); timer = undefined; watcher.reset(); },
};
const alerts = createAlerts(env);

let dialog: HTMLDialogElement | null = null, last: Result | null = null, busy = false, preparing = false;
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
  const act = async (fn: () => Promise<Result>) => { busy = true; render(); try { last = await fn(); } catch { last = { ...alerts.status(), notice: 'failed' }; } busy = false; render(); };
  const toggle = on ? button(S.off, () => void act(() => alerts.disable())) : button(S.on, () => void act(() => alerts.enable(finished.checked, intent)), preparing || !canToggle || r.state === 'denied');
  const status = para(busy ? S.working : [stateText(r), notice && notice !== stateText(r) ? notice : ''].filter(Boolean).join(' '), 'status');
  root.replaceChildren(head, section(S.appHead, ...install, para(S.onlineNote)), section(S.updateHead, ...update), section(S.alertsHead, para(S.alertsIntro), ...(canToggle ? [label] : []), toggle, status, para(S.scopeNote)));
  if (focused) {
    const controls = [...root.querySelectorAll<HTMLButtonElement | HTMLInputElement>('button, input')].filter(e => !e.disabled);
    (controls.find(e => focusId ? e.id === focusId : (e.getAttribute('aria-label') ?? e.textContent) === focusLabel) ?? (toggle.disabled ? head.querySelector('button') : toggle))?.focus({ preventScroll: true });
  }
}
function open() {
  if (!dialog) { dialog = el('dialog', undefined, { class: 'app-tools', 'aria-label': S.title }); document.body.append(dialog); dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog!.close(); }); onPwaChange(render); }
  last = null; void prepareIntent(); render(); if (!dialog.open) dialog.showModal();
  void alerts.reconcile().then((r) => { last = r; render(); });
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
