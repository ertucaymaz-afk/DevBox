const SOURCE_TYPES = new Set(["official-doc", "official-repo", "standard", "paper", "community"]);
const CONFIDENCE = new Set(["high", "medium", "low"]);
const FRESHNESS = new Set(["fresh", "possibly-stale"]);

function httpsUrl(value) {
  const url = new URL(String(value ?? ""));
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("RESEARCH_SOURCE_URL_INVALID");
  return url.href;
}

export function normalizeResearchEvidence(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("RESEARCH_EVIDENCE_OBJECT_REQUIRED");
  const query = String(input.query ?? "").trim().slice(0, 500);
  const claim = String(input.claim ?? "").trim().slice(0, 4_000);
  const usedFor = String(input.usedFor ?? "").trim().slice(0, 500);
  if (!query) throw new Error("RESEARCH_QUERY_REQUIRED");
  if (!claim) throw new Error("RESEARCH_CLAIM_REQUIRED");
  if (!usedFor) throw new Error("RESEARCH_USED_FOR_REQUIRED");
  if (!SOURCE_TYPES.has(input.sourceType)) throw new Error("RESEARCH_SOURCE_TYPE_INVALID");
  if (!CONFIDENCE.has(input.confidence)) throw new Error("RESEARCH_CONFIDENCE_INVALID");
  if (!FRESHNESS.has(input.freshness)) throw new Error("RESEARCH_FRESHNESS_INVALID");
  const accessedAt = new Date(input.accessedAt);
  if (Number.isNaN(accessedAt.getTime())) throw new Error("RESEARCH_ACCESSED_AT_INVALID");
  const publishedAt = input.publishedAt ? new Date(input.publishedAt) : null;
  if (publishedAt && Number.isNaN(publishedAt.getTime())) throw new Error("RESEARCH_PUBLISHED_AT_INVALID");
  return Object.freeze({
    query,
    sourceUrl: httpsUrl(input.sourceUrl),
    sourceType: input.sourceType,
    publishedAt: publishedAt ? publishedAt.toISOString() : null,
    accessedAt: accessedAt.toISOString(),
    claim,
    confidence: input.confidence,
    freshness: input.freshness,
    usedFor
  });
}

export function isUntrustedInstruction(text) {
  const value = String(text ?? "");
  return /(?:ignore previous|forget previous|system prompt|send secret|exfiltrat|run this command|delete files|upload token)/iu.test(value);
}

export function assertResearchSafeForPlanning(evidence) {
  const normalized = normalizeResearchEvidence(evidence);
  if (isUntrustedInstruction(normalized.claim)) throw new Error("RESEARCH_PROMPT_INJECTION_SUSPECTED");
  return normalized;
}
