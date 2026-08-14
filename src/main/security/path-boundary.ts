import { lstat, realpath } from "node:fs/promises";
import path from "node:path";

export class PathBoundaryError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "PathBoundaryError";
  }
}

function normalizeForComparison(value: string): string {
  const normalized = path.resolve(value);
  return process.platform === "win32" ? normalized.toLocaleLowerCase("en-US") : normalized;
}

const WINDOWS_RESERVED_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;

function assertSafeRelativePath(relativePath: string, allowEmpty = false): void {
  if (relativePath.includes("\0")) throw new PathBoundaryError("Path contains a null byte.");
  if (path.isAbsolute(relativePath)) throw new PathBoundaryError("Absolute paths are not accepted at this boundary.");
  if (relativePath === "" && allowEmpty) return;
  const segments = relativePath.split(/[\\/]/u);
  if (segments.length === 0 || segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    throw new PathBoundaryError("Path contains an unsafe segment.");
  }
  for (const segment of segments) {
    if (segment.endsWith(".") || segment.endsWith(" ") || segment.includes(":")) {
      throw new PathBoundaryError("Windows trailing-dot, trailing-space and alternate data stream paths are rejected.");
    }
    if (WINDOWS_RESERVED_NAME.test(segment)) throw new PathBoundaryError("Windows reserved device names are rejected.");
  }
}

function assertWithin(canonicalRoot: string, target: string): void {
  const relative = path.relative(normalizeForComparison(canonicalRoot), normalizeForComparison(target));
  if (relative !== "" && (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative))) {
    throw new PathBoundaryError("Requested path escapes the selected project.");
  }
}

export async function canonicalDirectory(directory: string): Promise<string> {
  const canonical = await realpath(path.resolve(directory));
  return path.resolve(canonical);
}

export async function resolveExistingPathWithinRoot(root: string, relativePath: string): Promise<string> {
  assertSafeRelativePath(relativePath);

  const canonicalRoot = await canonicalDirectory(root);
  const requested = path.resolve(canonicalRoot, relativePath);
  const canonicalTarget = path.resolve(await realpath(requested));
  assertWithin(canonicalRoot, canonicalTarget);
  return canonicalTarget;
}

export async function resolveEntryWithinRoot(root: string, relativePath: string): Promise<string> {
  assertSafeRelativePath(relativePath);
  const canonicalRoot = await canonicalDirectory(root);
  const requested = path.resolve(canonicalRoot, relativePath);
  const canonicalParent = path.resolve(await realpath(path.dirname(requested)));
  assertWithin(canonicalRoot, canonicalParent);
  const entry = path.join(canonicalParent, path.basename(requested));
  await lstat(entry);
  return entry;
}

export async function resolveNewPathWithinRoot(root: string, relativePath: string): Promise<string> {
  assertSafeRelativePath(relativePath);
  const canonicalRoot = await canonicalDirectory(root);
  const requested = path.resolve(canonicalRoot, relativePath);
  const canonicalParent = path.resolve(await realpath(path.dirname(requested)));
  assertWithin(canonicalRoot, canonicalParent);
  const target = path.join(canonicalParent, path.basename(requested));
  assertWithin(canonicalRoot, target);
  return target;
}
