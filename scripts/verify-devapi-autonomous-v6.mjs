import { readFile } from "node:fs/promises";

function assert(condition, code) { if (!condition) throw new Error(code); }
const readJson = (file) => readFile(file, "utf8").then(JSON.parse);

const [coder, provider, reviewer, db, vercel, sites, provenance] = await Promise.all([
  readJson("outputs/devapi-coder-smoke.json"),
  readJson("outputs/devapi-provider-smoke.json"),
  readJson("outputs/devapi-reviewer-smoke.json"),
  readJson("outputs/devapi-db-runtime-smoke.json"),
  readJson("outputs/devapi-vercel-credential-state.json"),
  readJson("cloud/devapi-sites/sites.manifest.json"),
  readJson("cloud/devapi-sites/main/ui-provenance.json")
]);
const [taskState, agentStore, mainHtml] = await Promise.all([
  readFile("cloud/devapi-control/agent/task-state.mjs", "utf8"),
  readFile("cloud/devapi-control/lib/agent-store.mjs", "utf8"),
  readFile("cloud/devapi-sites/main/index.html", "utf8")
]);

assert(coder.state === "RUNTIME_VERIFIED" && coder.runtimeScope === "bounded-worker-coding-executor", "DEVAPI_V6_CODER_RUNTIME");
assert(coder.modelRuntimeVerified === false, "DEVAPI_V6_CODER_MODEL_OVERCLAIM");
assert(coder.changedFiles === 1 && coder.tests === 1 && coder.scopeDenied === true, "DEVAPI_V6_CODER_SMOKE");

for (const [name, evidence] of [["provider", provider], ["reviewer", reviewer], ["db", db]]) {
  assert(["RUNTIME_VERIFIED", "BLOCKED_EXTERNAL"].includes(evidence.state), `DEVAPI_V6_${name.toUpperCase()}_STATE`);
  if (evidence.state === "BLOCKED_EXTERNAL") assert(evidence.runtimeVerified === false, `DEVAPI_V6_${name.toUpperCase()}_OVERCLAIM`);
}
assert(["SOURCE_READY_FOR_DEPLOY_ATTEMPT", "BLOCKED_EXTERNAL", "RUNTIME_VERIFIED", "PRODUCTION_VERIFIED"].includes(vercel.state), "DEVAPI_V6_VERCEL_STATE");
if (vercel.state !== "PRODUCTION_VERIFIED") assert(vercel.productionVerified === false, "DEVAPI_V6_VERCEL_PRODUCTION_OVERCLAIM");

for (const state of ["PRODUCTION_PROMOTING", "PRODUCTION_VERIFIED", "OBSERVING", "KNOWN_GOOD"]) assert(taskState.includes(`\"${state}\"`), `DEVAPI_V6_TASK_STATE:${state}`);
for (const type of ["PLAN", "APPROVAL", "WORKSPACE", "LEASE", "PATCH", "TEST", "REVIEW", "SECURITY", "PREVIEW", "CANARY", "PRODUCTION", "ROLLBACK"]) assert(agentStore.includes(type), `DEVAPI_V6_EVIDENCE_TYPE:${type}`);

assert(sites.schemaVersion === 2 && sites.projects.length === 5, "DEVAPI_V6_SITE_MANIFEST");
assert(sites.domainPolicy?.requiredSuffix === ".vercel.app" && sites.domainPolicy?.customComDomains === false, "DEVAPI_V6_SITE_DOMAIN_POLICY");
assert(sites.canonicalDomainsVerified === false && sites.deploymentState === "NOT_RUN", "DEVAPI_V6_SITE_RELEASE_TRUTH");

assert(provenance.nativeRuntime?.runtimeDependencyCount === 0, "DEVAPI_V6_MAIN_RUNTIME_DEPENDENCY");
assert(provenance.items?.find((item) => item.name === "Lucide")?.state === "INTEGRATED_LOCAL_CURATED_SVG", "DEVAPI_V6_MAIN_LUCIDE");
assert(mainHtml.includes("DevAPI henüz “her işlemde kendi modelini eğiten” bir sistem değil"), "DEVAPI_V6_MAIN_LEARNING_TRUTH");
assert(mainHtml.includes("SOURCE_READY · PRODUCTION NOT_RUN"), "DEVAPI_V6_MAIN_PRODUCTION_TRUTH");
assert(mainHtml.includes("13 routes / 21 operations"), "DEVAPI_V6_MAIN_CONTRACT_BASELINE");

const state = (value) => String(value.state).toLowerCase();
console.log(`DEVAPI_AUTONOMOUS_V6_VERIFY_PASS mainSite=source-verified-ui coderRuntime=verified-bounded modelRuntime=not-verified planner=${state(provider)} reviewer=${state(reviewer)} db=${state(db)} vercel=${state(vercel)} sites=5 suffix=.vercel.app canonical=false learningTruth=fail-closed`);
