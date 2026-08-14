import { spawn } from "node:child_process";
import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const baseUrl = (process.env.DEVBOX_URL ?? "http://127.0.0.1:43110").replace(/\/$/u, "");
const workerRoot = path.resolve(process.env.DEVBOX_WORKER_ROOT ?? process.cwd());
const tokenFile = path.resolve(process.env.DEVBOX_TOKEN_FILE ?? path.join(os.homedir(), ".devbox", "worker-token"));
const allowedCommands = new Set(["git", "node", "pnpm", "npm", "pwsh", "dotnet"]);
const DEFAULT_JOB_TIMEOUT_MS = 15 * 60_000;
const MAX_JOB_TIMEOUT_MS = 60 * 60_000;
const heartbeatOverride = Number(process.env.DEVBOX_HEARTBEAT_INTERVAL_MS ?? 10_000);
const HEARTBEAT_INTERVAL_MS = Number.isFinite(heartbeatOverride)
  ? Math.max(1_000, Math.min(30_000, Math.trunc(heartbeatOverride)))
  : 10_000;
let stopping = false;
let cancelActiveCommand = null;

async function request(route, token, body = {}, timeoutMs = 30_000) {
  const response = await fetch(`${baseUrl}${route}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs)
  });
  const payload = response.status === 204 ? null : await response.json();
  if (!response.ok) throw new Error(`${response.status}:${payload?.code ?? "REMOTE_REQUEST_FAILED"}`);
  return payload;
}

async function lockTokenFile() {
  if (process.platform !== "win32") {
    await chmod(tokenFile, 0o600);
    return;
  }
  const account = [process.env.USERDOMAIN, process.env.USERNAME].filter(Boolean).join("\\");
  if (!account) throw new Error("WINDOWS_ACCOUNT_NOT_DISCOVERED");
  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn("icacls.exe", [tokenFile, "/inheritance:r", "/grant:r", `${account}:(F)`], {
      windowsHide: true,
      shell: false,
      stdio: "ignore"
    });
    child.once("error", reject);
    child.once("close", resolve);
  });
  if (exitCode !== 0) throw new Error("WINDOWS_TOKEN_ACL_HARDENING_FAILED");
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
  try { await lockTokenFile(); }
  catch (error) {
    await rm(tokenFile, { force: true });
    throw error;
  }
  return paired.token;
}

function boundedCwd(relative = ".") {
  const target = path.resolve(workerRoot, relative);
  const relation = path.relative(workerRoot, target);
  if (relation.startsWith("..") || path.isAbsolute(relation)) throw new Error("REMOTE_JOB_CWD_OUTSIDE_ROOT");
  return target;
}

function processTreeTerminator(child) {
  return async () => {
    if (!child.pid || child.exitCode !== null) return;
    if (process.platform === "win32") {
      await new Promise((resolve) => {
        const killer = spawn("taskkill.exe", ["/pid", String(child.pid), "/t", "/f"], {
          windowsHide: true,
          shell: false,
          stdio: "ignore"
        });
        killer.once("error", () => resolve());
        killer.once("close", () => resolve());
      });
      return;
    }
    try { process.kill(-child.pid, "SIGTERM"); } catch { child.kill("SIGTERM"); }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    if (child.exitCode === null) {
      try { process.kill(-child.pid, "SIGKILL"); } catch { child.kill("SIGKILL"); }
    }
  };
}

function runCommand(payload, onHeartbeat) {
  if (!payload || typeof payload !== "object") throw new Error("REMOTE_JOB_PAYLOAD_INVALID");
  const command = String(payload.command ?? "");
  const args = Array.isArray(payload.args) ? payload.args.map(String) : [];
  if (!allowedCommands.has(command) || args.length > 128 || args.some((arg) => arg.length > 4_096)) {
    throw new Error("REMOTE_JOB_COMMAND_NOT_ALLOWED");
  }
  const requestedTimeout = Number(payload.timeoutMs ?? DEFAULT_JOB_TIMEOUT_MS);
  if (!Number.isFinite(requestedTimeout) || requestedTimeout < 1_000) throw new Error("REMOTE_JOB_TIMEOUT_INVALID");
  const timeoutMs = Math.min(Math.trunc(requestedTimeout), MAX_JOB_TIMEOUT_MS);
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: boundedCwd(typeof payload.cwd === "string" ? payload.cwd : "."),
      env: { PATH: process.env.PATH ?? "", SystemRoot: process.env.SystemRoot ?? "", TEMP: process.env.TEMP ?? "" },
      shell: false,
      windowsHide: true,
      detached: process.platform !== "win32"
    });
    let stdout = "";
    let stderr = "";
    let completed = false;
    let heartbeatRunning = false;
    let missedHeartbeats = 0;
    let terminationReason = null;
    const append = (current, chunk) => `${current}${chunk}`.slice(-1_000_000);
    child.stdout.on("data", (chunk) => { stdout = append(stdout, chunk.toString("utf8")); });
    child.stderr.on("data", (chunk) => { stderr = append(stderr, chunk.toString("utf8")); });
    const terminateTree = processTreeTerminator(child);
    const finish = (exitCode, errorMessage = "") => {
      if (completed) return;
      completed = true;
      clearInterval(heartbeatTimer);
      clearTimeout(timeoutTimer);
      cancelActiveCommand = null;
      resolve({
        exitCode,
        stdout,
        stderr: `${stderr}${errorMessage ? `\n${errorMessage}` : ""}`.trim(),
        state: terminationReason === "USER_REQUEST" || terminationReason === "WORKER_SHUTDOWN" ? "CANCELLED" : exitCode === 0 ? "SUCCEEDED" : "FAILED",
        reason: terminationReason ?? (exitCode === 0 ? "COMPLETED" : "PROCESS_EXIT")
      });
    };
    const cancel = async (reason) => {
      if (completed || terminationReason) return;
      terminationReason = reason;
      await terminateTree();
    };
    cancelActiveCommand = cancel;
    const heartbeat = async () => {
      if (completed || heartbeatRunning) return;
      heartbeatRunning = true;
      try {
        const response = await onHeartbeat();
        missedHeartbeats = 0;
        if (response?.job?.state === "CANCEL_REQUESTED") await cancel("USER_REQUEST");
      } catch (error) {
        missedHeartbeats += 1;
        const message = error instanceof Error ? error.message : String(error);
        if (/^(401|403):/u.test(message)) await cancel("AUTHORIZATION_REVOKED");
        else if (missedHeartbeats >= 2) await cancel("HEARTBEAT_LOST");
      } finally {
        heartbeatRunning = false;
      }
    };
    const heartbeatTimer = setInterval(() => { void heartbeat(); }, HEARTBEAT_INTERVAL_MS);
    const timeoutTimer = setTimeout(() => { void cancel("TIMEOUT"); }, timeoutMs);
    child.once("error", (error) => finish(null, error.message));
    child.once("close", (exitCode) => finish(exitCode));
  });
}

async function execute(token, job) {
  const started = await request(`/v1/workers/agent/jobs/${job.id}/start`, token);
  if (started?.job?.state === "CANCEL_REQUESTED") {
    await request(`/v1/workers/agent/jobs/${job.id}/settle`, token, { state: "CANCELLED", result: { reason: "USER_REQUEST" } });
    return;
  }
  if (job.kind !== "remote:command") throw new Error(`UNSUPPORTED_REMOTE_JOB_KIND:${job.kind}`);
  const result = await runCommand(job.payload, async () => await request(`/v1/workers/agent/jobs/${job.id}/heartbeat`, token, {}, 8_000));
  await request(`/v1/workers/agent/jobs/${job.id}/settle`, token, { state: result.state, result });
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

process.on("SIGINT", () => { stopping = true; void cancelActiveCommand?.("WORKER_SHUTDOWN"); });
process.on("SIGTERM", () => { stopping = true; void cancelActiveCommand?.("WORKER_SHUTDOWN"); });
await main();
