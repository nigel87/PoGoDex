const CACHE_VERSION = 'v1';
const STATIC_CACHE = `pogodex-static-${CACHE_VERSION}`;
const SPRITE_CACHE = `pogodex-sprites-${CACHE_VERSION}`;
const API_CACHE = `pogodex-api-${CACHE_VERSION}`;

// Assets to pre-cache immediately on Service Worker installation
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/favicon.ico',
  '/favicon.png',
  '/logo.png',
  '/manifest.json'
];

// Installation Event: pre-cache shell resources
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installazione in corso...');
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      console.log('[Service Worker] Pre-caching dell\'app shell...');
      return cache.addAll(PRECACHE_ASSETS);
    }).then(() => {
      return self.skipWaiting();
    })
  );
});

// Activation Event: cleanup old caches
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Attivazione in corso...');
  const activeCaches = [STATIC_CACHE, SPRITE_CACHE, API_CACHE];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName.startsWith('pogodex-') && !activeCaches.includes(cacheName)) {
            console.log(`[Service Worker] Eliminazione vecchia cache: ${cacheName}`);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});

// Fetch Event: intercept network requests and apply custom caching strategies
self.addEventListener('fetch', (event) => {
  // We only cache GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  const url = new URL(event.request.url);

  // 1. STRATEGY: Cache-First for PokeAPI Sprite Artworks (raw.githubusercontent.com)
  if (url.hostname === 'raw.githubusercontent.com' && url.pathname.includes('/PokeAPI/sprites')) {
    event.respondWith(
      caches.open(SPRITE_CACHE).then((cache) => {
        return cache.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse; // Return from cache immediately
          }
          // Fetch from network, cache a clone, and return
          return fetch(event.request).then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              cache.put(event.request, networkResponse.clone());
            }
            return networkResponse;
          }).catch((err) => {
            console.error('[Service Worker] Impossibile caricare lo sprite da remoto:', err);
            // Return nothing, browser will show default alt
          });
        });
      })
    );
    return;
  }

  // 2. STRATEGY: Network-First with Cache-Fallback for local backend REST APIs
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      caches.open(API_CACHE).then((cache) => {
        return fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        }).catch(() => {
          console.warn('[Service Worker] Connessione API fallita. Caricamento dati offline...');
          return cache.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse;
            }
            // Return a lightweight mock JSON if no cache is found to prevent crashing
            return new Response(JSON.stringify([]), {
              headers: { 'Content-Type': 'application/json' }
            });
          });
        });
      })
    );
    return;
  }

  // 3. STRATEGY: Network-First with Cache-Fallback for HTML / SPA Route navigations
  if (event.request.mode === 'navigate' || (event.request.headers.get('accept') && event.request.headers.get('accept').includes('text/html'))) {
    event.respondWith(
      fetch(event.request).catch((err) => {
        console.warn('[Service Worker] Navigazione offline rilevata. Caricamento app shell...');
        return caches.match('/index.html') || caches.match('/');
      })
    );
    return;
  }

  // 4. STRATEGY: Stale-While-Revalidate for Static Assets (JS, CSS, Fonts, Icons)
  // Cache all same-origin static assets
  if (
    url.origin === self.location.origin && 
    (url.pathname.includes('.') || event.request.destination === 'script' || event.request.destination === 'style')
  ) {
    event.respondWith(
      caches.open(STATIC_CACHE).then((cache) => {
        return cache.match(event.request).then((cachedResponse) => {
          const fetchPromise = fetch(event.request).then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              cache.put(event.request, networkResponse.clone());
            }
            return networkResponse;
          }).catch((err) => {
            // Silently absorb fetch errors in background
          });
          return cachedResponse || fetchPromise;
        });
      })
    );
    return;
  }
});
