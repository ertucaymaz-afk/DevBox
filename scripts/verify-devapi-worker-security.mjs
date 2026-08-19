import { readFile } from "node:fs/promises";

function assert(condition, code) { if (!condition) throw new Error(code); }

const worker = JSON.parse(await readFile("outputs/devapi-worker-smoke.json", "utf8"));
const worktree = JSON.parse(await readFile("outputs/devapi-worktree-smoke.json", "utf8"));
const browser = JSON.parse(await readFile("outputs/devapi-browser-smoke.json", "utf8"));
assert(worker.approval?.missingApprovalBlocked === true, "DEVAPI_SECURITY_WORKER_APPROVAL_BYPASS");
assert(worker.patch?.approvalId === worker.approval?.approvalId, "DEVAPI_SECURITY_PATCH_APPROVAL_MISMATCH");
assert(worker.command?.approvalId === worker.approval?.approvalId, "DEVAPI_SECURITY_SHELL_APPROVAL_MISMATCH");
assert(worker.containment?.pathEscapeBlocked === true, "DEVAPI_SECURITY_PATH_ESCAPE");
assert(worker.containment?.unapprovedExecutableBlocked === true, "DEVAPI_SECURITY_EXECUTABLE_ALLOWLIST");
assert(worker.containment?.gitPushBlocked === true, "DEVAPI_SECURITY_GIT_PUSH_NOT_BLOCKED");
assert(worktree.approval?.missingApprovalBlocked === true, "DEVAPI_SECURITY_WORKTREE_APPROVAL_BYPASS");
assert(worktree.diff?.approvalId === worktree.approval?.approvalId, "DEVAPI_SECURITY_WORKTREE_APPROVAL_MISMATCH");
assert(worktree.singleWriter?.conflictQueued === true, "DEVAPI_SECURITY_SINGLE_WRITER_BYPASS");
assert(browser.security?.privateNetworkDeniedWithoutExplicitLoopback === true, "DEVAPI_SECURITY_BROWSER_SSRF_GUARD");
assert(browser.security?.browserActions === "READ_ONLY", "DEVAPI_SECURITY_BROWSER_WRITE_BOUNDARY");

const sourceFiles = [
  "cloud/devapi-control/worker/approval.mjs",
  "cloud/devapi-control/worker/workspace.mjs",
  "cloud/devapi-control/worker/git-worktree.mjs",
  "cloud/devapi-control/browser/system-chrome.mjs",
  "cloud/devapi-control/agent/runtime.mjs",
  "cloud/devapi-control/lib/openai-web-research.mjs"
];
for (const file of sourceFiles) {
  const source = await readFile(file, "utf8");
  assert(!/sk-[A-Za-z0-9_-]{20,}/u.test(source), `DEVAPI_SECURITY_LITERAL_OPENAI_SECRET:${file}`);
  assert(!/(?:password|access_token|api_key)\s*[=:]\s*["'][^"']{12,}["']/iu.test(source), `DEVAPI_SECURITY_LITERAL_CREDENTIAL:${file}`);
}
const workspaceSource = await readFile("cloud/devapi-control/worker/workspace.mjs", "utf8");
assert(workspaceSource.includes("shell: false"), "DEVAPI_SECURITY_SHELL_MUST_BE_FALSE");
assert(workspaceSource.includes("WORKSPACE_COMMAND_SUBCOMMAND_DENIED"), "DEVAPI_SECURITY_SUBCOMMAND_POLICY_MISSING");
assert(workspaceSource.includes("Bearer [REDACTED]"), "DEVAPI_SECURITY_OUTPUT_REDACTION_MISSING");
assert(!workspaceSource.includes("env: process.env"), "DEVAPI_SECURITY_FULL_ENV_LEAK");
const worktreeSource = await readFile("cloud/devapi-control/worker/git-worktree.mjs", "utf8");
assert(worktreeSource.includes("CONFLICT_QUEUE"), "DEVAPI_SECURITY_SINGLE_WRITER_POLICY_MISSING");
assert(worktreeSource.includes("assertWorkerApproval"), "DEVAPI_SECURITY_WORKTREE_APPROVAL_POLICY_MISSING");
const browserSource = await readFile("cloud/devapi-control/browser/system-chrome.mjs", "utf8");
assert(browserSource.includes("BROWSER_URL_PRIVATE_NETWORK_DENIED"), "DEVAPI_SECURITY_BROWSER_PRIVATE_NETWORK_POLICY_MISSING");
assert(browserSource.includes("lookup(url.hostname"), "DEVAPI_SECURITY_BROWSER_DNS_RESOLUTION_MISSING");
assert(browserSource.includes("--disable-background-networking"), "DEVAPI_SECURITY_BROWSER_BACKGROUND_NETWORK_NOT_DISABLED");

console.log("DEVAPI_WORKER_SECURITY_PASS approval=verified pathEscape=blocked shellInjection=blocked gitPush=blocked env=minimal outputRedaction=present singleWriter=verified browserSsrf=verified browserReadOnly=verified secretLiteralScan=pass");
