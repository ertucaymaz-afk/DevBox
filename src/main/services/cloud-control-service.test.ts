import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
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
  for (const database of databases.splice(0)) database.close();
  await Promise.all(directories.splice(0).map(async (directory) => await rm(directory, { recursive: true, force: true })));
});

async function fixture(environment: NodeJS.ProcessEnv = {}) {
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
    {} as ApiEvolutionService,
    {} as EvolutionFindingService,
    {} as ReleaseGateService,
    {} as MemoryService,
    environment
  );
  return { service, projectId: "project-cloud-control" };
}

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
});
