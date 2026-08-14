import { z } from "zod";
import { PluginPermissionSchema } from "./plugin-contracts.js";

const SAFE_ID = /^[a-z0-9][a-z0-9._-]{1,127}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;

export const MarketplaceChannelSchema = z.enum(["DEVELOPMENT", "BETA", "STABLE"]);
export const MarketplaceSubmissionStateSchema = z.enum([
  "DRAFT",
  "UPLOADING",
  "QUARANTINED",
  "SUBMITTED",
  "AUTOMATED_REVIEW",
  "CHANGES_REQUESTED",
  "HUMAN_REVIEW",
  "REJECTED",
  "APPROVED",
  "PUBLISHING",
  "PUBLISHED",
  "SUSPENDED",
  "REVOKED"
]);

export const MarketplaceArtifactSchema = z.object({
  artifactId: z.uuid(),
  packageId: z.string().regex(SAFE_ID),
  version: z.string().min(1).max(64),
  sha256: z.string().regex(SHA256),
  compressedBytes: z.number().int().positive(),
  expandedBytes: z.number().int().positive(),
  fileCount: z.number().int().positive(),
  uploadedAt: z.iso.datetime()
}).strict();

export const MarketplaceReviewEvidenceSchema = z.object({
  evidenceId: z.uuid(),
  artifactSha256: z.string().regex(SHA256),
  policyVersion: z.string().min(1).max(80),
  check: z.string().min(1).max(120),
  result: z.enum(["PASS", "WARN", "FAIL", "BLOCK", "NOT_RUN"]),
  summary: z.string().min(1).max(4_000),
  producedAt: z.iso.datetime()
}).strict();

export const MarketplacePackageVersionSchema = z.object({
  packageId: z.string().regex(SAFE_ID),
  publisherId: z.string().regex(SAFE_ID),
  publisherName: z.string().min(1).max(160),
  version: z.string().min(1).max(64),
  channel: MarketplaceChannelSchema,
  artifactSha256: z.string().regex(SHA256),
  publicKeyId: z.string().regex(SAFE_ID),
  permissions: z.array(PluginPermissionSchema).max(64),
  reviewDecisionId: z.uuid(),
  reviewedAt: z.iso.datetime(),
  publishedAt: z.iso.datetime()
}).strict();

export const MarketplacePolicySchema = z.object({
  policyVersion: z.string().min(1).max(80),
  maxCompressedBytes: z.number().int().positive(),
  maxExpandedBytes: z.number().int().positive(),
  maxFileCount: z.number().int().positive(),
  allowedPackageKinds: z.array(z.enum(["plugin", "mcp", "toolkit"])).min(1),
  stableRequiresBeta: z.boolean(),
  betaMinimumHours: z.number().int().nonnegative().optional(),
  highRiskRequiresSecurityReview: z.boolean(),
  highRiskRequiresTwoPersonApproval: z.boolean(),
  allowedLicenses: z.array(z.string().min(1).max(120)).optional(),
  blockedPermissions: z.array(PluginPermissionSchema).optional(),
  mandatoryChecks: z.array(z.string().min(1).max(120)).min(1),
  evidenceMaxAgeHours: z.number().int().positive()
}).strict();

export const MarketplaceRevocationEntrySchema = z.object({
  packageId: z.string().regex(SAFE_ID),
  version: z.union([z.literal("*"), z.string().min(1).max(64)]),
  publisherKeyId: z.string().regex(SAFE_ID).nullable(),
  disposition: z.enum(["SUSPENDED", "REVOKED"]),
  reasonCode: z.enum(["MALWARE", "PRIVACY", "IMPERSONATION", "LICENSE", "DATA_LOSS", "UNWANTED_NETWORK", "KEY_COMPROMISE", "POLICY"]),
  publicMessage: z.string().min(1).max(2_000),
  effectiveAt: z.iso.datetime()
}).strict();

export const SignedRevocationListSchema = z.object({
  schemaVersion: z.literal(1),
  sequence: z.number().int().positive(),
  catalogKeyId: z.string().regex(SAFE_ID),
  issuedAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  entries: z.array(MarketplaceRevocationEntrySchema).max(100_000),
  signature: z.string().min(40).max(2_048)
}).strict().superRefine((value, context) => {
  if (Date.parse(value.expiresAt) <= Date.parse(value.issuedAt)) context.addIssue({ code: "custom", message: "REVOCATION_EXPIRY_INVALID" });
});

export type MarketplacePolicy = z.infer<typeof MarketplacePolicySchema>;
export type MarketplaceArtifact = z.infer<typeof MarketplaceArtifactSchema>;
export type MarketplaceReviewEvidence = z.infer<typeof MarketplaceReviewEvidenceSchema>;
export type MarketplacePackageVersion = z.infer<typeof MarketplacePackageVersionSchema>;
export type MarketplaceRevocationEntry = z.infer<typeof MarketplaceRevocationEntrySchema>;
export type SignedRevocationList = z.infer<typeof SignedRevocationListSchema>;
