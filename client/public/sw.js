// Dynapharm Offline Service Worker
// Strategy:
//   /api/*          → network-only  (OfflineProvider queues failures in IndexedDB)
//   /assets/*       → cache-first   (Vite content-hash means cached files never go stale)
//   navigation/HTML → network-first → cached shell fallback  (SPA works offline)
//   everything else → network-first → cache fallback

const CACHE = 'dynapharm-shell-v5';

// ── Install: pre-cache the app shell ──────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.add('/'))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: drop every old cache ────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

// ── Fetch ──────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle GET requests from the same origin
  if (request.method !== 'GET' || url.origin !== location.origin) return;

  // ── API calls: always go to the network, never cache ──────────────────────
  // The OfflineProvider + IndexedDB queue handle the offline case in app code.
  if (url.pathname.startsWith('/api/')) return;

  // ── Vite assets (content-hashed filenames): cache-first ───────────────────
  // Once cached, these are valid until a new build with a different hash.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            caches.open(CACHE).then((cache) => cache.put(request, response.clone()));
          }
          return response;
        });
      })
    );
    return;
  }

  // ── Navigation + everything else: network-first, cached shell on failure ──
  event.respondWith(
    fetch(request)
      .then((response) => {
        // Keep a fresh copy of navigable HTML in the cache
        if (response.ok) {
          const isHtml =
            request.mode === 'navigate' ||
            response.headers.get('content-type')?.includes('text/html');
          if (isHtml) {
            caches.open(CACHE).then((cache) => cache.put(request, response.clone()));
          }
        }
        return response;
      })
      .catch(() =>
        // Offline: serve the specific cached URL or fall back to the root shell
        caches.match(request).then((hit) => hit || caches.match('/'))
      )
  );
});
