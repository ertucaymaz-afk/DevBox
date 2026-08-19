import { readFile } from "node:fs/promises";

function assert(condition, code) { if (!condition) throw new Error(code); }

const coderSource = await readFile("cloud/devapi-control/agent/coder.mjs", "utf8");
const coderEvidence = JSON.parse(await readFile("outputs/devapi-coder-smoke.json", "utf8"));
const sites = JSON.parse(await readFile("cloud/devapi-sites/sites.manifest.json", "utf8"));
const statusHtml = await readFile("cloud/devapi-sites/status/index.html", "utf8");

assert(coderSource.includes("WORKSPACE_EXPECTED_SHA_MISMATCH") || coderSource.includes("expectedBeforeSha256"), "DEVAPI_V5_CODER_EXPECTED_SHA");
assert(coderSource.includes("CODER_PATH_DENIED") && coderSource.includes("CODER_PATH_OUT_OF_SCOPE"), "DEVAPI_V5_CODER_SCOPE_POLICY");
assert(coderSource.includes("CODER_BUDGET_CHANGED_FILES_EXCEEDED") && coderSource.includes("CODER_BUDGET_PATCH_BYTES_EXCEEDED"), "DEVAPI_V5_CODER_BUDGET");
assert(coderEvidence.state === "RUNTIME_VERIFIED", "DEVAPI_V5_CODER_RUNTIME");
assert(coderEvidence.runtimeScope === "bounded-worker-coding-executor", "DEVAPI_V5_CODER_SCOPE");
assert(coderEvidence.modelRuntimeVerified === false, "DEVAPI_V5_MODEL_TRUTH");
assert(coderEvidence.changedFiles === 1 && coderEvidence.tests === 1 && coderEvidence.scopeDenied === true, "DEVAPI_V5_CODER_SMOKE_CONTRACT");
assert(/^[0-9a-f]{64}$/u.test(coderEvidence.patchDigest), "DEVAPI_V5_PATCH_DIGEST");

assert(sites.schemaVersion === 2, "DEVAPI_V5_SITE_MANIFEST_SCHEMA");
assert(sites.domainPolicy?.requiredSuffix === ".vercel.app", "DEVAPI_V5_SITE_SUFFIX_POLICY");
assert(sites.domainPolicy?.customComDomains === false, "DEVAPI_V5_SITE_CUSTOM_DOMAIN");
assert(Array.isArray(sites.projects) && sites.projects.length === 5, "DEVAPI_V5_SITE_COUNT");
const hosts = new Set(sites.projects.map((project) => project.hostCandidate));
assert(hosts.size === 5, "DEVAPI_V5_SITE_HOST_UNIQUE");
for (const project of sites.projects) {
  assert(project.hostCandidate === `${project.slugCandidate}.vercel.app`, `DEVAPI_V5_SITE_HOST:${project.id}`);
  assert(project.hostCandidate.endsWith(".vercel.app"), `DEVAPI_V5_SITE_SUFFIX:${project.id}`);
  assert(project.hostCandidate !== "devapi.vercel.app", `DEVAPI_V5_SITE_COLLISION:${project.id}`);
}
assert(statusHtml.includes("13 route / 21 operation baseline"), "DEVAPI_V5_STATUS_CONTRACT_DRIFT");

console.log(`DEVAPI_AUTONOMOUS_V5_VERIFY_PASS coderRuntime=verified-bounded modelRuntime=not-verified changedFiles=${coderEvidence.changedFiles} sites=${sites.projects.length} suffix=.vercel.app canonical=${sites.canonicalDomainsVerified}`);
