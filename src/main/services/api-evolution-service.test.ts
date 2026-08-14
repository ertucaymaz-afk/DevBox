import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { AgentService } from "./agent-service.js";
import { ApiEvolutionService } from "./api-evolution-service.js";
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
  return new ApiEvolutionService(database, projects, {} as AgentService, settings);
}

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
    expect(initial.tasks).toHaveLength(14);
    expect(initial.dailyCycleLimit).toBe(24);
    expect(initial.intervalMinutes).toBe(60);

    const directive = [
      "DevBox API gelişimini kalıcı olarak izle; her iddiayı gerçek çalışma kanıtına bağla.",
      "Kod, tasarım, güvenlik, performans ve yayın zinciri için uygulanabilir görevler ve kabul kriterleri üret."
    ].join(" ");
    const updated = firstService.setDirective(projectId, directive);
    firstDatabase.setSetting(`api-evolution:${projectId}`, {
      ...updated,
      dailyCycleLimit: 4,
      intervalMinutes: 360,
      tasks: updated.tasks.slice(0, 1)
    });

    firstDatabase.close();
    openDatabases.splice(openDatabases.indexOf(firstDatabase), 1);

    const reopenedDatabase = new StateDatabase(databasePath);
    openDatabases.push(reopenedDatabase);
    const reopened = createService(reopenedDatabase).get(projectId);

    expect(reopened.directive).toBe(directive);
    expect(reopened.dailyCycleLimit).toBe(24);
    expect(reopened.intervalMinutes).toBe(60);
    expect(reopened.tasks).toHaveLength(14);
    expect(new Set(reopened.tasks.map((task) => task.track)).size).toBe(14);
    expect(reopenedDatabase.integrityCheck()).toMatchObject({ ok: true, detail: "ok" });
  });
});
