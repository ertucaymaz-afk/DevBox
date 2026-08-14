import type { GitDiff, GitStatus } from "../../shared/contracts.js";
import type { CommandRunner } from "./command-runner.js";

type Numstat = GitStatus["stats"][number];

function parseNumstat(output: string): Numstat[] {
  const records = output.split("\0");
  const stats: Numstat[] = [];
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (!record) continue;
    const firstTab = record.indexOf("\t");
    const secondTab = firstTab < 0 ? -1 : record.indexOf("\t", firstTab + 1);
    if (firstTab < 0 || secondTab < 0) continue;
    const additionsText = record.slice(0, firstTab);
    const deletionsText = record.slice(firstTab + 1, secondTab);
    let filePath = record.slice(secondTab + 1);
    if (!filePath) {
      // With -z, a rename/copy record stores old and new paths in the next two NUL records.
      filePath = records[index + 2] ?? records[index + 1] ?? "";
      index += 2;
    }
    if (!filePath) continue;
    const binary = additionsText === "-" || deletionsText === "-";
    stats.push({
      path: filePath,
      additions: binary ? null : Number(additionsText),
      deletions: binary ? null : Number(deletionsText),
      binary
    });
  }
  return stats;
}

function mergeNumstats(groups: readonly Numstat[][]): Numstat[] {
  const merged = new Map<string, Numstat>();
  for (const group of groups) {
    for (const stat of group) {
      const current = merged.get(stat.path);
      if (!current) merged.set(stat.path, stat);
      else merged.set(stat.path, {
        path: stat.path,
        additions: current.additions === null || stat.additions === null ? null : current.additions + stat.additions,
        deletions: current.deletions === null || stat.deletions === null ? null : current.deletions + stat.deletions,
        binary: current.binary || stat.binary
      });
    }
  }
  return [...merged.values()];
}

export class GitService {
  readonly #runner: CommandRunner;

  public constructor(runner: CommandRunner) {
    this.#runner = runner;
  }

  public async status(rootPath: string): Promise<GitStatus> {
    const identity = await this.#runner.run({
      executable: "git",
      args: ["-C", rootPath, "rev-parse", "--show-toplevel"],
      cwd: rootPath,
      timeoutMs: 10_000,
      maxOutputBytes: 64 * 1024
    });
    if (identity.exitCode !== 0) {
      return { available: false, repositoryRoot: null, branch: null, head: null, upstream: null, ahead: 0, behind: 0, changes: [], stats: [], error: identity.stderr.trim() || "NOT_A_GIT_REPOSITORY" };
    }

    const result = await this.#runner.run({
      executable: "git",
      args: ["-C", rootPath, "status", "--porcelain=v2", "--branch", "-z", "--untracked-files=all"],
      cwd: rootPath,
      timeoutMs: 15_000,
      maxOutputBytes: 2 * 1024 * 1024
    });
    if (result.exitCode !== 0) {
      return { available: false, repositoryRoot: identity.stdout.trim(), branch: null, head: null, upstream: null, ahead: 0, behind: 0, changes: [], stats: [], error: result.stderr.trim() || "GIT_STATUS_FAILED" };
    }

    let branch: string | null = null;
    let head: string | null = null;
    let upstream: string | null = null;
    let ahead = 0;
    let behind = 0;
    const changes: GitStatus["changes"] = [];
    const records = result.stdout.split("\0").filter(Boolean);
    for (let index = 0; index < records.length; index += 1) {
      const record = records[index];
      if (!record) continue;
      if (record.startsWith("# branch.head ")) branch = record.slice(14) === "(detached)" ? null : record.slice(14);
      else if (record.startsWith("# branch.oid ")) head = record.slice(13) === "(initial)" ? null : record.slice(13);
      else if (record.startsWith("# branch.upstream ")) upstream = record.slice(18);
      else if (record.startsWith("# branch.ab ")) {
        const match = /\+(\d+) -(\d+)/.exec(record);
        ahead = Number(match?.[1] ?? 0);
        behind = Number(match?.[2] ?? 0);
      } else if (record.startsWith("1 ") || record.startsWith("2 ")) {
        const fields = record.split(" ");
        const status = fields[1] ?? "??";
        const fieldCountBeforePath = record.startsWith("1 ") ? 8 : 9;
        const filePath = fields.slice(fieldCountBeforePath).join(" ");
        let originalPath: string | null = null;
        if (record.startsWith("2 ")) {
          originalPath = records[index + 1] ?? null;
          index += 1;
        }
        changes.push({ indexStatus: status[0] ?? "?", worktreeStatus: status[1] ?? "?", path: filePath, originalPath });
      } else if (record.startsWith("? ")) {
        changes.push({ indexStatus: "?", worktreeStatus: "?", path: record.slice(2), originalPath: null });
      } else if (record.startsWith("u ")) {
        const fields = record.split(" ");
        changes.push({ indexStatus: "U", worktreeStatus: "U", path: fields.slice(10).join(" "), originalPath: null });
      }
    }

    const numstatResults = head
      ? [await this.#runner.run({ executable: "git", args: ["-C", rootPath, "diff", "--numstat", "-z", head, "--", "."], cwd: rootPath, timeoutMs: 20_000, maxOutputBytes: 2 * 1024 * 1024 })]
      : await Promise.all([
          this.#runner.run({ executable: "git", args: ["-C", rootPath, "diff", "--cached", "--numstat", "-z", "--", "."], cwd: rootPath, timeoutMs: 20_000, maxOutputBytes: 2 * 1024 * 1024 }),
          this.#runner.run({ executable: "git", args: ["-C", rootPath, "diff", "--numstat", "-z", "--", "."], cwd: rootPath, timeoutMs: 20_000, maxOutputBytes: 2 * 1024 * 1024 })
        ]);
    const knownStats = mergeNumstats(numstatResults.filter((item) => item.exitCode === 0 && !item.truncated).map((item) => parseNumstat(item.stdout)));
    const byPath = new Map(knownStats.map((stat) => [stat.path, stat]));
    const stats = changes.map((change) => byPath.get(change.path) ?? { path: change.path, additions: null, deletions: null, binary: false });

    return {
      available: true,
      repositoryRoot: identity.stdout.trim(),
      branch,
      head,
      upstream,
      ahead,
      behind,
      changes,
      stats,
      error: null
    };
  }

  public async diff(rootPath: string): Promise<GitDiff> {
    const status = await this.status(rootPath);
    if (!status.available) throw new Error(status.error ?? "GIT_UNAVAILABLE");
    const [unstaged, staged] = await Promise.all([
      this.#runner.run({ executable: "git", args: ["-C", rootPath, "diff", "--no-ext-diff", "--unified=3", "--", "."], cwd: rootPath, timeoutMs: 20_000, maxOutputBytes: 2 * 1024 * 1024 }),
      this.#runner.run({ executable: "git", args: ["-C", rootPath, "diff", "--cached", "--no-ext-diff", "--unified=3", "--", "."], cwd: rootPath, timeoutMs: 20_000, maxOutputBytes: 2 * 1024 * 1024 })
    ]);
    if (unstaged.exitCode !== 0 || staged.exitCode !== 0) throw new Error(unstaged.stderr || staged.stderr || "GIT_DIFF_FAILED");
    return {
      baseline: { head: status.head, includeStaged: true, includeUnstaged: true },
      staged: staged.stdout,
      unstaged: unstaged.stdout,
      truncated: staged.truncated || unstaged.truncated
    };
  }
}
