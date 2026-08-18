import { readFile, writeFile } from "node:fs/promises";

function replaceUnique(source, before, after, label) {
  const at = source.indexOf(before);
  if (at < 0 || at !== source.lastIndexOf(before)) throw new Error(`V015_ANCHOR_INVALID:${label}`);
  return source.slice(0, at) + after + source.slice(at + before.length);
}
async function edit(file, transform) {
  const source = (await readFile(file, "utf8")).replace(/\r\n?/gu, "\n");
  const next = transform(source);
  if (next === source) throw new Error(`V015_NO_CHANGE:${file}`);
  await writeFile(file, next, "utf8");
}

const pkgText = await readFile("package.json", "utf8");
if (/"version"\s*:\s*"0\.1\.15"/u.test(pkgText)) {
  const required = [
    "src/main/services/evolution-finding-service.ts",
    "src/main/services/release-gate-service.ts",
    "src/main/services/cloud-control-service.ts",
    "src/renderer/DevApiControlWorkspace.tsx"
  ];
  await Promise.all(required.map(async (file) => await readFile(file, "utf8")));
  console.log("DEVBOX_V015_ALREADY_MATERIALIZED");
  process.exit(0);
}

await edit("package.json", (source) => {
  let next = replaceUnique(source, '"version": "0.1.14"', '"version": "0.1.15"', "package-version");
  next = replaceUnique(next, '"evolution:verify": "node scripts/verify-api-evolution-v7.mjs"', '"evolution:verify": "node scripts/verify-api-evolution-v8.mjs"', "evolution-verifier");
  return next;
});

await edit("src/shared/contracts.ts", (source) => replaceUnique(source,
`  evolutionModelCatalog: "devbox:v1:evolution:model-catalog",
  integrationInspect: "devbox:v1:integration:inspect",`,
`  evolutionModelCatalog: "devbox:v1:evolution:model-catalog",
  devApiControlGet: "devbox:v1:devapi:control-get",
  evolutionFindingTransition: "devbox:v1:devapi:finding-transition",
  releaseGateRun: "devbox:v1:devapi:release-gate-run",
  cloudControlSync: "devbox:v1:devapi:cloud-sync",
  integrationInspect: "devbox:v1:integration:inspect",`, "ipc-contracts"));

await edit("src/shared/bridge.ts", (source) => {
  let next = replaceUnique(source, `} from "./contracts.js";\n\nexport interface DevBoxBridge {`, `} from "./contracts.js";\nimport type { CloudControlStatus, DevApiControlSnapshot, EvolutionFinding, ReleaseGateRun } from "./devapi-control-contracts.js";\n\nexport interface DevBoxBridge {`, "bridge-control-import");
  next = replaceUnique(next,
`  runEvolutionCycle(projectId: string): Promise<EvolutionCampaign>;
  inspectIntegrations(projectId?: string): Promise<IntegrationStatus[]>;`,
`  runEvolutionCycle(projectId: string): Promise<EvolutionCampaign>;
  getDevApiControl(projectId: string): Promise<DevApiControlSnapshot>;
  transitionEvolutionFinding(projectId: string, findingId: string, status: "RESOLVED" | "REJECTED", resolution: string): Promise<EvolutionFinding>;
  runReleaseGate(projectId: string, mode: "PREFLIGHT" | "FULL"): Promise<ReleaseGateRun>;
  syncDevApiCloud(projectId: string): Promise<CloudControlStatus>;
  inspectIntegrations(projectId?: string): Promise<IntegrationStatus[]>;`, "bridge-control-methods");
  return next;
});

await edit("src/preload/preload.cts", (source) => {
  let next = replaceUnique(source,
`  ,evolutionModelCatalog: "devbox:v1:evolution:model-catalog"
  ,integrationInspect: "devbox:v1:integration:inspect"`,
`  ,evolutionModelCatalog: "devbox:v1:evolution:model-catalog"
  ,devApiControlGet: "devbox:v1:devapi:control-get"
  ,evolutionFindingTransition: "devbox:v1:devapi:finding-transition"
  ,releaseGateRun: "devbox:v1:devapi:release-gate-run"
  ,cloudControlSync: "devbox:v1:devapi:cloud-sync"
  ,integrationInspect: "devbox:v1:integration:inspect"`, "preload-channels");
  next = replaceUnique(next,
`  runEvolutionCycle: async (projectId: string) => await ipcRenderer.invoke(CHANNELS.evolutionRun, { projectId }),
  inspectIntegrations: async (projectId?: string) => await ipcRenderer.invoke(CHANNELS.integrationInspect, projectId ? { projectId } : {}),`,
`  runEvolutionCycle: async (projectId: string) => await ipcRenderer.invoke(CHANNELS.evolutionRun, { projectId }),
  getDevApiControl: async (projectId: string) => await ipcRenderer.invoke(CHANNELS.devApiControlGet, { projectId }),
  transitionEvolutionFinding: async (projectId: string, findingId: string, status: "RESOLVED" | "REJECTED", resolution: string) => await ipcRenderer.invoke(CHANNELS.evolutionFindingTransition, { projectId, findingId, status, resolution }),
  runReleaseGate: async (projectId: string, mode: "PREFLIGHT" | "FULL") => await ipcRenderer.invoke(CHANNELS.releaseGateRun, { projectId, mode }),
  syncDevApiCloud: async (projectId: string) => await ipcRenderer.invoke(CHANNELS.cloudControlSync, { projectId }),
  inspectIntegrations: async (projectId?: string) => await ipcRenderer.invoke(CHANNELS.integrationInspect, projectId ? { projectId } : {}),`, "preload-control-methods");
  return next;
});

await edit("src/main/services/thread-turn-coordinator.ts", (source) => replaceUnique(source,
`  public snapshot(threadId: string): ThreadQueueSnapshot {
    const state = this.#queues.get(threadId);
    return { threadId, queued: state?.queued ?? 0, running: state?.running ?? false };
  }

  public run<T>`,
`  public snapshot(threadId: string): ThreadQueueSnapshot {
    const state = this.#queues.get(threadId);
    return { threadId, queued: state?.queued ?? 0, running: state?.running ?? false };
  }

  public snapshots(): ThreadQueueSnapshot[] {
    return [...this.#queues.entries()]
      .map(([threadId, state]) => ({ threadId, queued: state.queued, running: state.running }))
      .sort((left, right) => Number(right.running) - Number(left.running) || right.queued - left.queued || left.threadId.localeCompare(right.threadId));
  }

  public run<T>`, "fifo-snapshots"));

await edit("src/main/services/language-debug-service.ts", (source) => {
  const start = source.indexOf("function normalizeDiagnostics(message: ProtocolMessage)");
  const end = source.indexOf("\ntype ManagedDebugSession", start);
  if (start < 0 || end < 0 || end <= start) throw new Error("V015_LANGUAGE_BLOCK_NOT_FOUND");
  const replacement = `type DiagnosticPublication = { uri: string; diagnostics: EditorDiagnostic[] };

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

type ManagedLanguageSession = {
  projectId: string;
  protocol: ProtocolSession;
  rootUri: string;
  openDocuments: Set<string>;
  lastUsedAt: number;
  tail: Promise<void>;
};

const MAX_LANGUAGE_SESSIONS = 3;

export class LanguageService {
  readonly #projects: ProjectService;
  readonly #languageSessions = new Map<string, ManagedLanguageSession>();
  readonly #languageSessionInit = new Map<string, Promise<ManagedLanguageSession>>();

  public constructor(projects: ProjectService) { this.#projects = projects; }

  async #createLanguageSession(projectId: string): Promise<ManagedLanguageSession> {
    const project = this.#projects.get(projectId);
    while (this.#languageSessions.size >= MAX_LANGUAGE_SESSIONS) {
      const oldest = [...this.#languageSessions.values()].sort((left, right) => left.lastUsedAt - right.lastUsedAt)[0];
      if (!oldest) break;
      this.closeLanguageSession(oldest.projectId);
    }
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
      const managed: ManagedLanguageSession = { projectId, protocol, rootUri, openDocuments: new Set(), lastUsedAt: Date.now(), tail: Promise.resolve() };
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

  async #diagnosticsWithSession(managed: ManagedLanguageSession, input: { projectId: string; relativePath: string; language: string; content: string; version: number }): Promise<LanguageDiagnosticsResult> {
    const started = performance.now();
    const project = this.#projects.get(input.projectId);
    const absoluteFile = path.resolve(project.rootPath, input.relativePath);
    const relative = path.relative(project.rootPath, absoluteFile);
    if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("PATH_OUTSIDE_PROJECT");
    const documentUri = pathToFileURL(absoluteFile).toString();
    managed.lastUsedAt = Date.now();
    const published = new Promise<EditorDiagnostic[]>((resolve, reject) => {
      const timeout = setTimeout(() => { unsubscribe(); reject(new Error("LSP_DIAGNOSTICS_TIMEOUT")); }, 12_000);
      timeout.unref();
      const unsubscribe = managed.protocol.onMessage((message) => {
        const publication = normalizeDiagnostics(message);
        if (!publication || publication.uri !== documentUri) return;
        clearTimeout(timeout); unsubscribe(); resolve(publication.diagnostics);
      });
    });
    if (managed.openDocuments.has(documentUri)) {
      managed.protocol.notify("textDocument/didChange", { textDocument: { uri: documentUri, version: input.version }, contentChanges: [{ text: input.content }] });
    } else {
      managed.openDocuments.add(documentUri);
      managed.protocol.notify("textDocument/didOpen", { textDocument: { uri: documentUri, languageId: input.language, version: input.version, text: input.content } });
    }
    const diagnostics = await published;
    return { provider: "typescript-language-server", diagnostics, durationMs: Math.max(0, Math.round(performance.now() - started)) };
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
`;
  return source.slice(0, start) + replacement + source.slice(end);
});

await edit("src/main/services/language-debug-service.test.ts", (source) => replaceUnique(source,
`    const content = "const count: number = 'not-a-number';\\n";
    const result = await new LanguageService(projects).diagnostics({
      projectId: project.id, relativePath: "sample.ts", language: "typescript", content, version: 1
    });
    expect(result.provider).toBe("typescript-language-server");
    expect(result.diagnostics.some((item) => item.severity === "error" && /string|number/iu.test(item.message))).toBe(true);`,
`    const content = "const count: number = 'not-a-number';\\n";
    const service = new LanguageService(projects);
    try {
      const result = await service.diagnostics({ projectId: project.id, relativePath: "sample.ts", language: "typescript", content, version: 1 });
      expect(result.provider).toBe("typescript-language-server");
      expect(result.diagnostics.some((item) => item.severity === "error" && /string|number/iu.test(item.message))).toBe(true);
      const fixed = await service.diagnostics({ projectId: project.id, relativePath: "sample.ts", language: "typescript", content: "const count: number = 42;\\n", version: 2 });
      expect(fixed.diagnostics.some((item) => item.severity === "error")).toBe(false);
      expect(service.activeLanguageSessions()).toBe(1);
    } finally {
      service.close();
    }`, "language-test-pool"));

await edit("src/main/ipc.ts", (source) => {
  let next = replaceUnique(source, `} from "../shared/contracts.js";\nimport type { CapabilityService }`, `} from "../shared/contracts.js";\nimport { CloudControlStatusSchema, DevApiControlSnapshotSchema, EvolutionFindingSchema, FindingTransitionInputSchema, ProjectIdControlInputSchema, ReleaseGateRunInputSchema, ReleaseGateRunSchema } from "../shared/devapi-control-contracts.js";\nimport type { CapabilityService }`, "ipc-control-schemas");
  next = replaceUnique(next, `import type { ApiEvolutionService } from "./services/api-evolution-service.js";`, `import type { ApiEvolutionService } from "./services/api-evolution-service.js";\nimport type { CloudControlService } from "./services/cloud-control-service.js";\nimport type { EvolutionFindingService } from "./services/evolution-finding-service.js";\nimport type { ReleaseGateService } from "./services/release-gate-service.js";`, "ipc-control-service-imports");
  next = replaceUnique(next,
`  evolution: ApiEvolutionService;
  attachments: AttachmentService;`,
`  evolution: ApiEvolutionService;
  findings: EvolutionFindingService;
  releaseGate: ReleaseGateService;
  cloudControl: CloudControlService;
  attachments: AttachmentService;`, "ipc-control-services");
  next = replaceUnique(next,
`        const code = error instanceof Error ? error.message : "AGENT_UNKNOWN_FAILURE";
        publishActivity({ kind: "failure", message: \`Ajan çalıştırması başarısız oldu · \${code}.\`, createdAt: new Date().toISOString() });`,
`        const code = error instanceof Error ? error.message : "AGENT_UNKNOWN_FAILURE";
        services.findings.report({ projectId: project.id, source: "agent-service", key: code, title: \`AgentService · \${code}\`, detail: error instanceof Error ? error.message : String(error), severity: workspaceIntent ? "HIGH" : "MEDIUM", owner: "agent", track: workspaceIntent ? "coding" : "quality", evidence: [\`thread:\${input.threadId}\`, workspaceIntent ? "workspace-mutation" : "chat"] });
        publishActivity({ kind: "failure", message: \`Ajan çalıştırması başarısız oldu · \${code}.\`, createdAt: new Date().toISOString() });`, "ipc-agent-finding");
  next = replaceUnique(next,
`  registerHandler(IPC_CHANNELS.evolutionRun, services.rendererWebContentsId, async (unknownInput) => {
    const input = ProjectIdInputSchema.parse(unknownInput);
    // “Şimdi çalıştır” tıklaması sürekli self-development döngüsünü başlatan açık kullanıcı eylemidir.
    // Döngü Durdurulana, gerçek harici engel çıkana veya görev grafiği bitene kadar otomatik ilerler.
    return EvolutionCampaignSchema.parse(await services.evolution.runNow(input.projectId));
  });

  registerHandler(IPC_CHANNELS.integrationInspect`,
`  registerHandler(IPC_CHANNELS.evolutionRun, services.rendererWebContentsId, async (unknownInput) => {
    const input = ProjectIdInputSchema.parse(unknownInput);
    // “Şimdi çalıştır” tıklaması sürekli self-development döngüsünü başlatan açık kullanıcı eylemidir.
    // Döngü Durdurulana, gerçek harici engel çıkana veya görev grafiği bitene kadar otomatik ilerler.
    return EvolutionCampaignSchema.parse(await services.evolution.runNow(input.projectId));
  });

  registerHandler(IPC_CHANNELS.devApiControlGet, services.rendererWebContentsId, async (unknownInput) => {
    const input = ProjectIdControlInputSchema.parse(unknownInput);
    const campaign = services.evolution.get(input.projectId);
    const findings = services.findings.reconcileCampaign(input.projectId, campaign);
    return DevApiControlSnapshotSchema.parse({ campaign, findings, releaseGate: services.releaseGate.latest(input.projectId), releaseHistory: services.releaseGate.history(input.projectId), cloud: services.cloudControl.status(input.projectId), queues: services.turnCoordinator.snapshots(), generatedAt: new Date().toISOString() });
  });

  registerHandler(IPC_CHANNELS.evolutionFindingTransition, services.rendererWebContentsId, async (unknownInput) => {
    const input = FindingTransitionInputSchema.parse(unknownInput);
    return EvolutionFindingSchema.parse(services.findings.transition(input.projectId, input.findingId, input.status, input.resolution));
  });

  registerHandler(IPC_CHANNELS.releaseGateRun, services.rendererWebContentsId, async (unknownInput, event) => {
    const input = ReleaseGateRunInputSchema.parse(unknownInput);
    services.findings.reconcileCampaign(input.projectId, services.evolution.get(input.projectId));
    await enforcePermissionPolicy(event, services, { title: "Release gate", message: \`\${input.mode} release doğrulaması gerçek proje komutlarıyla çalıştırılsın mı?\`, detail: input.mode === "FULL" ? "TypeScript, evolution/truth kapıları, test ve production build gerçek süreçlerde çalışır." : "Preflight daha kısa fail-closed doğrulamaları çalıştırır.", risky: input.mode === "FULL" });
    return ReleaseGateRunSchema.parse(await services.releaseGate.run(input.projectId, input.mode));
  });

  registerHandler(IPC_CHANNELS.cloudControlSync, services.rendererWebContentsId, async (unknownInput) => {
    const input = ProjectIdControlInputSchema.parse(unknownInput);
    return CloudControlStatusSchema.parse(await services.cloudControl.sync(input.projectId));
  });

  registerHandler(IPC_CHANNELS.integrationInspect`, "ipc-control-handlers");
  return next;
});

await edit("src/main/main.ts", (source) => {
  let next = replaceUnique(source, `import { ApiEvolutionService } from "./services/api-evolution-service.js";`, `import { ApiEvolutionService } from "./services/api-evolution-service.js";\nimport { CloudControlService } from "./services/cloud-control-service.js";\nimport { EvolutionFindingService } from "./services/evolution-finding-service.js";`, "main-control-imports-a");
  next = replaceUnique(next, `import { RemoteWorkerService } from "./services/remote-worker-service.js";`, `import { RemoteWorkerService } from "./services/remote-worker-service.js";\nimport { ReleaseGateService } from "./services/release-gate-service.js";`, "main-control-imports-b");
  next = replaceUnique(next,
`let localCatalog: LocalCatalogService | null = null;
let debugService: DebugService | null = null;`,
`let localCatalog: LocalCatalogService | null = null;
let debugService: DebugService | null = null;
let languageService: LanguageService | null = null;
let cloudControlService: CloudControlService | null = null;`, "main-control-globals");
  next = replaceUnique(next,
`  const memory = new MemoryService(database);
  const turnCoordinator = new ThreadTurnCoordinator();`,
`  const memory = new MemoryService(database);
  const findings = new EvolutionFindingService(database);
  const turnCoordinator = new ThreadTurnCoordinator();`, "main-findings");
  next = replaceUnique(next,
`  evolution = new ApiEvolutionService(database, projects, agent, settings, developmentSpec, git, runner, worktrees);
  const previewRender`,
`  evolution = new ApiEvolutionService(database, projects, agent, settings, developmentSpec, git, runner, worktrees);
  const releaseGate = new ReleaseGateService(database, projects, git, runner, findings);
  cloudControlService = new CloudControlService(database, projects, evolution, findings, releaseGate, memory);
  const previewRender`, "main-control-services");
  next = replaceUnique(next, `  const language = new LanguageService(projects);\n  debugService`, `  languageService = new LanguageService(projects);\n  const language = languageService;\n  debugService`, "main-language-pool");
  next = replaceUnique(next,
`    evolution,
    settings,`,
`    evolution,
    findings,
    releaseGate,
    cloudControl: cloudControlService,
    settings,`, "main-core-options");
  next = replaceUnique(next,
`    turnCoordinator,
    evolution,
    attachments,`,
`    turnCoordinator,
    evolution,
    findings,
    releaseGate,
    cloudControl: cloudControlService,
    attachments,`, "main-ipc-options");
  next = replaceUnique(next, `  evolution.start();\n}`, `  evolution.start();\n  cloudControlService.start();\n}`, "main-cloud-start");
  next = replaceUnique(next,
`  evolution?.stop();
  evolution = null;
  const runner = commandRunner;`,
`  evolution?.stop();
  evolution = null;
  cloudControlService?.stop();
  cloudControlService = null;
  languageService?.close();
  languageService = null;
  const runner = commandRunner;`, "main-control-stop");
  return next;
});

await edit("src/main/services/core-api.ts", (source) => {
  let next = replaceUnique(source, `import type { ApiEvolutionService } from "./api-evolution-service.js";`, `import type { ApiEvolutionService } from "./api-evolution-service.js";\nimport type { CloudControlService } from "./cloud-control-service.js";\nimport type { EvolutionFindingService } from "./evolution-finding-service.js";\nimport type { ReleaseGateService } from "./release-gate-service.js";`, "core-control-imports");
  next = replaceUnique(next, `  evolution: ApiEvolutionService;\n  attachments: AttachmentService;`, `  evolution: ApiEvolutionService;\n  findings: EvolutionFindingService;\n  releaseGate: ReleaseGateService;\n  cloudControl: CloudControlService;\n  attachments: AttachmentService;`, "core-control-options");
  next = replaceUnique(next, `const EvolutionPatchBodySchema = z.object({`, `const ReleaseGateBodySchema = z.object({ mode: z.enum(["PREFLIGHT", "FULL"]).default("PREFLIGHT") }).strict();\nconst FindingParamsSchema = z.object({ id: z.string().min(8).max(128), findingId: z.string().uuid() }).strict();\nconst FindingPatchBodySchema = z.object({ status: z.enum(["RESOLVED", "REJECTED"]), resolution: z.string().trim().min(3).max(2_000) }).strict();\n\nconst EvolutionPatchBodySchema = z.object({`, "core-control-schemas");
  next = replaceUnique(next,
`    throw new Error(code);
  }

  if (!before`,
`    options.findings.report({ projectId: input.projectId, source: "agent-service", key: code, title: \`AgentService · \${code}\`, detail: error instanceof Error ? error.message : String(error), severity: workspaceIntent ? "HIGH" : "MEDIUM", owner: "agent", track: workspaceIntent ? "coding" : "quality", evidence: [\`thread:\${input.threadId}\`, workspaceIntent ? "workspace-mutation" : "core-api-chat"] });
    throw new Error(code);
  }

  if (!before`, "core-agent-finding");
  next = replaceUnique(next,
`      resources: ["runtime", "capabilities", "providers", "models", "projects", "threads", "memory", "evolution", "approvals", "git", "toolkits", "skills", "plugins", "mcp", "vercel", "github", "diagnostics"]`,
`      resources: ["runtime", "capabilities", "providers", "models", "projects", "threads", "memory", "evolution", "findings", "release-gates", "cloud-control", "approvals", "git", "toolkits", "skills", "plugins", "mcp", "vercel", "github", "diagnostics"]`, "core-resources");
  next = replaceUnique(next,
`    this.#server.get("/v1/capabilities", async () => ({`,
`    this.#server.get("/v1/runtime/queues", async () => ({ items: this.#options.turnCoordinator.snapshots() }));
    this.#server.get("/v1/capabilities", async () => ({`, "core-queue-route");
  next = replaceUnique(next,
`    this.#server.post("/v1/projects/:id/evolution/cancel", async (request) => {
      const params = IdParamsSchema.parse(request.params);
      return { item: this.#options.evolution.cancel(params.id) };
    });
    this.#server.get("/v1/threads",`,
`    this.#server.post("/v1/projects/:id/evolution/cancel", async (request) => {
      const params = IdParamsSchema.parse(request.params);
      return { item: this.#options.evolution.cancel(params.id) };
    });
    this.#server.get("/v1/projects/:id/findings", async (request) => {
      const params = IdParamsSchema.parse(request.params);
      const campaign = this.#options.evolution.get(params.id);
      return this.#options.findings.reconcileCampaign(params.id, campaign);
    });
    this.#server.patch("/v1/projects/:id/findings/:findingId", async (request) => {
      const params = FindingParamsSchema.parse(request.params);
      const body = FindingPatchBodySchema.parse(request.body);
      return { item: this.#options.findings.transition(params.id, params.findingId, body.status, body.resolution) };
    });
    this.#server.get("/v1/projects/:id/release-gates", async (request) => {
      const params = IdParamsSchema.parse(request.params);
      return { latest: this.#options.releaseGate.latest(params.id), items: this.#options.releaseGate.history(params.id) };
    });
    this.#server.post("/v1/projects/:id/release-gates", async (request, reply) => {
      const params = IdParamsSchema.parse(request.params);
      const body = ReleaseGateBodySchema.parse(request.body ?? {});
      if (body.mode === "FULL" && this.#options.settings.get().approvalPolicy === "always") throw new Error("API_INTERACTIVE_APPROVAL_REQUIRED");
      this.#options.findings.reconcileCampaign(params.id, this.#options.evolution.get(params.id));
      return await reply.code(202).send({ item: await this.#options.releaseGate.run(params.id, body.mode) });
    });
    this.#server.get("/v1/projects/:id/cloud-control", async (request) => {
      const params = IdParamsSchema.parse(request.params);
      return { item: this.#options.cloudControl.status(params.id) };
    });
    this.#server.post("/v1/projects/:id/cloud-control/sync", async (request) => {
      const params = IdParamsSchema.parse(request.params);
      return { item: await this.#options.cloudControl.sync(params.id) };
    });
    this.#server.get("/v1/threads",`, "core-control-routes");
  return next;
});

await edit("src/shared/devapi-control-contracts.ts", (source) => replaceUnique(source,
`  cloud: CloudControlStatusSchema,
  generatedAt: z.string().datetime()`,
`  cloud: CloudControlStatusSchema,
  queues: z.array(z.object({ threadId: z.string(), queued: z.number().int().nonnegative(), running: z.boolean() }).strict()).max(500),
  generatedAt: z.string().datetime()`, "control-queue-contract"));

await edit("src/renderer/DevApiControlWorkspace.tsx", (source) => replaceUnique(source,
`      <article className={snapshot.cloud.state === "READY" ? "ready" : "limited"}>{snapshot.cloud.state === "READY" ? <Cloud size={20} /> : <CloudOff size={20} />}<span>Cloud kontrol</span><strong>{snapshot.cloud.state}</strong><small>{snapshot.cloud.configured ? snapshot.cloud.endpoint : "DEVBOX_CONTROL_PLANE_URL/TOKEN yapılandırılmadı"}</small></article>
    </div>`,
`      <article className={snapshot.cloud.state === "READY" ? "ready" : "limited"}>{snapshot.cloud.state === "READY" ? <Cloud size={20} /> : <CloudOff size={20} />}<span>Cloud kontrol</span><strong>{snapshot.cloud.state}</strong><small>{snapshot.cloud.configured ? snapshot.cloud.endpoint : "DEVBOX_CONTROL_PLANE_URL/TOKEN yapılandırılmadı"}</small></article>
      <article><Activity size={20} /><span>FIFO / aktif turn</span><strong>{snapshot.queues.filter((item) => item.running).length}</strong><small>{snapshot.queues.reduce((sum, item) => sum + item.queued, 0)} aynı-thread istek kuyrukta · farklı thread'ler paralel</small></article>
    </div>`, "control-fifo-card"));

await edit("src/renderer/AdvancedViews.tsx", (source) => {
  let next = replaceUnique(source, `import type {`, `import { DEVBOX_DAY_THEME, DEVBOX_OBSIDIAN_THEME } from "../shared/theme-presets";\nimport type {`, "advanced-theme-import");
  next = replaceUnique(next,
`export function TerminalWorkspace({ project }: { project: ProjectSummary | null }): ReactNode {`,
`export function TerminalWorkspace({ project, settings }: { project: ProjectSummary | null; settings: AppSettings | null }): ReactNode {`, "terminal-theme-prop");
  next = replaceUnique(next,
`        theme: { background: "#0b0b0b", foreground: "#dddddd", cursor: "#f2f2f2", selectionBackground: "#3e3e3e" }`,
`        theme: settings?.theme.base === "light"
          ? { background: "#ffffff", foreground: "#182027", cursor: "#182027", selectionBackground: "#cfe2f3" }
          : { background: "#0b0b0b", foreground: "#dddddd", cursor: "#f2f2f2", selectionBackground: "#3e3e3e" }`, "terminal-light-theme");
  next = replaceUnique(next, `  }, [reload]);\n\n  useEffect(() => { void reload()`, `  }, [reload, settings?.theme.base]);\n\n  useEffect(() => { void reload()`, "terminal-theme-dependency");
  next = replaceUnique(next,
`      {section === "appearance" && <section><h2>Görünüm</h2><div className="settings-grid">`,
`      {section === "appearance" && <section><h2>Görünüm</h2><div className="theme-presets" aria-label="Yerleşik tema seçimi"><button className={settings.theme.base === "dark" ? "active" : ""} onClick={() => void patch({ theme: DEVBOX_OBSIDIAN_THEME })}>Obsidyen · koyu</button><button className={settings.theme.base === "light" ? "active" : ""} onClick={() => void patch({ theme: DEVBOX_DAY_THEME })}>Gündüz · açık</button></div><div className="settings-grid">`, "settings-theme-presets");
  return next;
});

await edit("src/renderer/App.tsx", (source) => {
  let next = replaceUnique(source, `  Search,\n  Send,`, `  Search,\n  Send,\n  Sun,\n  Moon,`, "app-theme-icons");
  next = replaceUnique(next, `} from "../shared/contracts";\nimport {`, `} from "../shared/contracts";\nimport { DEVBOX_DAY_THEME, DEVBOX_OBSIDIAN_THEME } from "../shared/theme-presets";\nimport {`, "app-theme-import");
  next = replaceUnique(next, `import { CanvasInspector } from "./CanvasInspector";`, `import { CanvasInspector } from "./CanvasInspector";\nimport { DevApiControlWorkspace } from "./DevApiControlWorkspace";`, "app-control-import");
  next = replaceUnique(next, `type View = "thread" | "files" | "git" | "runs" | "sites" | "capabilities" | "settings" | "terminal" | "worktrees" | "automations"`, `type View = "thread" | "files" | "git" | "runs" | "sites" | "capabilities" | "settings" | "terminal" | "worktrees" | "devapi" | "automations"`, "app-devapi-view");
  next = replaceUnique(next,
`                  : view === "automations" ? "DevBox API gelişimi"`,
`                  : view === "devapi" ? "DevAPI komuta merkezi"
                    : view === "automations" ? "API görev motoru"`, "app-devapi-title");
  next = replaceUnique(next,
`    <div style={themeStyle(appSettings)} className={\`app-shell \${sidebarVisible ? "" : "sidebar-hidden"}`, 
`    <div data-theme-base={appSettings?.theme.base ?? "dark"} style={themeStyle(appSettings)} className={\`app-shell \${sidebarVisible ? "" : "sidebar-hidden"}`, "app-theme-data");
  next = replaceUnique(next,
`<div className="system-left"><button onClick={() => setSidebarVisible((value) => !value)} aria-label="Kenar çubuğu">`,
`<div className="system-left"><button onClick={() => setSidebarVisible((value) => !value)} aria-label="Kenar çubuğu">`, "app-system-left-stability");
  next = replaceUnique(next,
`<button onClick={() => void handleMenu("help")}>Yardım</button></nav></div>
      </header>`,
`<button onClick={() => void handleMenu("help")}>Yardım</button></nav></div><div className="system-theme"><button onClick={() => { if (!appSettings) return; void window.devbox.patchSettings({ theme: appSettings.theme.base === "light" ? DEVBOX_OBSIDIAN_THEME : DEVBOX_DAY_THEME }).then((nextSettings) => { setAppSettings(nextSettings); setPermission(nextSettings.permissionProfile); }); }} title={appSettings?.theme.base === "light" ? "Koyu moda geç" : "Gündüz moduna geç"} aria-label="Tema modunu değiştir">{appSettings?.theme.base === "light" ? <Moon size={15} /> : <Sun size={15} />}</button></div>
      </header>`, "app-theme-toggle");
  next = replaceUnique(next,
`            <button className={view === "automations" ? "active" : ""} onClick={() => setView("automations")}><ListChecks size={16} /><span>API gelişimi</span></button>`,
`            <button className={view === "devapi" ? "active" : ""} onClick={() => setView("devapi")}><ListChecks size={16} /><span>DevAPI</span></button>
            <button className={view === "automations" ? "active" : ""} onClick={() => setView("automations")}><Activity size={16} /><span>Görev motoru</span></button>`, "app-devapi-nav");
  next = replaceUnique(next, `{view === "terminal" && <TerminalWorkspace project={selectedProject} />}`, `{view === "terminal" && <TerminalWorkspace project={selectedProject} settings={appSettings} />}`, "app-terminal-settings");
  next = replaceUnique(next,
`            {view === "worktrees" && <WorktreeWorkspace project={selectedProject} />}
            {view === "automations" && <AutomationWorkspace project={selfDevelopmentProject ?? selectedProject} />}`, 
`            {view === "worktrees" && <WorktreeWorkspace project={selectedProject} />}
            {view === "devapi" && <DevApiControlWorkspace project={selfDevelopmentProject ?? selectedProject} />}
            {view === "automations" && <AutomationWorkspace project={selfDevelopmentProject ?? selectedProject} />}`, "app-devapi-render");
  return next;
});

await edit("src/renderer/styles.css", (source) => {
  if (source.includes("/* DEVBOX_V015_DEVAPI_CONTROL */")) throw new Error("V015_STYLES_ALREADY_PRESENT");
  return source + `

/* DEVBOX_V015_DEVAPI_CONTROL */
.system-theme{margin-left:auto;display:flex;align-items:center;padding-right:138px}.system-theme button{width:30px;height:30px;border:1px solid var(--border);border-radius:8px;background:var(--bg-panel);color:var(--text);display:grid;place-items:center}.theme-presets{display:flex;gap:8px;margin-bottom:18px}.theme-presets button.active{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent) inset}.devapi-control{gap:18px}.devapi-heading{border-bottom:1px solid var(--border);padding-bottom:18px}.devapi-hero-grid{display:grid;grid-template-columns:minmax(330px,1.8fr) repeat(5,minmax(150px,1fr));gap:10px}.devapi-hero-grid>article{min-height:118px;border:1px solid var(--border);background:linear-gradient(145deg,var(--bg-panel),color-mix(in srgb,var(--bg-panel) 88%,var(--accent) 12%));border-radius:14px;padding:16px;display:flex;flex-direction:column;gap:7px;overflow:hidden}.devapi-hero-grid>article>span{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted)}.devapi-hero-grid>article>strong{font-size:22px}.devapi-hero-grid>article>small{color:var(--text-muted);line-height:1.35}.devapi-level-card{flex-direction:row!important;align-items:center}.devapi-level-ring{width:86px;height:86px;min-width:86px;border-radius:50%;border:1px solid color-mix(in srgb,var(--accent) 70%,transparent);box-shadow:0 0 28px color-mix(in srgb,var(--accent) 18%,transparent) inset;display:grid;place-content:center;text-align:center;position:relative}.devapi-level-ring:before{content:"";position:absolute;inset:6px;border-radius:50%;border:1px dashed color-mix(in srgb,var(--accent) 45%,transparent);animation:devapi-orbit 18s linear infinite}.devapi-level-ring strong{font-size:29px}.devapi-level-ring span{font-size:9px;letter-spacing:.14em;color:var(--text-muted)}.devapi-control-strip{display:flex;gap:8px;align-items:center;border:1px solid var(--border);background:var(--bg-panel);padding:10px 12px;border-radius:12px}.devapi-control-strip>div:first-child{display:flex;flex-direction:column}.devapi-control-strip span{font-size:11px;color:var(--text-muted)}.devapi-control-strip .spacer{flex:1}.devapi-section{border:1px solid var(--border);background:var(--bg-panel);border-radius:14px;padding:16px}.devapi-section>header{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px}.devapi-section h2{margin:2px 0 0;font-size:16px}.devapi-domain-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px}.devapi-domain-grid article{padding:10px;border:1px solid var(--border);border-radius:9px;background:color-mix(in srgb,var(--bg-panel) 90%,var(--bg-app) 10%)}.devapi-domain-grid article div{display:flex;justify-content:space-between;text-transform:capitalize}.devapi-domain-grid i{display:block;height:4px;background:color-mix(in srgb,var(--border) 75%,transparent);margin-top:8px;border-radius:99px;overflow:hidden}.devapi-domain-grid b{display:block;height:100%;background:var(--accent)}.devapi-tabs{display:flex;gap:5px}.devapi-tabs button.active{border-color:var(--accent);color:var(--text)}.finding-summary{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:10px}.finding-summary span{border:1px solid var(--border);border-radius:99px;padding:5px 9px;font-size:10px}.finding-summary .critical{border-color:color-mix(in srgb,var(--danger) 80%,var(--border));color:var(--danger)}.finding-summary .high{border-color:color-mix(in srgb,var(--warning) 80%,var(--border));color:var(--warning)}.finding-list{display:grid;gap:8px;max-height:560px;overflow:auto;padding-right:3px}.finding-card{display:grid;grid-template-columns:78px minmax(0,1fr) auto;gap:12px;align-items:start;border:1px solid var(--border);border-left:3px solid var(--border);border-radius:10px;padding:11px;background:color-mix(in srgb,var(--bg-panel) 92%,var(--bg-app) 8%)}.finding-card.critical{border-left-color:var(--danger)}.finding-card.high{border-left-color:var(--warning)}.finding-card.resolved{opacity:.72}.finding-card.rejected{opacity:.58}.finding-severity{font-size:10px;font-weight:800;letter-spacing:.05em}.finding-body>div{display:flex;justify-content:space-between;gap:10px}.finding-body span,.finding-body small{font-size:10px;color:var(--text-muted)}.finding-body p{margin:6px 0;line-height:1.4}.finding-body details,.release-check-grid details{margin-top:7px}.finding-body code,.release-check-grid code{display:block;white-space:pre-wrap;overflow-wrap:anywhere;font-size:10px;color:var(--text-muted);padding:3px 0}.finding-actions{display:flex;gap:5px}.release-check-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:8px}.release-check-grid article{border:1px solid var(--border);border-radius:10px;padding:11px}.release-check-grid article.fail.blocking{border-color:color-mix(in srgb,var(--danger) 70%,var(--border));box-shadow:0 0 0 1px color-mix(in srgb,var(--danger) 15%,transparent) inset}.release-check-grid article>div{display:flex;align-items:center;gap:7px}.release-check-grid article>div span{margin-left:auto;font-size:10px;font-weight:800}.release-check-grid p{font-size:12px;line-height:1.4}.release-check-grid small{color:var(--text-muted)}.gate-state.pass{color:var(--success)}.gate-state.fail{color:var(--danger)}.devapi-chat-log{height:min(440px,42vh);overflow:auto;padding:10px;border:1px solid var(--border);border-radius:10px;background:var(--bg-app);display:flex;flex-direction:column;gap:9px}.devapi-chat-log article{max-width:86%;padding:9px 11px;border-radius:10px;background:var(--bg-panel);border:1px solid var(--border)}.devapi-chat-log article.user{align-self:flex-end;background:color-mix(in srgb,var(--accent) 10%,var(--bg-panel))}.devapi-chat-log article span{font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted)}.devapi-chat-log article p{white-space:pre-wrap;margin:4px 0 0;line-height:1.45}.devapi-chat-working{display:flex;gap:7px;align-items:center;color:var(--text-muted)}.devapi-chat-composer{display:grid;grid-template-columns:1fr auto;gap:8px;margin-top:9px}.devapi-chat-composer textarea{min-height:72px;resize:vertical}.cloud-contract dl{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.cloud-contract dl div{padding:9px;border:1px solid var(--border);border-radius:8px}.cloud-contract dt{font-size:10px;color:var(--text-muted)}.cloud-contract dd{margin:4px 0 0;overflow-wrap:anywhere}.devapi-error{position:sticky;bottom:12px}.advanced-empty.compact{min-height:90px}.devapi-hero-grid .danger{border-color:color-mix(in srgb,var(--danger) 60%,var(--border))}.devapi-hero-grid .ready{border-color:color-mix(in srgb,var(--success) 55%,var(--border))}
[data-theme-base="light"]{color-scheme:light}[data-theme-base="light"] .system-bar,[data-theme-base="light"] .stage-header,[data-theme-base="light"] .sidebar,[data-theme-base="light"] .composer-wrap,[data-theme-base="light"] .terminal-pane{background:var(--bg-panel);color:var(--text)}[data-theme-base="light"] .conversation,[data-theme-base="light"] .stage-body,[data-theme-base="light"] .main-stage{background:var(--bg-app)}[data-theme-base="light"] .message.assistant,[data-theme-base="light"] .content-panel,[data-theme-base="light"] .advanced-page article{color:var(--text)}[data-theme-base="light"] .code-editor textarea,[data-theme-base="light"] .code-editor .line-numbers,[data-theme-base="light"] .diff-preview,[data-theme-base="light"] pre{background:#fff;color:#182027}[data-theme-base="light"] input,[data-theme-base="light"] textarea,[data-theme-base="light"] select{background:#fff;color:#182027;border-color:var(--border)}
@keyframes devapi-orbit{to{transform:rotate(360deg)}}.reduced-motion .devapi-level-ring:before{animation:none}@media(max-width:1180px){.devapi-hero-grid{grid-template-columns:repeat(3,1fr)}.devapi-level-card{grid-column:span 2}}@media(max-width:820px){.devapi-hero-grid{grid-template-columns:1fr}.devapi-level-card{grid-column:auto}.devapi-control-strip{flex-wrap:wrap}.cloud-contract dl{grid-template-columns:1fr 1fr}.finding-card{grid-template-columns:70px 1fr}.finding-actions{grid-column:2}.system-theme{padding-right:100px}}
`;
});

console.log("DEVBOX_V015_MATERIALIZE_PASS");
