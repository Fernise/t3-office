/** Installability and update handling. Registration is not a permission prompt; nothing here asks for notifications or subscribes to anything. */
export interface PwaState { updateReady: boolean; canInstall: boolean; standalone: boolean; registered: boolean }
type Listener = () => void;
const listeners = new Set<Listener>();
export const pwa: PwaState = { updateReady: false, canInstall: false, standalone: false, registered: false };
let deferredInstall: (Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> }) | null = null;
let registration: ServiceWorkerRegistration | null = null;
let reloading = false, reloadRequested = false;
let finishRegistration: () => void;
export const whenPwaReady = new Promise<void>(resolve => { finishRegistration = resolve; });
const emit = () => listeners.forEach((l) => l());
export const onPwaChange = (l: Listener) => { listeners.add(l); return () => listeners.delete(l); };
export const getRegistration = () => registration;
const standalone = () => matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;

/** Service workers need a secure context (HTTPS or localhost). Not registered inside the friends iframe, and not in `vite dev` unless ?pwa=1. */
export const swSupported = () => 'serviceWorker' in navigator && window.isSecureContext;
function watch(reg: ServiceWorkerRegistration) {
  const check = () => { if (reg.waiting && navigator.serviceWorker.controller) { pwa.updateReady = true; emit(); } };
  check();
  reg.addEventListener('updatefound', () => reg.installing?.addEventListener('statechange', function () { if (this.state === 'installed') check(); }));
}
export function initPwa(options: { dev?: boolean } = {}) {
  pwa.standalone = standalone();
  addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredInstall = e as typeof deferredInstall; pwa.canInstall = true; emit(); });
  addEventListener('appinstalled', () => { deferredInstall = null; pwa.canInstall = false; pwa.standalone = true; emit(); });
  if (window.top !== window || !swSupported() || (options.dev && !/[?&]pwa=1\b/.test(location.search))) { finishRegistration(); return; }
  const start = async () => {
    try {
      registration = await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' });
      pwa.registered = true; watch(registration); emit();
      // A new version is looked for when the person comes back to the tab, at most hourly.
      let last = Date.now();
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && Date.now() - last > 3_600_000) { last = Date.now(); void registration?.update().catch(() => {}); } });
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloading) return;
        if (!reloadRequested) { pwa.updateReady = true; emit(); return; }
        reloading = true; location.reload();
      });
    } catch { /* unsupported or blocked: the office works as before */ } finally { finishRegistration(); }
  };
  if (document.readyState === 'complete') void start(); else addEventListener('load', () => void start(), { once: true });
}
/** Only on an explicit click: the waiting worker takes over, then the page reloads once. */
export function applyUpdate() {
  if (registration?.waiting) { reloadRequested = true; registration.waiting.postMessage({ type: 'SKIP_WAITING' }); }
  else if (pwa.updateReady && !reloading) { reloading = true; location.reload(); }
}
/** Only on an explicit click. */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!deferredInstall) return 'unavailable';
  const e = deferredInstall; deferredInstall = null; pwa.canInstall = false; emit();
  await e.prompt();
  return (await e.userChoice).outcome === 'accepted' ? 'accepted' : 'dismissed';
}
export const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
