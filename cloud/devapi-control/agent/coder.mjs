import { createHash, randomUUID } from "node:crypto";

const MAX_CHANGED_FILES = 4;
const MAX_PATCH_BYTES = 64 * 1024;
const MAX_SHELL_COMMANDS = 8;

function hash(value) {
  return createHash("sha256").update(String(value ?? "")).digest("hex");
}

function assertUuid(value, code) {
  const text = String(value ?? "").trim();
  if (!/^[0-9a-f-]{36}$/iu.test(text)) throw new Error(code);
  return text;
}

function assertPathAllowed(path, allowedPaths = [], deniedPaths = []) {
  const value = String(path ?? "").replaceAll("\\", "/");
  if (!value || value.startsWith("/") || value.includes("../") || /^[A-Za-z]:\//u.test(value)) throw new Error("CODER_PATH_INVALID");
  if (deniedPaths.some((prefix) => value === prefix || value.startsWith(`${prefix}/`))) throw new Error("CODER_PATH_DENIED");
  if (allowedPaths.length > 0 && !allowedPaths.some((prefix) => value === prefix || value.startsWith(`${prefix}/`))) throw new Error("CODER_PATH_OUT_OF_SCOPE");
  return value;
}

function normalizeBudget(input = {}) {
  return Object.freeze({
    maxChangedFiles: Math.max(1, Math.min(MAX_CHANGED_FILES, Number(input.maxChangedFiles) || 2)),
    maxPatchBytes: Math.max(256, Math.min(MAX_PATCH_BYTES, Number(input.maxPatchBytes) || 16 * 1024)),
    maxShellCommands: Math.max(0, Math.min(MAX_SHELL_COMMANDS, Number(input.maxShellCommands) || 3))
  });
}

export async function runCodingAgent({
  taskId,
  sourceSha,
  planEvidenceId,
  approvalId,
  approval,
  workspace,
  allowedPaths = [],
  deniedPaths = [],
  budget = {},
  actions = [],
  tests = []
} = {}) {
  const id = assertUuid(taskId, "CODER_TASK_ID_INVALID");
  const planId = assertUuid(planEvidenceId, "CODER_PLAN_EVIDENCE_ID_INVALID");
  const approvedId = assertUuid(approvalId, "CODER_APPROVAL_ID_INVALID");
  if (!workspace || typeof workspace.writeText !== "function" || typeof workspace.exec !== "function") throw new Error("CODER_WORKSPACE_INVALID");
  if (String(approval?.approvalId ?? "") !== approvedId || approval?.approved !== true || approval?.riskClass !== "R2") throw new Error("CODER_APPROVAL_MISMATCH");
  if (!/^[0-9a-f]{7,64}$/iu.test(String(sourceSha ?? ""))) throw new Error("CODER_SOURCE_SHA_INVALID");
  if (!Array.isArray(actions) || actions.length === 0) throw new Error("CODER_ACTIONS_REQUIRED");
  if (!Array.isArray(tests)) throw new Error("CODER_TESTS_INVALID");

  const limits = normalizeBudget(budget);
  if (actions.length > limits.maxChangedFiles) throw new Error("CODER_BUDGET_CHANGED_FILES_EXCEEDED");
  if (tests.length > limits.maxShellCommands) throw new Error("CODER_BUDGET_SHELL_COMMANDS_EXCEEDED");

  const startedAt = new Date().toISOString();
  const sessionId = randomUUID();
  const changedFiles = [];
  let patchBytes = 0;

  for (const action of actions) {
    if (!action || action.operation !== "UPDATE") throw new Error("CODER_OPERATION_NOT_ALLOWED");
    const target = assertPathAllowed(action.path, allowedPaths, deniedPaths);
    const content = String(action.content ?? "");
    patchBytes += Buffer.byteLength(content);
    if (patchBytes > limits.maxPatchBytes) throw new Error("CODER_BUDGET_PATCH_BYTES_EXCEEDED");
    const result = await workspace.writeText(target, content, { expectedSha256: action.expectedBeforeSha256 ?? null });
    changedFiles.push({
      path: target,
      operation: "UPDATE",
      beforeSha256: result.beforeSha256,
      afterSha256: result.afterSha256,
      bytes: result.bytes,
      approvalId: result.approvalId
    });
  }

  const toolCalls = [];
  for (const test of tests) {
    const command = String(test?.command ?? "");
    const args = Array.isArray(test?.args) ? test.args : [];
    const result = await workspace.exec(command, args, { cwd: test?.cwd ?? "repo", timeoutMs: test?.timeoutMs ?? 60_000 });
    toolCalls.push({
      toolCallId: randomUUID(),
      tool: "shell.exec",
      commandHash: result.commandHash,
      exitCode: result.exitCode,
      stdoutDigest: result.stdoutDigest,
      stderrDigest: result.stderrDigest,
      timedOut: result.timedOut
    });
    if (result.exitCode !== 0) throw new Error("CODER_TEST_FAILED");
  }

  const patchDigest = hash(JSON.stringify(changedFiles.map(({ path, beforeSha256, afterSha256 }) => ({ path, beforeSha256, afterSha256 }))));
  return Object.freeze({
    schemaVersion: 1,
    taskId: id,
    role: "coding-agent",
    sessionId,
    sourceSha: String(sourceSha),
    planEvidenceId: planId,
    approvalId: approvedId,
    changedFiles,
    patchDigest,
    patchBytes,
    toolCalls,
    testImpact: tests.map((test) => String(test?.label ?? test?.command ?? "test").slice(0, 160)),
    state: "SOURCE_VERIFIED_CANDIDATE",
    runtimeScope: "bounded-worker-executor",
    modelRuntimeVerified: false,
    startedAt,
    completedAt: new Date().toISOString()
  });
}
