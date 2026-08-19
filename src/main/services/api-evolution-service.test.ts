import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { StateDatabase } from "./database.js";
import { ApiEvolutionService, createAdaptiveEvolutionTask, shouldContinueEvolution } from "./api-evolution-service.js";

const temporaryDirectories: string[] = [];
const openDatabases: StateDatabase[] = [];

afterEach(async () => {
  while (openDatabases.length > 0) {
    try { openDatabases.pop()?.close(); } catch { /* best effort */ }
  }
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop();
    if (directory) await rm(directory, { recursive: true, force: true });
  }
});

function createService(database: StateDatabase) {
  return new ApiEvolutionService({
    database,
    developmentSpec: { start: () => {}, stop: () => {}, getSummary: () => ({ remainingCount: 0 }) } as never,
    agent: {} as never,
    commandRunner: {} as never,
    git: {} as never,
    project: {} as never,
    settings: {} as never,
    worktree: {} as never
  });
}

describe("adaptive API evolution tasks", () => {
  it("continues immediately after the fixed graph while respecting adaptive blockers", () => {
    expect(shouldContinueEvolution({ enabled: true, isRunning: false, remainingCount: 0, gateState: "PASS", adaptiveState: null })).toBe(true);
    expect(shouldContinueEvolution({ enabled: true, isRunning: false, remainingCount: 0, gateState: "PASS", adaptiveState: "RECOVERY_REQUIRED" })).toBe(false);
    expect(shouldContinueEvolution({ enabled: true, isRunning: false, remainingCount: 1, gateState: "RECOVERY_REQUIRED", adaptiveState: null })).toBe(false);
    expect(shouldContinueEvolution({ enabled: false, isRunning: false, remainingCount: 0, gateState: "PASS", adaptiveState: null })).toBe(false);
  });

  it("recovers an interrupted adaptive RUNNING mission instead of leaving stale runtime state", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "devbox-evolution-recovery-"));
    temporaryDirectories.push(directory);
    const database = new StateDatabase(path.join(directory, "state.sqlite"));
    openDatabases.push(database);
    const projectId = "project-evolution-recovery";
    database.upsertProject({ id: projectId, name: "recovery-project", rootPath: directory, isGitRepository: true });
    database.setSetting(`api-evolution:adaptive:${projectId}`, {
      schemaVersion: 1,
      sequence: 9,
      completed: 8,
      failed: 0,
      current: { task: createAdaptiveEvolutionTask(9), state: "RUNNING", attempts: 1, retryAfterAt: null, lastError: null, updatedAt: new Date().toISOString() },
      recent: []
    });
    const service = createService(database);
    service.start();
    try {
      const recovered = database.getSetting<{ current?: { state?: string; lastError?: string | null } }>(`api-evolution:adaptive:${projectId}`);
      expect(recovered?.current?.state).toBe("RECOVERY_REQUIRED");
      expect(recovered?.current?.lastError).toMatch(/stale RUNNING|recovery/iu);
      expect(service.get(projectId).runtime.stage).toBe("RECOVERY_REQUIRED");
    } finally { service.stop(); }
  });

  it("rotates real maintenance domains deterministically after the fixed core graph", () => {
    const first = createAdaptiveEvolutionTask(1);
    const repeatedFirst = createAdaptiveEvolutionTask(1);
    const second = createAdaptiveEvolutionTask(2);
    const sample = Array.from({ length: 80 }, (_, index) => createAdaptiveEvolutionTask(index + 1));
    const tracks = new Set(sample.map((task) => task.track));

    expect(first.taskId).toBe("ADAPT-000001");
    expect(repeatedFirst.track).toBe(first.track);
    expect(repeatedFirst.title).toBe(first.title);
    expect(second.track).not.toBe(first.track);
    expect(tracks.size).toBeGreaterThanOrEqual(12);
    expect(sample.every((task, index) => task.taskId === `ADAPT-${String(index + 1).padStart(6, "0")}`)).toBe(true);
    expect(first.objective).toMatch(/gerçek kaynak|regresyon|verify/iu);
    expect(first.objective).toMatch(/demo|placeholder|no-op/iu);
  });
});

describe("API evolution persistence", () => {
  it("survives a real SQLite close/reopen and expands legacy four-cycle campaigns", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "devbox-evolution-persistence-"));
    temporaryDirectories.push(directory);
    const databasePath = path.join(directory, "state.sqlite");
    const projectId = "project-evolution-persistence";
    const now = new Date().toISOString();

    const firstDatabase = new StateDatabase(databasePath);
    openDatabases.push(firstDatabase);
    firstDatabase.upsertProject({
      id: projectId,
      name: "persistent-project",
      rootPath: directory,
      isGitRepository: true
    });
    firstDatabase.setSetting(`api-evolution:${projectId}`, {
      maturityModelVersion: 1,
      projectId,
      enabled: true,
      isRunning: false,
      directive: "DevBox ürününü gerçek kanıtlarla geliştir ve sahte durum üretme. Bu eski kampanya migration davranışını doğrulamak için yeterince uzun bir direktiftir.",
      routing: { mode: "AUTO", provider: "codex", model: "gpt-5.6-sol", reasoningEffort: "high", allowFallback: true },
      score: 75,
      level: 4,
      stage: "legacy",
      provider: "OpenAI Codex CLI",
      model: "gpt-5.6-sol",
      modelEffort: "high",
      lastProvider: "OpenAI Codex CLI",
      lastModel: "gpt-5.6-sol",
      completedCycles: 4,
      failedCycles: 0,
      cyclesToday: 4,
      cycleDay: now.slice(0, 10),
      dailyCycleLimit: 4,
      intervalMinutes: 60,
      lastCycleAt: now,
      nextCycleAt: now,
      lastCycleDurationMs: 1_000,
      lastError: null,
      tasks: [],
      learnings: [],
      updatedAt: now
    });
    firstDatabase.close();
    openDatabases.pop();

    const reopened = new StateDatabase(databasePath);
    openDatabases.push(reopened);
    const service = createService(reopened);
    const migrated = service.get(projectId);
    expect(migrated.maturityModelVersion).toBe(2);
    expect(migrated.completedCycles).toBeGreaterThanOrEqual(4);
    expect(migrated.dailyCycleLimit).toBeNull();
    expect(migrated.lifetimeLevel).toBeGreaterThanOrEqual(4);
    expect(migrated.lifetimeEvidencePoints).toBeGreaterThanOrEqual(0);
    expect(migrated.validatedImprovementCount).toBeGreaterThanOrEqual(0);
    expect(migrated.stablePromotionCount).toBeGreaterThanOrEqual(0);
  });
});
