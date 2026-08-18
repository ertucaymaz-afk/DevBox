import { existsSync } from "node:fs";
import { access } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { DebugResponse, DebugSession, EditorDiagnostic, LanguageDiagnosticsResult } from "../../shared/contracts.js";
import { resolveExistingPathWithinRoot } from "../security/path-boundary.js";
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

type DiagnosticPublication = { uri: string; diagnostics: EditorDiagnostic[] };

function normalizeDiagnostics(message: ProtocolMessage): DiagnosticPublication | null {
  if (message.method !== "textDocument/publishDiagnostics") return null;
  const params = message.params;
  if (!params || typeof params !== "object") return null;
  const record = params as Record<string, unknown>;
  if (typeof record.uri !== "string" || !record.uri) return null;
  const raw = record.diagnostics;
  if (!Array.isArray(raw)) return { uri: record.uri, diagnostics: [] };
  const diagnostics = raw.slice(0, 10_000).flatMap((entry): EditorDiagnostic[] => {
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
  return { uri: record.uri, diagnostics };
}

function sameDocumentUri(left: string, right: string): boolean {
  if (left === right) return true;
  try {
    const normalizePath = (value: string): string => {
      const resolved = path.resolve(fileURLToPath(value));
      return process.platform === "win32" ? resolved.toLocaleLowerCase("en-US") : resolved;
    };
    return normalizePath(left) === normalizePath(right);
  } catch {
    return false;
  }
}

type ManagedOpenDocument = { version: number; lastUsedAt: number };
type ManagedLanguageSession = {
  projectId: string;
  protocol: ProtocolSession;
  rootUri: string;
  openDocuments: Map<string, ManagedOpenDocument>;
  lastUsedAt: number;
  activeRequests: number;
  tail: Promise<void>;
};

const MAX_LANGUAGE_SESSIONS = 3;
const MAX_OPEN_DOCUMENTS_PER_SESSION = 64;

export class LanguageService {
  readonly #projects: ProjectService;
  readonly #languageSessions = new Map<string, ManagedLanguageSession>();
  readonly #languageSessionInit = new Map<string, Promise<ManagedLanguageSession>>();

  public constructor(projects: ProjectService) { this.#projects = projects; }

  #trimLanguageSessions(targetSize = MAX_LANGUAGE_SESSIONS): void {
    while (this.#languageSessions.size > targetSize) {
      const oldestIdle = [...this.#languageSessions.values()]
        .filter((session) => session.activeRequests === 0)
        .sort((left, right) => left.lastUsedAt - right.lastUsedAt)[0];
      if (!oldestIdle) return;
      this.closeLanguageSession(oldestIdle.projectId);
    }
  }

  #makeRoomForLanguageSession(): void {
    if (this.#languageSessions.size < MAX_LANGUAGE_SESSIONS) return;
    const oldestIdle = [...this.#languageSessions.values()]
      .filter((session) => session.activeRequests === 0)
      .sort((left, right) => left.lastUsedAt - right.lastUsedAt)[0];
    if (oldestIdle) this.closeLanguageSession(oldestIdle.projectId);
  }

  async #createLanguageSession(projectId: string): Promise<ManagedLanguageSession> {
    const project = this.#projects.get(projectId);
    this.#makeRoomForLanguageSession();
    const cli = require.resolve("typescript-language-server/lib/cli.mjs");
    const protocol = new ProtocolSession("lsp", process.execPath, [cli, "--stdio"], project.rootPath, { ...process.env, ELECTRON_RUN_AS_NODE: "1" });
    const rootUri = pathToFileURL(project.rootPath).toString();
    try {
      await protocol.request("initialize", {
        processId: null,
        rootUri,
        workspaceFolders: [{ uri: rootUri, name: project.name }],
        capabilities: { textDocument: { publishDiagnostics: { relatedInformation: true, versionSupport: true } } },
        initializationOptions: { preferences: { includeCompletionsForModuleExports: true } }
      }, 20_000);
      protocol.notify("initialized", {});
      const managed: ManagedLanguageSession = { projectId, protocol, rootUri, openDocuments: new Map(), lastUsedAt: Date.now(), activeRequests: 0, tail: Promise.resolve() };
      this.#languageSessions.set(projectId, managed);
      return managed;
    } catch (error) {
      protocol.close();
      throw error;
    }
  }

  async #getLanguageSession(projectId: string): Promise<ManagedLanguageSession> {
    const existing = this.#languageSessions.get(projectId);
    if (existing) { existing.lastUsedAt = Date.now(); return existing; }
    const pending = this.#languageSessionInit.get(projectId);
    if (pending) return await pending;
    const creation = this.#createLanguageSession(projectId);
    this.#languageSessionInit.set(projectId, creation);
    try { return await creation; }
    finally { this.#languageSessionInit.delete(projectId); }
  }

  public closeLanguageSession(projectId: string): void {
    const managed = this.#languageSessions.get(projectId);
    if (!managed) return;
    managed.protocol.close();
    this.#languageSessions.delete(projectId);
  }

  public activeLanguageSessions(): number { return this.#languageSessions.size; }

  #touchDocument(managed: ManagedLanguageSession, documentUri: string, requestedVersion: number): number {
    const existing = managed.openDocuments.get(documentUri);
    if (!existing && managed.openDocuments.size >= MAX_OPEN_DOCUMENTS_PER_SESSION) {
      const oldest = [...managed.openDocuments.entries()].sort((left, right) => left[1].lastUsedAt - right[1].lastUsedAt)[0];
      if (oldest) {
        managed.protocol.notify("textDocument/didClose", { textDocument: { uri: oldest[0] } });
        managed.openDocuments.delete(oldest[0]);
      }
    }
    const nextVersion = existing ? Math.max(existing.version + 1, requestedVersion) : Math.max(1, requestedVersion);
    managed.openDocuments.set(documentUri, { version: nextVersion, lastUsedAt: Date.now() });
    return nextVersion;
  }

  async #diagnosticsWithSession(managed: ManagedLanguageSession, input: { projectId: string; relativePath: string; language: string; content: string; version: number }): Promise<LanguageDiagnosticsResult> {
    const started = performance.now();
    const project = this.#projects.get(input.projectId);
    const absoluteFile = path.resolve(project.rootPath, input.relativePath);
    const relative = path.relative(project.rootPath, absoluteFile);
    if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("PATH_OUTSIDE_PROJECT");
    const documentUri = pathToFileURL(absoluteFile).toString();
    managed.lastUsedAt = Date.now();
    managed.activeRequests += 1;
    try {
      const published = new Promise<EditorDiagnostic[]>((resolve, reject) => {
        const timeout = setTimeout(() => { unsubscribe(); reject(new Error("LSP_DIAGNOSTICS_TIMEOUT")); }, 12_000);
        timeout.unref();
        const unsubscribe = managed.protocol.onMessage((message) => {
          const publication = normalizeDiagnostics(message);
          if (!publication || !sameDocumentUri(publication.uri, documentUri)) return;
          clearTimeout(timeout); unsubscribe(); resolve(publication.diagnostics);
        });
      });
      const wasOpen = managed.openDocuments.has(documentUri);
      const version = this.#touchDocument(managed, documentUri, input.version);
      if (wasOpen) {
        managed.protocol.notify("textDocument/didChange", { textDocument: { uri: documentUri, version }, contentChanges: [{ text: input.content }] });
      } else {
        managed.protocol.notify("textDocument/didOpen", { textDocument: { uri: documentUri, languageId: input.language, version, text: input.content } });
      }
      const diagnostics = await published;
      return { provider: "typescript-language-server", diagnostics, durationMs: Math.max(0, Math.round(performance.now() - started)) };
    } finally {
      managed.activeRequests = Math.max(0, managed.activeRequests - 1);
      managed.lastUsedAt = Date.now();
      this.#trimLanguageSessions();
    }
  }

  public async diagnostics(input: { projectId: string; relativePath: string; language: string; content: string; version: number }): Promise<LanguageDiagnosticsResult> {
    if (!SUPPORTED_LANGUAGES.has(input.language)) throw new Error("LANGUAGE_SERVER_UNSUPPORTED_LANGUAGE");
    const managed = await this.#getLanguageSession(input.projectId);
    const task = managed.tail.then(async () => await this.#diagnosticsWithSession(managed, input));
    managed.tail = task.then(() => undefined, () => undefined);
    try { return await task; }
    catch (error) { this.closeLanguageSession(input.projectId); throw error; }
  }

  public close(): void {
    for (const projectId of [...this.#languageSessions.keys()]) this.closeLanguageSession(projectId);
    this.#languageSessionInit.clear();
  }
}

type ManagedDebugSession = { protocol: ProtocolSession; snapshot: DebugSession; projectRoot: string; builtIn: boolean };

export const BUILTIN_JAVASCRIPT_DEBUG_ADAPTER = "devbox:javascript";

export function builtInJavaScriptAdapterFiles(): { proxy: string; server: string } {
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  const roots = [
    process.env.DEVBOX_JS_DEBUG_ROOT,
    resourcesPath ? path.join(resourcesPath, "vendor", "microsoft-js-debug") : undefined,
    path.resolve(process.cwd(), "vendor", "microsoft-js-debug")
  ].filter((candidate): candidate is string => Boolean(candidate));
  const root = roots.find((candidate) => existsSync(path.join(candidate, "devbox-stdio-proxy.mjs")) && existsSync(path.join(candidate, "src", "dapDebugServer.js")));
  if (!root) throw new Error("BUILTIN_JAVASCRIPT_DEBUG_ADAPTER_NOT_FOUND");
  return {
    proxy: path.join(root, "devbox-stdio-proxy.mjs"),
    server: path.join(root, "src", "dapDebugServer.js")
  };
}

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
    const builtIn = input.executable === BUILTIN_JAVASCRIPT_DEBUG_ADAPTER;
    const executable = builtIn ? process.execPath : path.resolve(input.executable);
    const files = builtIn ? builtInJavaScriptAdapterFiles() : null;
    await Promise.all([access(executable), ...(files ? [access(files.proxy), access(files.server)] : [])]);
    const adapterArguments = files ? [files.proxy, files.server] : input.arguments;
    const configuration = { ...input.configuration };
    if (builtIn && input.request === "launch") {
      const suppliedProgram = typeof configuration.program === "string" ? configuration.program.trim() : "";
      if (!suppliedProgram) throw new Error("JAVASCRIPT_DEBUG_PROGRAM_REQUIRED");
      const program = path.isAbsolute(suppliedProgram) ? path.normalize(suppliedProgram) : path.resolve(project.rootPath, suppliedProgram);
      const relativeProgram = path.relative(project.rootPath, program);
      if (relativeProgram.startsWith("..") || path.isAbsolute(relativeProgram)) throw new Error("JAVASCRIPT_DEBUG_PROGRAM_OUTSIDE_PROJECT");
      const suppliedCwd = typeof configuration.cwd === "string" ? configuration.cwd.trim() : "";
      const cwd = suppliedCwd ? (path.isAbsolute(suppliedCwd) ? path.normalize(suppliedCwd) : path.resolve(project.rootPath, suppliedCwd)) : project.rootPath;
      const relativeCwd = path.relative(project.rootPath, cwd);
      if (relativeCwd.startsWith("..") || path.isAbsolute(relativeCwd)) throw new Error("JAVASCRIPT_DEBUG_CWD_OUTSIDE_PROJECT");
      await Promise.all([access(program), access(cwd)]);
      Object.assign(configuration, {
        type: "pwa-node",
        name: typeof configuration.name === "string" && configuration.name.trim() ? configuration.name.trim() : "DevBox JavaScript",
        program,
        cwd,
        console: "internalConsole"
      });
    }
    const protocol = new ProtocolSession("dap", executable, adapterArguments, project.rootPath, {
      ...process.env,
      ...(builtIn ? { ELECTRON_RUN_AS_NODE: "1" } : {})
    });
    const adapterName = builtIn ? "Microsoft vscode-js-debug 1.117.0" : executable;
    const snapshot: DebugSession = { id: protocol.id, state: "STARTING", adapter: adapterName, capabilities: {}, lastEvent: null };
    const managed: ManagedDebugSession = { protocol, snapshot, projectRoot: project.rootPath, builtIn };
    let launchPromise: Promise<ProtocolMessage> | null = null;
    this.#sessions.set(snapshot.id, managed);
    protocol.onMessage((message) => {
      managed.snapshot = { ...managed.snapshot, lastEvent: message };
      if (message.type === "event" && message.event === "stopped") managed.snapshot = { ...managed.snapshot, state: "PAUSED" };
      if (message.type === "event" && (message.event === "continued" || message.event === "process")) managed.snapshot = { ...managed.snapshot, state: "RUNNING" };
      if (message.type === "event" && (message.event === "terminated" || message.event === "exited")) managed.snapshot = { ...managed.snapshot, state: "STOPPED" };
    });
    try {
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
      const initialized = await protocol.request("initialize", {
        clientID: "devbox",
        clientName: "DevBox",
        adapterID: builtIn ? "pwa-node" : path.basename(executable),
        pathFormat: "path",
        linesStartAt1: true,
        columnsStartAt1: true,
        supportsVariableType: true,
        supportsRunInTerminalRequest: false
      });
      const capabilities = initialized.body && typeof initialized.body === "object" ? initialized.body as Record<string, unknown> : {};
      managed.snapshot = { ...managed.snapshot, capabilities };
      launchPromise = protocol.request(input.request, { ...configuration, request: input.request }, 45_000);
      await adapterInitialized;
      if (capabilities.supportsConfigurationDoneRequest !== false) {
        await protocol.request("configurationDone", {}, 15_000);
      }
      const launched = await launchPromise;
      if (launched.success === false) throw new Error(`DAP_${input.request.toUpperCase()}_FAILED:${launched.message ?? "UNKNOWN"}`);
      managed.snapshot = { ...managed.snapshot, state: "RUNNING" };
      return managed.snapshot;
    } catch (error) {
      protocol.close();
      this.#sessions.delete(snapshot.id);
      throw error;
    }
  }

  public list(): DebugSession[] { return [...this.#sessions.values()].map((item) => item.snapshot); }

  public async command(sessionId: string, command: string, args: unknown): Promise<DebugResponse> {
    const managed = this.#sessions.get(sessionId);
    if (!managed) throw new Error("DEBUG_SESSION_NOT_FOUND");
    if (command === "setBreakpoints" && args && typeof args === "object" && !Array.isArray(args)) {
      const input = args as Record<string, unknown>;
      const source = input.source;
      if (source && typeof source === "object" && !Array.isArray(source)) {
        const sourcePath = (source as Record<string, unknown>).path;
        if (typeof sourcePath === "string" && sourcePath.trim()) {
          await resolveExistingPathWithinRoot(managed.projectRoot, sourcePath);
        }
      }
    }
    const response = await managed.protocol.request(command, args, 30_000);
    return { command, success: response.success !== false, message: response.message ?? null, body: response.body ?? null };
  }

  public async stop(sessionId: string): Promise<DebugSession> {
    const managed = this.#sessions.get(sessionId);
    if (!managed) throw new Error("DEBUG_SESSION_NOT_FOUND");
    try { await managed.protocol.request("disconnect", { restart: false, terminateDebuggee: true }, 5_000); }
    catch { /* closing the transport is the fail-safe */ }
    managed.protocol.close();
    managed.snapshot = { ...managed.snapshot, state: "STOPPED" };
    this.#sessions.delete(sessionId);
    return managed.snapshot;
  }

  public close(): void {
    for (const managed of this.#sessions.values()) managed.protocol.close();
    this.#sessions.clear();
  }
}
