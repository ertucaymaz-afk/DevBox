import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { canonicalDirectory, PathBoundaryError, resolveExistingPathWithinRoot, resolveNewPathWithinRoot } from "./path-boundary.js";

const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "devbox-path-test-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(async (directory) => await rm(directory, { recursive: true, force: true })));
});

describe("project path boundary", () => {
  it("resolves an existing file inside the canonical project root", async () => {
    const root = await temporaryDirectory();
    await mkdir(path.join(root, "src"));
    await writeFile(path.join(root, "src", "index.ts"), "export {};\n");

    const result = await resolveExistingPathWithinRoot(root, path.join("src", "index.ts"));

    expect(result).toBe(path.join(await canonicalDirectory(root), "src", "index.ts"));
  });

  it("rejects traversal and absolute path requests", async () => {
    const parent = await temporaryDirectory();
    const root = path.join(parent, "project");
    await mkdir(root);
    await writeFile(path.join(parent, "outside.txt"), "outside");

    await expect(resolveExistingPathWithinRoot(root, path.join("..", "outside.txt"))).rejects.toBeInstanceOf(PathBoundaryError);
    await expect(resolveExistingPathWithinRoot(root, path.join(parent, "outside.txt"))).rejects.toBeInstanceOf(PathBoundaryError);
  });

  it("rejects Windows device names, alternate streams, and trailing-dot creation", async () => {
    const root = await temporaryDirectory();
    await expect(resolveNewPathWithinRoot(root, "CON.txt")).rejects.toBeInstanceOf(PathBoundaryError);
    await expect(resolveNewPathWithinRoot(root, "secret.txt:stream")).rejects.toBeInstanceOf(PathBoundaryError);
    await expect(resolveNewPathWithinRoot(root, "trailing.")).rejects.toBeInstanceOf(PathBoundaryError);
  });
});
