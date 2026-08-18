import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { EvolutionCampaign } from "../../shared/contracts.js";
import { StateDatabase } from "./database.js";
import { EvolutionFindingService } from "./evolution-finding-service.js";

const temporaryDirectories: string[] = [];
const databases: StateDatabase[] = [];

afterEach(async () => {
  for (const database of databases.splice(0)) database.close();
  await Promise.all(temporaryDirectories.splice(0).map(async (directory) => await rm(directory, { recursive: true, force: true })));
});

async function fixture(): Promise<{ database: StateDatabase; service: EvolutionFindingService; projectId: string }> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "devbox-findings-"));
  temporaryDirectories.push(directory);
  const database = new StateDatabase(path.join(directory, "state.sqlite"));
  databases.push(database);
  const projectId = "project-findings-test";
  const now = new Date().toISOString();
  database.upsertProject({ id: projectId, name: "finding-project", rootPath: directory, isGitRepository: false, createdAt: now, updatedAt: now });
  return { database, service: new EvolutionFindingService(database), projectId };
}

function campaign(projectId: string, taskState: EvolutionCampaign["tasks"][number]["state"]): EvolutionCampaign {
  const now = new Date().toISOString();
  return {
    maturityModelVersion: 2,
    projectId,
    enabled: true,
    isRunning: false,
    directive: "DevBox API gelişimini gerçek kaynak ve doğrulama kanıtlarıyla sürekli geliştir; sahte, demo veya no-op başarı kabul etme ve tüm değişiklikleri fail-closed doğrula.",
    routing: { mode: "AUTO", provider: "codex", model: "gpt-5.6-sol", reasoningEffort: "high", allowFallback: true },
    runtime: { stage: "IDLE", detail: "bekliyor", waitingReason: null, activeTaskId: null, activeSpecTaskId: null, activePhaseId: null, durableJobId: null, provider: null, model: null, worktreePath: null, startedAt: null, updatedAt: now },
    activity: [],
    spec: { sourceSha256: "a".repeat(64), phaseCount: 22, totalTaskCount: 3362, passCount: 0, failedCount: 0, blockedCount: 0, runningCount: 0, recoveryCount: 0, remainingCount: 3362, currentPhaseId: "FAZ-01", currentPhaseTitle: "Başlangıç", currentTaskIndex: 0, currentPhaseTaskCount: 1, currentGateState: "TODO", phaseSummaries: Array.from({ length: 22 }, (_, index) => ({ phaseId: `FAZ-${String(index + 1).padStart(2, "0")}` as `FAZ-${string}`, title: `Faz ${index + 1}`, taskCount: index === 0 ? 1 : 0, passCount: 0, failedCount: 0, blockedCount: 0, runningCount: 0, recoveryCount: 0, remainingCount: index === 0 ? 1 : 0, currentTaskIndex: index === 0 ? 0 : null, gateState: "TODO" as const })), queuePreview: [] },
    score: 0, level: 1, lifetimeLevel: 1, migrationFloorLevel: 1, lifetimeEvidencePoints: 0, validatedImprovementCount: 0, stablePromotionCount: 0, verifiedResearchCount: 0, verifiedRegressionFixCount: 0,
    domainScores: { research: 0, architecture: 0, api: 0, coding: 0, design: 0, quality: 0, security: 0, release: 0, performance: 0, observability: 0, accessibility: 0, integrations: 0, documentation: 0, "supply-chain": 0 },
    stage: "Seviye 1", provider: "OpenAI Codex CLI", model: "gpt-5.6-sol", modelEffort: "high", lastProvider: null, lastModel: null,
    completedCycles: 0, failedCycles: 0, cyclesToday: 0, cycleDay: now.slice(0, 10), dailyCycleLimit: null, intervalMinutes: 60, lastCycleAt: null, nextCycleAt: null, lastCycleDurationMs: null, lastError: null,
    tasks: [{ id: "11111111-1111-4111-8111-111111111111", specTaskId: "TASK-001", phaseId: "FAZ-01", sourceLine: 1, track: "quality", title: "TypeScript regresyonu", prompt: "gerçek sorunu düzelt", state: taskState, provider: "codex", model: "gpt-5.6-sol", threadId: null, durableJobId: null, evidence: ["pnpm typecheck"], error: taskState === "FAILED" ? "TS2322" : null, attempts: 1, blockReason: taskState === "BLOCKED_EXTERNAL" ? "provider unavailable" : null, retryAfterAt: null, createdAt: now, startedAt: now, completedAt: now }],
    learnings: [], updatedAt: now
  };
}

describe("EvolutionFindingService", () => {
  it("deduplicates by fingerprint and preserves occurrence history", async () => {
    const { service, projectId } = await fixture();
    const first = service.report({ projectId, source: "typescript", key: "a.ts:1:1:TS2322", title: "TS2322", detail: "first", severity: "HIGH", owner: "typescript", evidence: ["a.ts:1:1"] });
    const second = service.report({ projectId, source: "typescript", key: "a.ts:1:1:TS2322", title: "TS2322", detail: "second", severity: "HIGH", owner: "typescript", evidence: ["pnpm typecheck"] });
    expect(second.id).toBe(first.id);
    expect(second.occurrences).toBe(2);
    expect(second.evidence).toEqual(expect.arrayContaining(["a.ts:1:1", "pnpm typecheck"]));
    expect(service.summary(projectId).blocking).toBe(1);
  });

  it("reconciles failed evolution tasks and resolves the same stable task after success", async () => {
    const { service, projectId } = await fixture();
    const opened = service.reconcileCampaign(projectId, campaign(projectId, "FAILED"));
    expect(opened.open).toBe(1);
    expect(opened.items[0]?.severity).toBe("HIGH");
    const closed = service.reconcileCampaign(projectId, campaign(projectId, "SUCCEEDED"));
    expect(closed.open).toBe(0);
    expect(closed.resolved).toBe(1);
  });

  it("tracks rejected findings separately from resolved findings", async () => {
    const { service, projectId } = await fixture();
    const finding = service.report({ projectId, source: "release", key: "ownership", title: "Ownership", detail: "mismatch", severity: "MEDIUM", owner: "project" });
    service.transition(projectId, finding.id, "REJECTED", "False positive verified against canonical root");
    const summary = service.summary(projectId);
    expect(summary.rejected).toBe(1);
    expect(summary.resolved).toBe(0);
    expect(summary.open).toBe(0);
  });

  it("parses canonical TypeScript diagnostics into high severity owned findings", async () => {
    const { service, projectId } = await fixture();
    const findings = service.reportTypeScriptOutput(projectId, "src/a.ts(12,4): error TS2322: Type 'string' is not assignable to type 'number'.\n");
    expect(findings).toHaveLength(1);
    expect(findings[0]?.owner).toBe("typescript");
    expect(findings[0]?.severity).toBe("HIGH");
  });
});
