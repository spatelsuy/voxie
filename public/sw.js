/* ─── Kahija Service Worker ─────────────────────────────────────────────────
   Strategy:
   - App shell (HTML, JS, CSS) → Cache-first, update in background
   - API calls (/api/*) → Network-only (never cache — always fresh data)
   - Static assets (images, icons) → Cache-first
   ─────────────────────────────────────────────────────────────────────────── */

const CACHE_NAME = "kahija-v1";

const APP_SHELL = [
  "/",
  "/manifest.json",
  "/K_ico.png",
  "/K_Logo.png",
  "/K_Logo-record.png",
];

/* ── Install: pre-cache the app shell ── */
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

/* ── Activate: delete old caches ── */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

/* ── Fetch: network-only for API, cache-first for everything else ── */
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  /* Always go to the network for API routes */
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(fetch(request));
    return;
  }

  /* Cache-first for everything else */
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        /* Return cached, but refresh in background */
        const networkFetch = fetch(request)
          .then((response) => {
            if (response && response.status === 200 && response.type === "basic") {
              caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
            }
            return response;
          })
          .catch(() => {});
        /* Suppress unused promise warning */
        void networkFetch;
        return cached;
      }
      /* Not in cache — go to network and cache the result */
      return fetch(request).then((response) => {
        if (!response || response.status !== 200 || response.type !== "basic") {
          return response;
        }
        caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
        return response;
      });
    })
  );
});
