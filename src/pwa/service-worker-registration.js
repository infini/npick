export function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || window.location.protocol === "file:") {
    return;
  }

  window.addEventListener("load", () => {
    const workerUrl = new URL("../../service-worker.js", import.meta.url);
    const scope = new URL("../../", import.meta.url);
    navigator.serviceWorker.register(workerUrl, { scope }).catch(() => {});
  });
}
