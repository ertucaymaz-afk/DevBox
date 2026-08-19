import { readFile, writeFile } from "node:fs/promises";

const REPORT_PATH = process.env.V020_PRODUCTION_REPORT?.trim() || "outputs/v020-production-promotion.json";
const EVIDENCE_PATH = "cloud/production-evidence.json";
const LINKS_PATH = "cloud/product-links.json";

const [pkgRaw, reportRaw, currentEvidenceRaw, currentLinksRaw] = await Promise.all([
  readFile("package.json", "utf8"),
  readFile(REPORT_PATH, "utf8"),
  readFile(EVIDENCE_PATH, "utf8"),
  readFile(LINKS_PATH, "utf8")
]);
const pkg = JSON.parse(pkgRaw);
const report = JSON.parse(reportRaw);
const currentEvidence = JSON.parse(currentEvidenceRaw);
const currentLinks = JSON.parse(currentLinksRaw);
const version = String(pkg.version ?? "");

function fail(code, detail = "") { throw new Error(`V020_EVIDENCE_FINALIZE_FAIL:${code}${detail ? `:${String(detail).slice(0, 500)}` : ""}`); }
function requireId(value, prefix, label) {
  const text = String(value ?? "");
  if (!new RegExp(`^${prefix}_[A-Za-z0-9]+$`, "u").test(text)) fail("ID_INVALID", `${label}:${text || "missing"}`);
  return text;
}
function origin(value, label) {
  let url;
  try { url = new URL(String(value ?? "")); } catch { fail("URL_INVALID", label); }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") fail("URL_UNSAFE", label);
  return url.origin;
}
function requirePass(record, keys, prefix) {
  for (const key of keys) if (record?.[key] !== "PASS") fail(`${prefix}_${key}`, record?.[key]);
}

if (version !== "0.1.20" || report.productVersion !== version) fail("VERSION_DRIFT", `${version}/${report.productVersion}`);
if (report.schemaVersion !== 2) fail("REPORT_SCHEMA", report.schemaVersion);
if (report.state !== "PASS_RELEASE_EVIDENCE_CANDIDATE") fail("REPORT_STATE", report.state);
if (!/^[a-f0-9]{40}$/u.test(String(report.sourceSha ?? ""))) fail("SOURCE_SHA", report.sourceSha);
if (!Number.isSafeInteger(Number(report.workflowRunId)) || Number(report.workflowRunId) <= 0) fail("WORKFLOW_RUN_ID", report.workflowRunId);
if (!Number.isFinite(Date.parse(String(report.capturedAt ?? "")))) fail("CAPTURED_AT", report.capturedAt);

requirePass(report.deploymentContract, ["publicStateSanitization", "crossSiteLinks"], "DEPLOYMENT_CONTRACT");
requirePass(report.canary, [
  "desktopSnapshot",
  "publicStateSanitization",
  "setEnabledAck",
  "runAck",
  "cancelAck",
  "commandIdempotency",
  "commandSequence",
  "crossSiteLinks",
  "runtimeErrorScan"
], "CANARY");
if (report.proof?.cloudCommandIdempotencyFaultInjection !== "PASS") fail("IDEMPOTENCY_STATIC_PROOF", report.proof?.cloudCommandIdempotencyFaultInjection);
if (Number(report.proof?.runtimeErrorClusters) !== 0) fail("RUNTIME_ERROR_CLUSTERS", report.proof?.runtimeErrorClusters);
if (report.proof?.canaryStepOutcome !== "success" || report.proof?.runtimeStepOutcome !== "success") fail("STEP_OUTCOME", `${report.proof?.canaryStepOutcome}/${report.proof?.runtimeStepOutcome}`);

const devapiProjectId = requireId(report.vercel?.devapi?.projectId, "prj", "devapi-project");
const devapiDeploymentId = requireId(report.vercel?.devapi?.deploymentId, "dpl", "devapi-deployment");
const devapiRollbackId = requireId(report.vercel?.devapi?.rollbackCandidateId, "dpl", "devapi-rollback");
const devboxProjectId = requireId(report.vercel?.devbox?.projectId, "prj", "devbox-project");
const devboxDeploymentId = requireId(report.vercel?.devbox?.deploymentId, "dpl", "devbox-deployment");
const devboxRollbackId = requireId(report.vercel?.devbox?.rollbackCandidateId, "dpl", "devbox-rollback");
if (devapiDeploymentId === devapiRollbackId || devboxDeploymentId === devboxRollbackId) fail("ROLLBACK_EQUALS_LIVE");

const devapiCanonicalUrl = origin(report.vercel?.devapi?.canonicalUrl, "devapi-canonical");
const devboxCanonicalUrl = origin(report.vercel?.devbox?.productUrl, "devbox-product");
origin(report.vercel?.devapi?.deploymentUrl, "devapi-deployment-url");
origin(report.vercel?.devbox?.deploymentUrl, "devbox-deployment-url");
if (Number(report.vercel?.devapi?.rootHttpStatus) !== 200 || Number(report.vercel?.devapi?.healthHttpStatus) !== 200 || Number(report.vercel?.devapi?.publicStateHttpStatus) !== 200) {
  fail("DEVAPI_HTTP_PROOF", `${report.vercel?.devapi?.rootHttpStatus}/${report.vercel?.devapi?.healthHttpStatus}/${report.vercel?.devapi?.publicStateHttpStatus}`);
}
if (Number(report.vercel?.devbox?.rootHttpStatus) !== 200) fail("DEVBOX_ROOT_HTTP_PROOF", report.vercel?.devbox?.rootHttpStatus);

const neon = currentEvidence.neon ?? {};
if (neon.schemaReadBack !== "PASS") fail("NEON_SCHEMA_READBACK", neon.schemaReadBack);
const canonicalTables = new Set(Array.isArray(neon.schemaTables) ? neon.schemaTables : []);
for (const table of ["devbox_project_state", "devbox_project_state_history", "devbox_control_commands"]) {
  if (!canonicalTables.has(table)) fail("NEON_CANONICAL_TABLE", table);
}

const requestedDevboxUrl = currentLinks.devbox?.requestedCanonicalUrl ?? currentEvidence.vercel?.devbox?.requestedCanonicalUrl ?? null;
const evidence = {
  schemaVersion: 2,
  productVersion: version,
  capturedAt: report.capturedAt,
  source: {
    repository: "ertucaymaz-afk/DevBox",
    branch: "codex/v0.1.20-vercel-production-modernization",
    verifiedCommit: report.sourceSha,
    status: "PASS"
  },
  vercel: {
    teamId: report.vercel.teamId ?? currentEvidence.vercel?.teamId ?? null,
    teamSlug: currentEvidence.vercel?.teamSlug ?? null,
    devapi: {
      projectId: devapiProjectId,
      canonicalUrl: devapiCanonicalUrl,
      latestDeploymentId: devapiDeploymentId,
      rollbackCandidateId: devapiRollbackId,
      observedVersion: version,
      expectedVersion: version,
      rootHttpStatus: 200,
      healthHttpStatus: 200,
      publicStateHttpStatus: 200,
      runtimeErrorClustersDeployment: 0,
      state: "PASS"
    },
    devbox: {
      projectId: devboxProjectId,
      requestedCanonicalUrl: requestedDevboxUrl,
      canonicalUrl: devboxCanonicalUrl,
      latestDeploymentId: devboxDeploymentId,
      rollbackCandidateId: devboxRollbackId,
      rootHttpStatus: 200,
      state: "PASS"
    }
  },
  neon: {
    ...neon,
    state: "PASS"
  },
  promotion: {
    workflow: ".github/workflows/v020-production-promote.yml",
    lastObservedRunId: Number(report.workflowRunId),
    sourceSha: report.sourceSha,
    devapiProjectId,
    devboxProjectId,
    devapiDeploymentId,
    devboxDeploymentId,
    devapiCanonicalUrl,
    devboxProductUrl: devboxCanonicalUrl,
    crossSiteLinks: "PASS",
    publicStateSanitization: "PASS",
    state: "PASS",
    missingGitHubSecrets: []
  },
  canary: {
    desktopSnapshot: "PASS",
    publicStateSanitization: "PASS",
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

const links = {
  schemaVersion: 1,
  productVersion: version,
  github: currentLinks.github ?? "https://github.com/ertucaymaz-afk/DevBox",
  devapi: { canonicalUrl: devapiCanonicalUrl, state: "PASS" },
  devbox: { requestedCanonicalUrl: requestedDevboxUrl, canonicalUrl: devboxCanonicalUrl, state: "PASS" }
};

await writeFile(EVIDENCE_PATH, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
await writeFile(LINKS_PATH, `${JSON.stringify(links, null, 2)}\n`, "utf8");
console.log(`V020_EVIDENCE_FINALIZE_PASS version=${version} source=${report.sourceSha} devapi=${devapiDeploymentId} devbox=${devboxDeploymentId} canary=pass runtime=pass secrets=0`);
