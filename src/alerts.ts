/** Opt-in alert controller. Nothing here runs a permission prompt or subscription unless enable() is called from an explicit click. Logic is DOM-free so tests can drive it with a fake environment. */
import { unb64u } from './webpush';
export interface PushSub { endpoint: string; keys: { p256dh: string; auth: string }; unsubscribe(): Promise<boolean> }
export interface Pref { actor: string; push: boolean; finished: boolean }
export type AlertState = 'insecure' | 'unsupported' | 'needs-install' | 'denied' | 'signed-out' | 'off' | 'on-push' | 'on-foreground';
export type Notice = 'dismissed' | 'denied' | 'signedOut' | 'accountChanged' | 'failed' | null;
export interface AlertEnv {
  support(): 'ok' | 'insecure' | 'unsupported' | 'needs-install';
  permission(): NotificationPermission; requestPermission(): Promise<NotificationPermission>;
  /** Null when this page has no service worker/Push API; push then stays off and alerts are foreground-only. */
  push(): { get(): Promise<PushSub | null>; subscribe(appServerKey: Uint8Array): Promise<PushSub> } | null;
  pref: { get(): Pref | null; set(p: Pref | null): void };
  session(): Promise<{ id: string } | null>; // null = definitely signed out (401); throws on network trouble
  config(): Promise<{ enabled: boolean; publicKey: string | null; subscriptions: number }>;
  register(body: { actorId: string; endpoint: string; keys: { p256dh: string; auth: string }; finished: boolean }): Promise<void>;
  unregister(endpoint: string): Promise<void>;
  startWatcher(): void; stopWatcher(): void;
}
export interface AlertIntent { actor: string; config: { enabled: boolean; publicKey: string | null; subscriptions: number } }
export interface Result { state: AlertState; notice: Notice; finished: boolean }
export function createAlerts(env: AlertEnv) {
  const base = (): AlertState | null => { const s = env.support(); return s === 'ok' ? null : s; };
  const stateFromPref = (): AlertState => { const p = env.pref.get(); return p ? (p.push ? 'on-push' : 'on-foreground') : 'off'; };
  const result = (state: AlertState, notice: Notice = null): Result => ({ state, notice, finished: env.pref.get()?.finished ?? false });
  /** Removes everything this browser holds for alerts. Server removal is best effort: a different account cannot delete it, and a dead endpoint is dropped by the next delivery (410/404). */
  async function cleanup() {
    env.stopWatcher();
    try { const sub = await env.push()?.get(); if (sub) { await env.unregister(sub.endpoint).catch(() => {}); await sub.unsubscribe().catch(() => {}); } } catch { /* nothing to remove */ }
    env.pref.set(null);
  }
  /** Called on startup and whenever the dialog opens. Never prompts. Re-validates account, permission and subscription. */
  async function reconcile(): Promise<Result> {
    const b = base(); if (b) return result(b);
    const pref = env.pref.get();
    if (!pref) return result(env.permission() === 'denied' ? 'denied' : 'off');
    if (env.permission() !== 'granted') { await cleanup(); return result('denied', 'denied'); }
    let me: { id: string } | null;
    try { me = await env.session(); } catch { env.startWatcher(); return result(stateFromPref()); } // offline: keep the opt-in, change nothing
    if (!me) { await cleanup(); return result('signed-out', 'signedOut'); }
    if (me.id !== pref.actor) { await cleanup(); return result('off', 'accountChanged'); }
    if (pref.push) {
      try {
        const cfg = await env.config(), channel = env.push();
        if (!cfg.enabled || !channel) { env.pref.set({ ...pref, push: false }); } else {
          let sub = await channel.get();
          if (!sub) sub = await channel.subscribe(unb64u(cfg.publicKey!)); // permission already granted by the person; no prompt
          await env.register({ actorId: me.id, endpoint: sub.endpoint, keys: sub.keys, finished: pref.finished });
        }
      } catch { /* leave as is; the dialog offers turning it off and on */ }
    }
    env.startWatcher();
    return result(stateFromPref());
  }
  /** Explicit opt-in from a click. The browser permission prompt happens here and nowhere else. */
  async function enable(finished: boolean, intent?: AlertIntent): Promise<Result> {
    const b = base(); if (b) return result(b);
    if (env.permission() === 'denied') return result('denied', 'denied');
    let me: { id: string } | null;
    try { me = intent ? { id: intent.actor } : await env.session(); } catch { return result('off', 'failed'); }
    if (!me) return result('signed-out', 'signedOut');
    let push = false, sub: PushSub | null = null;
    // The dialog preloads account/config before the click. Safari requires subscribe (or the
    // permission request for foreground-only alerts) directly in that click, before network awaits.
    const channel = env.push();
    if (intent?.config.enabled && intent.config.publicKey && channel) {
      try {
        sub = await channel.subscribe(unb64u(intent.config.publicKey));
        await env.register({ actorId: me.id, endpoint: sub.endpoint, keys: sub.keys, finished }); push = true;
      } catch {
        if (sub) await sub.unsubscribe().catch(() => {});
        if (env.permission() !== 'granted') return result(env.permission() === 'denied' ? 'denied' : 'off', env.permission() === 'denied' ? 'denied' : 'dismissed');
      }
    } else {
      const permission = env.permission() === 'granted' ? 'granted' : await env.requestPermission();
      if (permission === 'denied') return result('denied', 'denied');
      if (permission !== 'granted') return result('off', 'dismissed');
      try {
        const cfg = intent?.config ?? await env.config();
        if (cfg.enabled && channel && cfg.publicKey) {
          const existing = await channel.get();
          if (existing) await existing.unsubscribe().catch(() => {});
          sub = await channel.subscribe(unb64u(cfg.publicKey));
          try { await env.register({ actorId: me.id, endpoint: sub.endpoint, keys: sub.keys, finished }); push = true; }
          catch (e) { await sub.unsubscribe().catch(() => {}); sub = null; throw e; }
        }
      } catch { /* foreground-only alerts remain available if push cannot be configured */ }
    }
    // Account may have changed while the permission prompt or push registration was pending.
    try {
      const current = await env.session();
      if (!current || current.id !== me.id) { await cleanup(); return result(current ? 'off' : 'signed-out', current ? 'accountChanged' : 'signedOut'); }
    } catch { await cleanup(); return result('off', 'failed'); }
    env.pref.set({ actor: me.id, push, finished });
    env.startWatcher();
    return result(push ? 'on-push' : 'on-foreground');
  }
  async function disable(): Promise<Result> { await cleanup(); return result(base() ?? 'off'); }
  return { reconcile, enable, disable, status: (): Result => result(base() ?? (env.pref.get() ? stateFromPref() : env.permission() === 'denied' ? 'denied' : 'off')) };
}
