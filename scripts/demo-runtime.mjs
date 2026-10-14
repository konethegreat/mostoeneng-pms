// Starts the real PMS API on loopback against a throwaway PostgreSQL 16 container,
// with a generated database password, signing key and account password, the
// fictional seed, and AI and external widget calls switched off. Shared by the
// demo launcher and the HTTP workflow test; it never uses the caller's DATABASE_URL.
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const backend = join(root, "backend");
export const CONTAINER_LABEL = "mostoeneng-pms.disposable-demo=true";
const IMAGE = "postgres:16-alpine";
const DATABASE = "pms_demo";

// Runs a command without a shell and with a deadline; resolves with its output.
function run(command, args, { env = process.env, timeoutMs = 120000 } = {}) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { cwd: backend, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { output += chunk; });
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.once("exit", (code, signal) => {
      clearTimeout(timer);
      if (code === 0) resolveRun(output.trim());
      else reject(new Error(`${command} ${args.slice(0, 2).join(" ")} failed (${signal || code}): ${output.trim().slice(-1500)}`));
    });
  });
}

async function freePort() {
  const probe = createServer();
  await new Promise((ready, fail) => { probe.once("error", fail); probe.listen(0, "127.0.0.1", ready); });
  const { port } = probe.address();
  await new Promise((done) => probe.close(done));
  return port;
}

async function waitFor(check, description, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${description}.`);
    await new Promise((wait) => setTimeout(wait, 250));
  }
}

function startApi(env) {
  const child = spawn(process.execPath, ["src/server.js"], { cwd: backend, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  const keep = (chunk) => { output = (output + chunk).slice(-20000); };
  child.stdout.on("data", keep);
  child.stderr.on("data", keep);
  return { child, logs: () => output };
}

// Waits for /api/health and refuses an instance that could reach AI or widget APIs.
async function waitForApi(api, origin) {
  await waitFor(async () => {
    if (api.child.exitCode !== null) throw new Error(`The demo API exited during start-up: ${api.logs()}`);
    let health;
    try {
      const response = await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(1000) });
      health = await response.json();
      if (!response.ok || health.service !== "mostoeneng-pms") return false;
    } catch {
      return false;
    }
    if (health.aiEnabled !== false || health.externalWidgets !== false) {
      throw new Error("The demo API must run with AI and external widgets disabled.");
    }
    return true;
  }, "the demo API", 30000);
}

async function stopApi(api) {
  const { child } = api;
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise((done) => child.once("exit", done));
  child.kill("SIGTERM");
  const timer = setTimeout(() => child.kill("SIGKILL"), 5000);
  await exited;
  clearTimeout(timer);
}

export async function startDemo({ clientOrigin = "http://127.0.0.1:4177", log = () => {} } = {}) {
  const container = `mostoeneng-pms-demo-${randomBytes(6).toString("hex")}`;
  const databasePassword = randomBytes(24).toString("hex");
  const password = randomBytes(18).toString("base64url");
  let api;

  // Removes only this run's uniquely named container and its anonymous volume.
  async function stop() {
    if (api) await stopApi(api);
    await run("docker", ["rm", "--force", "--volumes", container]).catch(() => {});
    const left = await run("docker", ["ps", "--all", "--quiet", "--filter", `name=^/${container}$`]);
    if (left) throw new Error(`The demo database container ${container} is still present.`);
  }

  try {
    log("Starting a disposable PostgreSQL 16 container on 127.0.0.1.");
    try {
      // The password reaches Docker through the environment, not the command line.
      await run("docker", ["run", "--detach", "--rm", "--name", container, "--label", CONTAINER_LABEL,
        "--publish", "127.0.0.1::5432", "--env", "POSTGRES_PASSWORD",
        "--env", `POSTGRES_USER=${DATABASE}`, "--env", `POSTGRES_DB=${DATABASE}`, IMAGE],
      { env: { ...process.env, POSTGRES_PASSWORD: databasePassword }, timeoutMs: 300000 });
    } catch (error) {
      if (error.code === "ENOENT") throw new Error("Docker is required for the disposable PostgreSQL demo database.");
      throw error;
    }
    const mapping = await run("docker", ["port", container, "5432/tcp"]);
    const databasePort = Number(mapping.split(/\r?\n/)[0].split(":").at(-1));
    if (!Number.isInteger(databasePort) || databasePort < 1) throw new Error(`Unexpected database port mapping: ${mapping}`);
    // TCP readiness: the image's first-boot server only listens on its socket.
    await waitFor(() => run("docker", ["exec", container, "pg_isready", "--host=127.0.0.1",
      `--username=${DATABASE}`, `--dbname=${DATABASE}`], { timeoutMs: 10000 }).then(() => true, () => false),
    "PostgreSQL", 90000);

    // Explicit values win over the caller's environment and any backend/.env file.
    const env = {
      ...process.env,
      NODE_ENV: "development",
      DATABASE_URL: `postgresql://${DATABASE}:${databasePassword}@127.0.0.1:${databasePort}/${DATABASE}?schema=public`,
      JWT_SECRET: randomBytes(48).toString("hex"),
      JWT_EXPIRES_IN: "1h",
      ALLOW_DEMO_SEED: "true",
      SEED_PASSWORD: password,
      HOST: "127.0.0.1",
      PORT: String(await freePort()),
      CLIENT_ORIGIN: clientOrigin,
      AI_ENABLED: "false",
      ANTHROPIC_API_KEY: "",
      EXTERNAL_WIDGETS_ENABLED: "false",
      CHECKPOINT_DISABLE: "1", // no Prisma CLI update check
    };
    log("Creating the schema.");
    await run(process.execPath, [join(backend, "node_modules", "prisma", "build", "index.js"), "db", "push", "--skip-generate"], { env });
    log("Seeding the fictional firm.");
    await run(process.execPath, ["prisma/seed.js"], { env });
    const origin = `http://127.0.0.1:${env.PORT}`;
    api = startApi(env);
    await waitForApi(api, origin);
    log("Loopback API ready; AI and external widgets are off.");
    return {
      origin,
      password,
      container,
      // Restarts only the API process; the database and its data stay in place.
      async restart() {
        await stopApi(api);
        api = startApi(env);
        await waitForApi(api, origin);
      },
      stop,
      logs: () => api.logs(),
    };
  } catch (error) {
    try { await stop(); } catch (cleanupError) { error.message += ` (cleanup also failed: ${cleanupError.message})`; }
    throw error;
  }
}
