import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { app, BrowserWindow, Menu, net, protocol, session } from "electron";
import { registerIpcHandlers } from "./ipc.js";
import { SecretStore } from "./security/secret-store.js";
import { AgentService } from "./services/agent-service.js";
import { ApiEvolutionService } from "./services/api-evolution-service.js";
import { AttachmentService } from "./services/attachment-service.js";
import { CapabilityService } from "./services/capability-service.js";
import { CommandRunner } from "./services/command-runner.js";
import { CoreApi } from "./services/core-api.js";
import { StateDatabase } from "./services/database.js";
import { GitService } from "./services/git-service.js";
import { IntegrationService } from "./services/integration-service.js";
import { DebugService, LanguageService } from "./services/language-debug-service.js";
import { PackageLifecycleService } from "./services/package-lifecycle-service.js";
import { ProjectService } from "./services/project-service.js";
import { RemoteWorkerService } from "./services/remote-worker-service.js";
import { SettingsService } from "./services/settings-service.js";
import { SshTrustService } from "./services/ssh-trust-service.js";
import { TaskService } from "./services/task-service.js";
import { TerminalService } from "./services/terminal-service.js";
import { WorktreeService } from "./services/worktree-service.js";
import { IPC_CHANNELS, TerminalEventSchema } from "../shared/contracts.js";

protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: false } }
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
let debugService: DebugService | null = null;

function rendererRoot(): string {
  return path.resolve(app.getAppPath(), "dist", "renderer");
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
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'"
        ]
      }
    });
  });
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    title: "DevBox",
    width: 1_280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor: "#0B0D0E",
    autoHideMenuBar: true,
    titleBarStyle: "hidden",
    titleBarOverlay: { color: "#191B1D", symbolColor: "#F3F5F6", height: 40 },
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

  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
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
  const agent = new AgentService(runner);
  const attachments = new AttachmentService(database, path.join(app.getPath("userData"), "attachments"));
  const projects = new ProjectService(database);
  const git = new GitService(runner);
  const tasks = new TaskService(runner);
  const settings = new SettingsService(database);
  const remoteWorkers = new RemoteWorkerService(database);
  evolution = new ApiEvolutionService(database, projects, agent, settings);
  const worktrees = new WorktreeService(runner, path.join(app.getPath("userData"), "worktrees"));
  const packages = new PackageLifecycleService(path.join(app.getPath("userData"), "signed-runtime"));
  const sshTrust = new SshTrustService(path.join(app.getPath("userData"), "ssh", "known-hosts"), runner);
  const integrations = new IntegrationService(runner, packages, sshTrust);
  const language = new LanguageService(projects);
  debugService = new DebugService(projects);
  coreApi = new CoreApi({
    apiKey: apiKey.value,
    database,
    projects,
    capabilities,
    agent,
    attachments,
    git,
    evolution,
    settings,
    remoteWorkers,
    probeCwd: app.getPath("userData"),
    appVersion: app.getVersion()
  });
  await coreApi.start();

  mainWindow = createWindow();
  terminals = new TerminalService((event) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.webContents.send(IPC_CHANNELS.terminalEvent, TerminalEventSchema.parse(event));
  });
  unregisterIpc = registerIpcHandlers({
    coreApi,
    capabilities,
    agent,
    evolution,
    attachments,
    projects,
    git,
    tasks,
    settings,
    terminals,
    worktrees,
    integrations,
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
  if (!coreApi && !database && !terminals && !evolution && !commandRunner) return;
  event.preventDefault();
  const api = coreApi;
  coreApi = null;
  terminals?.close();
  terminals = null;
  evolution?.stop();
  evolution = null;
  const runner = commandRunner;
  commandRunner = null;
  debugService?.close();
  debugService = null;
  unregisterIpc?.();
  unregisterIpc = null;
  void (async () => {
    await runner?.close();
    await api?.close();
    database?.close();
    database = null;
    app.exit(0);
  })();
});
