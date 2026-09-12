import { watch } from "node:fs";
import { relative, sep } from "node:path";
import { spawn } from "node:child_process";

const rootDir = new URL("..", import.meta.url).pathname;
const debounceMs = 2500;
const ignoredTopLevel = new Set([".git", "node_modules", "screenshots", "dist", "build", "coverage"]);
let timer = null;
let running = false;
let pending = false;

console.log("NPICK auto push watcher started.");

watch(rootDir, { recursive: true }, (_eventType, filename) => {
  if (!filename || shouldIgnore(filename)) {
    return;
  }

  schedule();
});

function schedule() {
  pending = true;
  clearTimeout(timer);
  timer = setTimeout(flush, debounceMs);
}

async function flush() {
  if (running) {
    pending = true;
    return;
  }

  running = true;
  pending = false;

  try {
    const status = await git(["status", "--porcelain"]);
    if (!status.trim()) {
      return;
    }

    await git(["add", "-A"]);
    const stamp = new Date().toISOString().replace("T", " ").slice(0, 19);
    const commit = await git(["commit", "-m", `chore: auto push ${stamp}`], { allowFailure: true });

    if (commit.code !== 0 && /nothing to commit/i.test(commit.stderr + commit.stdout)) {
      return;
    }

    if (commit.code !== 0) {
      throw new Error(commit.stderr || commit.stdout || "git commit failed");
    }

    const branch = (await git(["branch", "--show-current"])).trim() || "main";
    await git(["push", "origin", branch]);
    console.log(`Auto pushed ${branch} at ${stamp}.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
  } finally {
    running = false;
    if (pending) {
      schedule();
    }
  }
}

function shouldIgnore(filename) {
  const normalized = relative(rootDir, String(filename)).split(sep);
  const topLevel = normalized[0] || String(filename).split(/[\\/]/)[0];
  return ignoredTopLevel.has(topLevel) || topLevel.endsWith(".log");
}

function git(args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, {
      cwd: rootDir,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      const result = { code, stdout, stderr };
      if (code === 0 || options.allowFailure) {
        resolve(result);
      } else {
        reject(new Error(stderr || stdout || `git ${args.join(" ")} failed with ${code}`));
      }
    });
  });
}
