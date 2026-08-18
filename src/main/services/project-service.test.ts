import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { StateDatabase } from "./database.js";
import { ProjectService } from "./project-service.js";

const temporaryDirectories: string[] = [];
const databases: StateDatabase[] = [];

afterEach(async () => {
  for (const database of databases.splice(0)) database.close();
  await Promise.all(temporaryDirectories.splice(0).map(async (directory) => await rm(directory, { recursive: true, force: true })));
});

describe("project service", () => {
  it("opens a canonical project and provides bounded, hash-guarded text editing", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "devbox-project-test-"));
    temporaryDirectories.push(root);
    await mkdir(path.join(root, "src"));
    await mkdir(path.join(root, "node_modules"));
    await writeFile(path.join(root, "src", "index.ts"), "export const answer = 42;\n");
    await writeFile(path.join(root, "node_modules", "ignored.js"), "ignored");
    const database = new StateDatabase(path.join(root, ".state", "test.sqlite"));
    databases.push(database);
    const projects = new ProjectService(database);

    const project = await projects.open(root);
    const tree = await projects.tree(project.id);
    const snapshot = await projects.readFile(project.id, path.join("src", "index.ts"));

    // Windows runners can expose the same temp directory through both an 8.3
    // alias (RUNNER~1) and its long path (runneradmin). Compare canonical paths
    // so this assertion still verifies the exact directory identity.
    expect(project.rootPath).toBe(await realpath(root));
    expect(tree.some((item) => item.name === "node_modules")).toBe(false);
    expect(snapshot.content).toContain("answer = 42");
    expect(snapshot.language).toBe("typescript");
    expect(snapshot.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(snapshot.readOnlyReason).toBeNull();

    const saved = await projects.writeFile(project.id, path.join("src", "index.ts"), snapshot.sha256, "export const answer = 43;\n");
    expect(saved.content).toContain("answer = 43");
    expect(saved.sha256).not.toBe(snapshot.sha256);
    await expect(projects.writeFile(project.id, path.join("src", "index.ts"), snapshot.sha256, "stale\n")).rejects.toThrow("STALE_FILE_CONFLICT");

    await projects.createPath(project.id, "src", "created.ts", "file");
    await projects.renamePath(project.id, path.join("src", "created.ts"), "renamed.ts");
    const updatedTree = await projects.duplicatePath(project.id, path.join("src", "renamed.ts"));
    const sourceDirectory = updatedTree.find((item) => item.name === "src");
    expect(sourceDirectory?.children?.map((item) => item.name)).toEqual(expect.arrayContaining(["renamed.ts", "renamed kopya.ts"]));
  });

  it("rejects editing a final file symlink before following it outside the project root", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "devbox-project-symlink-"));
    const outsideRoot = await mkdtemp(path.join(os.tmpdir(), "devbox-project-outside-"));
    temporaryDirectories.push(root, outsideRoot);
    await mkdir(path.join(root, "src"));
    const outsideFile = path.join(outsideRoot, "secret.ts");
    await writeFile(outsideFile, "export const outside = 1;\n");
    const linkPath = path.join(root, "src", "escape.ts");
    await symlink(outsideFile, linkPath, "file");

    const database = new StateDatabase(path.join(root, ".state", "test.sqlite"));
    databases.push(database);
    const projects = new ProjectService(database);
    const project = await projects.open(root);

    await expect(projects.readFile(project.id, path.join("src", "escape.ts"))).rejects.toThrow();
    await expect(projects.writeFile(project.id, path.join("src", "escape.ts"), "0".repeat(64), "mutated\n"))
      .rejects.toThrow("SYMLINK_FILE_EDIT_FORBIDDEN");
    expect(await readFile(outsideFile, "utf8")).toBe("export const outside = 1;\n");
  });
});
