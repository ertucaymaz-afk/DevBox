import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentService } from "./agent-service.js";
import { ApiEvolutionService } from "./api-evolution-service.js";
import { AttachmentService } from "./attachment-service.js";
import { CapabilityService } from "./capability-service.js";
import { CommandRunner } from "./command-runner.js";
import { CoreApi } from "./core-api.js";
import { StateDatabase } from "./database.js";
import { GitService } from "./git-service.js";
import { ProjectService } from "./project-service.js";
import { SettingsService } from "./settings-service.js";
import { RemoteWorkerService } from "./remote-worker-service.js";

const temporaryDirectories: string[] = [];
const databases: StateDatabase[] = [];
const apis: CoreApi[] = [];

afterEach(async () => {
  for (const api of apis.splice(0)) await api.close();
  for (const database of databases.splice(0)) database.close();
  await Promise.all(temporaryDirectories.splice(0).map(async (directory) => await rm(directory, { recursive: true, force: true })));
});

describe("loopback core API", () => {
  it("exposes health without credentials and protects versioned routes", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "devbox-api-test-"));
    temporaryDirectories.push(root);
    const database = new StateDatabase(path.join(root, "state.sqlite"));
    databases.push(database);
    const runner = new CommandRunner();
    const projects = new ProjectService(database);
    const project = await projects.open(root);
    const settings = new SettingsService(database);
    const agent = { respond: vi.fn().mockResolvedValue({ content: "Gerçek servis sözleşmesi için izole test yanıtı." }) } as unknown as AgentService;
    const api = new CoreApi({
      apiKey: "test-only-api-key",
      database,
      projects,
      capabilities: new CapabilityService(runner),
      agent,
      evolution: new ApiEvolutionService(database, projects, agent, settings),
      attachments: new AttachmentService(database, path.join(root, "attachments")),
      git: new GitService(runner),
      settings,
      remoteWorkers: new RemoteWorkerService(database),
      probeCwd: root,
      appVersion: "0.1.0-test"
    });
    apis.push(api);
    const origin = await api.start();

    const health = await fetch(`${origin}/health/ready`);
    const unauthenticated = await fetch(`${origin}/v1/runtime`);
    const authenticated = await fetch(`${origin}/v1/runtime`, { headers: { authorization: "Bearer test-only-api-key" } });
    const descriptor = await fetch(`${origin}/v1`, { headers: { authorization: "Bearer test-only-api-key" } });
    const queryWithoutCredential = await fetch(`${origin}/v1?format=json`);
    const createdThread = await fetch(`${origin}/v1/threads`, {
      method: "POST",
      headers: { authorization: "Bearer test-only-api-key", "content-type": "application/json" },
      body: JSON.stringify({ projectId: project.id, title: "API görevi" })
    });
    const created = await createdThread.json() as { thread: { id: string } };
    const createdMessage = await fetch(`${origin}/v1/threads/${created.thread.id}/messages`, {
      method: "POST",
      headers: { authorization: "Bearer test-only-api-key", "content-type": "application/json" },
      body: JSON.stringify({ content: "API mesajı" })
    });
    const pairingResponse = await fetch(`${origin}/v1/workers/pairings`, {
      method: "POST", headers: { authorization: "Bearer test-only-api-key" }
    });
    const pairing = await pairingResponse.json() as { code: string };
    const workerResponse = await fetch(`${origin}/v1/workers/pair`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: pairing.code, name: "test-worker", capabilities: ["node"] })
    });
    const credential = await workerResponse.json() as { token: string; worker: { id: string } };
    const reusedPairing = await fetch(`${origin}/v1/workers/pair`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: pairing.code, name: "second-worker", capabilities: ["node"] })
    });
    const unauthenticatedWorker = await fetch(`${origin}/v1/workers/agent/lease`, {
      method: "POST", headers: { "content-type": "application/json" }, body: "{}"
    });
    const remoteJobResponse = await fetch(`${origin}/v1/workers/jobs`, {
      method: "POST", headers: { authorization: "Bearer test-only-api-key", "content-type": "application/json" },
      body: JSON.stringify({ kind: "command", payload: { command: "node", args: ["--version"] } })
    });
    const remoteLease = await fetch(`${origin}/v1/workers/agent/lease`, {
      method: "POST", headers: { authorization: `Bearer ${credential.token}`, "content-type": "application/json" }, body: "{}"
    });

    expect(new URL(origin).hostname).toBe("127.0.0.1");
    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({ status: "ready", integrity: { ok: true } });
    expect(unauthenticated.status).toBe(401);
    expect(queryWithoutCredential.status).toBe(401);
    expect(authenticated.status).toBe(200);
    expect(await authenticated.json()).toMatchObject({ product: "DevBox", apiVersion: "v1", state: "READY" });
    expect(authenticated.headers.get("x-devbox-api-version")).toBe("v1");
    expect(descriptor.status).toBe(200);
    expect(await descriptor.json()).toMatchObject({ product: "DevBox", transport: "loopback" });
    expect(createdThread.status).toBe(201);
    expect(createdMessage.status).toBe(201);
    expect(await createdMessage.json()).toMatchObject({
      thread: { id: created.thread.id },
      items: [
        { role: "user", content: "API mesajı" },
        { role: "assistant", content: "Gerçek servis sözleşmesi için izole test yanıtı." }
      ]
    });
    expect(pairingResponse.status).toBe(201);
    expect(workerResponse.status).toBe(201);
    expect(reusedPairing.status).toBe(409);
    expect(unauthenticatedWorker.status).toBe(401);
    expect(credential.token).toMatch(/^dvw_/u);
    expect(remoteJobResponse.status).toBe(202);
    expect(remoteLease.status).toBe(200);
    expect(await remoteLease.json()).toMatchObject({ job: { kind: "remote:command", leaseOwner: credential.worker.id } });
  });
});
