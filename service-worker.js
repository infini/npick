const CACHE_NAME = "npick-v16";
const APP_SHELL = [
  "./",
  "./index.html",
  "./index.html?v=16",
  "./manifest.webmanifest?v=16",
  "./assets/npick-mark.svg",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./data/lotto-data.js?v=16",
  "./data/weekly-recommendations.js?v=16",
  "./data/recommendation-analysis.js?v=16",
  "./src/app.js?v=16",
  "./src/styles.css?v=16",
  "./src/core/number-utils.js?v=16",
  "./src/core/random.js?v=16",
  "./src/core/recommendation-engine.js?v=16",
  "./src/core/hot104-engine.js?v=16",
  "./src/core/recommendation-comparison.js?v=16",
  "./src/core/recommendation-performance.js?v=16",
  "./src/core/statistics.js?v=16",
  "./src/core/weekly-cycle.js?v=16",
  "./src/pwa/install-prompt.js?v=16",
  "./src/pwa/service-worker-registration.js?v=16",
  "./src/ui/lotto-balls.js?v=16",
  "./src/ui/renderers.js?v=16",
  "./src/ui/performance.js?v=16",
  "./src/ui/strategy-comparison.js?v=16",
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
    url.pathname.endsWith("/data/weekly-recommendations.js") ||
    url.pathname.endsWith("/data/recommendation-analysis.js");

  const needsFreshResponse = isWeeklyData || request.mode === "navigate";
  event.respondWith(needsFreshResponse ? networkFirst(request) : staleWhileRevalidate(request));
});

async function networkFirst(request) {
  try {
    const response = await fetch(request, { cache: "no-store" });
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
      return response;
    }

    const cached = await getCachedResponse(request);
    return cached || response;
  } catch {
    const cached = await getCachedResponse(request);
    if (cached) return cached;
    throw new Error(`No network or cached response for ${request.url}`);
  }
}

async function getCachedResponse(request) {
  const cached = await caches.match(request);
  if (cached || request.mode !== "navigate") return cached;
  return caches.match("./index.html");
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
