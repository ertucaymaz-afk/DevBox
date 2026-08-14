import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { CommandRunner } from "../dist/main/main/services/command-runner.js";
import { StateDatabase } from "../dist/main/main/services/database.js";

const workspace = path.resolve(new URL("..", import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/u, (match) => match.slice(1)));
const temporary = await mkdtemp(path.join(os.tmpdir(), "devbox-failure-injection-"));
const runner = new CommandRunner();
const cases = [];

function record(name, passed, evidence) {
  cases.push({ name, passed, evidence });
  if (!passed) throw new Error(`${name} failed: ${JSON.stringify(evidence)}`);
}

try {
  const missing = await runner.run({ executable: `devbox-missing-${Date.now()}.exe`, args: [], cwd: temporary, timeoutMs: 2_000 });
  record("spawn-error", missing.exitReason === "SPAWN_ERROR" && missing.exitCode === null, { exitReason: missing.exitReason, exitCode: missing.exitCode });

  const timeout = await runner.run({ executable: process.execPath, args: ["-e", "setInterval(() => {}, 1000)"], cwd: temporary, timeoutMs: 150 });
  record("timeout", timeout.exitReason === "TIMEOUT" && timeout.timedOut, { exitReason: timeout.exitReason, durationMs: timeout.durationMs });

  const controller = new AbortController();
  const cancellation = runner.run({ executable: process.execPath, args: ["-e", "setInterval(() => {}, 1000)"], cwd: temporary, timeoutMs: 5_000, cancellation: controller.signal });
  setTimeout(() => controller.abort(), 100).unref();
  const cancelled = await cancellation;
  record("cancellation", cancelled.exitReason === "CANCELLED", { exitReason: cancelled.exitReason, durationMs: cancelled.durationMs });

  const bounded = await runner.run({ executable: process.execPath, args: ["-e", "process.stdout.write('x'.repeat(1024 * 1024))"], cwd: temporary, timeoutMs: 5_000, maxOutputBytes: 32 * 1024 });
  record("output-bound", bounded.truncated && Buffer.byteLength(bounded.stdout, "utf8") <= 32 * 1024, { truncated: bounded.truncated, stdoutBytes: Buffer.byteLength(bounded.stdout, "utf8") });

  const database = new StateDatabase(path.join(temporary, "state", "devbox.sqlite"));
  try {
    const queued = database.enqueueDurableJob("failure-injection", { safe: true }, "aggregate-1");
    const leased = database.leaseNextDurableJob("worker-before-crash", 1_000);
    if (!leased) throw new Error("Durable job could not be leased");
    database.startDurableJob(leased.id, "worker-before-crash", 1_000);
    const recoveredCount = database.recoverExpiredDurableJobs(new Date(Date.now() + 2_000));
    const recovered = database.getDurableJob(queued.id);
    record("lease-crash-recovery", recoveredCount === 1 && recovered.state === "QUEUED" && recovered.leaseOwner === null, { recoveredCount, state: recovered.state, attempt: recovered.attempt });

    const cancelledQueued = database.enqueueDurableJob("cancel-before-run", {});
    const cancellationState = database.requestDurableJobCancellation(cancelledQueued.id);
    record("queued-cancellation", cancellationState.state === "CANCELLED", { state: cancellationState.state });
  } finally {
    database.close();
  }

  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    verdict: cases.every((item) => item.passed) ? "PASS" : "FAIL",
    scope: "bounded-local-failure-injection",
    limitations: ["This is not a clean-VM, network-partition or multi-hour production chaos run."],
    cases
  };
  const outputDirectory = path.join(workspace, "outputs");
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(path.join(outputDirectory, "failure-injection.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
