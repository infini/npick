export function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || window.location.protocol === "file:") {
    return;
  }

  window.addEventListener("load", () => {
    const workerUrl = new URL("../../service-worker.js?v=13", import.meta.url);
    const scope = new URL("../../", import.meta.url);
    navigator.serviceWorker.register(workerUrl, { scope }).catch(() => {});
  });
}
