import { spawn } from "node:child_process";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const baseUrl = (process.env.DEVBOX_URL ?? "http://127.0.0.1:43110").replace(/\/$/u, "");
const workerRoot = path.resolve(process.env.DEVBOX_WORKER_ROOT ?? process.cwd());
const tokenFile = path.resolve(process.env.DEVBOX_TOKEN_FILE ?? path.join(os.homedir(), ".devbox", "worker-token"));
const allowedCommands = new Set(["git", "node", "pnpm", "npm", "pwsh", "dotnet"]);
let stopping = false;

async function request(route, token, body = {}) {
  const response = await fetch(`${baseUrl}${route}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000)
  });
  const payload = response.status === 204 ? null : await response.json();
  if (!response.ok) throw new Error(`${response.status}:${payload?.code ?? "REMOTE_REQUEST_FAILED"}`);
  return payload;
}

async function loadToken() {
  if (process.env.DEVBOX_WORKER_TOKEN) return process.env.DEVBOX_WORKER_TOKEN.trim();
  try { return (await readFile(tokenFile, "utf8")).trim(); } catch { /* first pairing */ }
  const code = process.env.DEVBOX_PAIRING_CODE?.trim();
  if (!code) throw new Error("DEVBOX_WORKER_TOKEN_OR_PAIRING_CODE_REQUIRED");
  const paired = await request("/v1/workers/pair", null, {
    code,
    name: process.env.DEVBOX_WORKER_NAME ?? os.hostname(),
    capabilities: [...allowedCommands]
  });
  await mkdir(path.dirname(tokenFile), { recursive: true });
  await writeFile(tokenFile, paired.token, { encoding: "utf8", mode: 0o600 });
  if (process.platform !== "win32") await chmod(tokenFile, 0o600);
  return paired.token;
}

function boundedCwd(relative = ".") {
  const target = path.resolve(workerRoot, relative);
  const relation = path.relative(workerRoot, target);
  if (relation.startsWith("..") || path.isAbsolute(relation)) throw new Error("REMOTE_JOB_CWD_OUTSIDE_ROOT");
  return target;
}

function runCommand(payload, onHeartbeat) {
  if (!payload || typeof payload !== "object") throw new Error("REMOTE_JOB_PAYLOAD_INVALID");
  const command = String(payload.command ?? "");
  const args = Array.isArray(payload.args) ? payload.args.map(String) : [];
  if (!allowedCommands.has(command) || args.length > 128 || args.some((arg) => arg.length > 4_096)) {
    throw new Error("REMOTE_JOB_COMMAND_NOT_ALLOWED");
  }
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: boundedCwd(typeof payload.cwd === "string" ? payload.cwd : "."),
      env: { PATH: process.env.PATH ?? "", SystemRoot: process.env.SystemRoot ?? "", TEMP: process.env.TEMP ?? "" },
      shell: false,
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    const append = (current, chunk) => `${current}${chunk}`.slice(-1_000_000);
    child.stdout.on("data", (chunk) => { stdout = append(stdout, chunk.toString("utf8")); });
    child.stderr.on("data", (chunk) => { stderr = append(stderr, chunk.toString("utf8")); });
    const timer = setInterval(onHeartbeat, 15_000);
    child.once("error", (error) => { clearInterval(timer); resolve({ exitCode: null, stdout, stderr: `${stderr}\n${error.message}`.trim() }); });
    child.once("close", (exitCode) => { clearInterval(timer); resolve({ exitCode, stdout, stderr }); });
  });
}

async function execute(token, job) {
  await request(`/v1/workers/agent/jobs/${job.id}/start`, token);
  if (job.kind !== "remote:command") throw new Error(`UNSUPPORTED_REMOTE_JOB_KIND:${job.kind}`);
  const result = await runCommand(job.payload, () => {
    void request(`/v1/workers/agent/jobs/${job.id}/heartbeat`, token).catch(() => undefined);
  });
  const state = result.exitCode === 0 ? "SUCCEEDED" : "FAILED";
  await request(`/v1/workers/agent/jobs/${job.id}/settle`, token, { state, result });
}

async function main() {
  const token = await loadToken();
  let delay = 1_000;
  while (!stopping) {
    try {
      const { job } = await request("/v1/workers/agent/lease", token);
      if (job) {
        try { await execute(token, job); }
        catch (error) {
          await request(`/v1/workers/agent/jobs/${job.id}/settle`, token, {
            state: "FAILED", result: { error: error instanceof Error ? error.message : String(error) }
          }).catch(() => undefined);
        }
      }
      delay = job ? 100 : 2_000;
    } catch (error) {
      process.stderr.write(`[DevBox Worker] ${error instanceof Error ? error.message : String(error)}\n`);
      delay = Math.min(delay * 2, 30_000);
    }
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}

process.on("SIGINT", () => { stopping = true; });
process.on("SIGTERM", () => { stopping = true; });
await main();
