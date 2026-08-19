import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { taskBudget } from "../cloud/devapi-control/agent/orchestrator.mjs";
import { reviewerConfiguration } from "../cloud/devapi-control/agent/reviewer.mjs";

function assert(condition, code) { if (!condition) throw new Error(code); }
function readJson(file) { return readFile(file, "utf8").then(JSON.parse); }

const pkg = await readJson("cloud/devapi-control/package.json");
const manifest = await readJson("cloud/devapi-control/agent/dependency-manifest.json");
assert(pkg.dependencies?.["@openai/agents"] === "0.14.3", "DEVAPI_V3_AGENTS_EXACT_PIN");
assert(pkg.dependencies?.zod === "4.4.3", "DEVAPI_V3_ZOD_EXACT_PIN");
assert(manifest.runtime.version === "0.14.3", "DEVAPI_V3_MANIFEST_AGENT_VERSION");
assert(manifest.schemaRuntime.version === "4.4.3", "DEVAPI_V3_MANIFEST_ZOD_VERSION");
assert(manifest.truth.supplyChainVerified === true && manifest.truth.lockCommitted === true, "DEVAPI_V3_SUPPLY_CHAIN_MANIFEST_TRUTH");

const runtimeSource = await readFile("cloud/devapi-control/agent/runtime.mjs", "utf8");
assert(runtimeSource.includes('const DEFAULT_MODEL = "gpt-5.6"'), "DEVAPI_V3_PLANNER_MODEL_DEFAULT");
const reviewerSource = await readFile("cloud/devapi-control/agent/reviewer.mjs", "utf8");
for (const token of ["DevAPI Independent Reviewer","outputType: ReviewSchema","REQUEST_CHANGES","REJECT","riskDelta","hidden chain-of-thought"]) assert(reviewerSource.includes(token), `DEVAPI_V3_REVIEWER_CONTRACT:${token}`);
const reviewerConfig = await reviewerConfiguration();
assert(reviewerConfig.role === "independent-reviewer" && reviewerConfig.sourceState === "SOURCE_READY", "DEVAPI_V3_REVIEWER_SOURCE_STATE");
assert(reviewerConfig.runtimeState !== "RUNTIME_VERIFIED", "DEVAPI_V3_REVIEWER_FAKE_STATIC_RUNTIME");

const budget = taskBudget();
assert(budget.maxTurns === 6 && budget.maxChangedFiles === 12 && budget.maxPatchBytes === 131072, "DEVAPI_V3_BUDGET_DEFAULTS");
let budgetDenied = false;
try { taskBudget({ maxTurns: 1000 }); } catch { budgetDenied = true; }
assert(budgetDenied, "DEVAPI_V3_UNBOUNDED_BUDGET_ALLOWED");

const approvalSource = await readFile("cloud/devapi-control/lib/approval-store.mjs", "utf8");
for (const token of ["APPROVAL_REPLAY_DENIED","APPROVAL_TASK_MISMATCH","APPROVAL_EXPIRED","scope","expires_at"]) assert(approvalSource.includes(token), `DEVAPI_V3_APPROVAL_POLICY:${token}`);
const migrationSource = await readFile("cloud/devapi-control/lib/migration-ledger.mjs", "utf8");
for (const token of ["devapi_schema_migrations","checksum","source_sha","MIGRATION_CHECKSUM_DRIFT"]) assert(migrationSource.includes(token), `DEVAPI_V3_MIGRATION_LEDGER:${token}`);
const orchestratorSource = await readFile("cloud/devapi-control/agent/orchestrator.mjs", "utf8");
for (const token of ["CREATED","TRIAGED","PLANNING","BLOCKED_EXTERNAL","WAITING_APPROVAL","WORKSPACE_PROVISIONING"]) assert(orchestratorSource.includes(token), `DEVAPI_V3_ORCHESTRATOR:${token}`);

const sites = await readJson("cloud/devapi-sites/sites.manifest.json");
assert(sites.projects?.length === 5, "DEVAPI_V3_SITE_COUNT");
assert(sites.deploymentState === "NOT_RUN" && sites.canonicalDomainsVerified === false, "DEVAPI_V3_SITES_OVERCLAIM");

const apiRoot = path.resolve("cloud/devapi-control/api/v1");
const sourceRoutes = (await readdir(apiRoot)).filter((x) => x.endsWith(".mjs")).map((x) => `/api/v1/${x.replace(/\.mjs$/u, "")}`).sort();
const openapi = await readJson("cloud/devapi-control/contracts/openapi.v1.json");
const contractRoutes = Object.keys(openapi.paths).sort();
assert(JSON.stringify(sourceRoutes) === JSON.stringify(contractRoutes), `DEVAPI_V3_ROUTE_CONTRACT_DRIFT:${sourceRoutes.length}:${contractRoutes.length}`);
assert(sourceRoutes.includes("/api/v1/agent-approvals"), "DEVAPI_V3_APPROVAL_ROUTE_MISSING");
assert(sourceRoutes.includes("/api/v1/agent-orchestrator"), "DEVAPI_V3_ORCHESTRATOR_ROUTE_MISSING");
assert(openapi.components?.schemas?.ErrorEnvelopeV2, "DEVAPI_V3_ERROR_ENVELOPE_MISSING");

const provider = await readJson("outputs/devapi-provider-smoke.json");
assert(["RUNTIME_VERIFIED","BLOCKED_EXTERNAL"].includes(provider.state), "DEVAPI_V3_PROVIDER_STATE_INVALID");
assert(provider.secretValue === null, "DEVAPI_V3_PROVIDER_SECRET_EXPOSED");
if (provider.state === "RUNTIME_VERIFIED") {
  assert(provider.runtimeVerified === true && provider.responseId, "DEVAPI_V3_PROVIDER_EVIDENCE_INCOMPLETE");
  assert(provider.model === "gpt-5.6" || typeof provider.model === "string", "DEVAPI_V3_PROVIDER_MODEL_MISSING");
} else {
  assert(provider.runtimeVerified === false && provider.blocker, "DEVAPI_V3_PROVIDER_BLOCKER_INCOMPLETE");
}

const reviewer = await readJson("outputs/devapi-reviewer-smoke.json");
assert(["RUNTIME_VERIFIED","BLOCKED_EXTERNAL"].includes(reviewer.state), "DEVAPI_V3_REVIEWER_STATE_INVALID");
assert(reviewer.secretValue === null, "DEVAPI_V3_REVIEWER_SECRET_EXPOSED");
if (reviewer.state === "RUNTIME_VERIFIED") {
  assert(reviewer.runtimeVerified === true && reviewer.responseId && reviewer.decision, "DEVAPI_V3_REVIEWER_EVIDENCE_INCOMPLETE");
} else {
  assert(reviewer.runtimeVerified === false && reviewer.blocker, "DEVAPI_V3_REVIEWER_BLOCKER_INCOMPLETE");
}

const db = await readJson("outputs/devapi-db-runtime-smoke.json");
assert(["RUNTIME_VERIFIED","BLOCKED_EXTERNAL"].includes(db.state), "DEVAPI_V3_DB_STATE_INVALID");
assert(db.secretValue === null, "DEVAPI_V3_DB_SECRET_EXPOSED");
if (db.state === "RUNTIME_VERIFIED") {
  assert(db.runtimeVerified === true && db.transactionRollbackVerified === true && db.cleanupVerified === true, "DEVAPI_V3_DB_RUNTIME_INCOMPLETE");
} else {
  assert(db.runtimeVerified === false && db.blocker, "DEVAPI_V3_DB_BLOCKER_INCOMPLETE");
}

const supply = await readJson("outputs/devapi-agents-supply-chain.json");
assert(supply.state === "SUPPLY_CHAIN_VERIFIED", "DEVAPI_V3_SUPPLY_CHAIN_NOT_VERIFIED");
assert(supply.direct?.agents?.version === "0.14.3" && supply.direct?.zod?.version === "4.4.3", "DEVAPI_V3_SUPPLY_CHAIN_VERSION_DRIFT");
assert(supply.audit.high === 0 && supply.audit.critical === 0, "DEVAPI_V3_SUPPLY_CHAIN_AUDIT_BLOCKER");

console.log(`DEVAPI_AUTONOMOUS_V3_VERIFY_PASS routes=${sourceRoutes.length} sites=5 supplyChain=verified plannerModel=gpt-5.6 provider=${provider.state.toLowerCase()} reviewer=${reviewer.state.toLowerCase()} db=${db.state.toLowerCase()} approvals=source-ready orchestrator=source-ready errorEnvelope=v2`);
