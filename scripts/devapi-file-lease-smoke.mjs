import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

function assert(condition, code) { if (!condition) throw new Error(code); }
function digest(value) { return createHash("sha256").update(String(value ?? "")).digest("hex"); }
const childScript = path.resolve("scripts/devapi-file-lease-child.mjs");

function spawnChild(args) {
  const child = spawn(process.execPath, [childScript, ...args.map(String)], {
    cwd: process.cwd(),
    shell: false,
    windowsHide: true,
    env: { PATH: process.env.PATH || "", HOME: process.env.HOME || os.homedir(), CI: "1" }
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk.toString("utf8"); });
  child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
  return { child, getStdout: () => stdout, getStderr: () => stderr };
}

async function waitForClaim(proc, timeoutMs = 5000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const lines = proc.getStdout().trim().split(/\r?\n/u).filter(Boolean);
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        if (parsed.event === "CLAIMED") return parsed;
        if (parsed.event === "ERROR") throw new Error(parsed.message || "LEASE_CHILD_ERROR");
      } catch (error) {
        if (error instanceof SyntaxError) continue;
        throw error;
      }
    }
    await sleep(25);
  }
  throw new Error(`LEASE_SMOKE_CLAIM_TIMEOUT:${proc.getStderr().slice(0, 200)}`);
}

function waitExit(proc) {
  return new Promise((resolve, reject) => {
    proc.child.once("error", reject);
    proc.child.once("close", (code, signal) => resolve({ code: code ?? -1, signal, stdout: proc.getStdout(), stderr: proc.getStderr() }));
  });
}

function parseEvents(text) {
  return String(text).trim().split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line));
}

const root = await mkdtemp(path.join(os.tmpdir(), "devapi-lease-smoke-"));
const output = path.resolve("outputs/devapi-file-lease-smoke.json");
const file = "cloud/devapi-control/README.md";
let evidence;
try {
  const holder = spawnChild(["claim-hold", root, file, "4000", "1400"]);
  const holderClaim = await waitForClaim(holder);

  const contender = spawnChild(["claim-release", root, file, "4000", "0"]);
  const contenderResult = await waitExit(contender);
  const contenderEvents = parseEvents(contenderResult.stdout);
  const conflictEvent = contenderEvents.find((event) => event.event === "ERROR");
  assert(contenderResult.code === 3, "LEASE_SMOKE_CONTENDER_EXIT_CODE");
  assert(String(conflictEvent?.message || "").startsWith("CONFLICT_QUEUE:"), "LEASE_SMOKE_CONFLICT_NOT_QUEUED");

  const holderResult = await waitExit(holder);
  const holderEvents = parseEvents(holderResult.stdout);
  assert(holderResult.code === 0, "LEASE_SMOKE_HOLDER_FAILED");
  assert(holderEvents.some((event) => event.event === "RELEASED"), "LEASE_SMOKE_HOLDER_NOT_RELEASED");

  const staleOwner = spawnChild(["claim-exit", root, file, "600", "0"]);
  const staleResult = await waitExit(staleOwner);
  const staleEvents = parseEvents(staleResult.stdout);
  const staleClaim = staleEvents.find((event) => event.event === "CLAIMED");
  assert(staleResult.code === 0 && staleClaim?.leaseId, "LEASE_SMOKE_STALE_OWNER_NOT_CLAIMED");
  await sleep(900);

  const recovery = spawnChild(["claim-release", root, file, "1500", "0"]);
  const recoveryResult = await waitExit(recovery);
  const recoveryEvents = parseEvents(recoveryResult.stdout);
  const recoveredClaim = recoveryEvents.find((event) => event.event === "CLAIMED");
  assert(recoveryResult.code === 0, "LEASE_SMOKE_RECOVERY_FAILED");
  assert(recoveredClaim?.state === "RECOVERED", "LEASE_SMOKE_STALE_NOT_RECOVERED");
  assert(recoveredClaim?.recoveredFrom?.leaseId === staleClaim.leaseId, "LEASE_SMOKE_RECOVERY_PROVENANCE_MISMATCH");
  assert(recoveryEvents.some((event) => event.event === "RELEASED"), "LEASE_SMOKE_RECOVERY_NOT_RELEASED");

  evidence = {
    schemaVersion: 1,
    type: "CROSS_PROCESS_FILE_LEASE",
    file,
    liveConflict: {
      holderPid: holderClaim.pid,
      holderLeaseId: holderClaim.leaseId,
      contenderExitCode: contenderResult.code,
      state: "CONFLICT_QUEUE",
      verified: true
    },
    staleRecovery: {
      staleLeaseId: staleClaim.leaseId,
      recoveredLeaseId: recoveredClaim.leaseId,
      recoveredFrom: recoveredClaim.recoveredFrom,
      state: "RECOVERED",
      verified: true
    },
    truth: {
      state: "RUNTIME_VERIFIED",
      appliesTo: ["cross-process-file-lease", "live-owner-conflict", "ttl-stale-recovery"],
      doesNotApplyTo: ["distributed-multi-host-lock", "database-backed-lease", "production-known-good"]
    },
    completedAt: new Date().toISOString()
  };
  evidence.digest = digest(JSON.stringify(evidence));
} finally {
  await rm(root, { recursive: true, force: true });
}
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
console.log(`DEVAPI_FILE_LEASE_SMOKE_PASS conflictQueue=${evidence.liveConflict.verified} staleRecovery=${evidence.staleRecovery.verified} crossProcess=true digest=${evidence.digest}`);
