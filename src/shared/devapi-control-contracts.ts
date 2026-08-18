import { z } from "zod";
import { EvolutionCampaignSchema } from "./contracts.js";

export const FindingSeveritySchema = z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"]);
export const FindingStatusSchema = z.enum(["OPEN", "RESOLVED", "REJECTED"]);
export const FindingOwnerSchema = z.enum(["core", "agent", "api", "release", "typescript", "evolution", "workspace", "cloud", "ui", "security", "project", "integration"]);
export const EvolutionFindingSchema = z.object({
  id: z.string().uuid(), fingerprint: z.string().regex(/^[a-f0-9]{64}$/u), projectId: z.string().min(8).max(128), title: z.string().min(1).max(500), detail: z.string().max(4_000), source: z.string().min(1).max(120),
  track: z.enum(["research", "architecture", "api", "coding", "design", "quality", "security", "release", "performance", "observability", "accessibility", "integrations", "documentation", "supply-chain"]).nullable(),
  specTaskId: z.string().max(160).nullable(), taskId: z.string().max(160).nullable(), severity: FindingSeveritySchema, status: FindingStatusSchema, owner: FindingOwnerSchema,
  evidence: z.array(z.string().max(512)).max(40), occurrences: z.number().int().positive(), firstSeenAt: z.string().datetime(), lastSeenAt: z.string().datetime(), resolvedAt: z.string().datetime().nullable(), rejectedAt: z.string().datetime().nullable(), resolution: z.string().max(2_000).nullable()
}).strict();
export type EvolutionFinding = z.infer<typeof EvolutionFindingSchema>;

export const FindingSummarySchema = z.object({
  total: z.number().int().nonnegative(), open: z.number().int().nonnegative(), resolved: z.number().int().nonnegative(), rejected: z.number().int().nonnegative(), blocking: z.number().int().nonnegative(),
  bySeverity: z.object({ CRITICAL: z.number().int().nonnegative(), HIGH: z.number().int().nonnegative(), MEDIUM: z.number().int().nonnegative(), LOW: z.number().int().nonnegative(), INFO: z.number().int().nonnegative() }).strict(),
  byOwner: z.record(FindingOwnerSchema, z.number().int().nonnegative()), items: z.array(EvolutionFindingSchema).max(1_200)
}).strict();
export type FindingSummary = z.infer<typeof FindingSummarySchema>;

export const FindingTransitionInputSchema = z.object({ projectId: z.string().min(8).max(128), findingId: z.string().uuid(), status: z.enum(["RESOLVED", "REJECTED"]), resolution: z.string().trim().min(3).max(2_000) }).strict();

export const ReleaseGateModeSchema = z.enum(["PREFLIGHT", "FULL"]);
export const ReleaseGateCheckSchema = z.object({ id: z.string().min(1).max(120), title: z.string().min(1).max(240), state: z.enum(["PASS", "FAIL", "SKIP"]), blocking: z.boolean(), durationMs: z.number().int().nonnegative(), detail: z.string().max(4_000), command: z.string().max(1_000).nullable(), evidence: z.array(z.string().max(2_000)).max(40) }).strict();
export const ReleaseGateRunSchema = z.object({ id: z.string().uuid(), projectId: z.string().min(8).max(128), mode: ReleaseGateModeSchema, state: z.enum(["PASS", "FAIL"]), head: z.string().max(160).nullable(), branch: z.string().max(240).nullable(), repositoryRoot: z.string().max(32_768).nullable(), startedAt: z.string().datetime(), completedAt: z.string().datetime(), durationMs: z.number().int().nonnegative(), checks: z.array(ReleaseGateCheckSchema).max(40), blockingFailures: z.number().int().nonnegative() }).strict();
export type ReleaseGateRun = z.infer<typeof ReleaseGateRunSchema>;
export const ReleaseGateRunInputSchema = z.object({ projectId: z.string().min(8).max(128), mode: ReleaseGateModeSchema }).strict();
export const ProjectIdControlInputSchema = z.object({ projectId: z.string().min(8).max(128) }).strict();

export const CloudControlStatusSchema = z.object({ state: z.enum(["UNCONFIGURED", "READY", "DEGRADED", "FAILED"]), endpoint: z.string().url().nullable(), configured: z.boolean(), lastSyncAt: z.string().datetime().nullable(), lastCommandAt: z.string().datetime().nullable(), lastError: z.string().max(1_000).nullable(), pendingCommandCursor: z.string().max(128).nullable() }).strict();
export type CloudControlStatus = z.infer<typeof CloudControlStatusSchema>;

export const DevApiControlSnapshotSchema = z.object({
  campaign: EvolutionCampaignSchema,
  findings: FindingSummarySchema,
  releaseGate: ReleaseGateRunSchema.nullable(),
  releaseHistory: z.array(ReleaseGateRunSchema).max(40),
  cloud: CloudControlStatusSchema,
  generatedAt: z.string().datetime()
}).strict();
export type DevApiControlSnapshot = z.infer<typeof DevApiControlSnapshotSchema>;
