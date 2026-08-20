import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { LocalWorkerWorkspace } from "../cloud/devapi-control/worker/workspace.mjs";

function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function assert(condition, code) { if (!condition) throw new Error(code); }

const sourceRoot = path.resolve("cloud/devapi-control");
const output = path.resolve("outputs/devapi-worker-smoke.json");
const startedAt = new Date().toISOString();
const approval = { approvalId: randomUUID(), riskClass: "R2", approved: true, actor: "ci-worker-smoke" };

let missingApprovalBlocked = false;
try { await LocalWorkerWorkspace.create(); }
catch (error) { missingApprovalBlocked = error?.message === "WORKER_APPROVAL_REQUIRED"; }
assert(missingApprovalBlocked, "WORKER_SMOKE_MISSING_APPROVAL_NOT_BLOCKED");

const workspace = await LocalWorkerWorkspace.create({ approval });
let evidence;
try {
  await workspace.materializeDirectory(sourceRoot, "repo");
  const before = await workspace.readText("repo/README.md");
  const marker = `\n\n<!-- devapi-worker-smoke:${workspace.workspaceId} -->\n`;
  const patch = await workspace.writeText("repo/README.md", `${before.content.trimEnd()}${marker}`, { expectedSha256: before.sha256 });
  assert(patch.beforeSha256 === before.sha256, "WORKER_SMOKE_BEFORE_SHA");
  assert(patch.afterSha256 !== patch.beforeSha256, "WORKER_SMOKE_PATCH_NO_CHANGE");
  assert(patch.approvalId === approval.approvalId, "WORKER_SMOKE_PATCH_APPROVAL_EVIDENCE");

  const syntax = await workspace.exec("node", ["--check", "agent/task-state.mjs"], { cwd: "repo", timeoutMs: 30_000 });
  assert(syntax.exitCode === 0, "WORKER_SMOKE_SYNTAX_FAIL");
  assert(syntax.approvalId === approval.approvalId, "WORKER_SMOKE_SHELL_APPROVAL_EVIDENCE");
  assert(syntax.policyVersion === 3 && /^[0-9a-f]{64}$/u.test(syntax.policyDigest), "WORKER_SMOKE_SHELL_POLICY_EVIDENCE");
  assert(syntax.networkAllowed === false && syntax.writeScope === "workspace-only", "WORKER_SMOKE_SHELL_SCOPE_EVIDENCE");

  let pathEscapeBlocked = false;
  try { await workspace.readText("../package.json"); }
  catch (error) { pathEscapeBlocked = error?.message === "WORKSPACE_PATH_ESCAPE"; }
  assert(pathEscapeBlocked, "WORKER_SMOKE_PATH_ESCAPE_NOT_BLOCKED");

  let executableDenied = false;
  try { await workspace.exec("sh", ["-c", "echo unsafe"], { cwd: "repo" }); }
  catch (error) {
    const message = String(error?.message || "");
    executableDenied = message.startsWith("WORKSPACE_COMMAND_SUBCOMMAND_DENIED:sh") && message.endsWith(":UNKNOWN_EXECUTABLE");
  }
  assert(executableDenied, "WORKER_SMOKE_EXECUTABLE_POLICY_FAIL");

  let gitPushDenied = false;
  try { await workspace.exec("git", ["push", "origin", "HEAD"], { cwd: "repo" }); }
  catch (error) { gitPushDenied = String(error?.message || "").startsWith("WORKSPACE_COMMAND_SUBCOMMAND_DENIED:git:push:GIT_REMOTE_WRITE"); }
  assert(gitPushDenied, "WORKER_SMOKE_GIT_PUSH_POLICY_FAIL");

  evidence = {
    schemaVersion: 3,
    type: "WORKER_EXECUTION",
    runtime: "node-local-isolated-workspace",
    runtimeAgentVerified: false,
    workerRuntimeVerified: true,
    sourceSha: process.env.DEVAPI_SOURCE_SHA || process.env.GITHUB_HEAD_SHA || process.env.GITHUB_SHA || "LOCAL",
    workspaceId: workspace.workspaceId,
    approval: { approvalId: approval.approvalId, riskClass: approval.riskClass, actor: approval.actor, missingApprovalBlocked },
    startedAt,
    completedAt: new Date().toISOString(),
    patch: {
      path: patch.path,
      beforeSha256: patch.beforeSha256,
      afterSha256: patch.afterSha256,
      bytes: patch.bytes,
      diffDigest: sha256(marker),
      approvalId: patch.approvalId
    },
    command: {
      commandHash: syntax.commandHash,
      approvalId: syntax.approvalId,
      policyVersion: syntax.policyVersion,
      policyDigest: syntax.policyDigest,
      matchedRule: syntax.matchedRule,
      networkAllowed: syntax.networkAllowed,
      writeScope: syntax.writeScope,
      exitCode: syntax.exitCode,
      durationMs: syntax.durationMs,
      stdoutDigest: syntax.stdoutDigest,
      stderrDigest: syntax.stderrDigest,
      truncated: syntax.truncated,
      timedOut: syntax.timedOut
    },
    containment: {
      pathEscapeBlocked,
      unapprovedExecutableBlocked: executableDenied,
      gitPushBlocked: gitPushDenied
    },
    truth: {
      state: "RUNTIME_VERIFIED",
      appliesTo: ["workspace.create", "fs.patch", "shell.exec", "R2-approval-enforcement", "shell-policy-v3"],
      doesNotApplyTo: ["openai-agent-runtime", "browser.interact", "distributed-lock", "deploy.production"]
    }
  };
} finally {
  await workspace.destroy();
}
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
console.log(`DEVAPI_WORKER_SMOKE_PASS workspace=${evidence.workspaceId} approval=verified patch=${evidence.patch.path} shellExit=${evidence.command.exitCode} shellPolicy=v3 containment=verified gitPush=blocked runtimeAgentVerified=false`);
