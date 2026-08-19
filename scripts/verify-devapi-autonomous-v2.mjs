import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { agentRuntimeConfiguration } from "../cloud/devapi-control/agent/runtime.mjs";
import { assertTaskTransition, normalizeTaskInput, TASK_STATES } from "../cloud/devapi-control/agent/task-state.mjs";
import { listToolCapabilities } from "../cloud/devapi-control/agent/tool-registry.mjs";

function assert(condition, code) { if (!condition) throw new Error(code); }

const manifest = JSON.parse(await readFile("cloud/devapi-control/agent/dependency-manifest.json", "utf8"));
assert(manifest.runtime.name === "@openai/agents", "DEVAPI_AGENTS_PACKAGE_NAME");
assert(manifest.runtime.version === "0.14.3", "DEVAPI_AGENTS_VERSION_PIN_REVIEW");
assert(manifest.runtime.tag === "v0.14.3", "DEVAPI_AGENTS_TAG_PIN_REVIEW");
assert(manifest.runtime.releaseCommit === "94a3edc3e5318fdbc4ceb045df4dad934ca4ab2b", "DEVAPI_AGENTS_RELEASE_SHA");
assert(manifest.runtime.license === "MIT", "DEVAPI_AGENTS_LICENSE");
assert(manifest.runtime.transitiveLockState === "NOT_LOCKED", "DEVAPI_AGENTS_LOCK_TRUTH");
assert(manifest.truth.supplyChainVerified === false && manifest.truth.runtimeVerified === false, "DEVAPI_AGENTS_NO_FAKE_VERIFICATION");
assert(manifest.schemaRuntime.version === "4.4.3", "DEVAPI_ZOD_VERSION_REVIEW");
assert(manifest.schemaRuntime.releaseCommit === "1fb56a5c18c27102dbc92260a4007c7732a0ccca", "DEVAPI_ZOD_RELEASE_SHA");

const packageJson = JSON.parse(await readFile("cloud/devapi-control/package.json", "utf8"));
assert(!packageJson.dependencies?.["@openai/agents"], "DEVAPI_AGENTS_NOT_LOCKED_BUT_INSTALLED");

assert(TASK_STATES.includes("CREATED") && TASK_STATES.includes("SOURCE_VERIFIED") && TASK_STATES.includes("ROLLED_BACK"), "DEVAPI_TASK_STATES_INCOMPLETE");
assertTaskTransition("CREATED", "TRIAGED");
assertTaskTransition("TRIAGED", "PLANNING");
assertTaskTransition("PLANNING", "WORKSPACE_PROVISIONING");
assertTaskTransition("IMPLEMENTING", "VERIFYING");
assertTaskTransition("VERIFYING", "SOURCE_VERIFIED");
let denied = false;
try { assertTaskTransition("CREATED", "PRODUCTION_VERIFIED"); } catch { denied = true; }
assert(denied, "DEVAPI_TASK_INVALID_TRANSITION_ALLOWED");
const normalized = normalizeTaskInput({
  title: "Worker smoke task",
  request: "Analyze and patch a safe documentation fixture",
  sourceRepo: "ertucaymaz-afk/DevBox",
  sourceRef: "codex/devapi-autonomous-evolution-v1",
  sourceSha: "2c017f5535abb886136f4bec1ab90757e5b87428"
});
assert(normalized.sourceRepo === "ertucaymaz-afk/DevBox", "DEVAPI_TASK_NORMALIZATION");

const storeSource = await readFile("cloud/devapi-control/lib/agent-store.mjs", "utf8");
for (const table of ["agent_tasks","agent_task_events","agent_sessions","agent_tool_calls","agent_approvals","agent_workspaces","agent_artifacts","agent_evidence"]) {
  assert(storeSource.includes(`CREATE TABLE IF NOT EXISTS ${table}`), `DEVAPI_AGENT_TABLE_MISSING:${table}`);
}
assert(storeSource.includes("agent_task_events"), "DEVAPI_APPEND_ONLY_EVENT_LEDGER_MISSING");

const tools = listToolCapabilities();
assert(tools.length >= 11, "DEVAPI_TOOL_REGISTRY_V2_TOO_SMALL");
assert(tools.filter((tool) => tool.state === "RUNTIME_VERIFIED").length === 0, "DEVAPI_STATIC_REGISTRY_FAKE_RUNTIME");
for (const id of ["agent.runtime", "workspace.create", "shell.exec", "fs.patch", "git.worktree.create", "browser.inspect"]) {
  assert(tools.some((tool) => tool.toolId === id && tool.state === "SOURCE_READY"), `DEVAPI_TOOL_SOURCE_NOT_READY:${id}`);
}

const runtime = await agentRuntimeConfiguration();
assert(runtime.provider === "openai-agents-sdk" && runtime.sourceState === "SOURCE_READY", "DEVAPI_AGENT_RUNTIME_SOURCE");
assert(runtime.runtimeState !== "RUNTIME_VERIFIED", "DEVAPI_AGENT_RUNTIME_FAKE_VERIFIED");

const smoke = JSON.parse(await readFile("outputs/devapi-worker-smoke.json", "utf8"));
assert(smoke.workerRuntimeVerified === true, "DEVAPI_WORKER_RUNTIME_NOT_VERIFIED");
assert(smoke.runtimeAgentVerified === false, "DEVAPI_WORKER_MUST_NOT_VERIFY_MODEL_AGENT");
assert(smoke.approval.missingApprovalBlocked === true, "DEVAPI_WORKER_APPROVAL_NOT_ENFORCED");
assert(smoke.patch.approvalId === smoke.approval.approvalId && smoke.command.approvalId === smoke.approval.approvalId, "DEVAPI_WORKER_APPROVAL_EVIDENCE_MISMATCH");
assert(smoke.patch.beforeSha256 !== smoke.patch.afterSha256, "DEVAPI_WORKER_PATCH_NO_CHANGE");
assert(smoke.command.exitCode === 0 && smoke.command.timedOut === false, "DEVAPI_WORKER_SHELL_FAILED");
assert(smoke.containment.pathEscapeBlocked && smoke.containment.unapprovedExecutableBlocked && smoke.containment.gitPushBlocked, "DEVAPI_WORKER_CONTAINMENT_FAILED");

const worktree = JSON.parse(await readFile("outputs/devapi-worktree-smoke.json", "utf8"));
assert(worktree.worktreeRuntimeVerified === true, "DEVAPI_WORKTREE_RUNTIME_NOT_VERIFIED");
assert(worktree.modelRuntimeVerified === false, "DEVAPI_WORKTREE_MUST_NOT_VERIFY_MODEL_AGENT");
assert(worktree.approval.missingApprovalBlocked === true, "DEVAPI_WORKTREE_APPROVAL_NOT_ENFORCED");
assert(worktree.diff.approvalId === worktree.approval.approvalId, "DEVAPI_WORKTREE_APPROVAL_EVIDENCE_MISMATCH");
assert(worktree.singleWriter.conflictQueued === true, "DEVAPI_SINGLE_WRITER_CONFLICT_QUEUE_FAILED");
assert(worktree.patch.beforeSha256 !== worktree.patch.afterSha256, "DEVAPI_WORKTREE_PATCH_NO_CHANGE");
assert(worktree.diff.bytes > 0 && /^[0-9a-f]{64}$/u.test(worktree.diff.sha256), "DEVAPI_WORKTREE_DIFF_EVIDENCE_INVALID");
assert(/^devapi\/evolution\/[0-9a-f]{8}-/u.test(worktree.branch), "DEVAPI_WORKTREE_BRANCH_INVALID");

const browser = JSON.parse(await readFile("outputs/devapi-browser-smoke.json", "utf8"));
assert(browser.state === "RUNTIME_VERIFIED", "DEVAPI_BROWSER_RUNTIME_NOT_VERIFIED");
assert(browser.runtime === "system-chrome-headless", "DEVAPI_BROWSER_RUNTIME_INVALID");
assert(browser.dom.bytes > 0 && /^[0-9a-f]{64}$/u.test(browser.dom.sha256), "DEVAPI_BROWSER_DOM_EVIDENCE_INVALID");
assert(browser.screenshot.bytes > 100 && /^[0-9a-f]{64}$/u.test(browser.screenshot.sha256), "DEVAPI_BROWSER_SCREENSHOT_EVIDENCE_INVALID");
assert(browser.security.privateNetworkDeniedWithoutExplicitLoopback === true && browser.security.browserActions === "READ_ONLY", "DEVAPI_BROWSER_SECURITY_EVIDENCE_INVALID");
assert(browser.truth.doesNotApplyTo.includes("browser.click") && browser.truth.doesNotApplyTo.includes("openai-agent-runtime"), "DEVAPI_BROWSER_SCOPE_OVERCLAIM");

const apiRoot = path.resolve("cloud/devapi-control/api/v1");
const sourceRoutes = (await readdir(apiRoot)).filter((name) => name.endsWith(".mjs")).map((name) => `/api/v1/${name.replace(/\.mjs$/u, "")}`).sort();
const openapi = JSON.parse(await readFile("cloud/devapi-control/contracts/openapi.v1.json", "utf8"));
const contractRoutes = Object.keys(openapi.paths).sort();
assert(JSON.stringify(sourceRoutes) === JSON.stringify(contractRoutes), `DEVAPI_V2_ROUTE_CONTRACT_DRIFT:${sourceRoutes.length}:${contractRoutes.length}`);
let operationCount = 0;
for (const item of Object.values(openapi.paths)) for (const method of Object.keys(item)) if (["get","post","put","patch","delete","head","options"].includes(method)) operationCount += 1;
assert(openapi["x-devapi-runtime-state"] === "STALE", "DEVAPI_HISTORICAL_SERVER_MUST_BE_STALE");
assert(sourceRoutes.includes("/api/v1/agent-tasks") && sourceRoutes.includes("/api/v1/agent-runtime"), "DEVAPI_AGENT_ROUTES_MISSING");

for (const file of [
  "cloud/devapi-control/agent/dependency-manifest.json",
  "cloud/devapi-control/agent/task-state.mjs",
  "cloud/devapi-control/agent/runtime.mjs",
  "cloud/devapi-control/lib/agent-store.mjs",
  "cloud/devapi-control/worker/approval.mjs",
  "cloud/devapi-control/worker/workspace.mjs",
  "cloud/devapi-control/worker/git-worktree.mjs",
  "cloud/devapi-control/browser/system-chrome.mjs",
  "cloud/devapi-control/api/v1/agent-tasks.mjs",
  "cloud/devapi-control/api/v1/agent-runtime.mjs"
]) {
  const text = await readFile(file, "utf8");
  assert(!/HotAPI/iu.test(text), `DEVAPI_SCOPE_LEAK:${file}`);
}

console.log(`DEVAPI_AUTONOMOUS_V2_VERIFY_PASS tools=${tools.length} routes=${sourceRoutes.length} operations=${operationCount} taskState=verified persistence=8-tables workerRuntime=verified worktreeRuntime=verified conflictQueue=verified browserRuntime=verified-readonly modelRuntime=not-verified agentsSdk=source-reviewed-not-installed`);
