import { access } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import type { DebugResponse, DebugSession, EditorDiagnostic, LanguageDiagnosticsResult } from "../../shared/contracts.js";
import type { ProjectService } from "./project-service.js";
import { ProtocolSession, type ProtocolMessage } from "./protocol-service.js";

const require = createRequire(import.meta.url);
const SUPPORTED_LANGUAGES = new Set(["typescript", "typescriptreact", "javascript", "javascriptreact"]);

function severity(value: unknown): EditorDiagnostic["severity"] {
  return value === 1 ? "error" : value === 2 ? "warning" : value === 3 ? "information" : "hint";
}

function position(value: unknown): { line: number; character: number } {
  if (!value || typeof value !== "object") return { line: 0, character: 0 };
  const record = value as Record<string, unknown>;
  return {
    line: typeof record.line === "number" && Number.isInteger(record.line) && record.line >= 0 ? record.line : 0,
    character: typeof record.character === "number" && Number.isInteger(record.character) && record.character >= 0 ? record.character : 0
  };
}

function normalizeDiagnostics(message: ProtocolMessage): EditorDiagnostic[] | null {
  if (message.method !== "textDocument/publishDiagnostics") return null;
  const params = message.params;
  if (!params || typeof params !== "object") return null;
  const raw = (params as Record<string, unknown>).diagnostics;
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 10_000).flatMap((entry): EditorDiagnostic[] => {
    if (!entry || typeof entry !== "object") return [];
    const item = entry as Record<string, unknown>;
    const range = item.range;
    if (!range || typeof range !== "object" || typeof item.message !== "string" || item.message.length === 0) return [];
    const rangeRecord = range as Record<string, unknown>;
    const code = typeof item.code === "string" || typeof item.code === "number" ? item.code : null;
    return [{
      severity: severity(item.severity),
      message: item.message.slice(0, 16_000),
      source: typeof item.source === "string" ? item.source.slice(0, 160) : null,
      code,
      range: { start: position(rangeRecord.start), end: position(rangeRecord.end) }
    }];
  });
}

export class LanguageService {
  readonly #projects: ProjectService;

  public constructor(projects: ProjectService) {
    this.#projects = projects;
  }

  public async diagnostics(input: {
    projectId: string;
    relativePath: string;
    language: string;
    content: string;
    version: number;
  }): Promise<LanguageDiagnosticsResult> {
    if (!SUPPORTED_LANGUAGES.has(input.language)) throw new Error("LANGUAGE_SERVER_UNSUPPORTED_LANGUAGE");
    const started = performance.now();
    const project = this.#projects.get(input.projectId);
    const absoluteFile = path.resolve(project.rootPath, input.relativePath);
    const relative = path.relative(project.rootPath, absoluteFile);
    if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("PATH_OUTSIDE_PROJECT");

    const cli = require.resolve("typescript-language-server/lib/cli.mjs");
    const session = new ProtocolSession("lsp", process.execPath, [cli, "--stdio"], project.rootPath, {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1"
    });
    const rootUri = pathToFileURL(project.rootPath).toString();
    const documentUri = pathToFileURL(absoluteFile).toString();
    try {
      await session.request("initialize", {
        processId: null,
        rootUri,
        workspaceFolders: [{ uri: rootUri, name: project.name }],
        capabilities: { textDocument: { publishDiagnostics: { relatedInformation: true, versionSupport: true } } },
        initializationOptions: { preferences: { includeCompletionsForModuleExports: true } }
      }, 20_000);
      session.notify("initialized", {});
      const published = new Promise<EditorDiagnostic[]>((resolve, reject) => {
        const timeout = setTimeout(() => {
          unsubscribe();
          reject(new Error("LSP_DIAGNOSTICS_TIMEOUT"));
        }, 12_000);
        timeout.unref();
        const unsubscribe = session.onMessage((message) => {
          const diagnostics = normalizeDiagnostics(message);
          if (diagnostics === null) return;
          clearTimeout(timeout);
          unsubscribe();
          resolve(diagnostics);
        });
      });
      session.notify("textDocument/didOpen", {
        textDocument: { uri: documentUri, languageId: input.language, version: input.version, text: input.content }
      });
      const diagnostics = await published;
      return { provider: "typescript-language-server", diagnostics, durationMs: Math.max(0, Math.round(performance.now() - started)) };
    } finally {
      session.close();
    }
  }
}

type ManagedDebugSession = { protocol: ProtocolSession; snapshot: DebugSession };

export class DebugService {
  readonly #projects: ProjectService;
  readonly #sessions = new Map<string, ManagedDebugSession>();

  public constructor(projects: ProjectService) {
    this.#projects = projects;
  }

  public async start(input: {
    projectId: string;
    executable: string;
    arguments: string[];
    request: "launch" | "attach";
    configuration: Record<string, unknown>;
  }): Promise<DebugSession> {
    const project = this.#projects.get(input.projectId);
    const executable = path.resolve(input.executable);
    await access(executable);
    const protocol = new ProtocolSession("dap", executable, input.arguments, project.rootPath, { ...process.env });
    const snapshot: DebugSession = { id: protocol.id, state: "STARTING", adapter: executable, capabilities: {}, lastEvent: null };
    const managed: ManagedDebugSession = { protocol, snapshot };
    let launchPromise: Promise<ProtocolMessage> | null = null;
    this.#sessions.set(snapshot.id, managed);
    protocol.onMessage((message) => {
      managed.snapshot = { ...managed.snapshot, lastEvent: message };
      if (message.type === "event" && message.event === "stopped") managed.snapshot = { ...managed.snapshot, state: "PAUSED" };
      if (message.type === "event" && (message.event === "continued" || message.event === "process")) managed.snapshot = { ...managed.snapshot, state: "RUNNING" };
      if (message.type === "event" && (message.event === "terminated" || message.event === "exited")) managed.snapshot = { ...managed.snapshot, state: "STOPPED" };
    });
    try {
      const initialized = await protocol.request("initialize", {
        clientID: "devbox",
        clientName: "DevBox",
        adapterID: path.basename(executable),
        pathFormat: "path",
        linesStartAt1: true,
        columnsStartAt1: true,
        supportsVariableType: true,
        supportsRunInTerminalRequest: false
      });
      const capabilities = initialized.body && typeof initialized.body === "object" ? initialized.body as Record<string, unknown> : {};
      managed.snapshot = { ...managed.snapshot, capabilities };
      const adapterInitialized = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          unsubscribe();
          reject(new Error("DAP_INITIALIZED_EVENT_TIMEOUT"));
        }, 15_000);
        timeout.unref();
        const unsubscribe = protocol.onMessage((message) => {
          if (message.type !== "event" || message.event !== "initialized") return;
          clearTimeout(timeout);
          unsubscribe();
          resolve();
        });
      });
      // DAP launch/attach responses may deliberately wait for configurationDone. Start the
      // request first, wait for the adapter's initialized event, then close configuration.
      launchPromise = protocol.request(input.request, { ...input.configuration, request: input.request }, 45_000);
      await adapterInitialized;
      if (capabilities.supportsConfigurationDoneRequest !== false) {
        await protocol.request("configurationDone", {}, 15_000);
      }
      await launchPromise;
      managed.snapshot = { ...managed.snapshot, state: "RUNNING" };
      return managed.snapshot;
    } catch (error) {
      managed.snapshot = { ...managed.snapshot, state: "FAILED" };
      protocol.close();
      await launchPromise?.catch(() => undefined);
      this.#sessions.delete(snapshot.id);
      throw error;
    }
  }

  public async command(sessionId: string, command: string, args: Record<string, unknown>): Promise<DebugResponse> {
    const managed = this.#sessions.get(sessionId);
    if (!managed) throw new Error("DEBUG_SESSION_NOT_FOUND");
    const response = await managed.protocol.request(command, args);
    // The adapter's stopped/continued events are authoritative. Step requests resume the
    // debuggee until the adapter reports the next stopped event; a pause request does not
    // become PAUSED merely because the request was accepted.
    if (["continue", "next", "stepIn", "stepOut"].includes(command)) {
      managed.snapshot = { ...managed.snapshot, state: "RUNNING" };
    }
    return { session: managed.snapshot, body: response.body ?? null };
  }

  public async stop(sessionId: string): Promise<void> {
    const managed = this.#sessions.get(sessionId);
    if (!managed) return;
    await managed.protocol.request("disconnect", { restart: false, terminateDebuggee: true }, 10_000).catch(() => undefined);
    managed.protocol.close();
    this.#sessions.delete(sessionId);
  }

  public close(): void {
    for (const managed of this.#sessions.values()) managed.protocol.close();
    this.#sessions.clear();
  }
}
