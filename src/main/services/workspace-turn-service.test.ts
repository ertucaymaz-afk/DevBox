import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { GitStatus } from "../../shared/contracts.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GitService } from "./git-service.js";
import type { ProjectService } from "./project-service.js";
import { WorkspaceTurnService } from "./workspace-turn-service.js";

const roots: string[] = [];

function gitStatus(root: string, changes: GitStatus["changes"], stats: GitStatus["stats"] = []): GitStatus {
  return {
    available: true,
    repositoryRoot: root,
    branch: "main",
    head: "1111111111111111111111111111111111111111",
    upstream: null,
    ahead: 0,
    behind: 0,
    changes,
    stats,
    error: null
  };
}

async function root(): Promise<string> {
  const value = await mkdtemp(path.join(tmpdir(), "devbox-workspace-turn-test-"));
  roots.push(value);
  return value;
}

function projectService(rootPath: string): ProjectService {
  return { get: vi.fn(() => ({ id: "project-12345678", rootPath })) } as unknown as ProjectService;
}

function gitService(statuses: GitStatus[]): GitService {
  let index = 0;
  return { status: vi.fn(async () => statuses[Math.min(index++, statuses.length - 1)]!) } as unknown as GitService;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((value) => rm(value, { recursive: true, force: true })));
});

describe("WorkspaceTurnService", () => {
  it("does not misreport a pre-existing dirty file as a change made by the current task", async () => {
    const rootPath = await root();
    await writeFile(path.join(rootPath, "existing.ts"), "const value = 1;\n", "utf8");
    const dirty: GitStatus["changes"] = [{ indexStatus: ".", worktreeStatus: "M", path: "existing.ts", originalPath: null }];
    const status = gitStatus(rootPath, dirty, [{ path: "existing.ts", additions: 4, deletions: 2, binary: false }]);
    const service = new WorkspaceTurnService(projectService(rootPath), gitService([status, status, status]));

    const before = await service.capture("project-12345678");
    const result = await service.finalize({ projectId: "project-12345678", threadId: "thread-12345678", turnId: "turn-12345678", intent: "WORKSPACE_MUTATION", before });

    expect(result.baselineDirtyCount).toBe(1);
    expect(result.finalDirtyCount).toBe(1);
    expect(result.changedFiles).toEqual([]);
    expect(result.mutated).toBe(false);
    expect(result.verified).toBe(false);
  });

  it("detects a newly created index.html, hashes it from disk and selects it for Canvas preview", async () => {
    const rootPath = await root();
    const clean = gitStatus(rootPath, []);
    const createdChanges: GitStatus["changes"] = [{ indexStatus: "?", worktreeStatus: "?", path: "index.html", originalPath: null }];
    const created = gitStatus(rootPath, createdChanges, [{ path: "index.html", additions: 5, deletions: 0, binary: false }]);
    const git = gitService([clean, created, created]);
    const service = new WorkspaceTurnService(projectService(rootPath), git);

    const before = await service.capture("project-12345678");
    await writeFile(path.join(rootPath, "index.html"), "<!doctype html>\n<html>\n<body>Gerçek</body>\n</html>\n", "utf8");
    const result = await service.finalize({ projectId: "project-12345678", threadId: "thread-12345678", turnId: "turn-12345678", intent: "WORKSPACE_MUTATION", before });

    expect(result.mutated).toBe(true);
    expect(result.verified).toBe(true);
    expect(result.previewPath).toBe("index.html");
    expect(result.primaryFile).toBe("index.html");
    expect(result.changedFiles).toHaveLength(1);
    expect(result.changedFiles[0]).toMatchObject({ path: "index.html", kind: "added", binary: false, verified: true });
    expect(result.changedFiles[0]?.afterSha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(result.evidence.some((line) => line.startsWith("turn-change:added:index.html:"))).toBe(true);
  });

  it("fails verification if the provider changes Git HEAD during the task", async () => {
    const rootPath = await root();
    const beforeStatus = gitStatus(rootPath, []);
    const afterStatus = { ...gitStatus(rootPath, []), head: "2222222222222222222222222222222222222222" };
    const service = new WorkspaceTurnService(projectService(rootPath), gitService([beforeStatus, afterStatus, afterStatus]));

    const before = await service.capture("project-12345678");
    const result = await service.finalize({ projectId: "project-12345678", threadId: "thread-12345678", turnId: "turn-12345678", intent: "WORKSPACE_MUTATION", before });

    expect(result.gitHeadChanged).toBe(true);
    expect(result.mutated).toBe(true);
    expect(result.verified).toBe(false);
  });
});
