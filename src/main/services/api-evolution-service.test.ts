import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { AgentService } from "./agent-service.js";
import type { CommandRunner } from "./command-runner.js";
import { DevelopmentSpecService } from "./development-spec-service.js";
import type { GitService } from "./git-service.js";
import { ApiEvolutionService, createAdaptiveEvolutionTask } from "./api-evolution-service.js";
import { StateDatabase } from "./database.js";
import { ProjectService } from "./project-service.js";
import { SettingsService } from "./settings-service.js";

const temporaryDirectories: string[] = [];
const openDatabases: StateDatabase[] = [];

afterEach(async () => {
  for (const database of openDatabases.splice(0)) database.close();
  await Promise.all(temporaryDirectories.splice(0).map(async (directory) => await rm(directory, { recursive: true, force: true })));
});

function createService(database: StateDatabase): ApiEvolutionService {
  const projects = new ProjectService(database);
  const settings = new SettingsService(database);
  // This persistence test never executes an agent cycle. Keeping the collaborator
  // intentionally empty makes an accidental provider call fail instead of hiding it.
  const spec = new DevelopmentSpecService(database, path.resolve("specs", "development", "geliştirme-spec-task-graph.json"));
  return new ApiEvolutionService(database, projects, {} as AgentService, settings, spec, {} as GitService, {} as CommandRunner);
}

describe("adaptive API evolution tasks", () => {
  it("rotates real maintenance domains after the fixed core graph", () => {
    const first = createAdaptiveEvolutionTask(1);
    const second = createAdaptiveEvolutionTask(2);
    const eleventh = createAdaptiveEvolutionTask(11);
    expect(first.taskId).toBe("ADAPT-000001");
    expect(second.track).not.toBe(first.track);
    expect(eleventh.track).toBe(first.track);
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
      isGitRepository: false,
      createdAt: now,
      updatedAt: now
    });

    const firstService = createService(firstDatabase);
    const initial = firstService.get(projectId);
    expect(initial.tasks).toHaveLength(0);
    expect(initial.spec.phaseCount).toBe(22);
    expect(initial.spec.totalTaskCount).toBe(3362);
    expect(initial.spec.remainingCount).toBe(3362);
    expect(initial.dailyCycleLimit).toBeNull();
    expect(initial.intervalMinutes).toBe(60);
    expect(initial.provider).toContain("OpenAI Codex CLI");
    expect(initial.model).toBe("gpt-5.6-sol");
    expect(initial.modelEffort).toBe("high");

    const directive = [
      "DevBox API gelişimini kalıcı olarak izle; her iddiayı gerçek çalışma kanıtına bağla.",
      "Kod, tasarım, güvenlik, performans ve yayın zinciri için uygulanabilir görevler ve kabul kriterleri üret."
    ].join(" ");
    const updated = firstService.setDirective(projectId, directive);
    firstDatabase.setSetting(`api-evolution:${projectId}`, {
      ...updated,
      dailyCycleLimit: 4,
      intervalMinutes: 360,
      level: 7,
      tasks: updated.tasks.slice(0, 1)
    });

    firstDatabase.close();
    openDatabases.splice(openDatabases.indexOf(firstDatabase), 1);

    const reopenedDatabase = new StateDatabase(databasePath);
    openDatabases.push(reopenedDatabase);
    const reopened = createService(reopenedDatabase).get(projectId);

    expect(reopened.directive).toBe(directive);
    expect(reopened.dailyCycleLimit).toBeNull();
    expect(reopened.intervalMinutes).toBe(360);
    expect(reopened.level).toBe(7);
    expect(reopened.lifetimeLevel).toBe(7);
    expect(reopened.migrationFloorLevel).toBe(7);
    expect(reopened.tasks).toHaveLength(0);
    expect(reopened.spec.totalTaskCount).toBe(3362);
    expect(reopened.spec.queuePreview[0]?.taskId).toBe("MAX-01-001");
    expect(reopened.provider).toContain("OpenAI Codex CLI");
    expect(reopenedDatabase.integrityCheck()).toMatchObject({ ok: true, detail: "ok" });
  });
});
