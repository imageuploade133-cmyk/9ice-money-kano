const CACHE_NAME = "e-tech-wallet-v1.2.0";

const ASSETS_TO_CACHE = [
  "/",
  "/cpanel",
  "/auth/login",
  "/auth/signup",
  "/file.svg",
  "/globe.svg",
  "/next.svg",
  "/vercel.svg",
  "/window.svg",
];

// Install Event
self.addEventListener("install", (event) => {
  console.log("[Service Worker] Installing and caching static assets...");
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// Activate Event: Clear outdated cache buckets immediately on SW upgrade
self.addEventListener("activate", (event) => {
  console.log("[Service Worker] Activating and pruning old cache groups...");
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log("[Service Worker] Pruning obsolete cache group:", cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event: Cache First, Network Fallback with Dynamic Background Sync (Stale-While-Revalidate)
self.addEventListener("fetch", (event) => {
  // Only intercept GET requests
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  // Strictly skip caching server API lookups, Firebase, or external authorization services
  if (
    url.pathname.startsWith("/api") ||
    url.hostname.includes("firebase") ||
    url.hostname.includes("google") ||
    url.hostname.includes("googleapis") ||
    url.hostname.includes("duckdns")
  ) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Serve from cache instantly, then refresh cache in the background (stale-while-revalidate)
        fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse.status === 200) {
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, networkResponse);
              });
            }
          })
          .catch(() => {});
        return cachedResponse;
      }

      // If not in cache, fetch from network and dynamically cache the result
      return fetch(event.request)
        .then((networkResponse) => {
          if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== "basic") {
            return networkResponse;
          }

          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });

          return networkResponse;
        })
        .catch(() => {
          // Offline fallback: Never cross-serve main wallet '/' for CPanel routes
          if (event.request.mode === "navigate") {
            if (url.pathname.startsWith("/cpanel")) {
              return caches.match(event.request).then((cached) => cached || caches.match("/cpanel"));
            }
            return caches.match("/");
          }
        });
    })
  );
});
