import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { StateDatabase } from "./database.js";
import { DevelopmentSpecService } from "./development-spec-service.js";

const dirs: string[] = [];
const databases: StateDatabase[] = [];
afterEach(async () => {
  for (const database of databases.splice(0)) database.close();
  await Promise.all(dirs.splice(0).map(async (directory) => await rm(directory, { recursive: true, force: true })));
});


const completeAcceptance = {
  summary: "kanıtlı sonuç",
  positiveTests: ["positive PASS"],
  negativeTests: ["negative PASS"],
  securityChecks: ["NOT_APPLICABLE_VERIFIED: security"],
  performanceChecks: ["NOT_APPLICABLE_VERIFIED: performance"],
  uxChecks: ["NOT_APPLICABLE_VERIFIED: ux"],
  evidenceRefs: ["run:test"]
};

describe("DevelopmentSpecService", () => {
  it("loads all 22 phases and 3362 atomized tasks without marking imported tasks as PASS", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "devbox-spec-service-"));
    dirs.push(directory);
    const database = new StateDatabase(path.join(directory, "state.sqlite"));
    databases.push(database);
    const service = new DevelopmentSpecService(database, path.resolve("specs", "development", "geliştirme-spec-task-graph.json"));

    const initial = service.summary("project-spec-test");
    expect(initial.phaseCount).toBe(22);
    expect(initial.totalTaskCount).toBe(3362);
    expect(initial.passCount).toBe(0);
    expect(initial.remainingCount).toBe(3362);
    expect(service.next("project-spec-test")?.taskId).toBe("MAX-01-001");

    service.mark("project-spec-test", "MAX-01-001", "RUNNING");
    expect(service.summary("project-spec-test").runningCount).toBe(1);
    expect(() => service.mark("project-spec-test", "MAX-01-001", "PASS")).toThrow("DEVELOPMENT_SPEC_ACCEPTANCE_INCOMPLETE");
    service.mark("project-spec-test", "MAX-01-001", "PASS", { acceptance: completeAcceptance, deterministicReviewer: "DEVBOX_DETERMINISTIC_GATE_V1" });
    expect(service.summary("project-spec-test").passCount).toBe(1);
    expect(service.next("project-spec-test")?.taskId).not.toBe("MAX-01-001");
  });

  it("moves abandoned RUNNING task state to RECOVERY_REQUIRED on startup reconciliation", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "devbox-spec-recovery-"));
    dirs.push(directory);
    const database = new StateDatabase(path.join(directory, "state.sqlite"));
    databases.push(database);
    const service = new DevelopmentSpecService(database, path.resolve("specs", "development", "geliştirme-spec-task-graph.json"));
    service.mark("project-spec-recovery", "MAX-01-001", "RUNNING");
    expect(service.recoverRunning("project-spec-recovery")).toBe(1);
    expect(service.summary("project-spec-recovery").recoveryCount).toBe(1);
    expect(service.summary("project-spec-recovery").currentGateState).toBe("RECOVERY_REQUIRED");
    expect(service.next("project-spec-recovery")).toBeNull();
  });


  it("keeps BLOCKED_EXTERNAL inside the same phase and allows only explicit manual retry", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "devbox-spec-blocked-"));
    dirs.push(directory);
    const database = new StateDatabase(path.join(directory, "state.sqlite"));
    databases.push(database);
    const service = new DevelopmentSpecService(database, path.resolve("specs", "development", "geliştirme-spec-task-graph.json"));
    service.mark("project-spec-blocked", "MAX-01-001", "RUNNING");
    service.mark("project-spec-blocked", "MAX-01-001", "BLOCKED_EXTERNAL", { blockReason: "login gerekli" });
    expect(service.summary("project-spec-blocked").currentPhaseId).toBe("FAZ-01");
    expect(service.summary("project-spec-blocked").currentGateState).toBe("BLOCKED_EXTERNAL");
    expect(service.next("project-spec-blocked")).toBeNull();
    expect(service.next("project-spec-blocked", { allowBlockedExternalRetry: true })?.taskId).toBe("MAX-01-001");
  });

  it("fails closed when the packaged geliştirme.md source does not match the task-graph digest", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "devbox-spec-integrity-"));
    dirs.push(directory);
    const database = new StateDatabase(path.join(directory, "state.sqlite"));
    databases.push(database);
    const fakeSource = path.join(directory, "geliştirme.md");
    await writeFile(fakeSource, "tam kaynak değil\n", "utf8");
    expect(() => new DevelopmentSpecService(database, path.resolve("specs", "development", "geliştirme-spec-task-graph.json"), fakeSource)).toThrow("DEVELOPMENT_SPEC_SOURCE_SHA_MISMATCH");
  });

});
