import { describe, expect, it } from "vitest";
import { MarketplacePolicySchema, MarketplaceReviewEvidenceSchema, SignedRevocationListSchema } from "./marketplace-contracts.js";

describe("marketplace contracts", () => {
  it("keeps NOT_RUN distinct from a passing review and validates a versioned policy", () => {
    expect(MarketplaceReviewEvidenceSchema.parse({
      evidenceId: crypto.randomUUID(),
      artifactSha256: "a".repeat(64),
      policyVersion: "2026-08-14",
      check: "windows-clean-vm",
      result: "NOT_RUN",
      summary: "Temiz Windows VM kanıtı henüz üretilmedi.",
      producedAt: "2026-08-14T00:00:00.000Z"
    }).result).toBe("NOT_RUN");
    expect(MarketplacePolicySchema.parse({
      policyVersion: "2026-08-14",
      maxCompressedBytes: 314_572_800,
      maxExpandedBytes: 1_073_741_824,
      maxFileCount: 50_000,
      allowedPackageKinds: ["plugin", "mcp", "toolkit"],
      stableRequiresBeta: true,
      betaMinimumHours: 24,
      highRiskRequiresSecurityReview: true,
      highRiskRequiresTwoPersonApproval: true,
      mandatoryChecks: ["manifest", "signature", "malware", "license", "sandbox"],
      evidenceMaxAgeHours: 168
    }).stableRequiresBeta).toBe(true);
  });

  it("rejects a revocation list whose expiry is not after its issue time", () => {
    expect(() => SignedRevocationListSchema.parse({
      schemaVersion: 1,
      sequence: 1,
      catalogKeyId: "catalog.root",
      issuedAt: "2026-08-14T01:00:00.000Z",
      expiresAt: "2026-08-14T01:00:00.000Z",
      entries: [],
      signature: "x".repeat(64)
    })).toThrow("REVOCATION_EXPIRY_INVALID");
  });
});
