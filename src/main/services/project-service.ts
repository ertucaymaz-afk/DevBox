import { createHash, randomUUID } from "node:crypto";
import { cp, lstat, mkdir, open, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { shell } from "electron";
import type { FileSnapshot, ProjectSummary, ProjectTreeNode } from "../../shared/contracts.js";
import { canonicalDirectory, resolveEntryWithinRoot, resolveExistingPathWithinRoot, resolveNewPathWithinRoot } from "../security/path-boundary.js";
import type { StateDatabase } from "./database.js";

const IGNORED_DIRECTORIES = new Set([".git", "node_modules", "dist", "build", ".next", ".turbo", "coverage", "release"]);
const MAX_TREE_ENTRIES = 1_500;
const MAX_DEPTH = 8;
const MAX_TEXT_FILE_SIZE = 1_048_576;

const LANGUAGE_BY_EXTENSION: Readonly<Record<string, string>> = {
  ".css": "css",
  ".go": "go",
  ".html": "html",
  ".java": "java",
  ".js": "javascript",
  ".json": "json",
  ".jsx": "javascriptreact",
  ".md": "markdown",
  ".ps1": "powershell",
  ".py": "python",
  ".rs": "rust",
  ".scss": "scss",
  ".sh": "shell",
  ".sql": "sql",
  ".ts": "typescript",
  ".tsx": "typescriptreact",
  ".xml": "xml",
  ".yaml": "yaml",
  ".yml": "yaml"
};

export class ProjectService {
  readonly #database: StateDatabase;

  public constructor(database: StateDatabase) {
    this.#database = database;
  }

  public list(): ProjectSummary[] {
    return this.#database.listProjects();
  }

  public get(projectId: string): ProjectSummary {
    const project = this.#database.getProject(projectId);
    if (!project) throw new Error("PROJECT_NOT_FOUND");
    return project;
  }

  public async open(rootPath: string): Promise<ProjectSummary> {
    const canonicalRoot = await canonicalDirectory(rootPath);
    const info = await stat(canonicalRoot);
    if (!info.isDirectory()) throw new Error("PROJECT_ROOT_NOT_DIRECTORY");
    const now = new Date().toISOString();
    const project: ProjectSummary = {
      id: createHash("sha256").update(canonicalRoot.toLocaleLowerCase("en-US")).digest("base64url").slice(0, 24),
      name: path.basename(canonicalRoot),
      rootPath: canonicalRoot,
      isGitRepository: await this.#isGitRepository(canonicalRoot),
      createdAt: now,
      updatedAt: now
    };
    return this.#database.upsertProject(project);
  }

  public async tree(projectId: string): Promise<ProjectTreeNode[]> {
    const project = this.get(projectId);
    let entries = 0;

    const visit = async (directory: string, relativeDirectory: string, depth: number): Promise<ProjectTreeNode[]> => {
      if (depth > MAX_DEPTH || entries >= MAX_TREE_ENTRIES) return [];
      const directoryEntries = await readdir(directory, { withFileTypes: true });
      directoryEntries.sort((left, right) => {
        if (left.isDirectory() !== right.isDirectory()) return left.isDirectory() ? -1 : 1;
        return left.name.localeCompare(right.name, undefined, { sensitivity: "base", numeric: true });
      });
      const nodes: ProjectTreeNode[] = [];
      for (const entry of directoryEntries) {
        if (entries >= MAX_TREE_ENTRIES) break;
        if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) continue;
        entries += 1;
        const relativePath = relativeDirectory ? path.join(relativeDirectory, entry.name) : entry.name;
        const absolutePath = path.join(directory, entry.name);
        if (entry.isSymbolicLink()) {
          nodes.push({ name: entry.name, relativePath, kind: "symlink", size: null });
        } else if (entry.isDirectory()) {
          nodes.push({ name: entry.name, relativePath, kind: "directory", size: null, children: await visit(absolutePath, relativePath, depth + 1) });
        } else if (entry.isFile()) {
          const fileInfo = await stat(absolutePath);
          nodes.push({ name: entry.name, relativePath, kind: "file", size: fileInfo.size });
        }
      }
      return nodes;
    };

    return await visit(project.rootPath, "", 0);
  }

  public async readFile(projectId: string, relativePath: string): Promise<FileSnapshot> {
    const project = this.get(projectId);
    const absolutePath = await resolveExistingPathWithinRoot(project.rootPath, relativePath);
    const info = await stat(absolutePath);
    if (!info.isFile()) throw new Error("PATH_IS_NOT_A_FILE");
    if (info.size > MAX_TEXT_FILE_SIZE) throw new Error("FILE_TOO_LARGE_FOR_TEXT_PREVIEW");
    const buffer = await readFile(absolutePath);
    if (buffer.subarray(0, Math.min(buffer.length, 8_192)).includes(0)) throw new Error("BINARY_FILE_PREVIEW_UNAVAILABLE");
    const content = buffer.toString("utf8");
    return {
      projectId,
      relativePath,
      language: LANGUAGE_BY_EXTENSION[path.extname(relativePath).toLocaleLowerCase("en-US")] ?? "plaintext",
      encoding: "utf8",
      content,
      size: info.size,
      sha256: createHash("sha256").update(buffer).digest("hex"),
      readOnlyReason: null
    };
  }

  public async writeFile(projectId: string, relativePath: string, expectedSha256: string, content: string): Promise<FileSnapshot> {
    const project = this.get(projectId);
    const target = await resolveEntryWithinRoot(project.rootPath, relativePath);
    const info = await stat(target);
    if (!info.isFile()) throw new Error("PATH_IS_NOT_A_FILE");
    const encoded = Buffer.from(content, "utf8");
    if (encoded.byteLength > MAX_TEXT_FILE_SIZE) throw new Error("FILE_TOO_LARGE_TO_EDIT");
    const before = await readFile(target);
    if (before.subarray(0, Math.min(before.length, 8_192)).includes(0)) throw new Error("BINARY_FILE_EDIT_UNAVAILABLE");
    const beforeHash = createHash("sha256").update(before).digest("hex");
    if (beforeHash !== expectedSha256) throw new Error("STALE_FILE_CONFLICT");

    const nonce = randomUUID();
    const temporary = path.join(path.dirname(target), `.${path.basename(target)}.${nonce}.devbox-tmp`);
    const backup = path.join(path.dirname(target), `.${path.basename(target)}.${nonce}.devbox-backup`);
    const handle = await open(temporary, "wx", info.mode);
    try {
      await handle.writeFile(encoded);
      await handle.sync();
    } finally {
      await handle.close();
    }

    let backupCreated = false;
    try {
      const fresh = await readFile(target);
      if (createHash("sha256").update(fresh).digest("hex") !== expectedSha256) throw new Error("STALE_FILE_CONFLICT");
      await rename(target, backup);
      backupCreated = true;
      await rename(temporary, target);
      const stored = await readFile(target);
      const expectedStoredHash = createHash("sha256").update(encoded).digest("hex");
      if (createHash("sha256").update(stored).digest("hex") !== expectedStoredHash) throw new Error("POST_WRITE_VERIFICATION_FAILED");
      await rm(backup, { force: true });
      backupCreated = false;
    } catch (error) {
      await rm(temporary, { force: true }).catch(() => undefined);
      if (backupCreated) {
        await rm(target, { force: true }).catch(() => undefined);
        await rename(backup, target).catch(() => undefined);
      }
      throw error;
    }
    return await this.readFile(projectId, relativePath);
  }

  public async createPath(projectId: string, parentRelativePath: string, name: string, kind: "file" | "directory"): Promise<ProjectTreeNode[]> {
    const project = this.get(projectId);
    const relativePath = parentRelativePath ? path.join(parentRelativePath, name) : name;
    const target = await resolveNewPathWithinRoot(project.rootPath, relativePath);
    await lstat(target).then(() => { throw new Error("PATH_ALREADY_EXISTS"); }).catch((error: NodeJS.ErrnoException) => {
      if (error.message === "PATH_ALREADY_EXISTS") throw error;
      if (error.code !== "ENOENT") throw error;
    });
    if (kind === "directory") await mkdir(target);
    else await writeFile(target, "", { encoding: "utf8", flag: "wx" });
    return await this.tree(projectId);
  }

  public async renamePath(projectId: string, relativePath: string, newName: string): Promise<ProjectTreeNode[]> {
    const project = this.get(projectId);
    const source = await resolveEntryWithinRoot(project.rootPath, relativePath);
    const destinationRelative = path.join(path.dirname(relativePath), newName);
    const destination = await resolveNewPathWithinRoot(project.rootPath, destinationRelative);
    await lstat(destination).then(() => { throw new Error("PATH_ALREADY_EXISTS"); }).catch((error: NodeJS.ErrnoException) => {
      if (error.message === "PATH_ALREADY_EXISTS") throw error;
      if (error.code !== "ENOENT") throw error;
    });
    await rename(source, destination);
    return await this.tree(projectId);
  }

  public async duplicatePath(projectId: string, relativePath: string): Promise<ProjectTreeNode[]> {
    const project = this.get(projectId);
    const source = await resolveEntryWithinRoot(project.rootPath, relativePath);
    const extension = path.extname(relativePath);
    const stem = path.basename(relativePath, extension);
    const parent = path.dirname(relativePath) === "." ? "" : path.dirname(relativePath);
    let destination: string | null = null;
    for (let index = 1; index <= 100; index += 1) {
      const suffix = index === 1 ? " kopya" : ` kopya ${index}`;
      const candidate = await resolveNewPathWithinRoot(project.rootPath, path.join(parent, `${stem}${suffix}${extension}`));
      const exists = await lstat(candidate).then(() => true).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return false;
        throw error;
      });
      if (!exists) { destination = candidate; break; }
    }
    if (!destination) throw new Error("DUPLICATE_NAME_EXHAUSTED");
    await cp(source, destination, { recursive: true, force: false, errorOnExist: true, dereference: false });
    return await this.tree(projectId);
  }

  public async trashPath(projectId: string, relativePath: string): Promise<ProjectTreeNode[]> {
    const project = this.get(projectId);
    const target = await resolveEntryWithinRoot(project.rootPath, relativePath);
    await shell.trashItem(target);
    return await this.tree(projectId);
  }

  public async revealPath(projectId: string, relativePath: string): Promise<void> {
    const project = this.get(projectId);
    const target = await resolveEntryWithinRoot(project.rootPath, relativePath);
    shell.showItemInFolder(target);
  }

  public async displayPath(projectId: string, relativePath: string, absolute: boolean): Promise<string> {
    if (!absolute) return relativePath;
    const project = this.get(projectId);
    return await resolveEntryWithinRoot(project.rootPath, relativePath);
  }

  async #isGitRepository(rootPath: string): Promise<boolean> {
    try {
      const gitPath = await resolveExistingPathWithinRoot(rootPath, ".git");
      const gitInfo = await stat(gitPath);
      return gitInfo.isDirectory() || gitInfo.isFile();
    } catch {
      return false;
    }
  }
}
