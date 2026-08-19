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

async function fixture(evolution: ApiEvolutionService) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "devbox-cloud-idempotency-"));
  directories.push(directory);
  const database = new StateDatabase(path.join(directory, "state.sqlite"));
  databases.push(database);
  const projects = new ProjectService(database);
  const now = new Date().toISOString();
  const projectId = "project-cloud-idempotency";
  database.upsertProject({ id: projectId, name: "idempotency", rootPath: directory, isGitRepository: false, createdAt: now, updatedAt: now });
  const service = new CloudControlService(
    database,
    projects,
    evolution,
    {} as EvolutionFindingService,
    {} as ReleaseGateService,
    {} as MemoryService,
    {
      DEVBOX_CONTROL_PLANE_URL: "https://devbox.example",
      DEVBOX_CONTROL_PLANE_TOKEN: "x".repeat(40)
    }
  );
  return { service, projectId };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("CloudControlService idempotency", () => {
  it("does not re-apply a locally successful command when the first cloud ACK fails", async () => {
    const setEnabled = vi.fn();
    const command = {
      id: "44444444-4444-4444-8444-444444444444",
      sequence: 41,
      projectId: "project-cloud-idempotency",
      kind: "evolution.setEnabled",
      payload: { enabled: true },
      createdAt: new Date().toISOString()
    };
    let patchAttempts = 0;

    vi.stubGlobal("fetch", vi.fn(async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      const url = input instanceof Request ? input.url : String(input);
      const method = init?.method ?? "GET";
      if (method === "GET" && url.includes("/api/v1/commands")) return json({ items: [command] });
      if (method === "PATCH" && url.includes("/api/v1/commands")) {
        patchAttempts += 1;
        if (patchAttempts === 1) return json({ error: "transient-ack-failure" }, 503);
        const body = JSON.parse(typeof init?.body === "string" ? init.body : "{}");
        return json({ item: { ...command, applyStatus: body.status, appliedInstanceId: "desktop" } });
      }
      return json({ error: "UNEXPECTED_REQUEST" }, 500);
    }));

    const evolution = { setEnabled } as unknown as ApiEvolutionService;
    const { service, projectId } = await fixture(evolution);

    const first = await service.poll(projectId);
    expect(first.state).toBe("DEGRADED");
    expect(first.pendingCommandCursor).toBeNull();
    expect(setEnabled).toHaveBeenCalledTimes(1);

    const second = await service.poll(projectId);
    expect(second).toMatchObject({ state: "READY", pendingCommandCursor: "41", lastError: null });
    expect(setEnabled).toHaveBeenCalledTimes(1);
    expect(setEnabled).toHaveBeenCalledWith(projectId, true);
    expect(patchAttempts).toBe(2);
  });
});
