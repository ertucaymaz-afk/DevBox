import { createHash, randomUUID } from "node:crypto";
import type { EvolutionCampaign, EvolutionTrack } from "../../shared/contracts.js";
import type { StateDatabase } from "./database.js";

export type FindingSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
export type FindingStatus = "OPEN" | "RESOLVED" | "REJECTED";
export type FindingOwner = "core" | "agent" | "api" | "release" | "typescript" | "evolution" | "workspace" | "cloud" | "ui" | "security" | "project" | "integration";

export const FINDING_OWNERS: readonly FindingOwner[] = ["core", "agent", "api", "release", "typescript", "evolution", "workspace", "cloud", "ui", "security", "project", "integration"] as const;

export type EvolutionFinding = {
  id: string; fingerprint: string; projectId: string; title: string; detail: string; source: string; track: EvolutionTrack | null; specTaskId: string | null; taskId: string | null;
  severity: FindingSeverity; status: FindingStatus; owner: FindingOwner; evidence: string[]; occurrences: number; firstSeenAt: string; lastSeenAt: string; resolvedAt: string | null; rejectedAt: string | null; resolution: string | null;
};

export type FindingSummary = {
  total: number; open: number; resolved: number; rejected: number; blocking: number;
  bySeverity: Record<FindingSeverity, number>;
  byOwner: Record<FindingOwner, number>;
  items: EvolutionFinding[];
};

type FindingStore = { schemaVersion: 1; items: EvolutionFinding[]; updatedAt: string };
const MAX_FINDINGS = 1_200;
const STORE_VERSION = 1 as const;
const BLOCKING_SEVERITIES = new Set<FindingSeverity>(["CRITICAL", "HIGH"]);
function bounded(value: string, max: number): string { return value.replace(/\s+/gu, " ").trim().slice(0, max); }
function uniqueEvidence(values: readonly string[]): string[] { return [...new Set(values.map((value) => bounded(value, 512)).filter(Boolean))].slice(-40); }
function fingerprint(input: { projectId: string; source: string; key: string }): string { return createHash("sha256").update(`${input.projectId}\u0000${input.source}\u0000${input.key}`).digest("hex"); }
function ownerForTrack(track: EvolutionTrack | null): FindingOwner {
  if (track === "security" || track === "supply-chain") return "security";
  if (track === "release") return "release";
  if (track === "api") return "api";
  if (track === "design" || track === "accessibility") return "ui";
  if (track === "integrations") return "integration";
  if (track === "coding") return "core";
  return "evolution";
}
function severityForTaskState(state: string): FindingSeverity { if (state === "RECOVERY_REQUIRED") return "CRITICAL"; if (state === "FAILED") return "HIGH"; if (state === "BLOCKED_EXTERNAL") return "MEDIUM"; return "LOW"; }
function emptyCounts(): Record<FindingSeverity, number> { return { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 }; }
export function emptyOwnerCounts(): Record<FindingOwner, number> { return { core: 0, agent: 0, api: 0, release: 0, typescript: 0, evolution: 0, workspace: 0, cloud: 0, ui: 0, security: 0, project: 0, integration: 0 }; }

const FINDING_SEVERITIES = new Set<FindingSeverity>(["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"]);
const FINDING_STATUSES = new Set<FindingStatus>(["OPEN", "RESOLVED", "REJECTED"]);
const FINDING_OWNER_SET = new Set<FindingOwner>(FINDING_OWNERS);
const FINDING_TRACKS = new Set<EvolutionTrack>(["research", "architecture", "api", "coding", "design", "quality", "security", "release", "performance", "observability", "accessibility", "integrations", "documentation", "supply-chain"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
function storedRecord(value: unknown): Record<string, unknown> | null { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null; }
function storedIso(value: unknown, fallback: string): string { return typeof value === "string" && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : fallback; }
function storedNullableString(value: unknown, max: number): string | null { return typeof value === "string" ? bounded(value, max) || null : null; }
function deterministicLegacyId(projectId: string, source: string, key: string): string {
  const hex = createHash("sha256").update(`${projectId}\u0000${source}\u0000${key}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
function normalizeStoredFinding(projectId: string, value: unknown, fallbackUpdatedAt: string): EvolutionFinding | null {
  const item = storedRecord(value);
  if (!item || item.projectId !== projectId) return null;
  const source = typeof item.source === "string" ? bounded(item.source, 120) || "legacy" : "legacy";
  const title = typeof item.title === "string" ? bounded(item.title, 500) || "Eski bulgu" : "Eski bulgu";
  const detail = typeof item.detail === "string" ? bounded(item.detail, 4_000) : "Eski finding kaydı v0.1.17 tarafından güvenli biçimde normalize edildi.";
  const track = typeof item.track === "string" && FINDING_TRACKS.has(item.track as EvolutionTrack) ? item.track as EvolutionTrack : null;
  const severity = typeof item.severity === "string" && FINDING_SEVERITIES.has(item.severity as FindingSeverity) ? item.severity as FindingSeverity : "MEDIUM";
  const status = typeof item.status === "string" && FINDING_STATUSES.has(item.status as FindingStatus) ? item.status as FindingStatus : "OPEN";
  const owner = typeof item.owner === "string" && FINDING_OWNER_SET.has(item.owner as FindingOwner) ? item.owner as FindingOwner : ownerForTrack(track);
  const stableKey = typeof item.id === "string" ? item.id : `${source}:${title}`;
  const id = typeof item.id === "string" && UUID_PATTERN.test(item.id) ? item.id : deterministicLegacyId(projectId, source, stableKey);
  const fingerprintValue = typeof item.fingerprint === "string" ? item.fingerprint.toLocaleLowerCase("en-US") : "";
  const findingFingerprint = SHA256_PATTERN.test(fingerprintValue)
    ? fingerprintValue
    : fingerprint({ projectId, source, key: stableKey });
  const evidence = Array.isArray(item.evidence) ? uniqueEvidence(item.evidence.filter((entry): entry is string => typeof entry === "string")) : [];
  const occurrences = typeof item.occurrences === "number" && Number.isFinite(item.occurrences) ? Math.max(1, Math.trunc(item.occurrences)) : 1;
  const firstSeenAt = storedIso(item.firstSeenAt, fallbackUpdatedAt);
  const lastSeenAt = storedIso(item.lastSeenAt, firstSeenAt);
  return {
    id,
    fingerprint: findingFingerprint,
    projectId,
    title,
    detail,
    source,
    track,
    specTaskId: storedNullableString(item.specTaskId, 160),
    taskId: storedNullableString(item.taskId, 160),
    severity,
    status,
    owner,
    evidence,
    occurrences,
    firstSeenAt,
    lastSeenAt,
    resolvedAt: status === "RESOLVED" ? storedIso(item.resolvedAt, lastSeenAt) : null,
    rejectedAt: status === "REJECTED" ? storedIso(item.rejectedAt, lastSeenAt) : null,
    resolution: storedNullableString(item.resolution, 2_000)
  };
}

export class EvolutionFindingService {
  readonly #database: StateDatabase;
  public constructor(database: StateDatabase) { this.#database = database; }
  #key(projectId: string): string { return `evolution:findings:v1:${projectId}`; }
  #load(projectId: string): FindingStore {
    const raw = this.#database.getSetting<unknown>(this.#key(projectId));
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { schemaVersion: STORE_VERSION, items: [], updatedAt: new Date(0).toISOString() };
    const candidate = raw as Partial<FindingStore>;
    if (candidate.schemaVersion !== STORE_VERSION || !Array.isArray(candidate.items)) return { schemaVersion: STORE_VERSION, items: [], updatedAt: new Date(0).toISOString() };
    const updatedAt = storedIso(candidate.updatedAt, new Date(0).toISOString());
    const items = candidate.items.flatMap((item): EvolutionFinding[] => {
      const normalized = normalizeStoredFinding(projectId, item, updatedAt);
      return normalized ? [normalized] : [];
    });
    return { schemaVersion: STORE_VERSION, items: items.slice(-MAX_FINDINGS), updatedAt };
  }
  #save(projectId: string, items: EvolutionFinding[]): FindingStore {
    const store: FindingStore = { schemaVersion: STORE_VERSION, items: items.slice(-MAX_FINDINGS), updatedAt: new Date().toISOString() };
    this.#database.setSetting(this.#key(projectId), store); return store;
  }
  public report(input: { projectId: string; source: string; key: string; title: string; detail: string; severity: FindingSeverity; owner: FindingOwner; track?: EvolutionTrack | null; specTaskId?: string | null; taskId?: string | null; evidence?: readonly string[] }): EvolutionFinding {
    const now = new Date().toISOString(); const fp = fingerprint({ projectId: input.projectId, source: bounded(input.source, 120), key: bounded(input.key, 300) }); const store = this.#load(input.projectId); const index = store.items.findIndex((item) => item.fingerprint === fp); const existing = index >= 0 ? store.items[index]! : null;
    const next: EvolutionFinding = existing ? { ...existing, title: bounded(input.title, 500), detail: bounded(input.detail, 4_000), severity: input.severity, status: "OPEN", owner: input.owner, track: input.track ?? existing.track, specTaskId: input.specTaskId ?? existing.specTaskId, taskId: input.taskId ?? existing.taskId, evidence: uniqueEvidence([...existing.evidence, ...(input.evidence ?? [])]), occurrences: existing.occurrences + 1, lastSeenAt: now, resolvedAt: null, rejectedAt: null, resolution: null }
      : { id: randomUUID(), fingerprint: fp, projectId: input.projectId, title: bounded(input.title, 500), detail: bounded(input.detail, 4_000), source: bounded(input.source, 120), track: input.track ?? null, specTaskId: input.specTaskId ?? null, taskId: input.taskId ?? null, severity: input.severity, status: "OPEN", owner: input.owner, evidence: uniqueEvidence(input.evidence ?? []), occurrences: 1, firstSeenAt: now, lastSeenAt: now, resolvedAt: null, rejectedAt: null, resolution: null };
    const items = [...store.items]; if (index >= 0) items[index] = next; else items.push(next); this.#save(input.projectId, items); this.#database.appendEvent(existing ? "evolution.finding.updated" : "evolution.finding.opened", input.projectId, next, BLOCKING_SEVERITIES.has(next.severity)); return next;
  }
  public transition(projectId: string, findingId: string, status: Exclude<FindingStatus, "OPEN">, resolution: string): EvolutionFinding {
    const store = this.#load(projectId); const index = store.items.findIndex((item) => item.id === findingId); if (index < 0) throw new Error("EVOLUTION_FINDING_NOT_FOUND"); const now = new Date().toISOString(); const current = store.items[index]!;
    const next: EvolutionFinding = { ...current, status, lastSeenAt: now, resolvedAt: status === "RESOLVED" ? now : null, rejectedAt: status === "REJECTED" ? now : null, resolution: bounded(resolution, 2_000) || (status === "RESOLVED" ? "Doğrulanmış düzeltme ile kapatıldı." : "Kanıtla reddedildi.") };
    const items = [...store.items]; items[index] = next; this.#save(projectId, items); this.#database.appendEvent(status === "RESOLVED" ? "evolution.finding.resolved" : "evolution.finding.rejected", projectId, next, false); return next;
  }
  public reconcileCampaign(projectId: string, campaign: EvolutionCampaign): FindingSummary {
    const currentStore = this.#load(projectId); const activeKeys = new Set<string>();
    for (const task of campaign.tasks) {
      if (!["FAILED", "RECOVERY_REQUIRED", "BLOCKED_EXTERNAL"].includes(task.state)) continue;
      const stableTaskKey = task.specTaskId ?? task.id; activeKeys.add(stableTaskKey);
      this.report({ projectId, source: "api-evolution", key: stableTaskKey, title: `${task.phaseId ?? "ADAPT"} · ${task.title}`, detail: task.error ?? task.blockReason ?? `Evolution görevi ${task.state} durumunda.`, severity: severityForTaskState(task.state), owner: ownerForTrack(task.track), track: task.track, specTaskId: task.specTaskId, taskId: task.id, evidence: task.evidence });
    }
    const refreshed = this.#load(projectId); const succeeded = new Set(campaign.tasks.filter((task) => task.state === "SUCCEEDED").map((task) => task.specTaskId ?? task.id)); let changed = false; const now = new Date().toISOString();
    const items = refreshed.items.map((item) => { if (item.status !== "OPEN" || item.source !== "api-evolution") return item; const key = item.specTaskId ?? item.taskId; if (!key || activeKeys.has(key) || !succeeded.has(key)) return item; changed = true; const next = { ...item, status: "RESOLVED" as const, resolvedAt: now, rejectedAt: null, lastSeenAt: now, resolution: "Aynı evolution görevi daha sonraki doğrulanmış çevrimde SUCCEEDED oldu." }; this.#database.appendEvent("evolution.finding.resolved", projectId, next, false); return next; });
    if (changed) this.#save(projectId, items); void currentStore; return this.summary(projectId);
  }
  public reportTypeScriptOutput(projectId: string, output: string): EvolutionFinding[] {
    const findings: EvolutionFinding[] = []; const seen = new Set<string>(); const pattern = /(?:^|\n)([^\n()]+\.(?:tsx?|jsx?))\((\d+),(\d+)\):\s*error\s*(TS\d+):\s*([^\n]+)/gu;
    for (const match of output.matchAll(pattern)) { const [, file = "unknown.ts", line = "0", column = "0", code = "TS", message = "TypeScript error"] = match; const key = `${file}:${line}:${column}:${code}`; if (seen.has(key)) continue; seen.add(key); findings.push(this.report({ projectId, source: "typescript", key, title: `${code} · ${file}:${line}:${column}`, detail: message, severity: "HIGH", owner: "typescript", track: "quality", evidence: [`${file}:${line}:${column}`, code] })); if (findings.length >= 250) break; }
    return findings;
  }
  public list(projectId: string, options: { status?: FindingStatus; severity?: FindingSeverity; owner?: FindingOwner; limit?: number } = {}): EvolutionFinding[] {
    const limit = Math.max(1, Math.min(MAX_FINDINGS, Math.trunc(options.limit ?? 300)));
    return this.#load(projectId).items.filter((item) => !options.status || item.status === options.status).filter((item) => !options.severity || item.severity === options.severity).filter((item) => !options.owner || item.owner === options.owner).sort((left, right) => right.lastSeenAt.localeCompare(left.lastSeenAt)).slice(0, limit);
  }
  public summary(projectId: string): FindingSummary {
    const items = this.list(projectId, { limit: MAX_FINDINGS }); const bySeverity = emptyCounts(); const byOwner = emptyOwnerCounts(); let open = 0; let resolved = 0; let rejected = 0; let blocking = 0;
    for (const item of items) { bySeverity[item.severity] += 1; byOwner[item.owner] += 1; if (item.status === "OPEN") { open += 1; if (BLOCKING_SEVERITIES.has(item.severity)) blocking += 1; } else if (item.status === "RESOLVED") resolved += 1; else rejected += 1; }
    return { total: items.length, open, resolved, rejected, blocking, bySeverity, byOwner, items };
  }
}
