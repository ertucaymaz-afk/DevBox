import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CommandRunner } from "./command-runner.js";
import { GitService } from "./git-service.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(async (directory) => await rm(directory, { recursive: true, force: true })));
});

async function runGit(runner: CommandRunner, root: string, args: string[]): Promise<void> {
  const result = await runner.run({ executable: "git", args: ["-C", root, ...args], cwd: root });
  if (result.exitCode !== 0) throw new Error(result.stderr);
}

describe("git service", () => {
  it("parses branch, tracked modifications, untracked files, and real diffs", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "devbox-git-test-"));
    temporaryDirectories.push(root);
    const runner = new CommandRunner();
    await runGit(runner, root, ["init", "--initial-branch=main"]);
    await runGit(runner, root, ["config", "user.email", "devbox-tests@example.invalid"]);
    await runGit(runner, root, ["config", "user.name", "DevBox Tests"]);
    await writeFile(path.join(root, "tracked.txt"), "first\n");
    await runGit(runner, root, ["add", "tracked.txt"]);
    await runGit(runner, root, ["commit", "-m", "initial"]);
    await writeFile(path.join(root, "tracked.txt"), "second\n");
    await writeFile(path.join(root, "new file.txt"), "untracked\n");

    const service = new GitService(runner);
    const status = await service.status(root);
    const diff = await service.diff(root);

    expect(status.available).toBe(true);
    expect(status.branch).toBe("main");
    expect(status.head).toMatch(/^[a-f0-9]{40}$/);
    expect(status.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ worktreeStatus: "M", path: "tracked.txt" }),
      expect.objectContaining({ path: "new file.txt" })
    ]));
    expect(status.stats).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "tracked.txt", additions: 1, deletions: 1, binary: false }),
      expect.objectContaining({ path: "new file.txt", additions: null, deletions: null, binary: false })
    ]));
    expect(diff.unstaged).toContain("-first");
    expect(diff.unstaged).toContain("+second");
    expect(diff.baseline.head).toBe(status.head);
  });
});
