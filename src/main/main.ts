import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { app, BrowserWindow, Menu, nativeTheme, net, protocol, session, shell } from "electron";
import { registerIpcHandlers } from "./ipc.js";
import { SecretStore } from "./security/secret-store.js";
import { isTrustedExternalUrl } from "./security/external-url.js";
import { AgentService } from "./services/agent-service.js";
import { ApiEvolutionService } from "./services/api-evolution-service.js";
import { CloudControlService } from "./services/cloud-control-service.js";
import { EvolutionFindingService } from "./services/evolution-finding-service.js";
import { AttachmentService } from "./services/attachment-service.js";
import { CapabilityService } from "./services/capability-service.js";
import { CommandRunner } from "./services/command-runner.js";
import { CoreApi } from "./services/core-api.js";
import { StateDatabase } from "./services/database.js";
import { DevelopmentSpecService } from "./services/development-spec-service.js";
import { GitService } from "./services/git-service.js";
import { IntegrationService } from "./services/integration-service.js";
import { LocalCatalogService } from "./services/local-catalog-service.js";
import { MemoryService } from "./services/memory-service.js";
import { DebugService, LanguageService } from "./services/language-debug-service.js";
import { PackageLifecycleService } from "./services/package-lifecycle-service.js";
import { ProjectService } from "./services/project-service.js";
import { createPreviewProtocolHandler } from "./services/preview-protocol-service.js";
import { PreviewRenderService } from "./services/preview-render-service.js";
import { RemoteWorkerService } from "./services/remote-worker-service.js";
import { ReleaseGateService } from "./services/release-gate-service.js";
import { RemixRotaService } from "./services/remixrota-service.js";
import { SettingsService } from "./services/settings-service.js";
import { SelfDevelopmentService } from "./services/self-development-service.js";
import { SshTrustService } from "./services/ssh-trust-service.js";
import { TaskService } from "./services/task-service.js";
import { TerminalService } from "./services/terminal-service.js";
import { ThreadTurnCoordinator } from "./services/thread-turn-coordinator.js";
import { WorktreeService } from "./services/worktree-service.js";
import { WorkspaceTurnService } from "./services/workspace-turn-service.js";
import { IPC_CHANNELS, TerminalEventSchema } from "../shared/contracts.js";

protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: false } },
  { scheme: "devbox-preview", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: false } }
]);

const devRendererUrl = process.env.DEVBOX_RENDERER_URL;
if (devRendererUrl && devRendererUrl !== "http://127.0.0.1:5173") {
  throw new Error("DEVBOX_RENDERER_URL must use the fixed loopback development origin.");
}
app.setName("DevBox");
app.setAppUserModelId("com.devbox.app");

const hasInstanceLock = app.requestSingleInstanceLock();
if (!hasInstanceLock) app.quit();

let mainWindow: BrowserWindow | null = null;
let database: StateDatabase | null = null;
let coreApi: CoreApi | null = null;
let terminals: TerminalService | null = null;
let evolution: ApiEvolutionService | null = null;
let commandRunner: CommandRunner | null = null;
let unregisterIpc: (() => void) | null = null;
let localCatalog: LocalCatalogService | null = null;
let debugService: DebugService | null = null;
let languageService: LanguageService | null = null;
let cloudControlService: CloudControlService | null = null;
let remixRotaService: RemixRotaService | null = null;

function rendererRoot(): string {
  return path.resolve(app.getAppPath(), "dist", "renderer");
}

function optionalCatalogRoot(name: "DEVBOX_SKILL_ROOT" | "DEVBOX_PLUGIN_ROOT"): string | null {
  const value = process.env[name]?.trim();
  return value ? path.resolve(value) : null;
}

async function registerApplicationProtocol(): Promise<void> {
  await protocol.handle("app", async (request) => {
    const url = new URL(request.url);
    if (url.hostname !== "devbox") return new Response("Not found", { status: 404 });
    const requestedPath = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
    const root = rendererRoot();
    const target = path.resolve(root, `.${requestedPath}`);
    const relative = path.relative(root, target);
    if (relative.startsWith("..") || path.isAbsolute(relative) || !existsSync(target)) {
      return new Response("Not found", { status: 404 });
    }
    return await net.fetch(pathToFileURL(target).toString());
  });
}

function installSessionSecurity(): void {
  const activeSession = session.defaultSession;
  activeSession.setPermissionCheckHandler(() => false);
  activeSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  activeSession.webRequest.onHeadersReceived((details, callback) => {
    if (details.url.startsWith("devbox-preview://")) {
      return callback(details.responseHeaders ? { responseHeaders: details.responseHeaders } : {});
    }
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'none'; object-src 'none'; frame-src devbox-preview:; base-uri 'none'; form-action 'none'"
        ]
      }
    });
  });
}

function createWindow(themeBase: "light" | "dark" | "system"): BrowserWindow {
  const light = themeBase === "light" || (themeBase === "system" && !nativeTheme.shouldUseDarkColors);
  const window = new BrowserWindow({
    title: "DevBox",
    width: 1_280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor: light ? "#F6F3EF" : "#0B0D0E",
    autoHideMenuBar: true,
    titleBarStyle: "hidden",
    titleBarOverlay: { color: light ? "#FFFDFA" : "#191B1D", symbolColor: light ? "#342A25" : "#F3F5F6", height: 40 },
    webPreferences: {
      preload: path.join(app.getAppPath(), "dist", "main", "preload", "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      spellcheck: false,
      devTools: devRendererUrl !== undefined
    }
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isTrustedExternalUrl(url)) {
      void shell.openExternal(url).catch((error: unknown) => console.error("Güvenilen dış bağlantı açılamadı:", error));
    }
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, navigationUrl) => {
    const allowed = navigationUrl.startsWith("app://devbox/") || navigationUrl.startsWith("http://127.0.0.1:5173/");
    if (!allowed) event.preventDefault();
  });
  window.webContents.on("will-attach-webview", (event) => event.preventDefault());
  window.once("ready-to-show", () => window.show());
  return window;
}

async function start(): Promise<void> {
  await registerApplicationProtocol();
  installSessionSecurity();
  Menu.setApplicationMenu(null);

  const stateDirectory = path.join(app.getPath("userData"), "state");
  database = new StateDatabase(path.join(stateDirectory, "devbox.sqlite"));
  const secretStore = new SecretStore(path.join(app.getPath("userData"), "secrets"));
  const apiKey = await secretStore.getOrCreateApiKey();
  const runner = new CommandRunner();
  commandRunner = runner;
  const capabilities = new CapabilityService(runner);
  const agent = new AgentService(runner, app.getVersion());
  const memory = new MemoryService(database);
  const findings = new EvolutionFindingService(database);
  const turnCoordinator = new ThreadTurnCoordinator();
  const attachments = new AttachmentService(database, path.join(app.getPath("userData"), "attachments"));
  const projects = new ProjectService(database);
  await protocol.handle("devbox-preview", createPreviewProtocolHandler(projects));
  const selfDevelopment = new SelfDevelopmentService(projects, runner, {
    packaged: app.isPackaged,
    appRoot: app.getAppPath(),
    templateRoot: path.join(process.resourcesPath, "development", "source-template"),
    workspaceRoot: path.join(app.getPath("userData"), "self-development"),
    appVersion: app.getVersion()
  });
  const selfDevelopmentProject = await selfDevelopment.ensure();
  const git = new GitService(runner);
  const workspaceTurns = new WorkspaceTurnService(projects, git);
  const tasks = new TaskService(runner);
  const settings = new SettingsService(database);
  const remoteWorkers = new RemoteWorkerService(database);
  const developmentSpecPath = app.isPackaged
    ? path.join(process.resourcesPath, "development", "geliştirme-spec-task-graph.json")
    : path.join(app.getAppPath(), "specs", "development", "geliştirme-spec-task-graph.json");
  const developmentSpec = new DevelopmentSpecService(database, developmentSpecPath);
  const worktrees = new WorktreeService(runner, path.join(app.getPath("userData"), "worktrees"));
  evolution = new ApiEvolutionService(database, projects, agent, settings, developmentSpec, git, runner, worktrees);
  const releaseGate = new ReleaseGateService(database, projects, git, runner, findings);
  cloudControlService = new CloudControlService(database, projects, evolution, findings, releaseGate, memory);
  const localAppData = process.env.LOCALAPPDATA?.trim() || path.join(app.getPath("home"), "AppData", "Local");
  remixRotaService = new RemixRotaService(database, { discoveryPath: path.join(localAppData, "RemixRota", "Integration", "companion.json"), appVersion: app.getVersion() });
  const previewRender = new PreviewRenderService(projects);
  const packages = new PackageLifecycleService(path.join(app.getPath("userData"), "signed-runtime"));
  const sshTrust = new SshTrustService(path.join(app.getPath("userData"), "ssh", "known-hosts"), runner);
  const integrations = new IntegrationService(runner, packages, sshTrust);
  const catalog = new LocalCatalogService(path.join(app.getPath("userData"), "catalog"), runner, {
    skillRoot: optionalCatalogRoot("DEVBOX_SKILL_ROOT"),
    pluginRoot: optionalCatalogRoot("DEVBOX_PLUGIN_ROOT")
  }, app.getVersion());
  localCatalog = catalog;
  languageService = new LanguageService(projects);
  const language = languageService;
  debugService = new DebugService(projects);
  coreApi = new CoreApi({
    apiKey: apiKey.value,
    database,
    projects,
    capabilities,
    agent,
    memory,
    turnCoordinator,
    attachments,
    git,
    workspaceTurns,
    evolution,
    findings,
    releaseGate,
    cloudControl: cloudControlService,
    settings,
    remoteWorkers,
    catalog,
    probeCwd: app.getPath("userData"),
    appVersion: app.getVersion()
  });
  await coreApi.start();

  mainWindow = createWindow(settings.get().theme.base);
  terminals = new TerminalService((event) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.webContents.send(IPC_CHANNELS.terminalEvent, TerminalEventSchema.parse(event));
  });
  unregisterIpc = registerIpcHandlers({
    coreApi,
    capabilities,
    agent,
    memory,
    turnCoordinator,
    evolution,
    findings,
    releaseGate,
    cloudControl: cloudControlService,
    remixRota: remixRotaService,
    attachments,
    projects,
    selfDevelopmentProjectId: selfDevelopmentProject.id,
    git,
    workspaceTurns,
    previewRender,
    tasks,
    settings,
    terminals,
    worktrees,
    integrations,
    catalog,
    packages,
    sshTrust,
    language,
    debug: debugService,
    remoteWorkers,
    database,
    probeCwd: app.getPath("userData"),
    rendererWebContentsId: mainWindow.webContents.id
  });
  await mainWindow.loadURL(devRendererUrl ?? "app://devbox/");
  evolution.start();
  cloudControlService.start();
}

app.on("second-instance", () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
});

app.on("window-all-closed", () => app.quit());

app.whenReady().then(start).catch((error: unknown) => {
  console.error("DevBox failed to start:", error);
  app.exit(1);
});

app.on("before-quit", (event) => {
  if (!coreApi && !database && !terminals && !evolution && !commandRunner && !localCatalog) return;
  event.preventDefault();
  const api = coreApi;
  coreApi = null;
  terminals?.close();
  terminals = null;
  evolution?.stop();
  evolution = null;
  cloudControlService?.stop();
  cloudControlService = null;
  remixRotaService?.close();
  remixRotaService = null;
  languageService?.close();
  languageService = null;
  const runner = commandRunner;
  commandRunner = null;
  debugService?.close();
  debugService = null;
  unregisterIpc?.();
  unregisterIpc = null;
  void (async () => {
    await localCatalog?.close();
    localCatalog = null;
    await runner?.close();
    await api?.close();
    database?.close();
    database = null;
    app.exit(0);
  })();
});
