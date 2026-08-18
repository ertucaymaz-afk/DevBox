import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import path from "node:path";
import { redactText } from "../security/redaction.js";
import { PluginRegistryService } from "./plugin-registry-service.js";

type JsonRpcResponse = { jsonrpc: "2.0"; id: number; result?: unknown; error?: { code?: number; message?: string } };
type PendingRequest = { resolve: (value: unknown) => void; reject: (error: Error) => void; timeout: NodeJS.Timeout };
export type McpToolDefinition = { name: string; description: string | null; inputSchema: Record<string, unknown> };
type McpSession = {
  pluginId: string;
  child: ChildProcessWithoutNullStreams;
  pending: Map<number, PendingRequest>;
  buffer: string;
  stderr: string;
  stopping: boolean;
  toolCount: number;
  tools: Map<string, McpToolDefinition>;
};

const MAX_BUFFER = 4 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 15_000;
const TOOL_TIMEOUT_MS = 30_000;
const MAX_TOOL_ARGUMENT_BYTES = 1 * 1024 * 1024;
const MAX_TOOL_RESULT_BYTES = 4 * 1024 * 1024;

function childEnvironment(): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = { ELECTRON_RUN_AS_NODE: "1", CI: "1", NO_COLOR: "1" };
  for (const key of ["SYSTEMROOT", "WINDIR", "PATH", "PATHEXT", "TEMP", "TMP", "APPDATA", "LOCALAPPDATA", "USERPROFILE"]) {
    if (process.env[key] !== undefined) environment[key] = process.env[key];
  }
  return environment;
}

function errorMessage(value: unknown): string {
  return redactText(value instanceof Error ? value.message : String(value)).slice(0, 2_000);
}

export class McpHostService {
  readonly #registry: PluginRegistryService;
  readonly #sessions = new Map<string, McpSession>();
  readonly #clientVersion: string;
  #requestId = 0;

  public constructor(registry: PluginRegistryService, clientVersion = process.env.npm_package_version?.trim() || "unknown") {
    this.#registry = registry;
    this.#clientVersion = clientVersion.trim().slice(0, 80) || "unknown";
  }

  public isRunning(pluginId: string): boolean {
    return this.#sessions.has(pluginId);
  }

  public toolCount(pluginId: string): number {
    return this.#sessions.get(pluginId)?.toolCount ?? 0;
  }

  public tools(pluginId: string): McpToolDefinition[] {
    return [...(this.#sessions.get(pluginId)?.tools.values() ?? [])].map((tool) => ({ ...tool, inputSchema: { ...tool.inputSchema } }));
  }

  async #terminate(session: McpSession): Promise<void> {
    if (session.child.exitCode !== null || session.child.signalCode !== null) return;
    const closed = new Promise<void>((resolve) => session.child.once("close", () => resolve()));
    session.child.stdin.end();
    session.child.kill();
    await Promise.race([
      closed,
      new Promise<void>((resolve) => setTimeout(resolve, 2_000))
    ]);
  }

  #send(session: McpSession, message: object): void {
    if (!session.child.stdin.writable) throw new Error("MCP_STDIN_NOT_WRITABLE");
    session.child.stdin.write(`${JSON.stringify(message)}\n`, "utf8");
  }

  async #request(session: McpSession, method: string, params: object, timeoutMs = REQUEST_TIMEOUT_MS): Promise<unknown> {
    const id = ++this.#requestId;
    return await new Promise<unknown>((resolve, reject) => {
      const timeout = setTimeout(() => {
        session.pending.delete(id);
        reject(new Error(`MCP_REQUEST_TIMEOUT:${method}`));
      }, timeoutMs);
      session.pending.set(id, { resolve, reject, timeout });
      this.#send(session, { jsonrpc: "2.0", id, method, params });
    });
  }

  #onStdout(session: McpSession, chunk: Buffer): void {
    session.buffer += chunk.toString("utf8");
    if (Buffer.byteLength(session.buffer, "utf8") > MAX_BUFFER) {
      session.child.kill();
      for (const request of session.pending.values()) {
        clearTimeout(request.timeout);
        request.reject(new Error("MCP_OUTPUT_LIMIT_EXCEEDED"));
      }
      session.pending.clear();
      return;
    }
    let newline = session.buffer.indexOf("\n");
    while (newline >= 0) {
      const line = session.buffer.slice(0, newline).trim();
      session.buffer = session.buffer.slice(newline + 1);
      if (line) {
        try {
          const response = JSON.parse(line) as JsonRpcResponse;
          if (typeof response.id === "number") {
            const pending = session.pending.get(response.id);
            if (pending) {
              session.pending.delete(response.id);
              clearTimeout(pending.timeout);
              if (response.error) pending.reject(new Error(`MCP_REMOTE_ERROR:${response.error.code ?? "UNKNOWN"}:${response.error.message ?? "Unknown error"}`));
              else pending.resolve(response.result);
            }
          }
        } catch (error) {
          session.stderr = `${session.stderr}\nGeçersiz MCP çıktısı: ${errorMessage(error)}`.slice(-64_000);
        }
      }
      newline = session.buffer.indexOf("\n");
    }
  }

  public async start(pluginId: string, serverPath: string): Promise<{ pluginId: string; toolCount: number }> {
    const existing = this.#sessions.get(pluginId);
    if (existing) return { pluginId, toolCount: existing.toolCount };
    const records = await this.#registry.list();
    const record = records.find((item) => item.pluginId === pluginId);
    if (!record) throw new Error("MCP_PLUGIN_NOT_REGISTERED");
    if (record.state === "INSTALLED" || record.state === "GRANT_PENDING") await this.#registry.setPermissions(pluginId, []);
    else if (record.state === "DISABLED") await this.#registry.transition(pluginId, "ENABLED");
    await this.#registry.transition(pluginId, "STARTING");

    const child = spawn(process.execPath, [path.resolve(serverPath)], {
      cwd: path.dirname(path.resolve(serverPath)),
      env: childEnvironment(),
      shell: false,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"]
    });
    const session: McpSession = { pluginId, child, pending: new Map(), buffer: "", stderr: "", stopping: false, toolCount: 0, tools: new Map() };
    this.#sessions.set(pluginId, session);
    child.stdout.on("data", (chunk: Buffer) => this.#onStdout(session, chunk));
    child.stderr.on("data", (chunk: Buffer) => {
      session.stderr = `${session.stderr}${redactText(chunk.toString("utf8"))}`.slice(-64_000);
    });
    child.once("exit", () => {
      this.#sessions.delete(pluginId);
      for (const request of session.pending.values()) {
        clearTimeout(request.timeout);
        request.reject(new Error(`MCP_PROCESS_EXITED:${session.stderr.trim().slice(-1_000)}`));
      }
      session.pending.clear();
      if (!session.stopping) void this.#registry.transition(pluginId, "CRASHED", session.stderr.trim() || "MCP_PROCESS_EXITED").catch(() => undefined);
    });

    try {
      await this.#request(session, "initialize", {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "DevBox", version: this.#clientVersion }
      });
      this.#send(session, { jsonrpc: "2.0", method: "notifications/initialized", params: {} });
      const listed = await this.#request(session, "tools/list", {}) as { tools?: unknown[] };
      if (!Array.isArray(listed?.tools) || listed.tools.length === 0) throw new Error("MCP_TOOL_LIST_EMPTY");
      for (const candidate of listed.tools) {
        if (!candidate || typeof candidate !== "object") throw new Error("MCP_TOOL_DEFINITION_INVALID");
        const raw = candidate as Record<string, unknown>;
        if (typeof raw.name !== "string" || raw.name.length < 1 || raw.name.length > 160 || session.tools.has(raw.name)) throw new Error("MCP_TOOL_NAME_INVALID");
        if (!raw.inputSchema || typeof raw.inputSchema !== "object" || Array.isArray(raw.inputSchema)) throw new Error("MCP_TOOL_INPUT_SCHEMA_INVALID");
        session.tools.set(raw.name, {
          name: raw.name,
          description: typeof raw.description === "string" ? raw.description.slice(0, 2_000) : null,
          inputSchema: raw.inputSchema as Record<string, unknown>
        });
      }
      session.toolCount = session.tools.size;
      await this.#registry.transition(pluginId, "RUNNING");
      return { pluginId, toolCount: session.toolCount };
    } catch (error) {
      session.stopping = true;
      await this.#terminate(session);
      this.#sessions.delete(pluginId);
      await this.#registry.transition(pluginId, "CRASHED", errorMessage(error)).catch(() => undefined);
      throw error;
    }
  }

  public async callTool(pluginId: string, toolName: string, args: Record<string, unknown>): Promise<{ result: unknown; durationMs: number }> {
    const session = this.#sessions.get(pluginId);
    if (!session) throw new Error("MCP_PLUGIN_NOT_RUNNING");
    if (!session.tools.has(toolName)) throw new Error("MCP_TOOL_NOT_FOUND");
    if (Buffer.byteLength(JSON.stringify(args), "utf8") > MAX_TOOL_ARGUMENT_BYTES) throw new Error("MCP_TOOL_ARGUMENT_LIMIT_EXCEEDED");
    const startedAt = Date.now();
    const result = await this.#request(session, "tools/call", { name: toolName, arguments: args }, TOOL_TIMEOUT_MS);
    if (Buffer.byteLength(JSON.stringify(result), "utf8") > MAX_TOOL_RESULT_BYTES) throw new Error("MCP_TOOL_RESULT_LIMIT_EXCEEDED");
    await this.#registry.transition(pluginId, "RUNNING");
    return { result, durationMs: Date.now() - startedAt };
  }

  public async stop(pluginId: string): Promise<void> {
    const session = this.#sessions.get(pluginId);
    if (!session) return;
    session.stopping = true;
    this.#sessions.delete(pluginId);
    await this.#terminate(session);
    await this.#registry.transition(pluginId, "DISABLED").catch(() => undefined);
  }

  public async close(): Promise<void> {
    await Promise.all([...this.#sessions.keys()].map(async (pluginId) => await this.stop(pluginId)));
  }
}
