import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import type { EvolutionPhaseSummary, EvolutionSpecSummary, EvolutionTrack } from "../../shared/contracts.js";
import type { StateDatabase } from "./database.js";

type SourceResearch = { sourceSha256?: unknown; line?: unknown };
type RawSpecTask = {
  taskId?: unknown;
  phaseId?: unknown;
  family?: unknown;
  parentTaskId?: unknown;
  title?: unknown;
  objective?: unknown;
  requirementIds?: unknown;
  dependencies?: unknown;
  sourceResearch?: unknown;
  plannedFiles?: unknown;
  touchedFiles?: unknown;
  commands?: unknown;
  tests?: unknown;
  failureTests?: unknown;
  securityChecks?: unknown;
  performanceChecks?: unknown;
  uxChecks?: unknown;
  evidence?: unknown;
  reviewer?: unknown;
};
type RawPhase = { phaseId?: unknown; title?: unknown; taskCount?: unknown };
type RawSpecGraph = {
  schemaVersion?: unknown;
  source?: { fileName?: unknown; sha256?: unknown; bytes?: unknown; lines?: unknown };
  summary?: { phaseCount?: unknown; taskCount?: unknown };
  phases?: unknown;
  tasks?: unknown;
};

export type DevelopmentSpecTask = {
  taskId: string;
  phaseId: string;
  family: string;
  parentTaskId: string | null;
  title: string;
  objective: string;
  sourceLine: number | null;
  sourceResearch: SourceResearch[];
  requirementIds: string[];
  dependencies: string[];
  plannedFiles: string[];
  touchedFiles: string[];
  commands: string[];
  tests: string[];
  failureTests: string[];
  securityChecks: string[];
  performanceChecks: string[];
  uxChecks: string[];
  evidence: string[];
  reviewer: string | null;
  track: EvolutionTrack;
};

export type DevelopmentSpecPersistedStateName = "RUNNING" | "PASS" | "FAILED" | "BLOCKED_EXTERNAL" | "CANCELLED" | "RECOVERY_REQUIRED";
export type DevelopmentSpecAcceptance = {
  summary: string | null;
  positiveTests: string[];
  negativeTests: string[];
  securityChecks: string[];
  performanceChecks: string[];
  uxChecks: string[];
  evidenceRefs: string[];
  deterministicReviewer: string | null;
};
export type DevelopmentSpecMarkDetails = {
  blockReason?: string | null;
  lastError?: string | null;
  evidence?: readonly string[];
  retryAfterAt?: string | null;
  acceptance?: Omit<DevelopmentSpecAcceptance, "deterministicReviewer"> | null;
  deterministicReviewer?: string | null;
};

type PersistedState = {
  state: DevelopmentSpecPersistedStateName;
  attempts: number;
  blockReason: string | null;
  lastError: string | null;
  evidence: string[];
  retryAfterAt: string | null;
  acceptance: DevelopmentSpecAcceptance | null;
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
};
type StateMap = Record<string, PersistedState>;
type PhaseDefinition = { phaseId: string; title: string; taskCount: number };

const PHASE_TRACK: Record<string, EvolutionTrack> = {
  "FAZ-01": "research", "FAZ-02": "design", "FAZ-03": "architecture", "FAZ-04": "api", "FAZ-05": "integrations",
  "FAZ-06": "coding", "FAZ-07": "coding", "FAZ-08": "coding", "FAZ-09": "security", "FAZ-10": "integrations",
  "FAZ-11": "quality", "FAZ-12": "integrations", "FAZ-13": "integrations", "FAZ-14": "integrations", "FAZ-15": "security",
  "FAZ-16": "design", "FAZ-17": "performance", "FAZ-18": "release", "FAZ-19": "quality", "FAZ-20": "supply-chain",
  "FAZ-21": "research", "FAZ-22": "documentation"
};

function finiteInt(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : fallback;
}
function strings(value: unknown, max = 500): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim().slice(0, 4_000)).slice(0, max) : [];
}
function clean(value: unknown, max = 1_000): string | null {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
}
function normalizeAcceptance(value: unknown, reviewer: unknown = null): DevelopmentSpecAcceptance | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const acceptance: DevelopmentSpecAcceptance = {
    summary: clean(record.summary, 1_000),
    positiveTests: strings(record.positiveTests, 40),
    negativeTests: strings(record.negativeTests, 40),
    securityChecks: strings(record.securityChecks, 40),
    performanceChecks: strings(record.performanceChecks, 40),
    uxChecks: strings(record.uxChecks, 40),
    evidenceRefs: strings(record.evidenceRefs, 80),
    deterministicReviewer: clean(reviewer ?? record.deterministicReviewer, 200)
  };
  return acceptance;
}
function acceptanceComplete(value: DevelopmentSpecAcceptance | null): boolean {
  return Boolean(value?.summary && value.positiveTests.length && value.negativeTests.length && value.securityChecks.length && value.performanceChecks.length && value.uxChecks.length && value.deterministicReviewer);
}
function normalizeTask(value: RawSpecTask): DevelopmentSpecTask {
  if (typeof value.taskId !== "string" || !value.taskId.trim()) throw new Error("DEVELOPMENT_SPEC_TASK_ID_INVALID");
  if (typeof value.phaseId !== "string" || !/^FAZ-\d{2}$/u.test(value.phaseId)) throw new Error(`DEVELOPMENT_SPEC_PHASE_INVALID:${String(value.taskId)}`);
  const title = typeof value.title === "string" && value.title.trim() ? value.title.trim() : String(value.objective ?? "").trim();
  if (!title) throw new Error(`DEVELOPMENT_SPEC_TITLE_INVALID:${value.taskId}`);
  const objective = typeof value.objective === "string" && value.objective.trim() ? value.objective.trim() : title;
  const research = Array.isArray(value.sourceResearch) ? value.sourceResearch.filter((entry): entry is SourceResearch => Boolean(entry && typeof entry === "object")) : [];
  const lineValue = research.find((entry) => typeof entry.line === "number")?.line;
  const sourceLine = typeof lineValue === "number" && Number.isInteger(lineValue) && lineValue > 0 ? lineValue : null;
  return {
    taskId: value.taskId.trim(), phaseId: value.phaseId, family: clean(value.family, 80) ?? "UNSPECIFIED",
    parentTaskId: clean(value.parentTaskId, 160), title, objective, sourceLine, sourceResearch: research,
    requirementIds: strings(value.requirementIds), dependencies: strings(value.dependencies), plannedFiles: strings(value.plannedFiles),
    touchedFiles: strings(value.touchedFiles), commands: strings(value.commands), tests: strings(value.tests), failureTests: strings(value.failureTests),
    securityChecks: strings(value.securityChecks), performanceChecks: strings(value.performanceChecks), uxChecks: strings(value.uxChecks),
    evidence: strings(value.evidence), reviewer: clean(value.reviewer, 200), track: PHASE_TRACK[value.phaseId] ?? "coding"
  };
}
function normalizePhase(value: RawPhase, tasks: readonly DevelopmentSpecTask[]): PhaseDefinition {
  if (typeof value.phaseId !== "string" || !/^FAZ-\d{2}$/u.test(value.phaseId)) throw new Error("DEVELOPMENT_SPEC_PHASE_DEFINITION_INVALID");
  const title = clean(value.title, 500) ?? value.phaseId;
  const actualTaskCount = tasks.filter((task) => task.phaseId === value.phaseId).length;
  const declaredTaskCount = finiteInt(value.taskCount, actualTaskCount);
  if (declaredTaskCount !== actualTaskCount) throw new Error(`DEVELOPMENT_SPEC_PHASE_TASK_COUNT_MISMATCH:${value.phaseId}:${declaredTaskCount}:${actualTaskCount}`);
  return { phaseId: value.phaseId, title, taskCount: actualTaskCount };
}
function terminalState(state: DevelopmentSpecPersistedStateName | undefined): boolean {
  return state === "PASS" || state === "BLOCKED_EXTERNAL" || state === "RECOVERY_REQUIRED";
}
function atomicJsonWrite(filePath: string, value: unknown): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  const temp = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  renameSync(temp, filePath);
}

const PINNED_DEVELOPMENT_SOURCE_SHA256 = "C6C9F157389E93FFC3F912C9D79583EB40F9BA7D6428ADC6D99405A1B9509750";
const PINNED_DEVELOPMENT_SOURCE_BYTES = 2415344;
const PINNED_DEVELOPMENT_SOURCE_LINES = 51468;

export class DevelopmentSpecService {
  readonly #database: StateDatabase;
  readonly #sourceSha256: string;
  readonly #phaseCount: number;
  readonly #tasks: readonly DevelopmentSpecTask[];
  readonly #phases: readonly PhaseDefinition[];
  readonly #taskById: ReadonlyMap<string, DevelopmentSpecTask>;

  public constructor(database: StateDatabase, graphPath: string, sourcePath?: string) {
    this.#database = database;
    let raw: RawSpecGraph;
    try { raw = JSON.parse(readFileSync(graphPath, "utf8")) as RawSpecGraph; }
    catch (error) { throw new Error(`DEVELOPMENT_SPEC_LOAD_FAILED:${error instanceof Error ? error.message : String(error)}`); }
    if (raw.schemaVersion !== 1 || !raw.source || typeof raw.source.sha256 !== "string" || !/^[A-Fa-f0-9]{64}$/u.test(raw.source.sha256)) throw new Error("DEVELOPMENT_SPEC_METADATA_INVALID");
    if (raw.source.sha256.toUpperCase() !== PINNED_DEVELOPMENT_SOURCE_SHA256) throw new Error("DEVELOPMENT_SPEC_SOURCE_IDENTITY_MISMATCH");
    if (raw.source.bytes !== PINNED_DEVELOPMENT_SOURCE_BYTES) throw new Error("DEVELOPMENT_SPEC_SOURCE_BYTES_IDENTITY_MISMATCH");
    if (raw.source.lines !== PINNED_DEVELOPMENT_SOURCE_LINES) throw new Error("DEVELOPMENT_SPEC_SOURCE_LINES_IDENTITY_MISMATCH");
    if (sourcePath) {
      let sourceBytes: Buffer;
      try { sourceBytes = readFileSync(sourcePath); }
      catch (error) { throw new Error(`DEVELOPMENT_SPEC_SOURCE_LOAD_FAILED:${error instanceof Error ? error.message : String(error)}`); }
      const actualSha = createHash("sha256").update(sourceBytes).digest("hex").toUpperCase();
      const expectedSha = raw.source.sha256.toUpperCase();
      if (actualSha !== expectedSha) throw new Error(`DEVELOPMENT_SPEC_SOURCE_SHA_MISMATCH:${actualSha}:${expectedSha}`);
      if (typeof raw.source.bytes === "number" && raw.source.bytes !== sourceBytes.length) throw new Error(`DEVELOPMENT_SPEC_SOURCE_BYTES_MISMATCH:${sourceBytes.length}:${raw.source.bytes}`);
      if (typeof raw.source.lines === "number") {
        const normalizedSource = sourceBytes.toString("utf8").replace(/\r\n?/gu, "\n");
        const actualLines = (normalizedSource.endsWith("\n") ? normalizedSource.slice(0, -1) : normalizedSource).split("\n").length;
        if (actualLines !== raw.source.lines) throw new Error(`DEVELOPMENT_SPEC_SOURCE_LINES_MISMATCH:${actualLines}:${raw.source.lines}`);
      }
    }
    if (!Array.isArray(raw.tasks) || raw.tasks.length === 0) throw new Error("DEVELOPMENT_SPEC_TASKS_EMPTY");
    this.#tasks = raw.tasks.map((task) => normalizeTask(task as RawSpecTask));
    const unique = new Set(this.#tasks.map((task) => task.taskId));
    if (unique.size !== this.#tasks.length) throw new Error("DEVELOPMENT_SPEC_DUPLICATE_TASK_ID");
    this.#taskById = new Map(this.#tasks.map((task) => [task.taskId, task]));
    const declaredCount = finiteInt(raw.summary?.taskCount, this.#tasks.length);
    if (declaredCount !== this.#tasks.length) throw new Error(`DEVELOPMENT_SPEC_COUNT_MISMATCH:${declaredCount}:${this.#tasks.length}`);
    this.#sourceSha256 = raw.source.sha256.toUpperCase();
    this.#phaseCount = finiteInt(raw.summary?.phaseCount, 22);
    if (this.#phaseCount !== 22) throw new Error(`DEVELOPMENT_SPEC_PHASE_COUNT_INVALID:${this.#phaseCount}`);
    if (!Array.isArray(raw.phases) || raw.phases.length !== 22) throw new Error("DEVELOPMENT_SPEC_PHASE_DEFINITIONS_INVALID");
    this.#phases = raw.phases.map((phase) => normalizePhase(phase as RawPhase, this.#tasks));
    const expected = Array.from({ length: 22 }, (_, index) => `FAZ-${String(index + 1).padStart(2, "0")}`);
    if (this.#phases.some((phase, index) => phase.phaseId !== expected[index])) throw new Error("DEVELOPMENT_SPEC_PHASE_ORDER_INVALID");
  }

  public recoverRunning(projectId: string): number {
    const states = this.#states(projectId); let recovered = 0; const now = new Date().toISOString();
    for (const [taskId, value] of Object.entries(states)) {
      if (value.state !== "RUNNING") continue;
      states[taskId] = { ...value, state: "RECOVERY_REQUIRED", lastError: value.lastError ?? "Uygulama yeniden başlatılırken RUNNING görev belirsiz durumda kaldı; kör tekrar yasak.", retryAfterAt: null, completedAt: now, updatedAt: now };
      recovered += 1;
    }
    if (recovered > 0) this.#database.setSetting(this.#key(projectId), states);
    return recovered;
  }

  public get taskCount(): number { return this.#tasks.length; }
  public getTask(taskId: string): DevelopmentSpecTask {
    const task = this.#taskById.get(taskId); if (!task) throw new Error("DEVELOPMENT_SPEC_TASK_UNKNOWN"); return task;
  }
  public getState(projectId: string, taskId: string): PersistedState | null { return this.#states(projectId)[taskId] ?? null; }

  public next(projectId: string, options: { ignoreRetryAfter?: boolean; allowBlockedExternalRetry?: boolean } = {}): DevelopmentSpecTask | null {
    const states = this.#states(projectId);
    for (const phase of this.#phases) {
      const phaseTasks = this.#tasks.filter((task) => task.phaseId === phase.phaseId);
      const task = phaseTasks.find((candidate) => {
        const persisted = states[candidate.taskId];
        return persisted?.state !== "PASS" || !acceptanceComplete(persisted.acceptance);
      });
      if (!task) continue;
      // Strict in-phase order: a failed/backoff task cannot be skipped to make the phase look busy.
      const state = states[task.taskId];
      if (state?.state === "RECOVERY_REQUIRED" || state?.state === "RUNNING") return null;
      if (state?.state === "BLOCKED_EXTERNAL") return options.allowBlockedExternalRetry ? task : null;
      if (!options.ignoreRetryAfter && state?.retryAfterAt && Date.parse(state.retryAfterAt) > Date.now()) return null;
      return task;
    }
    return null;
  }

  public mark(projectId: string, taskId: string, state: DevelopmentSpecPersistedStateName, details: DevelopmentSpecMarkDetails = {}): void {
    this.getTask(taskId);
    const states = this.#states(projectId); const previous = states[taskId]; const now = new Date().toISOString();
    const evidence = [...new Set([...(previous?.evidence ?? []), ...(details.evidence ?? [])])].filter(Boolean).slice(-100);
    const candidateAcceptance = details.acceptance === undefined ? previous?.acceptance ?? null : details.acceptance === null ? null : normalizeAcceptance(details.acceptance, details.deterministicReviewer);
    if (state === "PASS" && !acceptanceComplete(candidateAcceptance)) throw new Error(`DEVELOPMENT_SPEC_ACCEPTANCE_INCOMPLETE:${taskId}`);
    states[taskId] = {
      state,
      attempts: (previous?.attempts ?? 0) + (state === "RUNNING" ? 1 : 0),
      blockReason: state === "BLOCKED_EXTERNAL" ? clean(details.blockReason, 1_000) ?? previous?.blockReason ?? "Harici bağımlılık kullanıcı/sağlayıcı girdisi gerektiriyor." : details.blockReason === undefined ? previous?.blockReason ?? null : clean(details.blockReason, 1_000),
      lastError: details.lastError === undefined ? (state === "PASS" ? null : previous?.lastError ?? null) : clean(details.lastError, 1_000),
      evidence,
      retryAfterAt: clean(details.retryAfterAt, 64),
      acceptance: candidateAcceptance,
      startedAt: state === "RUNNING" ? (previous?.startedAt ?? now) : previous?.startedAt ?? null,
      completedAt: state === "RUNNING" ? null : now,
      updatedAt: now
    };
    this.#database.setSetting(this.#key(projectId), states);
  }

  public phaseSummary(projectId: string, phaseId: string): EvolutionPhaseSummary {
    const states = this.#states(projectId); const phase = this.#phases.find((item) => item.phaseId === phaseId);
    if (!phase) throw new Error("DEVELOPMENT_SPEC_PHASE_UNKNOWN");
    const tasks = this.#tasks.filter((task) => task.phaseId === phaseId);
    let passCount = 0; let failedCount = 0; let blockedCount = 0; let runningCount = 0; let recoveryCount = 0;
    for (const task of tasks) {
      const state = states[task.taskId]?.state;
      if (state === "PASS" && acceptanceComplete(states[task.taskId]?.acceptance ?? null)) passCount += 1;
      else if (state === "PASS") recoveryCount += 1;
      else if (state === "FAILED" || state === "CANCELLED") failedCount += 1;
      else if (state === "BLOCKED_EXTERNAL") blockedCount += 1;
      else if (state === "RUNNING") runningCount += 1;
      else if (state === "RECOVERY_REQUIRED") recoveryCount += 1;
    }
    const firstOpen = tasks.findIndex((task) => states[task.taskId]?.state !== "PASS");
    const gateState: EvolutionPhaseSummary["gateState"] = passCount === tasks.length ? "PASS"
      : recoveryCount > 0 ? "RECOVERY_REQUIRED"
      : blockedCount > 0 ? "BLOCKED_EXTERNAL"
      : runningCount > 0 ? "RUNNING"
      : failedCount > 0 ? "FAILED" : "TODO";
    return { phaseId, title: phase.title, taskCount: tasks.length, passCount, failedCount, blockedCount, runningCount, recoveryCount, remainingCount: tasks.length - passCount, currentTaskIndex: firstOpen >= 0 ? firstOpen + 1 : null, gateState };
  }

  public summary(projectId: string): EvolutionSpecSummary {
    const states = this.#states(projectId); const phaseSummaries = this.#phases.map((phase) => this.phaseSummary(projectId, phase.phaseId));
    const passCount = phaseSummaries.reduce((sum, phase) => sum + phase.passCount, 0);
    const failedCount = phaseSummaries.reduce((sum, phase) => sum + phase.failedCount, 0);
    const blockedCount = phaseSummaries.reduce((sum, phase) => sum + phase.blockedCount, 0);
    const runningCount = phaseSummaries.reduce((sum, phase) => sum + phase.runningCount, 0);
    const recoveryCount = phaseSummaries.reduce((sum, phase) => sum + phase.recoveryCount, 0);
    const current = phaseSummaries.find((phase) => phase.gateState !== "PASS") ?? null;
    const currentPhaseTasks = current ? this.#tasks.filter((task) => task.phaseId === current.phaseId) : [];
    const queuePreview = (current ? currentPhaseTasks : this.#tasks)
      .filter((task) => { const persisted = states[task.taskId]; return persisted?.state !== "PASS" || !acceptanceComplete(persisted.acceptance); })
      .slice(0, 60)
      .map((task) => {
        const persisted = states[task.taskId];
        const invalidLegacyPass = persisted?.state === "PASS" && !acceptanceComplete(persisted.acceptance);
        return {
          taskId: task.taskId, phaseId: task.phaseId, title: task.title, sourceLine: task.sourceLine,
          state: invalidLegacyPass ? "RECOVERY_REQUIRED" as const : persisted?.state ?? "TODO" as const, attempts: persisted?.attempts ?? 0, blockReason: persisted?.blockReason ?? null,
          lastError: invalidLegacyPass ? "Eski PASS kaydı acceptance bundle taşımıyor; yeniden doğrulama gerekli." : persisted?.lastError ?? null, updatedAt: persisted?.updatedAt ?? null,
          requirementCount: task.requirementIds.length, testCount: task.tests.length, failureTestCount: task.failureTests.length
        };
      });
    return {
      sourceSha256: this.#sourceSha256, phaseCount: this.#phaseCount, totalTaskCount: this.#tasks.length, passCount, failedCount, blockedCount,
      runningCount, recoveryCount, remainingCount: this.#tasks.length - passCount,
      currentPhaseId: current?.phaseId ?? null, currentPhaseTitle: current?.title ?? null, currentTaskIndex: current?.currentTaskIndex ?? null,
      currentPhaseTaskCount: current?.taskCount ?? null, currentGateState: current?.gateState ?? null, phaseSummaries, queuePreview
    };
  }

  public writePhaseEvidence(projectId: string, rootPath: string, phaseId: string): string[] {
    const summary = this.phaseSummary(projectId, phaseId); const states = this.#states(projectId);
    const tasks = this.#tasks.filter((task) => task.phaseId === phaseId);
    const directory = path.join(rootPath, "evidence", phaseId.toLowerCase());
    const taskRecords = tasks.map((task) => ({
      taskId: task.taskId, phaseId: task.phaseId, family: task.family, parentTaskId: task.parentTaskId, title: task.title, objective: task.objective,
      requirementIds: task.requirementIds, dependencies: task.dependencies, sourceResearch: task.sourceResearch, plannedFiles: task.plannedFiles,
      touchedFiles: task.touchedFiles, commands: task.commands, tests: task.tests, failureTests: task.failureTests, securityChecks: task.securityChecks,
      performanceChecks: task.performanceChecks, uxChecks: task.uxChecks, sourceEvidence: task.evidence, reviewer: task.reviewer,
      runtime: states[task.taskId] ?? { state: "TODO", attempts: 0, blockReason: null, lastError: null, evidence: [], retryAfterAt: null, acceptance: null, startedAt: null, completedAt: null, updatedAt: null }
    }));
    const requirements = taskRecords.flatMap((task) => (task.requirementIds.length ? task.requirementIds : [`REQ-${task.taskId}`]).map((requirementId) => ({ requirementId, taskId: task.taskId, objective: task.objective, state: task.runtime.state })));
    const tests = taskRecords.flatMap((task) => (task.runtime.acceptance?.positiveTests ?? task.tests).map((test, index) => ({ taskId: task.taskId, testId: `${task.taskId}:positive:${index + 1}`, definition: test, state: task.runtime.state === "PASS" ? "EVIDENCE_RECORDED" : "PENDING" })));
    const failures = taskRecords.flatMap((task) => (task.runtime.acceptance?.negativeTests ?? task.failureTests).map((test, index) => ({ taskId: task.taskId, testId: `${task.taskId}:negative:${index + 1}`, definition: test, state: task.runtime.state === "PASS" ? "EVIDENCE_RECORDED" : "PENDING" })));
    const checks = (field: "securityChecks" | "performanceChecks" | "uxChecks") => taskRecords.flatMap((task) => (task.runtime.acceptance?.[field] ?? task[field]).map((definition, index) => ({ taskId: task.taskId, checkId: `${task.taskId}:${field}:${index + 1}`, definition, state: task.runtime.state === "PASS" ? "EVIDENCE_RECORDED" : "PENDING" })));
    const common = { schemaVersion: 1, sourceSha256: this.#sourceSha256, projectId, phaseId, generatedAt: new Date().toISOString() };
    const files: Array<[string, unknown]> = [
      ["tasks.json", { ...common, summary, tasks: taskRecords }],
      ["requirements.json", { ...common, requirements }],
      ["tests.json", { ...common, tests }],
      ["failures.json", { ...common, failureTests: failures }],
      ["security.json", { ...common, checks: checks("securityChecks") }],
      ["performance.json", { ...common, checks: checks("performanceChecks") }],
      ["ux.json", { ...common, checks: checks("uxChecks") }],
      ["research-recheck.json", { ...common, status: summary.gateState === "PASS" ? "RECORDED_PER_TASK" : "PENDING_OR_PARTIAL", sources: taskRecords.flatMap((task) => task.sourceResearch) }],
      ["traceability.json", { ...common, entries: taskRecords.map((task) => ({ taskId: task.taskId, requirementIds: task.requirementIds.length ? task.requirementIds : [`REQ-${task.taskId}`], sourceResearch: task.sourceResearch, acceptance: task.runtime.acceptance, evidence: task.runtime.evidence, state: task.runtime.state })) }],
      ["gate.json", { ...common, verdict: summary.gateState, releaseBlocking: summary.gateState !== "PASS", summary, rule: "PASS only when every mandatory task in this phase is PASS; BLOCKED_EXTERNAL/RECOVERY_REQUIRED/FAILED do not advance the phase." }]
    ];
    for (const [name, body] of files) atomicJsonWrite(path.join(directory, name), body);
    return files.map(([name]) => path.join("evidence", phaseId.toLowerCase(), name).replaceAll(path.sep, "/"));
  }

  #key(projectId: string): string { return `api-evolution.spec-state.v2:${projectId}`; }
  #legacyKey(projectId: string): string { return `api-evolution.spec-state.v1:${projectId}`; }
  #states(projectId: string): StateMap {
    const raw = this.#database.getSetting<unknown>(this.#key(projectId)) ?? this.#database.getSetting<unknown>(this.#legacyKey(projectId));
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    const result: StateMap = {};
    for (const [taskId, value] of Object.entries(raw as Record<string, unknown>)) {
      if (!this.#taskById.has(taskId) || !value || typeof value !== "object" || Array.isArray(value)) continue;
      const record = value as Record<string, unknown>; const state = record.state;
      if (!( ["RUNNING", "PASS", "FAILED", "BLOCKED_EXTERNAL", "CANCELLED", "RECOVERY_REQUIRED"] as const).includes(state as DevelopmentSpecPersistedStateName)) continue;
      result[taskId] = {
        state: state as DevelopmentSpecPersistedStateName, attempts: finiteInt(record.attempts, 0), blockReason: clean(record.blockReason, 1_000), lastError: clean(record.lastError, 1_000),
        evidence: strings(record.evidence, 100), retryAfterAt: clean(record.retryAfterAt, 64), acceptance: normalizeAcceptance(record.acceptance), startedAt: clean(record.startedAt, 64), completedAt: clean(record.completedAt, 64),
        updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : new Date(0).toISOString()
      };
    }
    return result;
  }
}
