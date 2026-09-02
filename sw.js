// Service worker for Nethuli Sewwandi portfolio
// VERSION is rewritten by build.py on each build to bust the cache.
const VERSION = 'v9';
const CACHE = 'portfolio-' + VERSION;
const NAV_TIMEOUT_MS = 3000;

const SHELL = [
  './',
  './manifest.json',
  './icon.svg',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    try {
      const c = await caches.open(CACHE);
      await Promise.all(SHELL.map(u => c.add(u).catch(err => {
        console.warn('[sw] precache failed for', u, err);
      })));
    } catch (err) {
      console.warn('[sw] install error', err);
    }
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    } catch (err) {
      console.warn('[sw] activate cleanup error', err);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('message', e => {
  if (e.data === 'skip-waiting') self.skipWaiting();
});

function fetchWithTimeout(req, ms) {
  return Promise.race([
    fetch(req),
    new Promise((_, rej) => setTimeout(() => rej(new Error('nav timeout')), ms))
  ]);
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Network-first for HTML with a hard timeout — never block the splash forever.
  // Falls back to cached navigation, then to the cached app shell.
  if (req.mode === 'navigate' || req.destination === 'document') {
    e.respondWith((async () => {
      try {
        const res = await fetchWithTimeout(req, NAV_TIMEOUT_MS);
        if (res && res.ok) {
          const c = await caches.open(CACHE);
          c.put(req, res.clone()).catch(() => {});
        }
        return res;
      } catch (err) {
        console.warn('[sw] nav fallback to cache:', err.message);
        const cached = await caches.match(req, { ignoreSearch: true });
        return cached
          || (await caches.match('./', { ignoreSearch: true }))
          || (await caches.match('./index.html', { ignoreSearch: true }))
          || Response.error();
      }
    })());
    return;
  }

  // Cache-first for static assets (photos, icons).
  e.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    try {
      const res = await fetch(req);
      if (res && res.ok && res.type === 'basic') {
        const c = await caches.open(CACHE);
        c.put(req, res.clone()).catch(() => {});
      }
      return res;
    } catch {
      return Response.error();
    }
  })());
});
