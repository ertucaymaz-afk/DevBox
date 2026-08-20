import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { assertWorkerApproval } from "./approval.mjs";
import { FileLeaseRegistry } from "./file-lease.mjs";

const MAX_OUTPUT = 512 * 1024;
function digest(value) { return createHash("sha256").update(value).digest("hex"); }
function safeSlug(value) {
  const slug = String(value ?? "").toLowerCase().replace(/[^a-z0-9-]+/gu, "-").replace(/^-+|-+$/gu, "").slice(0, 48);
  if (!slug) throw new Error("WORKTREE_SLUG_INVALID");
  return slug;
}
function safeRelative(value) {
  const normalized = path.posix.normalize(String(value ?? "").replaceAll("\\", "/"));
  if (!normalized || normalized === ".." || normalized.startsWith("../") || normalized.startsWith("/")) throw new Error("WORKTREE_PATH_INVALID");
  return normalized;
}
async function execGit(repoRoot, args, timeoutMs = 60_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1_000, Math.min(120_000, Number(timeoutMs) || 60_000)));
  let stdout = "";
  let stderr = "";
  const append = (target, chunk) => (target + chunk.toString("utf8")).slice(0, MAX_OUTPUT);
  try {
    const result = await new Promise((resolve, reject) => {
      const child = spawn("git", args.map(String), { cwd: repoRoot, shell: false, windowsHide: true, signal: controller.signal, env: { PATH: process.env.PATH || "", HOME: process.env.HOME || os.homedir(), CI: "1" } });
      child.stdout?.on("data", (chunk) => { stdout = append(stdout, chunk); });
      child.stderr?.on("data", (chunk) => { stderr = append(stderr, chunk); });
      child.on("error", reject);
      child.on("close", (code, signal) => resolve({ code: code ?? -1, signal }));
    });
    if (result.code !== 0) throw new Error(`GIT_COMMAND_FAILED:${args[0]}:${result.code}:${stderr.slice(0, 240)}`);
    return { ...result, stdout, stderr, stdoutDigest: digest(stdout), stderrDigest: digest(stderr) };
  } catch (error) {
    if (controller.signal.aborted) throw new Error("GIT_COMMAND_TIMEOUT");
    throw error;
  } finally { clearTimeout(timer); }
}

export class GitWorktreeManager {
  constructor(repoRoot, leaseRegistry, approval) {
    this.repoRoot = repoRoot;
    this.leaseRegistry = leaseRegistry;
    this.approval = approval;
    this.claims = new Map();
  }

  static async fromRepository(repoRoot = process.cwd(), { approval, leaseTtlMs = 45_000 } = {}) {
    const verifiedApproval = assertWorkerApproval(approval, "R2");
    const root = await realpath(repoRoot);
    const probe = await execGit(root, ["rev-parse", "--show-toplevel"]);
    const top = await realpath(probe.stdout.trim());
    if (top !== root) throw new Error("WORKTREE_REPO_ROOT_REQUIRED");
    const common = await execGit(root, ["rev-parse", "--git-common-dir"]);
    const commonDir = path.resolve(root, common.stdout.trim());
    const lockRoot = path.join(commonDir, "devapi-agent-locks");
    await mkdir(lockRoot, { recursive: true });
    const leaseRegistry = await new FileLeaseRegistry(lockRoot, { ownerId: randomUUID(), ttlMs: leaseTtlMs }).init();
    return new GitWorktreeManager(root, leaseRegistry, verifiedApproval);
  }

  async create({ taskId = randomUUID(), slug, base = "HEAD" } = {}) {
    const approval = assertWorkerApproval(this.approval, "R2");
    if (!/^[0-9a-f-]{36}$/iu.test(String(taskId))) throw new Error("WORKTREE_TASK_ID_INVALID");
    const cleanSlug = safeSlug(slug);
    const parent = await mkdtemp(path.join(os.tmpdir(), "devapi-worktree-"));
    const worktreePath = path.join(parent, "repo");
    const branch = `devapi/evolution/${String(taskId).slice(0, 8)}-${cleanSlug}`;
    try {
      await execGit(this.repoRoot, ["worktree", "add", "-b", branch, worktreePath, String(base)]);
      const sourceSha = (await execGit(worktreePath, ["rev-parse", "HEAD"])).stdout.trim();
      return { taskId: String(taskId), branch, path: worktreePath, parent, sourceSha, state: "CREATED", approvalId: approval.approvalId };
    } catch (error) {
      await rm(parent, { recursive: true, force: true });
      throw error;
    }
  }

  async claimFiles(worktree, files = []) {
    assertWorkerApproval(this.approval, "R2");
    const claimed = [];
    try {
      for (const file of files.map(safeRelative)) {
        const lease = await this.leaseRegistry.claim({
          file,
          taskId: String(worktree.taskId),
          workspaceId: String(worktree.branch),
          approvalId: this.approval.approvalId
        });
        this.claims.set(file, lease);
        claimed.push(file);
      }
      return claimed;
    } catch (error) {
      await this.releaseClaims();
      throw error;
    }
  }

  async heartbeatClaims() {
    assertWorkerApproval(this.approval, "R2");
    const heartbeats = [];
    for (const [file, lease] of this.claims) {
      const next = await this.leaseRegistry.heartbeat(lease);
      this.claims.set(file, next);
      heartbeats.push({ file, leaseId: next.leaseId, state: next.state, heartbeatAt: next.heartbeatAt, expiresAt: next.expiresAt });
    }
    return heartbeats;
  }

  async diff(worktree) {
    assertWorkerApproval(this.approval, "R2");
    const result = await execGit(worktree.path, ["diff", "--no-ext-diff", "--binary"]);
    return { text: result.stdout, sha256: digest(result.stdout), bytes: Buffer.byteLength(result.stdout), approvalId: this.approval.approvalId };
  }

  async releaseClaims() {
    for (const lease of this.claims.values()) await this.leaseRegistry.release(lease).catch(() => {});
    this.claims.clear();
  }

  async remove(worktree) {
    assertWorkerApproval(this.approval, "R2");
    await this.releaseClaims();
    await execGit(this.repoRoot, ["worktree", "remove", "--force", worktree.path]).catch(() => {});
    await execGit(this.repoRoot, ["branch", "-D", worktree.branch]).catch(() => {});
    await rm(worktree.parent, { recursive: true, force: true });
  }
}
