import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ApiEvolutionService } from "./api-evolution-service.js";
import { CloudControlService } from "./cloud-control-service.js";
import { StateDatabase } from "./database.js";
import type { EvolutionFindingService } from "./evolution-finding-service.js";
import type { MemoryService } from "./memory-service.js";
import { ProjectService } from "./project-service.js";
import type { ReleaseGateService } from "./release-gate-service.js";

const directories: string[] = [];
const databases: StateDatabase[] = [];
afterEach(async () => {
  vi.unstubAllGlobals();
  for (const database of databases.splice(0)) database.close();
  await Promise.all(directories.splice(0).map(async (directory) => await rm(directory, { recursive: true, force: true })));
});

async function fixture(environment: NodeJS.ProcessEnv = {}, evolution: ApiEvolutionService = {} as ApiEvolutionService) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "devbox-cloud-control-"));
  directories.push(directory);
  const database = new StateDatabase(path.join(directory, "state.sqlite"));
  databases.push(database);
  const projects = new ProjectService(database);
  const now = new Date().toISOString();
  projects.list();
  database.upsertProject({ id: "project-cloud-control", name: "cloud", rootPath: directory, isGitRepository: false, createdAt: now, updatedAt: now });
  const service = new CloudControlService(
    database,
    projects,
    evolution,
    {} as EvolutionFindingService,
    {} as ReleaseGateService,
    {} as MemoryService,
    environment
  );
  return { service, projectId: "project-cloud-control", database };
}

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const cloudEnvironment = {
  DEVBOX_CONTROL_PLANE_URL: "https://devbox.example",
  DEVBOX_CONTROL_PLANE_TOKEN: "x".repeat(40)
};
const command = {
  id: "11111111-1111-4111-8111-111111111111",
  sequence: 1,
  projectId: "project-cloud-control",
  kind: "evolution.setEnabled",
  payload: { enabled: true },
  createdAt: new Date().toISOString()
};
const runCommand = {
  id: "22222222-2222-4222-8222-222222222222",
  sequence: 1,
  projectId: "project-cloud-control",
  kind: "evolution.run",
  payload: {},
  createdAt: new Date().toISOString()
};
const cancelCommand = {
  id: "33333333-3333-4333-8333-333333333333",
  sequence: 2,
  projectId: "project-cloud-control",
  kind: "evolution.cancel",
  payload: {},
  createdAt: new Date().toISOString()
};

describe("CloudControlService", () => {
  it("is explicitly UNCONFIGURED when no cloud endpoint/token exists", async () => {
    const { service, projectId } = await fixture({});
    expect(service.status(projectId)).toMatchObject({ state: "UNCONFIGURED", configured: false, endpoint: null });
    expect(await service.sync(projectId)).toMatchObject({ state: "UNCONFIGURED" });
    expect(await service.poll(projectId)).toMatchObject({ state: "UNCONFIGURED" });
  });

  it("rejects insecure non-loopback HTTP endpoints", async () => {
    await expect(fixture({ DEVBOX_CONTROL_PLANE_URL: "http://example.com", DEVBOX_CONTROL_PLANE_TOKEN: "x".repeat(40) })).rejects.toThrow("DEVBOX_CONTROL_PLANE_HTTPS_REQUIRED");
  });

  it("rejects short cloud bearer/signing secrets", async () => {
    await expect(fixture({ DEVBOX_CONTROL_PLANE_URL: "https://devbox.example", DEVBOX_CONTROL_PLANE_TOKEN: "short" })).rejects.toThrow("DEVBOX_CONTROL_PLANE_TOKEN_TOO_SHORT");
  });

  it("accepts loopback HTTP for local development only", async () => {
    const { service, projectId } = await fixture({ DEVBOX_CONTROL_PLANE_URL: "http://127.0.0.1:43119", DEVBOX_CONTROL_PLANE_TOKEN: "x".repeat(40) });
    expect(service.status(projectId)).toMatchObject({ configured: true, state: "DEGRADED", endpoint: "http://127.0.0.1:43119" });
    service.stop();
  });

  it("applies an allowlisted cloud command once and acknowledges APPLIED before advancing the cursor", async () => {
    const setEnabled = vi.fn();
    const calls: Array<{ method: string; body: string }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      const url = input instanceof Request ? input.url : String(input);
      const method = init?.method ?? "GET";
      calls.push({ method, body: typeof init?.body === "string" ? init.body : "" });
      if (method === "GET" && url.includes("/api/v1/commands")) return response({ items: [command] });
      if (method === "PATCH" && url.includes("/api/v1/commands")) return response({ item: { ...command, applyStatus: "APPLIED" } });
      return response({ error: "UNEXPECTED_REQUEST" }, 500);
    }));
    const evolution = { setEnabled } as unknown as ApiEvolutionService;
    const { service, projectId } = await fixture(cloudEnvironment, evolution);

    const status = await service.poll(projectId);

    expect(setEnabled).toHaveBeenCalledTimes(1);
    expect(setEnabled).toHaveBeenCalledWith(projectId, true);
    expect(status).toMatchObject({ state: "READY", pendingCommandCursor: "1", lastError: null });
    expect(calls.map((item) => item.method)).toEqual(["GET", "PATCH"]);
    expect(JSON.parse(calls[1]?.body ?? "{}")).toMatchObject({ id: command.id, sequence: 1, status: "APPLIED" });
  });

  it("acknowledges evolution.run only after real running state and still processes following cancel in FIFO order", async () => {
    const runNow = vi.fn(() => new Promise<never>(() => undefined));
    const get = vi.fn(() => ({ isRunning: true }));
    const cancel = vi.fn();
    const acknowledgements: Array<{ sequence: number; status: string }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      const url = input instanceof Request ? input.url : String(input);
      const method = init?.method ?? "GET";
      if (method === "GET" && url.includes("/api/v1/commands")) return response({ items: [runCommand, cancelCommand] });
      if (method === "PATCH" && url.includes("/api/v1/commands")) {
        const body = JSON.parse(typeof init?.body === "string" ? init.body : "{}");
        acknowledgements.push({ sequence: Number(body.sequence), status: String(body.status) });
        return response({ item: { id: body.id, sequence: body.sequence, applyStatus: body.status } });
      }
      return response({ error: "UNEXPECTED_REQUEST" }, 500);
    }));
    const evolution = { runNow, get, cancel } as unknown as ApiEvolutionService;
    const { service, projectId } = await fixture(cloudEnvironment, evolution);

    const status = await service.poll(projectId);

    expect(runNow).toHaveBeenCalledTimes(1);
    expect(runNow).toHaveBeenCalledWith(projectId);
    expect(get).toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledWith(projectId);
    expect(acknowledgements).toEqual([
      { sequence: 1, status: "APPLIED" },
      { sequence: 2, status: "APPLIED" }
    ]);
    expect(status).toMatchObject({ state: "READY", pendingCommandCursor: "2", lastError: null });
  });

  it("does not process cancel when evolution.run fails before any real running state", async () => {
    const runNow = vi.fn(async () => { throw new Error("provider unavailable before run start"); });
    const get = vi.fn(() => ({ isRunning: false }));
    const cancel = vi.fn();
    const acknowledgements: Array<{ sequence: number; status: string }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      const url = input instanceof Request ? input.url : String(input);
      const method = init?.method ?? "GET";
      if (method === "GET" && url.includes("/api/v1/commands")) return response({ items: [runCommand, cancelCommand] });
      if (method === "PATCH" && url.includes("/api/v1/commands")) {
        const body = JSON.parse(typeof init?.body === "string" ? init.body : "{}");
        acknowledgements.push({ sequence: Number(body.sequence), status: String(body.status) });
        return response({ item: { id: body.id, sequence: body.sequence, applyStatus: body.status } });
      }
      return response({ error: "UNEXPECTED_REQUEST" }, 500);
    }));
    const evolution = { runNow, get, cancel } as unknown as ApiEvolutionService;
    const { service, projectId } = await fixture(cloudEnvironment, evolution);

    const status = await service.poll(projectId);

    expect(runNow).toHaveBeenCalledTimes(1);
    expect(cancel).not.toHaveBeenCalled();
    expect(acknowledgements).toEqual([{ sequence: 1, status: "RETRYING" }]);
    expect(status.state).toBe("DEGRADED");
    expect(status.pendingCommandCursor).toBeNull();
    expect(status.lastError).toContain("CLOUD_COMMAND_RETRYING");
  });

  it("marks poison commands RETRYING and terminally FAILED after five bounded attempts", async () => {
    const setEnabled = vi.fn(() => { throw new Error("provider exploded"); });
    const acknowledgements: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      const url = input instanceof Request ? input.url : String(input);
      const method = init?.method ?? "GET";
      if (method === "GET" && url.includes("/api/v1/commands")) return response({ items: [command] });
      if (method === "PATCH" && url.includes("/api/v1/commands")) {
        const body = JSON.parse(typeof init?.body === "string" ? init.body : "{}");
        acknowledgements.push(String(body.status));
        return response({ item: { ...command, applyStatus: body.status } });
      }
      return response({ error: "UNEXPECTED_REQUEST" }, 500);
    }));
    const evolution = { setEnabled } as unknown as ApiEvolutionService;
    const { service, projectId } = await fixture(cloudEnvironment, evolution);

    for (let attempt = 0; attempt < 4; attempt += 1) {
      expect(await service.poll(projectId)).toMatchObject({ state: "DEGRADED", pendingCommandCursor: null });
    }
    const terminal = await service.poll(projectId);

    expect(setEnabled).toHaveBeenCalledTimes(5);
    expect(acknowledgements).toEqual(["RETRYING", "RETRYING", "RETRYING", "RETRYING", "FAILED"]);
    expect(terminal.state).toBe("DEGRADED");
    expect(terminal.pendingCommandCursor).toBe("1");
    expect(terminal.lastError).toContain("CLOUD_COMMAND_FAILED");
  });
});
