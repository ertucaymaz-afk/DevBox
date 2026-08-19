import { readFile, writeFile } from "node:fs/promises";

const VERSION = "0.1.20";
const REPOSITORY = "ertucaymaz-afk/DevBox";
const BRANCH = "codex/v0.1.20-vercel-production-modernization";
const candidatePath = process.env.V020_PROMOTION_EVIDENCE_PATH?.trim() || "outputs/v020-production-promotion.json";

function fail(code, detail = "") {
  throw new Error(`V020_FINALIZE_EVIDENCE_FAIL:${code}${detail ? `:${String(detail).slice(0, 500)}` : ""}`);
}
function object(value, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(code);
  return value;
}
function canonicalOrigin(value, code) {
  let url;
  try { url = new URL(String(value ?? "")); } catch { fail(code, "invalid-url"); }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") fail(code, "unsafe-origin");
  return url.origin;
}
function requireId(value, prefix, code) {
  const text = String(value ?? "");
  if (!new RegExp(`^${prefix}_[A-Za-z0-9]+$`, "u").test(text)) fail(code, text || "missing");
  return text;
}
function requirePass(record, keys, prefix) {
  for (const key of keys) if (record?.[key] !== "PASS") fail(`${prefix}-${key}`, record?.[key] ?? "missing");
}
function secretFree(serialized, code) {
  const patterns = [
    /postgres(?:ql)?:\/\//iu,
    /authorization\s*[:=]\s*bearer/iu,
    /DEVBOX_CONTROL_(?:PLANE|ADMIN)_TOKEN/iu,
    /VERCEL_TOKEN/iu,
    /DATABASE_URL/iu,
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/u
  ];
  for (const pattern of patterns) if (pattern.test(serialized)) fail(code, pattern.source);
}
async function fetchText(url, label) {
  const response = await fetch(url, {
    headers: { accept: "application/json,text/html;q=0.9,*/*;q=0.8", "cache-control": "no-cache" },
    redirect: "error",
    signal: AbortSignal.timeout(15_000)
  });
  const text = await response.text();
  return { response, text, label };
}
async function rootProbe(origin, label, requiredMarkers) {
  const { response, text } = await fetchText(origin, label);
  if (response.status !== 200) fail(`${label}-root-http`, response.status);
  for (const marker of requiredMarkers) if (!text.includes(marker)) fail(`${label}-root-marker`, marker);
  console.log(`V020_FINALIZE_ROOT_PASS label=${label} status=200 version=${VERSION}`);
  return 200;
}
async function jsonProbe(url, label, verify, expectedMarker = null) {
  const { response, text } = await fetchText(url, label);
  if (response.status !== 200) fail(`${label}-http`, response.status);
  if (expectedMarker && response.headers.get("x-devbox-public-state") !== expectedMarker) {
    fail(`${label}-marker`, response.headers.get("x-devbox-public-state") ?? "missing");
  }
  let body;
  try { body = JSON.parse(text); } catch { fail(`${label}-json`); }
  const verdict = verify(body);
  if (verdict !== true) fail(`${label}-contract`, verdict || "verify-failed");
  console.log(`V020_FINALIZE_JSON_PASS label=${label} status=200${expectedMarker ? ` marker=${expectedMarker}` : ""}`);
  return { status: 200, body };
}

const [packageRaw, candidateRaw, previousRaw, linksRaw] = await Promise.all([
  readFile("package.json", "utf8"),
  readFile(candidatePath, "utf8"),
  readFile("cloud/production-evidence.json", "utf8"),
  readFile("cloud/product-links.json", "utf8")
]);
const pkg = JSON.parse(packageRaw);
const candidate = JSON.parse(candidateRaw);
const previous = JSON.parse(previousRaw);
const previousLinks = JSON.parse(linksRaw);

if (String(pkg.version ?? "") !== VERSION) fail("package-version", pkg.version);
if (candidate.productVersion !== VERSION) fail("candidate-version", candidate.productVersion);
if (candidate.state !== "PASS_RELEASE_EVIDENCE_CANDIDATE") fail("candidate-state", candidate.state);
if (!/^[a-f0-9]{40}$/u.test(String(candidate.sourceSha ?? ""))) fail("source-sha", candidate.sourceSha);
if (!Number.isSafeInteger(Number(candidate.workflowRunId)) || Number(candidate.workflowRunId) <= 0) fail("workflow-run-id", candidate.workflowRunId);

const deploymentContract = object(candidate.deploymentContract, "deployment-contract");
requirePass(deploymentContract, ["publicStateSanitization", "crossSiteLinks"], "deployment");
const canary = object(candidate.canary, "canary");
requirePass(canary, [
  "desktopSnapshot",
  "publicStateSanitization",
  "idleIsolation",
  "setEnabledAck",
  "runAck",
  "cancelAck",
  "commandIdempotency",
  "commandSequence",
  "crossSiteLinks",
  "runtimeErrorScan"
], "canary");
if (Number(candidate.proof?.runtimeErrorClusters) !== 0) fail("runtime-error-clusters", candidate.proof?.runtimeErrorClusters);
if (candidate.proof?.cloudCommandIdempotencyFaultInjection !== "PASS") fail("idempotency-fault-proof", candidate.proof?.cloudCommandIdempotencyFaultInjection);
if (candidate.proof?.desktopIdleIsolation !== "PASS") fail("idle-isolation-proof", candidate.proof?.desktopIdleIsolation);

const devapiCandidate = object(candidate.vercel?.devapi, "candidate-devapi");
const devboxCandidate = object(candidate.vercel?.devbox, "candidate-devbox");
const desktop = object(candidate.desktop, "candidate-desktop");
const devapiProjectId = requireId(devapiCandidate.projectId, "prj", "devapi-project-id");
const devboxProjectId = requireId(devboxCandidate.projectId, "prj", "devbox-project-id");
const devapiDeploymentId = requireId(devapiCandidate.deploymentId, "dpl", "devapi-deployment-id");
const devapiRollbackId = requireId(devapiCandidate.rollbackCandidateId, "dpl", "devapi-rollback-id");
const devboxDeploymentId = requireId(devboxCandidate.deploymentId, "dpl", "devbox-deployment-id");
const devboxRollbackId = requireId(devboxCandidate.rollbackCandidateId, "dpl", "devbox-rollback-id");
if (devapiDeploymentId === devapiRollbackId) fail("devapi-rollback-equals-live");
if (devboxDeploymentId === devboxRollbackId) fail("devbox-rollback-equals-live");
const devapiOrigin = canonicalOrigin(devapiCandidate.canonicalUrl, "devapi-origin");
const devboxOrigin = canonicalOrigin(devboxCandidate.productUrl, "devbox-origin");
const desktopProjectId = String(desktop.projectId ?? "");
if (desktopProjectId.length < 8 || desktop.version !== VERSION || Number(desktop.protocol) !== 1) fail("desktop-identity-contract");

const devapiRootStatus = await rootProbe(devapiOrigin, "devapi", ["DevAPI", "v0.1.20"]);
const health = await jsonProbe(`${devapiOrigin}/api/v1/health`, "devapi-health", (body) => {
  return body?.version === VERSION && body?.state === "READY" ? true : `version=${body?.version} state=${body?.state}`;
});
const directPublicUrl = new URL("/api/v1/public-state", devapiOrigin);
directPublicUrl.searchParams.set("projectId", desktopProjectId);
const publicState = await jsonProbe(directPublicUrl, "devapi-public-state", (body) => {
  if (body?.product?.name !== "DevBox" || body?.product?.version !== VERSION) return "product-drift";
  if (body?.devapi?.state !== "READY" || body?.devapi?.controlPlaneVersion !== VERSION) return "devapi-state-drift";
  if (body?.freshness?.stale !== false) return "stale";
  return true;
}, "sanitized");

const devboxRootStatus = await rootProbe(devboxOrigin, "devbox", ["DevBox", "v0.1.20"]);
await jsonProbe(`${devboxOrigin}/api/product-links`, "devbox-product-links", (body) => {
  return body?.schemaVersion === 1 && body?.devapi === devapiOrigin ? true : `devapi=${body?.devapi ?? "missing"}`;
});
await jsonProbe(`${devboxOrigin}/api/public-state`, "devbox-public-state-proxy", (body) => {
  return body?.product?.name === "DevBox" && body?.product?.version === VERSION ? true : "product-drift";
}, "sanitized-proxy");

const neon = object(previous.neon, "previous-neon");
if (neon.schemaReadBack !== "PASS") fail("neon-schema-readback", neon.schemaReadBack);
const schemaTables = new Set(Array.isArray(neon.schemaTables) ? neon.schemaTables : []);
for (const table of ["devbox_project_state", "devbox_project_state_history", "devbox_control_commands"]) {
  if (!schemaTables.has(table)) fail("neon-schema-table", table);
}

const finalizedAt = new Date().toISOString();
const finalLinks = {
  schemaVersion: 1,
  productVersion: VERSION,
  github: `https://github.com/${REPOSITORY}`,
  devapi: { canonicalUrl: devapiOrigin, state: "PASS" },
  devbox: {
    requestedCanonicalUrl: previousLinks?.devbox?.requestedCanonicalUrl ?? devboxOrigin,
    canonicalUrl: devboxOrigin,
    state: "PASS"
  }
};

const finalEvidence = {
  schemaVersion: 2,
  productVersion: VERSION,
  capturedAt: finalizedAt,
  source: {
    repository: REPOSITORY,
    branch: BRANCH,
    verifiedCommit: candidate.sourceSha,
    status: "PASS"
  },
  vercel: {
    teamId: String(candidate.vercel?.teamId ?? ""),
    teamSlug: previous.vercel?.teamSlug ?? null,
    devapi: {
      projectId: devapiProjectId,
      canonicalUrl: devapiOrigin,
      latestDeploymentId: devapiDeploymentId,
      rollbackCandidateId: devapiRollbackId,
      observedVersion: VERSION,
      expectedVersion: VERSION,
      rootHttpStatus: devapiRootStatus,
      healthHttpStatus: health.status,
      publicStateHttpStatus: publicState.status,
      runtimeErrorClusters24h: 0,
      state: "PASS"
    },
    devbox: {
      projectId: devboxProjectId,
      requestedCanonicalUrl: previousLinks?.devbox?.requestedCanonicalUrl ?? devboxOrigin,
      canonicalUrl: devboxOrigin,
      latestDeploymentId: devboxDeploymentId,
      rollbackCandidateId: devboxRollbackId,
      rootHttpStatus: devboxRootStatus,
      state: "PASS"
    }
  },
  neon: {
    ...neon,
    runtimeBinding: "PASS",
    state: "PASS_PRODUCTION_CANONICAL_SCHEMA"
  },
  promotion: {
    workflow: ".github/workflows/v020-production-promote.yml",
    lastObservedRunId: Number(candidate.workflowRunId),
    state: "PASS",
    missingGitHubSecrets: [],
    sourceSha: candidate.sourceSha,
    crossSiteLinks: "PASS",
    publicStateSanitization: "PASS",
    devapiProjectId,
    devboxProjectId,
    devapiDeploymentId,
    devboxDeploymentId,
    devapiCanonicalUrl: devapiOrigin,
    devboxProductUrl: devboxOrigin,
    runtimeErrorScan: "PASS",
    idleIsolation: "PASS"
  },
  canary: {
    desktopSnapshot: "PASS",
    publicStateSanitization: "PASS",
    idleIsolation: "PASS",
    setEnabledAck: "PASS",
    runAck: "PASS",
    cancelAck: "PASS",
    commandIdempotency: "PASS",
    commandSequence: "PASS",
    crossSiteLinks: "PASS",
    runtimeErrorScan: "PASS"
  },
  release: {
    productionEvidence: "PASS",
    blockers: []
  }
};

const evidenceSerialized = `${JSON.stringify(finalEvidence, null, 2)}\n`;
const linksSerialized = `${JSON.stringify(finalLinks, null, 2)}\n`;
secretFree(evidenceSerialized, "evidence-secret-pattern");
secretFree(linksSerialized, "links-secret-pattern");
await writeFile("cloud/production-evidence.json", evidenceSerialized, "utf8");
await writeFile("cloud/product-links.json", linksSerialized, "utf8");
console.log(`V020_FINALIZE_EVIDENCE_PASS candidate=${candidatePath} source=${candidate.sourceSha} run=${candidate.workflowRunId} devapi=${devapiDeploymentId} devbox=${devboxDeploymentId} liveProbes=6 publicState=sanitized idleIsolation=pass runtimeErrors=0 secrets=0`);
