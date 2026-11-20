/* T3 Office service worker. Deliberately small:
 * - caches ONLY explicitly public static files (hashed build assets, icons, manifest, offline page);
 * - never touches /api/*, OAuth/auth callbacks, dot paths, Vite internals or any URL with credential-like query parameters (the browser handles those, network only);
 * - navigations are network-only; a static offline page is shown only if the network fails. No snapshot, user or office data is ever stored;
 * - shows generic push notifications; the payload only selects one of three fixed texts. */
const CACHE_PREFIX = 't3-office-static-';
const CACHE = CACHE_PREFIX + 'v1';
const PRECACHE = ['/offline.html', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'];
const TEXT = {
  en: { attention: 'An agent needs attention', finished: 'An agent finished', test: 'Test alert: notifications work on this device.' },
  de: { attention: 'Ein Agent braucht Aufmerksamkeit', finished: 'Ein Agent ist fertig', test: 'Test-Hinweis: Benachrichtigungen funktionieren auf diesem Gerät.' },
};
const PRIVATE_QUERY = /^(code|state|error|error_description|token|access_token|id_token|session|sid|key|auth|invite|invitation|publisher_key|password)$/i;

function isPrivate(url) {
  const p = url.pathname;
  if (p === '/api' || p.startsWith('/api/') || p.startsWith('/auth') || p.startsWith('/oauth') || p.startsWith('/@') || p.startsWith('/node_modules/')) return true;
  if (/(^|\/)\./.test(p) || /\.local(\/|$)/.test(p)) return true;
  for (const key of url.searchParams.keys()) if (PRIVATE_QUERY.test(key)) return true;
  return false;
}
const isPublicStatic = (url) => !url.search && (/^\/assets\/[\w.-]+$/.test(url.pathname) || PRECACHE.includes(url.pathname));

self.addEventListener('install', (event) => {
  // No skipWaiting here: an update waits until the person chooses to reload, so a session is never swapped mid-use.
  event.waitUntil(caches.open(CACHE).then((c) => Promise.all(PRECACHE.map(async (url) => {
    const res = await fetch(url, { cache: 'reload' });
    if (!res.ok) throw new Error('precache failed');
    // Static hosts may redirect /offline.html to /offline; a redirected response must never be served to a navigation, so store a clean copy.
    await c.put(url, res.redirected ? new Response(res.body, { status: 200, headers: res.headers }) : res);
  }))));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE).map((k) => caches.delete(k)))));
});
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || isPrivate(url)) return;
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(() => caches.match('/offline.html').then((r) => r || Response.error())));
    return;
  }
  if (!isPublicStatic(url)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE), hit = await cache.match(req);
    if (hit) return hit;
    const res = await fetch(req);
    // Never cache an HTML fallback served for a missing asset, redirects, errors, or anything marked private/no-store.
    const type = res.headers.get('Content-Type') || '', control = res.headers.get('Cache-Control') || '';
    if (res.ok && res.type === 'basic' && !/html/i.test(type) && !/no-store|private/i.test(control) && !res.headers.has('Set-Cookie')) cache.put(req, res.clone()).catch(() => {});
    return res;
  })());
});

self.addEventListener('push', (event) => {
  let kind = 'attention';
  try { const d = event.data && event.data.json(); if (d && d.v === 1 && (d.kind === 'finished' || d.kind === 'test')) kind = d.kind; } catch (e) { /* generic text only */ }
  const lang = String(self.navigator.language || 'en').toLowerCase().startsWith('de') ? 'de' : 'en';
  event.waitUntil(self.registration.showNotification('T3 Office', { body: TEXT[lang][kind], tag: 'office-attention', icon: '/icons/icon-192.png', data: { office: true } }));
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const mine = all.find((c) => new URL(c.url).origin === self.location.origin);
    if (mine) return mine.focus();
    return self.clients.openWindow('/');
  })());
});
self.addEventListener('pushsubscriptionchange', (event) => {
  // The browser rotated or dropped the subscription. Re-subscribing needs the signed-in account, so ask open pages to re-check; closed apps re-sync on next open.
  event.waitUntil(self.clients.matchAll({ type: 'window' }).then((cs) => cs.forEach((c) => c.postMessage({ type: 'push-subscription-changed' }))));
});
