import { readFile } from "node:fs/promises";

const [pkgRaw, evidenceRaw, linksRaw] = await Promise.all([
  readFile("package.json", "utf8"),
  readFile("cloud/production-evidence.json", "utf8"),
  readFile("cloud/product-links.json", "utf8")
]);
const pkg = JSON.parse(pkgRaw);
const evidence = JSON.parse(evidenceRaw);
const links = JSON.parse(linksRaw);
const fail = (id, detail = "") => { throw new Error(`DEVBOX_PRODUCTION_V13_FAIL:${id}:${detail}`); };
const requireId = (value, prefix, id) => {
  const text = String(value ?? "");
  if (!new RegExp(`^${prefix}_[A-Za-z0-9]+$`, "u").test(text)) fail(id, text || "missing");
  return text;
};
const origin = (value, id) => {
  let url;
  try { url = new URL(String(value ?? "")); } catch { fail(id, "invalid-url"); }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") fail(id, "unsafe-url");
  return url.origin;
};

if (evidence.productVersion !== pkg.version) fail("version", `${evidence.productVersion}!=${pkg.version}`);
if (links.productVersion !== pkg.version) fail("links-version", `${links.productVersion}!=${pkg.version}`);
if (evidence.release?.productionEvidence !== "PASS") fail("production-evidence", evidence.release?.productionEvidence);
if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/u.test(String(evidence.capturedAt ?? ""))) fail("captured-at", evidence.capturedAt);

const source = evidence.source ?? {};
if (source.status !== "PASS") fail("source-state", source.status);
if (source.repository !== "ertucaymaz-afk/DevBox") fail("source-repository", source.repository);
if (source.branch !== "codex/v0.1.20-vercel-production-modernization") fail("source-branch", source.branch);
if (!/^[a-f0-9]{40}$/u.test(String(source.verifiedCommit ?? ""))) fail("source-sha", source.verifiedCommit);

const promotion = evidence.promotion ?? {};
if (promotion.state !== "PASS") fail("promotion-state", promotion.state);
if (Array.isArray(promotion.missingGitHubSecrets) && promotion.missingGitHubSecrets.length > 0) fail("promotion-missing-secrets", promotion.missingGitHubSecrets.join(","));
if (promotion.sourceSha !== source.verifiedCommit) fail("promotion-source-drift", `${promotion.sourceSha}!=${source.verifiedCommit}`);
if (promotion.crossSiteLinks !== "PASS") fail("promotion-cross-links", promotion.crossSiteLinks);
if (promotion.publicStateSanitization !== "PASS") fail("promotion-public-state", promotion.publicStateSanitization);

const devapi = evidence.vercel?.devapi ?? {};
const devbox = evidence.vercel?.devbox ?? {};
const devapiProjectId = requireId(devapi.projectId, "prj", "devapi-project-id");
const devboxProjectId = requireId(devbox.projectId, "prj", "devbox-project-id");
const devapiDeploymentId = requireId(devapi.latestDeploymentId, "dpl", "devapi-deployment-id");
const devboxDeploymentId = requireId(devbox.latestDeploymentId, "dpl", "devbox-deployment-id");
const devapiRollbackId = requireId(devapi.rollbackCandidateId, "dpl", "devapi-rollback-id");
const devboxRollbackId = requireId(devbox.rollbackCandidateId, "dpl", "devbox-rollback-id");
if (devapiRollbackId === devapiDeploymentId) fail("devapi-rollback-same-as-live");
if (devboxRollbackId === devboxDeploymentId) fail("devbox-rollback-same-as-live");

if (devapi.state !== "PASS" || devapi.rootHttpStatus !== 200 || devapi.healthHttpStatus !== 200 || devapi.publicStateHttpStatus !== 200) {
  fail("devapi-production", `${devapi.state}:${devapi.rootHttpStatus}/${devapi.healthHttpStatus}/${devapi.publicStateHttpStatus}`);
}
if (devapi.observedVersion !== pkg.version || devapi.expectedVersion !== pkg.version) fail("devapi-version", `${devapi.observedVersion}/${devapi.expectedVersion}`);
if (devbox.state !== "PASS" || devbox.rootHttpStatus !== 200) fail("devbox-production", `${devbox.state}:${devbox.rootHttpStatus}`);

const devapiOrigin = origin(devapi.canonicalUrl, "devapi-canonical-url");
const devboxOrigin = origin(devbox.canonicalUrl, "devbox-canonical-url");
if (origin(links.devapi?.canonicalUrl, "links-devapi-url") !== devapiOrigin) fail("canonical-link-drift", "devapi");
if (origin(links.devbox?.canonicalUrl, "links-devbox-url") !== devboxOrigin) fail("canonical-link-drift", "devbox");
if (links.devapi?.state !== "PASS" || links.devbox?.state !== "PASS") fail("product-link-state", `${links.devapi?.state}/${links.devbox?.state}`);

if (promotion.devapiProjectId !== devapiProjectId) fail("promotion-devapi-project-drift", `${promotion.devapiProjectId}!=${devapiProjectId}`);
if (promotion.devboxProjectId !== devboxProjectId) fail("promotion-devbox-project-drift", `${promotion.devboxProjectId}!=${devboxProjectId}`);
if (promotion.devapiDeploymentId !== devapiDeploymentId) fail("promotion-devapi-deployment-drift", `${promotion.devapiDeploymentId}!=${devapiDeploymentId}`);
if (promotion.devboxDeploymentId !== devboxDeploymentId) fail("promotion-devbox-deployment-drift", `${promotion.devboxDeploymentId}!=${devboxDeploymentId}`);
if (origin(promotion.devapiCanonicalUrl, "promotion-devapi-url") !== devapiOrigin) fail("promotion-devapi-url-drift");
if (origin(promotion.devboxProductUrl, "promotion-devbox-url") !== devboxOrigin) fail("promotion-devbox-url-drift");

const neon = evidence.neon ?? {};
if (neon.schemaReadBack !== "PASS") fail("neon-schema-readback", neon.schemaReadBack);
const tables = new Set(Array.isArray(neon.schemaTables) ? neon.schemaTables : []);
for (const table of ["devbox_project_state", "devbox_project_state_history", "devbox_control_commands"]) {
  if (!tables.has(table)) fail("neon-canonical-table", table);
}

const canary = evidence.canary ?? {};
for (const key of [
  "desktopSnapshot",
  "publicStateSanitization",
  "setEnabledAck",
  "runAck",
  "cancelAck",
  "commandIdempotency",
  "commandSequence",
  "crossSiteLinks",
  "runtimeErrorScan"
]) {
  if (canary[key] !== "PASS") fail(`canary-${key}`, canary[key]);
}
if (canary.crossSiteLinks !== promotion.crossSiteLinks) fail("cross-link-evidence-drift");
if (canary.publicStateSanitization !== promotion.publicStateSanitization) fail("public-state-evidence-drift");

console.log(`DEVBOX_PRODUCTION_V13_PASS version=${pkg.version} source=${source.verifiedCommit} devapi=${devapiDeploymentId} devbox=${devboxDeploymentId} crossLinks=pass canary=pass`);
