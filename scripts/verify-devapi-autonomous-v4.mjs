import { readFile } from "node:fs/promises";

function assert(condition, code) { if (!condition) throw new Error(code); }
function readJson(file) { return readFile(file, "utf8").then(JSON.parse); }

const worktree = await readJson("outputs/devapi-worktree-smoke.json");
const lease = await readJson("outputs/devapi-file-lease-smoke.json");
const security = await readJson("outputs/devapi-security-v4-smoke.json");
const provider = await readJson("outputs/devapi-provider-smoke.json");
const reviewer = await readJson("outputs/devapi-reviewer-smoke.json");
const db = await readJson("outputs/devapi-db-runtime-smoke.json");
const vercel = await readJson("outputs/devapi-vercel-credential-state.json");

assert(worktree.worktreeRuntimeVerified === true, "DEVAPI_V4_WORKTREE_RUNTIME");
assert(worktree.singleWriter?.leaseHeartbeatVerified === true, "DEVAPI_V4_WORKTREE_HEARTBEAT");
assert(lease.liveConflict?.verified === true, "DEVAPI_V4_CROSS_PROCESS_CONFLICT");
assert(lease.staleRecovery?.verified === true, "DEVAPI_V4_TTL_RECOVERY");
assert(lease.truth?.state === "RUNTIME_VERIFIED", "DEVAPI_V4_LEASE_RUNTIME_STATE");
assert(lease.truth?.doesNotApplyTo?.includes("distributed-multi-host-lock"), "DEVAPI_V4_LEASE_SCOPE_OVERCLAIM");
assert(security.truth?.state === "RUNTIME_VERIFIED", "DEVAPI_V4_SECURITY_RUNTIME_STATE");
assert(security.commandCases?.length >= 10 && security.commandCases.every((x) => x.denied === true), "DEVAPI_V4_SECURITY_COMMAND_MATRIX");
assert(security.pathCases?.length >= 5 && security.pathCases.every((x) => x.denied === true), "DEVAPI_V4_SECURITY_PATH_MATRIX");
assert(security.outputRedaction?.verified === true, "DEVAPI_V4_SECURITY_REDACTION");

for (const [name, runtime] of [["provider", provider], ["reviewer", reviewer], ["db", db]]) {
  assert(["RUNTIME_VERIFIED", "BLOCKED_EXTERNAL"].includes(runtime.state), `DEVAPI_V4_${name.toUpperCase()}_STATE`);
  if (runtime.state === "RUNTIME_VERIFIED") assert(runtime.runtimeVerified === true, `DEVAPI_V4_${name.toUpperCase()}_VERIFIED_FLAG`);
  if (runtime.state === "BLOCKED_EXTERNAL") assert(runtime.runtimeVerified === false && runtime.blocker, `DEVAPI_V4_${name.toUpperCase()}_BLOCKER`);
}
assert(["SOURCE_READY", "BLOCKED_EXTERNAL", "RUNTIME_VERIFIED", "PRODUCTION_VERIFIED"].includes(vercel.state), "DEVAPI_V4_VERCEL_STATE");
assert(vercel.secretValue === null, "DEVAPI_V4_VERCEL_SECRET_EXPOSED");
if (vercel.state !== "PRODUCTION_VERIFIED") assert(vercel.productionVerified === false, "DEVAPI_V4_VERCEL_OVERCLAIM");

const leaseSource = await readFile("cloud/devapi-control/worker/file-lease.mjs", "utf8");
for (const token of ["CONFLICT_QUEUE", "RECOVERED", "HEARTBEAT", "LEASE_OWNERSHIP_MISMATCH", "LEASE_EXPIRED"]) assert(leaseSource.includes(token), `DEVAPI_V4_LEASE_SOURCE:${token}`);
const worktreeSource = await readFile("cloud/devapi-control/worker/git-worktree.mjs", "utf8");
assert(worktreeSource.includes("FileLeaseRegistry") && worktreeSource.includes("heartbeatClaims"), "DEVAPI_V4_WORKTREE_LEASE_INTEGRATION");

const state = (x) => String(x.state).toLowerCase();
console.log(`DEVAPI_AUTONOMOUS_V4_VERIFY_PASS crossProcessLease=runtime-verified ttlRecovery=verified shellSecurity=extended planner=${state(provider)} reviewer=${state(reviewer)} db=${state(db)} vercel=${state(vercel)} production=${vercel.productionVerified === true ? "verified" : "not-verified"}`);
