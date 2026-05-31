const CACHE_NAME = "npick-v7";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./assets/npick-mark.svg",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./data/lotto-data.js",
  "./src/app.js",
  "./src/styles.css",
  "./src/core/number-utils.js",
  "./src/core/random.js",
  "./src/core/recommendation-engine.js",
  "./src/core/statistics.js",
  "./src/pwa/install-prompt.js",
  "./src/pwa/service-worker-registration.js",
  "./src/ui/lotto-balls.js",
  "./src/ui/renderers.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const fetched = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);

      return cached || fetched;
    }),
  );
});
