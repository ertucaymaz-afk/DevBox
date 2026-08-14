import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { DebugSession } from "../../shared/contracts.js";
import { StateDatabase } from "./database.js";
import { BUILTIN_JAVASCRIPT_DEBUG_ADAPTER, DebugService, LanguageService } from "./language-debug-service.js";
import { ProjectService } from "./project-service.js";

const temporaryDirectories: string[] = [];
const databases: StateDatabase[] = [];

afterEach(async () => {
  for (const database of databases.splice(0)) database.close();
  await Promise.all(temporaryDirectories.splice(0).map(async (directory) => await rm(directory, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100
  })));
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

  it("runs a real JavaScript DAP session through the bundled Microsoft adapter", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "devbox-dap-test-"));
    const outsideRoot = await mkdtemp(path.join(os.tmpdir(), "devbox-dap-outside-"));
    temporaryDirectories.push(root, outsideRoot);
    await writeFile(path.join(root, "sample.js"), "const devboxMarker = 41;\ndebugger;\nconsole.log(devboxMarker + 1);\nsetInterval(() => {}, 1_000);\n", "utf8");
    const outsideSource = path.join(outsideRoot, "outside.js");
    await writeFile(outsideSource, "debugger;\n", "utf8");
    const database = new StateDatabase(path.join(root, ".state", "test.sqlite"));
    databases.push(database);
    const projects = new ProjectService(database);
    const project = await projects.open(root);
    const service = new DebugService(projects);
    let session: DebugSession | null = null;
    try {
      session = await service.start({
        projectId: project.id,
        executable: BUILTIN_JAVASCRIPT_DEBUG_ADAPTER,
        arguments: [],
        request: "launch",
        configuration: { program: "sample.js", cwd: "", stopOnEntry: true }
      });
      expect(session.adapter).toBe("Microsoft vscode-js-debug 1.117.0");
      expect(session.capabilities).toMatchObject({ supportsConfigurationDoneRequest: true });

      const threads = await service.command(session.id, "threads", {});
      const threadItems = (threads.body as { threads?: Array<{ id?: unknown }> } | null)?.threads ?? [];
      const threadId = threadItems.find((item) => typeof item.id === "number")?.id as number | undefined;
      expect(typeof threadId).toBe("number");

      let stackBody: { stackFrames?: Array<{ id?: unknown; name?: unknown }> } | null = null;
      for (let attempt = 0; attempt < 30; attempt += 1) {
        try {
          stackBody = (await service.command(session.id, "stackTrace", { threadId })).body as typeof stackBody;
          if (stackBody?.stackFrames?.length) break;
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }
      const frame = stackBody?.stackFrames?.find((item) => typeof item.id === "number");
      expect(frame).toBeTruthy();

      const scopes = await service.command(session.id, "scopes", { frameId: frame?.id });
      const scopeItems = (scopes.body as { scopes?: Array<{ variablesReference?: unknown }> } | null)?.scopes ?? [];
      const variablesReference = scopeItems.find((item) => typeof item.variablesReference === "number")?.variablesReference;
      expect(typeof variablesReference).toBe("number");

      const variables = await service.command(session.id, "variables", { variablesReference });
      const variableItems = (variables.body as { variables?: Array<{ name?: unknown }> } | null)?.variables ?? [];
      expect(variableItems.length).toBeGreaterThan(0);

      const breakpoints = await service.command(session.id, "setBreakpoints", {
        source: { path: "sample.js" }, breakpoints: [{ line: 2 }]
      });
      expect(Array.isArray((breakpoints.body as { breakpoints?: unknown[] } | null)?.breakpoints)).toBe(true);
      await expect(service.command(session.id, "setBreakpoints", {
        source: { path: outsideSource }, breakpoints: [{ line: 1 }]
      })).rejects.toThrow(/unsafe|escapes/iu);
    } finally {
      if (session) await service.stop(session.id);
      service.close();
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }, 60_000);
});
