import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseWorktreePorcelain } from "./worktree-service.js";

describe("Git worktree porcelain parser", () => {
  it("preserves detached, lock and prune metadata from NUL records", () => {
    const root = path.resolve("C:/repo");
    const output = [
      `worktree ${root}\nHEAD abcdef\nbranch refs/heads/main\n`,
      "worktree C:/managed/feature\nHEAD 123456\ndetached\nlocked agent-running\nprunable metadata-missing\n",
      ""
    ].join("\0");
    expect(parseWorktreePorcelain(output, root)).toEqual([
      expect.objectContaining({ path: root, branch: "main", isMain: true, detached: false }),
      expect.objectContaining({ path: "C:/managed/feature", isMain: false, detached: true, locked: true, lockReason: "agent-running", prunable: true })
    ]);
  });
});
