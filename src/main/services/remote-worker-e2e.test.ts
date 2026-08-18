import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentService } from "./agent-service.js";
import { ApiEvolutionService } from "./api-evolution-service.js";
import { AttachmentService } from "./attachment-service.js";
import { CapabilityService } from "./capability-service.js";
import { CommandRunner } from "./command-runner.js";
import { DevelopmentSpecService } from "./development-spec-service.js";
import { CoreApi } from "./core-api.js";
import { StateDatabase } from "./database.js";
import { GitService } from "./git-service.js";
import { LocalCatalogService } from "./local-catalog-service.js";
import { ProjectService } from "./project-service.js";
import { RemoteWorkerService } from "./remote-worker-service.js";
import { SettingsService } from "./settings-service.js";

const temporaryDirectories: string[] = [];
const databases: StateDatabase[] = [];
const apis: CoreApi[] = [];
const children: ChildProcess[] = [];

afterEach(async () => {
  for (const child of children.splice(0)) {
    if (child.exitCode === null) child.kill();
    await new Promise<void>((resolve) => child.exitCode === null ? child.once("close", () => resolve()) : resolve());
  }
  for (const api of apis.splice(0)) await api.close();
  for (const database of databases.splice(0)) database.close();
  await Promise.all(temporaryDirectories.splice(0).map(async (directory) => await rm(directory, { recursive: true, force: true })));
});

async function waitForJob(origin: string, apiKey: string, jobId: string, states: string[], timeoutMs = 20_000): Promise<Record<string, unknown>> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const response = await fetch(`${origin}/v1/workers/jobs`, { headers: { authorization: `Bearer ${apiKey}` } });
    const payload = await response.json() as { items: Array<Record<string, unknown>> };
    const job = payload.items.find((item) => item.id === jobId);
    if (job && states.includes(String(job.state))) return job;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`REMOTE_JOB_STATE_TIMEOUT:${jobId}:${states.join(",")}`);
}

describe("real remote worker process", () => {
  it("pairs, runs an allowlisted command and terminates a cancelled process tree", { timeout: 35_000 }, async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "devbox-worker-e2e-"));
    temporaryDirectories.push(root);
    const database = new StateDatabase(path.join(root, "state.sqlite"));
    databases.push(database);
    const runner = new CommandRunner();
    const projects = new ProjectService(database);
    await projects.open(root);
    const settings = new SettingsService(database);
    const agent = { respond: vi.fn() } as unknown as AgentService;
    const apiKey = "remote-worker-e2e-key";
    const remoteWorkers = new RemoteWorkerService(database);
    const api = new CoreApi({
      apiKey,
      database,
      projects,
      capabilities: new CapabilityService(runner),
      agent,
      evolution: new ApiEvolutionService(database, projects, agent, settings, new DevelopmentSpecService(database, path.resolve("specs", "development", "geliştirme-spec-task-graph.json")), new GitService(runner), runner),
      attachments: new AttachmentService(database, path.join(root, "attachments")),
      git: new GitService(runner),
      settings,
      remoteWorkers,
      catalog: new LocalCatalogService(path.join(root, "catalog"), runner),
      probeCwd: root,
      appVersion: "0.1.0-test"
    });
    apis.push(api);
    const origin = await api.start();
    const pairing = remoteWorkers.createPairing();
    let workerLog = "";
    const worker = spawn(process.execPath, [path.resolve("scripts", "remote-worker.mjs")], {
      cwd: path.resolve("."),
      windowsHide: true,
      env: {
        ...process.env,
        DEVBOX_URL: origin,
        DEVBOX_PAIRING_CODE: pairing.code,
        DEVBOX_WORKER_ROOT: root,
        DEVBOX_TOKEN_FILE: path.join(root, "worker-token"),
        DEVBOX_HEARTBEAT_INTERVAL_MS: "1000"
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    children.push(worker);
    worker.stdout?.on("data", (chunk) => { workerLog += chunk.toString("utf8"); });
    worker.stderr?.on("data", (chunk) => { workerLog += chunk.toString("utf8"); });

    const completed = remoteWorkers.enqueue("command", { command: "node", args: ["-e", "process.stdout.write('devbox-worker-ok')"], cwd: ".", timeoutMs: 10_000 });
    const completedJob = await waitForJob(origin, apiKey, completed.id, ["SUCCEEDED"]);
    expect(completedJob).toMatchObject({ state: "SUCCEEDED", result: { exitCode: 0, stdout: "devbox-worker-ok", reason: "COMPLETED" } });

    const cancellable = remoteWorkers.enqueue("command", { command: "node", args: ["-e", "setTimeout(() => {}, 30000)"], cwd: ".", timeoutMs: 30_000 });
    await waitForJob(origin, apiKey, cancellable.id, ["RUNNING"]);
    const cancelled = await fetch(`${origin}/v1/workers/jobs/${cancellable.id}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${apiKey}` }
    });
    expect(cancelled.status).toBe(200);
    const cancelledJob = await waitForJob(origin, apiKey, cancellable.id, ["CANCELLED"]);
    expect(cancelledJob).toMatchObject({ state: "CANCELLED", result: { reason: "USER_REQUEST" } });
    expect(worker.exitCode).toBeNull();
    expect(workerLog).not.toContain("REMOTE_JOB_STATE_TIMEOUT");
  });
});
