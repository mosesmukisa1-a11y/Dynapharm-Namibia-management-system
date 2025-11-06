const CACHE_NAME = 'dynapharm-v3.0';
const urlsToCache = [
  './',
  './index.html',
  './dynapharm-complete-system.html',
  './manifest.json',
  './web-modules/barcode-stock.js'
];

// Install event - cache resources
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache');
        // Cache files individually to handle failures gracefully
        // If one file fails, others will still be cached
        return Promise.allSettled(
          urlsToCache.map(url => 
            cache.add(url).catch(err => {
              console.warn(`Failed to cache ${url}:`, err);
              // Return a resolved promise so Promise.allSettled doesn't fail
              return null;
            })
          )
        );
      })
      .then(() => {
        console.log('Cache installation complete');
      })
      .catch(err => {
        console.error('Cache installation error:', err);
        // Don't fail the installation if caching fails
      })
  );
  // Activate new service worker immediately
  self.skipWaiting();
});

// Activate event - delete old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  // Take control of all clients immediately
  return self.clients.claim();
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  const req = event.request;
  let url;
  try { url = new URL(req.url); } catch(_) {}

  // Always bypass cache for API and cross-origin data/CDNs
  if (url) {
    const isSameOrigin = url.origin === self.location.origin;
    const isApi = isSameOrigin && url.pathname.startsWith('/api/');
    const isExternalData = url.hostname === 'raw.githubusercontent.com';
    const isCdn = /(?:cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com)/.test(url.hostname);
    if (isApi || isExternalData || isCdn) {
      event.respondWith(fetch(req));
      return;
    }
  }

  // Auto-fix: if a browser tries to import a script from /api/*.js,
  // rewrite to /web-modules/*.js when available to avoid Vercel serverless path
  try {
    const url = new URL(req.url);
    if (req.destination === 'script' && url.pathname.startsWith('/api/') && url.pathname.endsWith('.js')) {
      const fallbackPath = url.pathname.replace(/^\/api\//, '/web-modules/');
      const fallbackUrl = new URL(fallbackPath, url.origin).toString();
      event.respondWith(
        fetch(fallbackUrl).then((resp) => {
          if (resp && resp.ok) {
            console.warn('[SW] Remapped script import', url.pathname, '->', fallbackPath);
            return resp;
          }
          return fetch(req);
        }).catch(() => fetch(req))
      );
      return;
    }
  } catch (_) {}

  // Network-first for HTML documents to avoid serving stale pages
  if (req.destination === 'document') {
    event.respondWith(
      fetch(req)
        .then((networkResp) => {
          const respClone = networkResp.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, respClone));
          return networkResp;
        })
        .catch(() => {
          return caches.match(req)
            .then((cached) => {
              if (cached) return cached;
              return caches.match('./index.html');
            })
            .then((index) => {
              if (index) return index;
              return caches.match('./dynapharm-complete-system.html');
            });
        })
    );
    return;
  }

  // Cache-first strategy tailored for images (stale-while-revalidate-like)
  if (req.destination === 'image') {
    event.respondWith(
      caches.match(req).then((cached) => {
        const fetchAndCache = fetch(req)
          .then((networkResp) => {
            // Cache even opaque image responses (cross-origin), skip only non-200 non-opaque
            if (networkResp && (networkResp.ok || networkResp.type === 'opaque')) {
              const respClone = networkResp.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(req, respClone)).catch(() => {});
            }
            return networkResp;
          })
          .catch(() => cached || fetch(req));
        return cached || fetchAndCache;
      })
    );
    return;
  }

  // Cache-first for other assets
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((networkResp) => {
        // Only cache successful, basic responses
        if (!networkResp || networkResp.status !== 200 || networkResp.type !== 'basic') {
          return networkResp;
        }
        const respClone = networkResp.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, respClone));
        return networkResp;
      });
    })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  // Take control of uncontrolled clients as soon as activated
  self.clients.claim();
});

// Push notification event
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.text() : 'New notification';
  const options = {
    body: data,
    icon: '/manifest.json',
    badge: '/manifest.json',
    vibrate: [200, 100, 200],
    tag: 'notification',
    requireInteraction: true
  };
  
  event.waitUntil(
    self.registration.showNotification('Dynapharm International', options)
  );
});

// Notification click event
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow('/')
  );
});

