import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { LocalWorkerWorkspace } from "../cloud/devapi-control/worker/workspace.mjs";

function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function assert(condition, code) { if (!condition) throw new Error(code); }

const sourceRoot = path.resolve("cloud/devapi-control");
const output = path.resolve("outputs/devapi-worker-smoke.json");
const startedAt = new Date().toISOString();
const workspace = await LocalWorkerWorkspace.create();
let evidence;
try {
  await workspace.materializeDirectory(sourceRoot, "repo");
  const before = await workspace.readText("repo/README.md");
  const marker = `\n\n<!-- devapi-worker-smoke:${workspace.workspaceId} -->\n`;
  const patch = await workspace.writeText("repo/README.md", `${before.content.trimEnd()}${marker}`, { expectedSha256: before.sha256 });
  assert(patch.beforeSha256 === before.sha256, "WORKER_SMOKE_BEFORE_SHA");
  assert(patch.afterSha256 !== patch.beforeSha256, "WORKER_SMOKE_PATCH_NO_CHANGE");

  const syntax = await workspace.exec("node", ["--check", "agent/task-state.mjs"], { cwd: "repo", timeoutMs: 30_000 });
  assert(syntax.exitCode === 0, "WORKER_SMOKE_SYNTAX_FAIL");

  let pathEscapeBlocked = false;
  try { await workspace.readText("../package.json"); }
  catch (error) { pathEscapeBlocked = error?.message === "WORKSPACE_PATH_ESCAPE"; }
  assert(pathEscapeBlocked, "WORKER_SMOKE_PATH_ESCAPE_NOT_BLOCKED");

  let commandDenied = false;
  try { await workspace.exec("sh", ["-c", "echo unsafe"], { cwd: "repo" }); }
  catch (error) { commandDenied = error?.message === "WORKSPACE_COMMAND_DENIED"; }
  assert(commandDenied, "WORKER_SMOKE_COMMAND_POLICY_FAIL");

  evidence = {
    schemaVersion: 1,
    type: "WORKER_EXECUTION",
    runtime: "node-local-isolated-workspace",
    runtimeAgentVerified: false,
    workerRuntimeVerified: true,
    sourceSha: process.env.GITHUB_HEAD_SHA || process.env.GITHUB_SHA || "LOCAL",
    workspaceId: workspace.workspaceId,
    startedAt,
    completedAt: new Date().toISOString(),
    patch: {
      path: patch.path,
      beforeSha256: patch.beforeSha256,
      afterSha256: patch.afterSha256,
      bytes: patch.bytes,
      diffDigest: sha256(marker)
    },
    command: {
      commandHash: syntax.commandHash,
      exitCode: syntax.exitCode,
      durationMs: syntax.durationMs,
      stdoutDigest: syntax.stdoutDigest,
      stderrDigest: syntax.stderrDigest,
      truncated: syntax.truncated,
      timedOut: syntax.timedOut
    },
    containment: {
      pathEscapeBlocked,
      unapprovedExecutableBlocked: commandDenied
    },
    truth: {
      state: "RUNTIME_VERIFIED",
      appliesTo: ["workspace.create", "fs.patch", "shell.exec"],
      doesNotApplyTo: ["openai-agent-runtime", "browser.inspect", "git.worktree.create", "deploy.production"]
    }
  };
} finally {
  await workspace.destroy();
}
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
console.log(`DEVAPI_WORKER_SMOKE_PASS workspace=${evidence.workspaceId} patch=${evidence.patch.path} shellExit=${evidence.command.exitCode} containment=verified runtimeAgentVerified=false`);
