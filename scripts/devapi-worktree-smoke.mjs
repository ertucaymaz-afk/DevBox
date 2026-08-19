import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { GitWorktreeManager } from "../cloud/devapi-control/worker/git-worktree.mjs";

function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function assert(condition, code) { if (!condition) throw new Error(code); }

const output = path.resolve("outputs/devapi-worktree-smoke.json");
const approval = { approvalId: randomUUID(), riskClass: "R2", approved: true, actor: "ci-worktree-smoke" };
let missingApprovalBlocked = false;
try { await GitWorktreeManager.fromRepository(process.cwd()); }
catch (error) { missingApprovalBlocked = error?.message === "WORKER_APPROVAL_REQUIRED"; }
assert(missingApprovalBlocked, "WORKTREE_SMOKE_MISSING_APPROVAL_NOT_BLOCKED");

const manager = await GitWorktreeManager.fromRepository(process.cwd(), { approval, leaseTtlMs: 10_000 });
const taskId = randomUUID();
const worktree = await manager.create({ taskId, slug: "smoke-safe-readme" });
let evidence;
try {
  assert(worktree.approvalId === approval.approvalId, "WORKTREE_SMOKE_CREATE_APPROVAL_EVIDENCE");
  const claimed = await manager.claimFiles(worktree, ["cloud/devapi-control/README.md"]);
  assert(claimed.length === 1, "WORKTREE_SMOKE_CLAIM_FAILED");
  const heartbeats = await manager.heartbeatClaims();
  assert(heartbeats.length === 1 && heartbeats[0].state === "HEARTBEAT", "WORKTREE_SMOKE_LEASE_HEARTBEAT_FAILED");

  const approval2 = { approvalId: randomUUID(), riskClass: "R2", approved: true, actor: "ci-conflict-smoke" };
  const manager2 = await GitWorktreeManager.fromRepository(process.cwd(), { approval: approval2, leaseTtlMs: 10_000 });
  let conflictQueued = false;
  try { await manager2.claimFiles({ taskId: randomUUID(), branch: "devapi/evolution/conflict" }, ["cloud/devapi-control/README.md"]); }
  catch (error) { conflictQueued = String(error?.message || "").startsWith("CONFLICT_QUEUE:"); }
  finally { await manager2.releaseClaims(); }
  assert(conflictQueued, "WORKTREE_SMOKE_CONFLICT_NOT_QUEUED");

  const filePath = path.join(worktree.path, "cloud/devapi-control/README.md");
  const before = await readFile(filePath, "utf8");
  const marker = `\n\n<!-- devapi-real-worktree-smoke:${taskId} -->\n`;
  await writeFile(filePath, `${before.trimEnd()}${marker}`, "utf8");
  const after = await readFile(filePath, "utf8");
  assert(after !== before, "WORKTREE_SMOKE_PATCH_NO_CHANGE");

  const diff = await manager.diff(worktree);
  assert(diff.approvalId === approval.approvalId, "WORKTREE_SMOKE_DIFF_APPROVAL_EVIDENCE");
  assert(diff.bytes > 0 && diff.text.includes("devapi-real-worktree-smoke"), "WORKTREE_SMOKE_DIFF_MISSING");
  assert(worktree.sourceSha.length === 40, "WORKTREE_SMOKE_SOURCE_SHA_INVALID");

  evidence = {
    schemaVersion: 3,
    type: "GIT_WORKTREE_EXECUTION",
    taskId,
    branch: worktree.branch,
    sourceSha: worktree.sourceSha,
    approval: { approvalId: approval.approvalId, riskClass: approval.riskClass, actor: approval.actor, missingApprovalBlocked },
    worktreeRuntimeVerified: true,
    modelRuntimeVerified: false,
    singleWriter: { claimed, conflictQueued, leaseHeartbeatVerified: true, heartbeat: heartbeats[0] },
    patch: { path: "cloud/devapi-control/README.md", beforeSha256: sha256(before), afterSha256: sha256(after) },
    diff: { sha256: diff.sha256, bytes: diff.bytes, approvalId: diff.approvalId },
    truth: {
      state: "RUNTIME_VERIFIED",
      appliesTo: ["git.worktree.create", "single-writer", "file-lease-heartbeat", "git.diff", "R2-approval-enforcement"],
      doesNotApplyTo: ["distributed-multi-host-lock", "openai-agent-runtime", "browser.inspect", "deploy.production"]
    },
    completedAt: new Date().toISOString()
  };
} finally {
  await manager.remove(worktree);
}
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
console.log(`DEVAPI_WORKTREE_SMOKE_PASS task=${taskId} approval=verified branch=${evidence.branch} conflictQueue=${evidence.singleWriter.conflictQueued} leaseHeartbeat=${evidence.singleWriter.leaseHeartbeatVerified} diffBytes=${evidence.diff.bytes} modelRuntimeVerified=false`);
