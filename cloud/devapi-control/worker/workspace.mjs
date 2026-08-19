import { createHash, randomUUID } from "node:crypto";
import { cp, lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const COMMANDS = new Set(["git", "node", "npm", "pnpm"]);
const MAX_OUTPUT = 512 * 1024;
const MAX_FILE_BYTES = 4 * 1024 * 1024;

function hash(value) { return createHash("sha256").update(value).digest("hex"); }
function safeRelative(value) {
  const input = String(value ?? "").replaceAll("\\", "/");
  if (!input || input.startsWith("/") || /^[A-Za-z]:\//u.test(input)) throw new Error("WORKSPACE_PATH_ABSOLUTE_DENIED");
  const normalized = path.posix.normalize(input);
  if (normalized === ".." || normalized.startsWith("../") || normalized.includes("/../")) throw new Error("WORKSPACE_PATH_ESCAPE");
  return normalized;
}
function safeArg(value) {
  const text = String(value ?? "");
  if (text.includes("\0") || text.length > 2_000) throw new Error("WORKSPACE_ARG_INVALID");
  return text;
}

export class LocalWorkerWorkspace {
  constructor(root, workspaceId = randomUUID()) {
    this.root = root;
    this.workspaceId = workspaceId;
    this.destroyed = false;
  }

  static async create() {
    const root = await mkdtemp(path.join(os.tmpdir(), "devapi-worker-"));
    return new LocalWorkerWorkspace(await realpath(root));
  }

  assertLive() { if (this.destroyed) throw new Error("WORKSPACE_DESTROYED"); }

  async resolve(relativePath, { allowMissing = false } = {}) {
    this.assertLive();
    const relative = safeRelative(relativePath);
    const candidate = path.resolve(this.root, relative);
    const rel = path.relative(this.root, candidate);
    if (rel.startsWith("..") || path.isAbsolute(rel)) throw new Error("WORKSPACE_PATH_ESCAPE");
    if (!allowMissing) {
      const resolved = await realpath(candidate);
      const resolvedRel = path.relative(this.root, resolved);
      if (resolvedRel.startsWith("..") || path.isAbsolute(resolvedRel)) throw new Error("WORKSPACE_SYMLINK_ESCAPE");
      return resolved;
    }
    const parent = await realpath(path.dirname(candidate));
    const parentRel = path.relative(this.root, parent);
    if (parentRel.startsWith("..") || path.isAbsolute(parentRel)) throw new Error("WORKSPACE_SYMLINK_ESCAPE");
    return candidate;
  }

  async materializeDirectory(sourceDir, targetRelative = "repo") {
    this.assertLive();
    const source = await realpath(sourceDir);
    const stat = await lstat(source);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("WORKSPACE_SOURCE_INVALID");
    const targetRel = safeRelative(targetRelative);
    const target = path.resolve(this.root, targetRel);
    if (path.relative(this.root, target).startsWith("..")) throw new Error("WORKSPACE_PATH_ESCAPE");
    await cp(source, target, { recursive: true, dereference: false, errorOnExist: false });
    return { workspaceId: this.workspaceId, target: targetRel };
  }

  async readText(relativePath) {
    const file = await this.resolve(relativePath);
    const stat = await lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("WORKSPACE_FILE_INVALID");
    if (stat.size > MAX_FILE_BYTES) throw new Error("WORKSPACE_FILE_TOO_LARGE");
    const content = await readFile(file, "utf8");
    return { content, sha256: hash(content), bytes: Buffer.byteLength(content) };
  }

  async writeText(relativePath, content, { expectedSha256 = null } = {}) {
    const text = String(content ?? "");
    if (Buffer.byteLength(text) > MAX_FILE_BYTES) throw new Error("WORKSPACE_FILE_TOO_LARGE");
    const relative = safeRelative(relativePath);
    const candidate = path.resolve(this.root, relative);
    await mkdir(path.dirname(candidate), { recursive: true });
    let before = null;
    try { before = await this.readText(relative); }
    catch (error) { if (error?.code !== "ENOENT" && error?.message !== "WORKSPACE_FILE_INVALID") throw error; }
    if (expectedSha256 !== null && before?.sha256 !== expectedSha256) throw new Error("WORKSPACE_EXPECTED_SHA_MISMATCH");
    const target = await this.resolve(relative, { allowMissing: true });
    await writeFile(target, text, "utf8");
    const after = await this.readText(relative);
    if (after.sha256 !== hash(text)) throw new Error("WORKSPACE_WRITE_READBACK_MISMATCH");
    return { path: relative, beforeSha256: before?.sha256 ?? null, afterSha256: after.sha256, bytes: after.bytes };
  }

  async exec(command, args = [], { cwd = "repo", timeoutMs = 60_000 } = {}) {
    this.assertLive();
    const executable = String(command ?? "");
    if (!COMMANDS.has(executable)) throw new Error("WORKSPACE_COMMAND_DENIED");
    const argv = Array.isArray(args) ? args.map(safeArg) : [];
    const cwdPath = await this.resolve(cwd);
    const startedAt = new Date().toISOString();
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(1_000, Math.min(120_000, Number(timeoutMs) || 60_000)));
    let stdout = "";
    let stderr = "";
    let truncated = false;
    try {
      const result = await new Promise((resolve, reject) => {
        const child = spawn(executable, argv, {
          cwd: cwdPath,
          shell: false,
          windowsHide: true,
          env: { PATH: process.env.PATH || "", HOME: process.env.HOME || os.homedir(), CI: "1", NODE_ENV: "test" },
          signal: controller.signal
        });
        const append = (target, chunk) => {
          const value = chunk.toString("utf8");
          if (target.length + value.length > MAX_OUTPUT) { truncated = true; return target + value.slice(0, Math.max(0, MAX_OUTPUT - target.length)); }
          return target + value;
        };
        child.stdout?.on("data", (chunk) => { stdout = append(stdout, chunk); });
        child.stderr?.on("data", (chunk) => { stderr = append(stderr, chunk); });
        child.on("error", reject);
        child.on("close", (code, signal) => resolve({ code: code ?? -1, signal }));
      });
      return {
        commandHash: hash(JSON.stringify([executable, argv])),
        command: executable,
        args: argv,
        cwd: safeRelative(cwd),
        startedAt,
        durationMs: Date.now() - started,
        exitCode: result.code,
        signal: result.signal,
        stdout,
        stderr,
        stdoutDigest: hash(stdout),
        stderrDigest: hash(stderr),
        truncated,
        timedOut: false
      };
    } catch (error) {
      if (controller.signal.aborted) throw new Error("WORKSPACE_COMMAND_TIMEOUT");
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async destroy() {
    if (this.destroyed) return;
    await rm(this.root, { recursive: true, force: true });
    this.destroyed = true;
  }
}
