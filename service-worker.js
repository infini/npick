const CACHE_NAME = "npick-v14";
const APP_SHELL = [
  "./",
  "./index.html",
  "./index.html?v=14",
  "./manifest.webmanifest?v=14",
  "./assets/npick-mark.svg",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./data/lotto-data.js?v=14",
  "./data/weekly-recommendations.js?v=14",
  "./src/app.js?v=14",
  "./src/styles.css?v=14",
  "./src/core/number-utils.js?v=14",
  "./src/core/random.js?v=14",
  "./src/core/recommendation-engine.js?v=14",
  "./src/core/statistics.js?v=14",
  "./src/core/weekly-cycle.js?v=14",
  "./src/pwa/install-prompt.js?v=14",
  "./src/pwa/service-worker-registration.js?v=14",
  "./src/ui/lotto-balls.js?v=14",
  "./src/ui/renderers.js?v=14",
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

  const url = new URL(request.url);
  const isWeeklyData =
    url.pathname.endsWith("/data/lotto-data.js") ||
    url.pathname.endsWith("/data/weekly-recommendations.js");

  event.respondWith(isWeeklyData ? networkFirst(request) : staleWhileRevalidate(request));
});

async function networkFirst(request) {
  try {
    const response = await fetch(request, { cache: "no-store" });
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
      return response;
    }

    const cached = await caches.match(request);
    return cached || response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw new Error(`No network or cached response for ${request.url}`);
  }
}

async function staleWhileRevalidate(request) {
  const cached = await caches.match(request);
  const fetched = fetch(request)
    .then(async (response) => {
      if (response.ok) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => cached);

  return cached || fetched;
}
