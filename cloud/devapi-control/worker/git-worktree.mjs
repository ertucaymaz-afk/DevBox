import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, open, realpath, rm, unlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { assertWorkerApproval } from "./approval.mjs";

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
  constructor(repoRoot, lockRoot, approval) {
    this.repoRoot = repoRoot;
    this.lockRoot = lockRoot;
    this.approval = approval;
    this.claims = new Map();
  }

  static async fromRepository(repoRoot = process.cwd(), { approval } = {}) {
    const verifiedApproval = assertWorkerApproval(approval, "R2");
    const root = await realpath(repoRoot);
    const probe = await execGit(root, ["rev-parse", "--show-toplevel"]);
    const top = await realpath(probe.stdout.trim());
    if (top !== root) throw new Error("WORKTREE_REPO_ROOT_REQUIRED");
    const common = await execGit(root, ["rev-parse", "--git-common-dir"]);
    const commonDir = path.resolve(root, common.stdout.trim());
    const lockRoot = path.join(commonDir, "devapi-agent-locks");
    await mkdir(lockRoot, { recursive: true });
    return new GitWorktreeManager(root, lockRoot, verifiedApproval);
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
    const claims = [];
    try {
      for (const file of files.map(safeRelative)) {
        const key = digest(file);
        const lockPath = path.join(this.lockRoot, `${key}.lock`);
        const handle = await open(lockPath, "wx").catch((error) => {
          if (error?.code === "EEXIST") throw new Error(`CONFLICT_QUEUE:${file}`);
          throw error;
        });
        await handle.writeFile(`${worktree.taskId}\n${worktree.branch}\n${file}\n${this.approval.approvalId}\n`, "utf8");
        await handle.close();
        this.claims.set(lockPath, file);
        claims.push({ file, lockPath });
      }
      return claims.map(({ file }) => file);
    } catch (error) {
      await this.releaseClaims();
      throw error;
    }
  }

  async diff(worktree) {
    assertWorkerApproval(this.approval, "R2");
    const result = await execGit(worktree.path, ["diff", "--no-ext-diff", "--binary"]);
    return { text: result.stdout, sha256: digest(result.stdout), bytes: Buffer.byteLength(result.stdout), approvalId: this.approval.approvalId };
  }

  async releaseClaims() {
    for (const lockPath of this.claims.keys()) await unlink(lockPath).catch(() => {});
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
