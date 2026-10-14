// Synthetic PMS walkthrough: builds the SPA into a temporary folder and serves it
// on http://127.0.0.1:4177 with /api proxied to a disposable demo API and database.
// Ctrl+C stops both servers and removes the database container and build output.
// `node scripts/demo.mjs --check` starts the same stack, probes it and exits.
import { createRequire } from "node:module";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { root, startDemo } from "./demo-runtime.mjs";

const check = process.argv.includes("--check");
const PORT = 4177;
const ORIGIN = `http://127.0.0.1:${PORT}`;
let demo;
let preview;
let outDir;
let stopping = false;

// Bounded, so an open browser connection cannot keep the launcher alive.
async function closePreview() {
  if (!preview) return;
  let timer;
  try {
    await Promise.race([preview.close(), new Promise((_, fail) => {
      timer = setTimeout(() => fail(new Error("Vite preview shutdown timed out.")), 10000);
    })]);
  } finally {
    clearTimeout(timer);
    preview = undefined;
  }
}

async function removeBuild() {
  if (!outDir) return;
  if (dirname(outDir) !== resolve(tmpdir()) || !basename(outDir).startsWith("pms-demo-build-")) {
    throw new Error("Refusing to remove a folder outside this demo's temporary build output.");
  }
  await rm(outDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  outDir = undefined;
}

async function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const step of [closePreview, () => demo?.stop(), removeBuild]) {
    try { await step(); } catch (error) { console.error(error.message); code = 1; }
  }
  if (code === 0) console.log("Stopped; the demo database container and build output were removed.");
  process.exit(code);
}
process.once("SIGINT", () => shutdown(0));
process.once("SIGTERM", () => shutdown(0));

// Reads each body fully so keep-alive sockets do not hold the preview server open.
async function probe(path, init = {}) {
  const response = await fetch(`${ORIGIN}${path}`, { ...init, signal: AbortSignal.timeout(10000) });
  const body = await response.text();
  if (!response.ok) throw new Error(`${path} returned ${response.status}`);
  return body;
}

try {
  demo = await startDemo({ clientOrigin: ORIGIN, log: console.log });
  const requireFrontend = createRequire(join(root, "frontend", "package.json"));
  const { build, preview: startPreview } = await import(pathToFileURL(requireFrontend.resolve("vite")).href);
  const { default: react } = await import(pathToFileURL(requireFrontend.resolve("@vitejs/plugin-react")).href);
  outDir = await mkdtemp(join(tmpdir(), "pms-demo-build-"));
  const config = {
    root: join(root, "frontend"), configFile: false, envFile: false, plugins: [react()], logLevel: "warn",
    // Avatars render as local monograms, so the browser contacts no avatar service.
    define: { "import.meta.env.VITE_LOCAL_AVATARS": JSON.stringify("true") },
    build: { outDir, emptyOutDir: true },
    preview: { host: "127.0.0.1", port: PORT, strictPort: true, proxy: { "/api": { target: demo.origin } } },
  };
  console.log("Building the frontend into a temporary folder.");
  await build(config);
  preview = await startPreview(config);
  if (check) {
    const html = await probe("/");
    const entry = html.match(/<script[^>]+src="([^"]+)"/)?.[1];
    if (!html.includes("Demo Legal") || !entry?.startsWith("/assets/")) throw new Error("The compiled frontend entry was not served.");
    if ((await probe(entry)).length < 1000) throw new Error("The compiled bundle is unexpectedly small.");
    const health = JSON.parse(await probe("/api/health"));
    if (health.aiEnabled !== false || health.externalWidgets !== false) throw new Error("AI and external widgets must be disabled.");
    const session = JSON.parse(await probe("/api/auth/login", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "admin@example.test", password: demo.password }),
    }));
    const cycles = JSON.parse(await probe("/api/cycles", { headers: { Authorization: `Bearer ${session.token}` } }));
    if (!cycles.some((cycle) => cycle.name === "FY2026 Annual")) throw new Error("Seeded cycles were not returned through the proxy.");
    console.log("Demo check passed: compiled SPA, /api proxy, sign-in and seeded data, with AI and external widgets off.");
    await shutdown(0);
  } else {
    console.log(`\nDemo Legal PMS synthetic walkthrough: ${ORIGIN}`);
    console.log(`Password for every seeded example.test account (this run only): ${demo.password}`);
    console.log("Fictional data in a throwaway PostgreSQL container. AI, widget APIs and the avatar service are off.");
    console.log("Press Ctrl+C to stop both servers and remove the database container and build output.");
  }
} catch (error) {
  console.error(`Demo failed: ${error.message}`);
  await shutdown(1);
}
