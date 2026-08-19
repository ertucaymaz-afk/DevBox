import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { LocalWorkerWorkspace } from "../cloud/devapi-control/worker/workspace.mjs";
import { runCodingAgent } from "../cloud/devapi-control/agent/coder.mjs";

const hash = (value) => createHash("sha256").update(value).digest("hex");
const root = await mkdtemp(path.join(os.tmpdir(), "devapi-coder-smoke-"));
const source = path.join(root, "source");
await mkdir(path.join(source, "docs"), { recursive: true });
const before = "# DevAPI Smoke\n\nsource-ready\n";
await writeFile(path.join(source, "docs", "smoke.md"), before, "utf8");
await writeFile(path.join(source, "check.mjs"), "console.log('coder-smoke-pass')\n", "utf8");

const approval = Object.freeze({ approvalId: randomUUID(), riskClass: "R2", approved: true, actor: "devapi-ci" });
const workspace = await LocalWorkerWorkspace.create({ approval });
try {
  await workspace.materializeDirectory(source, "repo");
  const result = await runCodingAgent({
    taskId: randomUUID(),
    sourceSha: "3ffa8aeba6d61020cfac3979080065302270363f",
    planEvidenceId: randomUUID(),
    approvalId: approval.approvalId,
    approval,
    workspace,
    allowedPaths: ["repo/docs"],
    deniedPaths: ["repo/.github", "repo/secrets"],
    budget: { maxChangedFiles: 1, maxPatchBytes: 4096, maxShellCommands: 1 },
    actions: [{
      operation: "UPDATE",
      path: "repo/docs/smoke.md",
      expectedBeforeSha256: hash(before),
      content: "# DevAPI Smoke\n\nsource-verified-candidate\n"
    }],
    tests: [{ label: "syntax", command: "node", args: ["--check", "check.mjs"], cwd: "repo" }]
  });

  if (result.changedFiles.length !== 1) throw new Error("CODER_SMOKE_CHANGED_FILES");
  if (result.toolCalls.length !== 1 || result.toolCalls[0].exitCode !== 0) throw new Error("CODER_SMOKE_TEST");
  if (result.modelRuntimeVerified !== false) throw new Error("CODER_SMOKE_MODEL_TRUTH");
  const after = await readFile(path.join(workspace.root, "repo", "docs", "smoke.md"), "utf8");
  if (!after.includes("source-verified-candidate")) throw new Error("CODER_SMOKE_READBACK");

  let scopeDenied = false;
  try {
    await runCodingAgent({
      taskId: randomUUID(), sourceSha: result.sourceSha, planEvidenceId: randomUUID(), approvalId: approval.approvalId, approval, workspace,
      allowedPaths: ["repo/docs"], actions: [{ operation: "UPDATE", path: "repo/secrets/key.txt", content: "forbidden" }]
    });
  } catch (error) { scopeDenied = /CODER_PATH_OUT_OF_SCOPE|CODER_PATH_DENIED/u.test(String(error?.message)); }
  if (!scopeDenied) throw new Error("CODER_SMOKE_SCOPE_NOT_BLOCKED");

  console.log(`DEVAPI_CODER_SMOKE_PASS changedFiles=${result.changedFiles.length} tests=${result.toolCalls.length} scope=verified modelRuntimeVerified=false patchDigest=${result.patchDigest}`);
} finally {
  await workspace.destroy();
  await rm(root, { recursive: true, force: true });
}
