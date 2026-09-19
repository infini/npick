export function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || window.location.protocol === "file:") {
    return;
  }

  const hadController = Boolean(navigator.serviceWorker.controller);
  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController || refreshing) return;
    refreshing = true;
    window.location.reload();
  });

  window.addEventListener("load", () => {
    const workerUrl = new URL("../../service-worker.js?v=15", import.meta.url);
    const scope = new URL("../../", import.meta.url);
    navigator.serviceWorker.register(workerUrl, { scope, updateViaCache: "none" }).catch(() => {});
  });
}
