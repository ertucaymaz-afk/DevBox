import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { StateDatabase } from "./database.js";
import { LanguageService } from "./language-debug-service.js";
import { ProjectService } from "./project-service.js";

const temporaryDirectories: string[] = [];
const databases: StateDatabase[] = [];

afterEach(async () => {
  for (const database of databases.splice(0)) database.close();
  await Promise.all(temporaryDirectories.splice(0).map(async (directory) => await rm(directory, { recursive: true, force: true })));
});

describe("language and debug service", () => {
  it("returns diagnostics from the installed real TypeScript language server", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "devbox-lsp-test-"));
    temporaryDirectories.push(root);
    await writeFile(path.join(root, "tsconfig.json"), JSON.stringify({ compilerOptions: { strict: true } }), "utf8");
    const database = new StateDatabase(path.join(root, ".state", "test.sqlite"));
    databases.push(database);
    const projects = new ProjectService(database);
    const project = await projects.open(root);
    const content = "const count: number = 'not-a-number';\n";
    const result = await new LanguageService(projects).diagnostics({
      projectId: project.id, relativePath: "sample.ts", language: "typescript", content, version: 1
    });
    expect(result.provider).toBe("typescript-language-server");
    expect(result.diagnostics.some((item) => item.severity === "error" && /string|number/iu.test(item.message))).toBe(true);
  }, 30_000);
});
