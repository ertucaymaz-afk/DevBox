import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { McpHostService } from "./mcp-host-service.js";
import { PluginRegistryService } from "./plugin-registry-service.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(async (directory) => await rm(directory, { recursive: true, force: true })));
});

describe("isolated MCP host", () => {
  it("starts a child process, completes initialize and verifies tools/list before RUNNING", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "devbox-mcp-host-"));
    temporaryDirectories.push(root);
    const server = path.join(root, "server.mjs");
    await writeFile(server, `
      import readline from "node:readline";
      const input = readline.createInterface({ input: process.stdin });
      input.on("line", (line) => {
        const message = JSON.parse(line);
        if (message.method === "initialize") process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: message.id, result: { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "fixture", version: "1.0.0" } } }) + "\\n");
        if (message.method === "tools/list") process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: message.id, result: { tools: [{ name: "one", description: "Gerçek yankı aracı", inputSchema: { type: "object", properties: { value: { type: "string" } } } }, { name: "two", inputSchema: { type: "object" } }] } }) + "\\n");
        if (message.method === "tools/call") process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: message.id, result: { content: [{ type: "text", text: message.params.arguments.value }] } }) + "\\n");
      });
    `, "utf8");
    const registry = new PluginRegistryService(path.join(root, "registry.json"));
    await registry.recordInstalled({ pluginId: "devbox.fixture", version: "1.0.0", installRoot: root });
    const host = new McpHostService(registry);
    await expect(host.start("devbox.fixture", server)).resolves.toEqual({ pluginId: "devbox.fixture", toolCount: 2 });
    expect(host.isRunning("devbox.fixture")).toBe(true);
    expect(host.toolCount("devbox.fixture")).toBe(2);
    expect(host.tools("devbox.fixture")).toMatchObject([{ name: "one", description: "Gerçek yankı aracı" }, { name: "two" }]);
    await expect(host.callTool("devbox.fixture", "one", { value: "kanıt" })).resolves.toMatchObject({ result: { content: [{ text: "kanıt" }] } });
    await expect(host.callTool("devbox.fixture", "missing", {})).rejects.toThrow("MCP_TOOL_NOT_FOUND");
    await expect(registry.list()).resolves.toMatchObject([{ pluginId: "devbox.fixture", state: "RUNNING" }]);
    await host.close();
    expect(host.isRunning("devbox.fixture")).toBe(false);
    await expect(registry.list()).resolves.toMatchObject([{ pluginId: "devbox.fixture", state: "DISABLED" }]);
  });
});
