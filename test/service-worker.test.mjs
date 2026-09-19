import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("../service-worker.js", import.meta.url), "utf8");

function offlineWorker() {
  const handlers = new Map();
  const shell = { name: "latest cached index" };
  vm.runInNewContext(source, {
    URL,
    self: { location: { origin: "https://example.com" }, addEventListener: (name, handler) => handlers.set(name, handler) },
    fetch: async () => { throw new Error("offline"); },
    caches: { match: async (request) => request === "./index.html" ? shell : undefined },
  });
  return { shell, fetch: (path, mode) => {
    let response;
    handlers.get("fetch")({ request: { method: "GET", url: `https://example.com${path}`, mode },
      respondWith: (promise) => { response = promise; } });
    return response;
  } };
}

test("an installed app with an old versioned launch URL works offline after upgrade", async () => {
  const worker = offlineWorker();
  assert.equal(await worker.fetch("/npick/index.html?v=14", "navigate"), worker.shell);
});

test("missing analysis data never falls back to HTML", async () => {
  const worker = offlineWorker();
  await assert.rejects(worker.fetch("/npick/data/recommendation-analysis.js?v=15", "cors"), /No network or cached/);
});
