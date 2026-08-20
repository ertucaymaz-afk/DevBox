import { readFile } from "node:fs/promises";

function assert(condition, code) { if (!condition) throw new Error(code); }

const worker = JSON.parse(await readFile("outputs/devapi-worker-smoke.json", "utf8"));
const worktree = JSON.parse(await readFile("outputs/devapi-worktree-smoke.json", "utf8"));
const lease = JSON.parse(await readFile("outputs/devapi-file-lease-smoke.json", "utf8"));
const securityV5 = JSON.parse(await readFile("outputs/devapi-security-v4-smoke.json", "utf8"));
const browser = JSON.parse(await readFile("outputs/devapi-browser-smoke.json", "utf8"));
assert(worker.approval?.missingApprovalBlocked === true, "DEVAPI_SECURITY_WORKER_APPROVAL_BYPASS");
assert(worker.patch?.approvalId === worker.approval?.approvalId, "DEVAPI_SECURITY_PATCH_APPROVAL_MISMATCH");
assert(worker.command?.approvalId === worker.approval?.approvalId, "DEVAPI_SECURITY_SHELL_APPROVAL_MISMATCH");
assert(worker.command?.policyVersion === 3 && /^[0-9a-f]{64}$/u.test(worker.command?.policyDigest || ""), "DEVAPI_SECURITY_SHELL_POLICY_EVIDENCE");
assert(worker.command?.networkAllowed === false && worker.command?.writeScope === "workspace-only", "DEVAPI_SECURITY_SHELL_SCOPE_EVIDENCE");
assert(worker.containment?.pathEscapeBlocked === true, "DEVAPI_SECURITY_PATH_ESCAPE");
assert(worker.containment?.unapprovedExecutableBlocked === true, "DEVAPI_SECURITY_EXECUTABLE_ALLOWLIST");
assert(worker.containment?.gitPushBlocked === true, "DEVAPI_SECURITY_GIT_PUSH_NOT_BLOCKED");
assert(worktree.approval?.missingApprovalBlocked === true, "DEVAPI_SECURITY_WORKTREE_APPROVAL_BYPASS");
assert(worktree.diff?.approvalId === worktree.approval?.approvalId, "DEVAPI_SECURITY_WORKTREE_APPROVAL_MISMATCH");
assert(worktree.singleWriter?.conflictQueued === true, "DEVAPI_SECURITY_SINGLE_WRITER_BYPASS");
assert(worktree.singleWriter?.leaseHeartbeatVerified === true, "DEVAPI_SECURITY_LEASE_HEARTBEAT_MISSING");
assert(lease.liveConflict?.verified === true && lease.liveConflict?.state === "CONFLICT_QUEUE", "DEVAPI_SECURITY_CROSS_PROCESS_CONFLICT_BYPASS");
assert(lease.staleRecovery?.verified === true && lease.staleRecovery?.state === "RECOVERED", "DEVAPI_SECURITY_STALE_LEASE_RECOVERY_FAILED");
assert(lease.truth?.doesNotApplyTo?.includes("distributed-multi-host-lock"), "DEVAPI_SECURITY_LEASE_SCOPE_OVERCLAIM");
assert(browser.security?.privateNetworkDeniedWithoutExplicitLoopback === true, "DEVAPI_SECURITY_BROWSER_SSRF_GUARD");
assert(browser.security?.browserActions === "READ_ONLY", "DEVAPI_SECURITY_BROWSER_WRITE_BOUNDARY");

assert(Array.isArray(securityV5.commandCases) && securityV5.commandCases.length >= 10, "DEVAPI_SECURITY_V5_COMMAND_MATRIX_TOO_SMALL");
assert(securityV5.commandCases.every((entry) => entry.denied === true), "DEVAPI_SECURITY_V5_COMMAND_CASE_BYPASS");
assert(Array.isArray(securityV5.pathCases) && securityV5.pathCases.length >= 5, "DEVAPI_SECURITY_V5_PATH_MATRIX_TOO_SMALL");
assert(securityV5.pathCases.every((entry) => entry.denied === true), "DEVAPI_SECURITY_V5_PATH_CASE_BYPASS");
assert(securityV5.outputRedaction?.verified === true && securityV5.outputRedaction?.rawSecretPresent === false, "DEVAPI_SECURITY_V5_SECRET_REDACTION_FAILED");
assert(securityV5.encodedTraversalLiteral?.containedInsideWorkspace === true && securityV5.encodedTraversalLiteral?.decodedByWorker === false, "DEVAPI_SECURITY_V5_ENCODED_TRAVERSAL_BOUNDARY");
assert(securityV5.shellPolicy?.version === 3 && securityV5.shellPolicy?.networkDefault === false, "DEVAPI_SECURITY_V5_SHELL_POLICY_REPORT");

const sourceFiles = [
  "cloud/devapi-control/worker/approval.mjs",
  "cloud/devapi-control/worker/shell-policy.mjs",
  "cloud/devapi-control/worker/workspace.mjs",
  "cloud/devapi-control/worker/file-lease.mjs",
  "cloud/devapi-control/worker/git-worktree.mjs",
  "cloud/devapi-control/browser/system-chrome.mjs",
  "cloud/devapi-control/agent/runtime.mjs",
  "cloud/devapi-control/agent/coder.mjs",
  "cloud/devapi-control/lib/openai-web-research.mjs"
];
for (const file of sourceFiles) {
  const source = await readFile(file, "utf8");
  assert(!/sk-[A-Za-z0-9_-]{20,}/u.test(source), `DEVAPI_SECURITY_LITERAL_OPENAI_SECRET:${file}`);
  assert(!/(?:password|access_token|api_key)\s*[=:]\s*["'][^"']{12,}["']/iu.test(source), `DEVAPI_SECURITY_LITERAL_CREDENTIAL:${file}`);
}
const workspaceSource = await readFile("cloud/devapi-control/worker/workspace.mjs", "utf8");
assert(workspaceSource.includes("shell: false"), "DEVAPI_SECURITY_SHELL_MUST_BE_FALSE");
assert(workspaceSource.includes("assertShellPolicy"), "DEVAPI_SECURITY_SHELL_POLICY_NOT_BOUND");
assert(workspaceSource.includes("policyDigest"), "DEVAPI_SECURITY_SHELL_POLICY_EVIDENCE_NOT_RETURNED");
assert(workspaceSource.includes("Bearer [REDACTED]"), "DEVAPI_SECURITY_OUTPUT_REDACTION_MISSING");
assert(!workspaceSource.includes("env: process.env"), "DEVAPI_SECURITY_FULL_ENV_LEAK");
const shellPolicySource = await readFile("cloud/devapi-control/worker/shell-policy.mjs", "utf8");
for (const token of ["GIT_REMOTE_WRITE", "PACKAGE_PUBLISH", "NETWORK_UNRESTRICTED", "SYSTEM_MUTATION", "DESTRUCTIVE_FS", "UNKNOWN_EXECUTABLE", "UNKNOWN_SUBCOMMAND"]) {
  assert(shellPolicySource.includes(token), `DEVAPI_SECURITY_SHELL_POLICY_MISSING:${token}`);
}
assert(shellPolicySource.includes("policyVersion: 3"), "DEVAPI_SECURITY_SHELL_POLICY_VERSION");
const worktreeSource = await readFile("cloud/devapi-control/worker/git-worktree.mjs", "utf8");
assert(worktreeSource.includes("FileLeaseRegistry"), "DEVAPI_SECURITY_FILE_LEASE_NOT_INTEGRATED");
assert(worktreeSource.includes("heartbeatClaims"), "DEVAPI_SECURITY_LEASE_HEARTBEAT_POLICY_MISSING");
assert(worktreeSource.includes("assertWorkerApproval"), "DEVAPI_SECURITY_WORKTREE_APPROVAL_POLICY_MISSING");
const leaseSource = await readFile("cloud/devapi-control/worker/file-lease.mjs", "utf8");
for (const token of ["CONFLICT_QUEUE", "RECOVERED", "LEASE_OWNERSHIP_MISMATCH", "LEASE_EXPIRED", "recoveredFrom"]) assert(leaseSource.includes(token), `DEVAPI_SECURITY_FILE_LEASE_POLICY_MISSING:${token}`);
const browserSource = await readFile("cloud/devapi-control/browser/system-chrome.mjs", "utf8");
assert(browserSource.includes("BROWSER_URL_PRIVATE_NETWORK_DENIED"), "DEVAPI_SECURITY_BROWSER_PRIVATE_NETWORK_POLICY_MISSING");
assert(browserSource.includes("lookup(url.hostname"), "DEVAPI_SECURITY_BROWSER_DNS_RESOLUTION_MISSING");
assert(browserSource.includes("--disable-background-networking"), "DEVAPI_SECURITY_BROWSER_BACKGROUND_NETWORK_NOT_DISABLED");

console.log(`DEVAPI_WORKER_SECURITY_V5_PASS approval=verified shellPolicy=v3 pathEscape=blocked commandMatrix=${securityV5.commandCases.length} pathMatrix=${securityV5.pathCases.length} gitPush=blocked env=minimal outputRedaction=verified singleWriter=verified crossProcessLease=verified ttlRecovery=verified browserSsrf=verified browserReadOnly=verified secretLiteralScan=pass`);
