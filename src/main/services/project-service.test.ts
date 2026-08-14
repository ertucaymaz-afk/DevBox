import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
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

    expect(project.rootPath).toBe(root);
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
});
