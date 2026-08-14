import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Worktree } from "../../shared/contracts.js";
import type { CommandRunner } from "./command-runner.js";

type ParsedEntry = Omit<Worktree, "isMain">;

function parsePorcelain(output: string, repositoryRoot: string): Worktree[] {
  const entries: ParsedEntry[] = [];
  let current: ParsedEntry | null = null;
  for (const record of output.split("\0")) {
    if (!record) continue;
    const lines = record.split("\n").filter(Boolean);
    for (const line of lines) {
      const separator = line.indexOf(" ");
      const key = separator < 0 ? line : line.slice(0, separator);
      const value = separator < 0 ? "" : line.slice(separator + 1);
      if (key === "worktree") {
        if (current) entries.push(current);
        current = { path: value, head: null, branch: null, bare: false, detached: false, locked: false, lockReason: null, prunable: false, pruneReason: null };
      } else if (current && key === "HEAD") current.head = value;
      else if (current && key === "branch") current.branch = value.replace(/^refs\/heads\//u, "");
      else if (current && key === "bare") current.bare = true;
      else if (current && key === "detached") current.detached = true;
      else if (current && key === "locked") { current.locked = true; current.lockReason = value || null; }
      else if (current && key === "prunable") { current.prunable = true; current.pruneReason = value || null; }
    }
  }
  if (current) entries.push(current);
  const canonicalRoot = path.resolve(repositoryRoot).toLocaleLowerCase("en-US");
  return entries.map((entry) => ({
    ...entry,
    isMain: path.resolve(entry.path).toLocaleLowerCase("en-US") === canonicalRoot
  }));
}

export class WorktreeService {
  readonly #runner: CommandRunner;
  readonly #managedRoot: string;

  public constructor(runner: CommandRunner, managedRoot: string) {
    this.#runner = runner;
    this.#managedRoot = path.resolve(managedRoot);
  }

  public async list(repositoryRoot: string): Promise<Worktree[]> {
    const result = await this.#runner.run({
      executable: "git",
      args: ["-C", repositoryRoot, "worktree", "list", "--porcelain", "-z"],
      cwd: repositoryRoot,
      timeoutMs: 15_000,
      maxOutputBytes: 1_048_576
    });
    if (result.exitCode !== 0) throw new Error(result.stderr.trim() || "WORKTREE_LIST_FAILED");
    return parsePorcelain(result.stdout, repositoryRoot);
  }

  public async create(repositoryRoot: string, projectId: string, name: string, ref: string, mode: "detached" | "branch"): Promise<Worktree> {
    const projectKey = createHash("sha256").update(projectId).digest("hex").slice(0, 16);
    const projectRoot = path.join(this.#managedRoot, projectKey);
    const target = path.join(projectRoot, name);
    await mkdir(projectRoot, { recursive: true });
    const registered = await this.list(repositoryRoot);
    if (registered.some((worktree) => path.resolve(worktree.path).toLocaleLowerCase("en-US") === path.resolve(target).toLocaleLowerCase("en-US"))) {
      throw new Error("WORKTREE_ALREADY_EXISTS");
    }
    const args = mode === "detached"
      ? ["-C", repositoryRoot, "worktree", "add", "--detach", target, ref]
      : ["-C", repositoryRoot, "worktree", "add", "-b", `devbox/${name}`, target, ref];
    const result = await this.#runner.run({ executable: "git", args, cwd: repositoryRoot, timeoutMs: 120_000, maxOutputBytes: 2 * 1_048_576 });
    if (result.exitCode !== 0) throw new Error(result.stderr.trim() || "WORKTREE_CREATE_FAILED");
    const created = (await this.list(repositoryRoot)).find((worktree) => path.resolve(worktree.path) === path.resolve(target));
    if (!created) throw new Error("WORKTREE_CREATE_NOT_REGISTERED");
    return created;
  }

  public async remove(repositoryRoot: string, targetPath: string, force: boolean): Promise<{ recoveryPatch: string | null }> {
    const absolute = path.resolve(targetPath);
    const registered = (await this.list(repositoryRoot)).find((worktree) => path.resolve(worktree.path).toLocaleLowerCase("en-US") === absolute.toLocaleLowerCase("en-US"));
    if (!registered) throw new Error("WORKTREE_NOT_REGISTERED");
    if (registered.isMain) throw new Error("MAIN_WORKTREE_CANNOT_BE_REMOVED");
    const relativeManaged = path.relative(this.#managedRoot, absolute);
    if (relativeManaged.startsWith("..") || path.isAbsolute(relativeManaged)) throw new Error("WORKTREE_OUTSIDE_MANAGED_ROOT");
    let recoveryPatch: string | null = null;
    if (force) {
      const diff = await this.#runner.run({ executable: "git", args: ["-C", absolute, "diff", "--binary", "HEAD"], cwd: absolute, timeoutMs: 30_000, maxOutputBytes: 16 * 1_048_576 });
      if (diff.exitCode === 0 && diff.stdout.trim()) {
        const recoveryRoot = path.join(this.#managedRoot, "recovery");
        await mkdir(recoveryRoot, { recursive: true });
        recoveryPatch = path.join(recoveryRoot, `${Date.now()}-${path.basename(absolute)}.patch`);
        await writeFile(recoveryPatch, diff.stdout, { encoding: "utf8", flag: "wx" });
      }
    }
    if (registered.locked) {
      const unlock = await this.#runner.run({ executable: "git", args: ["-C", repositoryRoot, "worktree", "unlock", absolute], cwd: repositoryRoot, timeoutMs: 15_000 });
      if (unlock.exitCode !== 0) throw new Error(unlock.stderr.trim() || "WORKTREE_UNLOCK_FAILED");
    }
    const result = await this.#runner.run({
      executable: "git",
      args: ["-C", repositoryRoot, "worktree", "remove", ...(force ? ["--force"] : []), absolute],
      cwd: repositoryRoot,
      timeoutMs: 120_000,
      maxOutputBytes: 2 * 1_048_576
    });
    if (result.exitCode !== 0) throw new Error(result.stderr.trim() || "WORKTREE_REMOVE_FAILED");
    await this.#runner.run({ executable: "git", args: ["-C", repositoryRoot, "worktree", "prune", "--expire", "now"], cwd: repositoryRoot, timeoutMs: 30_000 });
    return { recoveryPatch };
  }
}

export { parsePorcelain as parseWorktreePorcelain };
