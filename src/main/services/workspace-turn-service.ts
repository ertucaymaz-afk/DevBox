import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import type { ThreadWorkspaceChange, ThreadWorkspaceResult } from "../../shared/contracts.js";
import type { GitService } from "./git-service.js";
import type { ProjectService } from "./project-service.js";

const MAX_GENERIC_FILES = 4_000;
const MAX_GENERIC_DEPTH = 12;
const IGNORED_DIRECTORIES = new Set([".git", "node_modules", "dist", "build", ".next", ".turbo", "coverage", "release", ".packaged-app"]);

type SnapshotEntry = {
  path: string;
  state: string;
  sha256: string | null;
  size: number | null;
  binary: boolean;
  lineCount: number | null;
  exists: boolean;
};

export type WorkspaceTurnSnapshot = {
  projectId: string;
  rootPath: string;
  gitAvailable: boolean;
  gitHead: string | null;
  dirtyCount: number;
  entries: Map<string, SnapshotEntry>;
};

function normalizeRelative(relativePath: string): string {
  return relativePath.replace(/\\/gu, "/").replace(/^\.\//u, "");
}

function withinRoot(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function inspectFile(rootPath: string, relativePath: string, state: string): SnapshotEntry {
  const normalized = normalizeRelative(relativePath);
  const absolute = path.resolve(rootPath, normalized);
  if (!withinRoot(rootPath, absolute)) throw new Error("WORKSPACE_SNAPSHOT_PATH_OUTSIDE_ROOT");
  if (!existsSync(absolute)) return { path: normalized, state, sha256: null, size: null, binary: false, lineCount: null, exists: false };
  const info = lstatSync(absolute);
  if (info.isSymbolicLink()) {
    return { path: normalized, state, sha256: `symlink:${info.size}:${info.mtimeMs}`, size: info.size, binary: true, lineCount: null, exists: true };
  }
  if (!info.isFile()) return { path: normalized, state, sha256: `nonfile:${info.mode}:${info.size}:${info.mtimeMs}`, size: info.size, binary: true, lineCount: null, exists: true };
  const bytes = readFileSync(absolute);
  const binary = bytes.subarray(0, Math.min(bytes.length, 8_192)).includes(0);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const lineCount = binary ? null : (bytes.length === 0 ? 0 : bytes.toString("utf8").split(/\r?\n/u).length);
  return { path: normalized, state, sha256, size: info.size, binary, lineCount, exists: true };
}

function genericSnapshot(rootPath: string): Map<string, SnapshotEntry> {
  const output = new Map<string, SnapshotEntry>();
  let count = 0;
  const visit = (directory: string, depth: number): void => {
    if (depth > MAX_GENERIC_DEPTH || count >= MAX_GENERIC_FILES) return;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (count >= MAX_GENERIC_FILES) break;
      if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) { visit(absolute, depth + 1); continue; }
      const relative = normalizeRelative(path.relative(rootPath, absolute));
      count += 1;
      try { output.set(relative, inspectFile(rootPath, relative, "GENERIC")); }
      catch { output.set(relative, { path: relative, state: "UNREADABLE", sha256: null, size: null, binary: true, lineCount: null, exists: true }); }
    }
  };
  visit(rootPath, 0);
  return output;
}

function signature(entry: SnapshotEntry | undefined): string {
  if (!entry) return "ABSENT";
  return JSON.stringify([entry.state, entry.sha256, entry.size, entry.binary, entry.exists]);
}

function changeKind(before: SnapshotEntry | undefined, after: SnapshotEntry | undefined): ThreadWorkspaceChange["kind"] {
  if (!before && after) {
    if (!after.exists || /D/u.test(after.state)) return "deleted";
    return "added";
  }
  if (before && !after) return "reverted";
  if (after && (!after.exists || /D/u.test(after.state))) return "deleted";
  return "modified";
}

function preferPreview(changes: ThreadWorkspaceChange[]): string | null {
  const html = changes.filter((item) => item.afterSha256 && /\.html?$/iu.test(item.path));
  return html.find((item) => /(^|\/)index\.html?$/iu.test(item.path))?.path ?? html[0]?.path ?? null;
}

export class WorkspaceTurnService {
  readonly #projects: ProjectService;
  readonly #git: GitService;

  public constructor(projects: ProjectService, git: GitService) {
    this.#projects = projects;
    this.#git = git;
  }

  public async capture(projectId: string): Promise<WorkspaceTurnSnapshot> {
    const project = this.#projects.get(projectId);
    const status = await this.#git.status(project.rootPath);
    if (!status.available) {
      const entries = genericSnapshot(project.rootPath);
      return { projectId, rootPath: project.rootPath, gitAvailable: false, gitHead: null, dirtyCount: 0, entries };
    }

    const entries = new Map<string, SnapshotEntry>();
    for (const change of status.changes) {
      const relative = normalizeRelative(change.path);
      const state = `${change.indexStatus}${change.worktreeStatus}`;
      try { entries.set(relative, inspectFile(project.rootPath, relative, state)); }
      catch { entries.set(relative, { path: relative, state: "UNREADABLE", sha256: null, size: null, binary: true, lineCount: null, exists: true }); }
    }
    return { projectId, rootPath: project.rootPath, gitAvailable: true, gitHead: status.head, dirtyCount: status.changes.length, entries };
  }

  public async finalize(input: {
    projectId: string;
    threadId: string;
    turnId: string;
    intent: ThreadWorkspaceResult["intent"];
    before: WorkspaceTurnSnapshot;
  }): Promise<ThreadWorkspaceResult> {
    const after = await this.capture(input.projectId);
    const paths = new Set([...input.before.entries.keys(), ...after.entries.keys()]);
    const changes: ThreadWorkspaceChange[] = [];
    const afterStatus = after.gitAvailable ? await this.#git.status(after.rootPath) : null;
    const stats = new Map((afterStatus?.stats ?? []).map((item) => [normalizeRelative(item.path), item]));

    for (const relative of [...paths].sort((left, right) => left.localeCompare(right))) {
      const beforeEntry = input.before.entries.get(relative);
      const afterEntry = after.entries.get(relative);
      if (signature(beforeEntry) === signature(afterEntry)) continue;
      const stat = stats.get(relative);
      const kind = changeKind(beforeEntry, afterEntry);
      const newlyCreatedText = kind === "added" && afterEntry?.exists && !afterEntry.binary;
      changes.push({
        path: relative,
        kind,
        beforeSha256: beforeEntry?.sha256 && /^[a-f0-9]{64}$/u.test(beforeEntry.sha256) ? beforeEntry.sha256 : null,
        afterSha256: afterEntry?.sha256 && /^[a-f0-9]{64}$/u.test(afterEntry.sha256) ? afterEntry.sha256 : null,
        additions: stat?.additions ?? (newlyCreatedText ? afterEntry.lineCount : null),
        deletions: stat?.deletions ?? (kind === "deleted" && beforeEntry?.lineCount !== null ? beforeEntry?.lineCount ?? null : null),
        binary: afterEntry?.binary ?? beforeEntry?.binary ?? false,
        verified: kind === "deleted" ? afterEntry?.exists === false || afterEntry === undefined : Boolean(afterEntry?.exists && afterEntry.sha256)
      });
    }

    const headChanged = input.before.gitAvailable && after.gitAvailable && input.before.gitHead !== after.gitHead;
    const mutated = changes.length > 0 || headChanged;
    const verified = mutated && !headChanged && changes.length > 0 && changes.every((item) => item.verified);
    const previewPath = preferPreview(changes);
    const evidence = [
      `workspace-intent:${input.intent}`,
      `baseline-dirty:${input.before.dirtyCount}`,
      `final-dirty:${after.dirtyCount}`,
      ...(input.before.gitHead ? [`git-head-before:${input.before.gitHead}`] : []),
      ...(after.gitHead ? [`git-head-after:${after.gitHead}`] : []),
      ...changes.slice(0, 40).map((item) => `turn-change:${item.kind}:${item.path}:${item.afterSha256?.slice(0, 12) ?? "absent"}`)
    ].slice(0, 64);

    return {
      threadId: input.threadId,
      turnId: input.turnId,
      projectId: input.projectId,
      intent: input.intent,
      mutated,
      verified,
      gitHeadChanged: headChanged,
      baselineDirtyCount: input.before.dirtyCount,
      finalDirtyCount: after.dirtyCount,
      changedFiles: changes.slice(0, 200),
      primaryFile: changes.find((item) => item.afterSha256)?.path ?? null,
      previewPath,
      evidence,
      createdAt: new Date().toISOString()
    };
  }
}
