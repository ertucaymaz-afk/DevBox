import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { CommandResult } from "../../shared/contracts.js";
import { StateDatabase } from "./database.js";
import { EvolutionFindingService } from "./evolution-finding-service.js";
import type { GitService } from "./git-service.js";
import { ProjectService } from "./project-service.js";
import { ReleaseGateService } from "./release-gate-service.js";
import type { CommandRunner } from "./command-runner.js";

const directories: string[] = [];
const databases: StateDatabase[] = [];
afterEach(async () => {
  for (const database of databases.splice(0)) database.close();
  await Promise.all(directories.splice(0).map(async (directory) => await rm(directory, { recursive: true, force: true })));
});

function result(commandDisplay: string, cwd: string, exitCode = 0, stdout = ""): CommandResult {
  const now = new Date().toISOString();
  return { runId: crypto.randomUUID(), commandDisplay, cwd, exitCode, signal: null, stdout, stderr: "", startedAt: now, endedAt: now, durationMs: 1, timedOut: false, truncated: false, exitReason: "EXITED" };
}

async function setup(options: { scripts?: Record<string, string>; commandExit?: Record<string, number> } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "devbox-release-gate-"));
  directories.push(root);
  await writeFile(path.join(root, "package.json"), JSON.stringify({ scripts: options.scripts ?? {} }), "utf8");
  const database = new StateDatabase(path.join(root, "state", "db.sqlite"));
  databases.push(database);
  const projects = new ProjectService(database);
  const now = new Date().toISOString();
  const project = database.upsertProject({ id: "project-release-gate", name: "gate", rootPath: root, isGitRepository: false, createdAt: now, updatedAt: now });
  const runner = {
    run: async (request: { executable: string; args: readonly string[]; cwd: string }) => {
      const script = request.args[0] ?? request.executable;
      const exitCode = options.commandExit?.[script] ?? 0;
      const stdout = exitCode === 0 ? `${script}:pass` : "src/a.ts(1,2): error TS2322: bad type";
      return result([request.executable, ...request.args].join(" "), request.cwd, exitCode, stdout);
    }
  } as unknown as CommandRunner;
  const git = {
    status: async () => ({ available: false, repositoryRoot: null, branch: null, head: null, upstream: null, ahead: 0, behind: 0, changes: [], stats: [], error: "NOT_A_GIT_REPOSITORY" })
  } as unknown as GitService;
  const findings = new EvolutionFindingService(database);
  return { database, project, projects, runner, git, findings, service: new ReleaseGateService(database, projects, git, runner, findings) };
}

describe("ReleaseGateService", () => {
  it("passes a lightweight preflight when optional scripts and git are absent", async () => {
    const { project, service } = await setup();
    const gate = await service.run(project.id, "PREFLIGHT");
    expect(gate.state).toBe("PASS");
    expect(gate.checks.find((check) => check.id === "database-integrity")?.state).toBe("PASS");
    expect(gate.checks.find((check) => check.id === "project-ownership")?.state).toBe("SKIP");
    expect(service.latest(project.id)?.id).toBe(gate.id);
  });

  it("blocks release when an open critical/high finding exists", async () => {
    const { project, service, findings } = await setup();
    findings.report({ projectId: project.id, source: "security", key: "escape", title: "Path escape", detail: "boundary failure", severity: "CRITICAL", owner: "security" });
    const gate = await service.run(project.id, "PREFLIGHT");
    expect(gate.state).toBe("FAIL");
    expect(gate.checks.find((check) => check.id === "blocking-findings")?.state).toBe("FAIL");
  });

  it("turns real TypeScript failures into owned findings and blocks fail-closed", async () => {
    const { project, service, findings } = await setup({ scripts: { typecheck: "tsc --noEmit" }, commandExit: { typecheck: 2 } });
    const gate = await service.run(project.id, "PREFLIGHT");
    expect(gate.state).toBe("FAIL");
    expect(gate.checks.find((check) => check.id === "typescript")?.state).toBe("FAIL");
    expect(findings.list(project.id, { status: "OPEN", owner: "typescript" })).toHaveLength(1);
  });

  it("runs test and build only in FULL mode", async () => {
    const { project, service } = await setup({ scripts: { test: "vitest run", build: "vite build" } });
    const preflight = await service.run(project.id, "PREFLIGHT");
    expect(preflight.checks.some((check) => check.id === "tests")).toBe(false);
    const full = await service.run(project.id, "FULL");
    expect(full.checks.find((check) => check.id === "tests")?.state).toBe("PASS");
    expect(full.checks.find((check) => check.id === "build")?.state).toBe("PASS");
  });
});
