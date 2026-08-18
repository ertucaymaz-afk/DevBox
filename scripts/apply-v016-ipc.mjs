import { readFile, writeFile } from "node:fs/promises";

async function load(file) { return (await readFile(file, "utf8")).replace(/\r\n/gu, "\n"); }
async function save(file, text) { await writeFile(file, text, "utf8"); }
function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  const at = source.indexOf(before);
  if (at < 0 || source.indexOf(before, at + 1) >= 0) throw new Error(`V016_IPC_ANCHOR_INVALID:${label}`);
  return source.slice(0, at) + after + source.slice(at + before.length);
}

{
  const file = "src/shared/contracts.ts"; let source = await load(file);
  source = replaceOnce(source,
    '  cloudControlSync: "devbox:v1:devapi:cloud-sync",\n  integrationInspect: "devbox:v1:integration:inspect",',
    '  cloudControlSync: "devbox:v1:devapi:cloud-sync",\n  remixRotaInspect: "devbox:v1:remixrota:inspect",\n  remixRotaSelectExecutable: "devbox:v1:remixrota:select-executable",\n  remixRotaConnect: "devbox:v1:remixrota:connect",\n  remixRotaDisconnect: "devbox:v1:remixrota:disconnect",\n  remixRotaInvoke: "devbox:v1:remixrota:invoke",\n  remixRotaEvent: "devbox:v1:remixrota:event",\n  integrationInspect: "devbox:v1:integration:inspect",',
    "contracts-channels");
  await save(file, source);
}

{
  const file = "src/shared/bridge.ts"; let source = await load(file);
  source = replaceOnce(source,
    'import type { CloudControlStatus, DevApiControlSnapshot, EvolutionFinding, ReleaseGateRun } from "./devapi-control-contracts.js";\n',
    'import type { CloudControlStatus, DevApiControlSnapshot, EvolutionFinding, ReleaseGateRun } from "./devapi-control-contracts.js";\nimport type { RemixRotaCommand, RemixRotaCommandResult, RemixRotaEvent, RemixRotaStatus } from "./remixrota-contracts.js";\n',
    "bridge-import");
  source = replaceOnce(source,
    '  syncDevApiCloud(projectId: string): Promise<CloudControlStatus>;\n  inspectIntegrations(projectId?: string): Promise<IntegrationStatus[]>;',
    '  syncDevApiCloud(projectId: string): Promise<CloudControlStatus>;\n  inspectRemixRota(): Promise<RemixRotaStatus>;\n  selectRemixRotaExecutable(): Promise<RemixRotaStatus>;\n  connectRemixRota(): Promise<RemixRotaStatus>;\n  disconnectRemixRota(): Promise<RemixRotaStatus>;\n  invokeRemixRota(command: RemixRotaCommand, args?: Record<string, unknown>): Promise<RemixRotaCommandResult>;\n  onRemixRotaEvent(listener: (event: RemixRotaEvent) => void): () => void;\n  inspectIntegrations(projectId?: string): Promise<IntegrationStatus[]>;',
    "bridge-methods");
  await save(file, source);
}

{
  const file = "src/preload/preload.cts"; let source = await load(file);
  source = replaceOnce(source,
    '  ,cloudControlSync: "devbox:v1:devapi:cloud-sync"\n  ,integrationInspect: "devbox:v1:integration:inspect"',
    '  ,cloudControlSync: "devbox:v1:devapi:cloud-sync"\n  ,remixRotaInspect: "devbox:v1:remixrota:inspect"\n  ,remixRotaSelectExecutable: "devbox:v1:remixrota:select-executable"\n  ,remixRotaConnect: "devbox:v1:remixrota:connect"\n  ,remixRotaDisconnect: "devbox:v1:remixrota:disconnect"\n  ,remixRotaInvoke: "devbox:v1:remixrota:invoke"\n  ,remixRotaEvent: "devbox:v1:remixrota:event"\n  ,integrationInspect: "devbox:v1:integration:inspect"',
    "preload-channels");
  source = replaceOnce(source,
    '  syncDevApiCloud: async (projectId: string) => await ipcRenderer.invoke(CHANNELS.cloudControlSync, { projectId }),\n  inspectIntegrations: async (projectId?: string) => await ipcRenderer.invoke(CHANNELS.integrationInspect, projectId ? { projectId } : {}),',
    '  syncDevApiCloud: async (projectId: string) => await ipcRenderer.invoke(CHANNELS.cloudControlSync, { projectId }),\n  inspectRemixRota: async () => await ipcRenderer.invoke(CHANNELS.remixRotaInspect),\n  selectRemixRotaExecutable: async () => await ipcRenderer.invoke(CHANNELS.remixRotaSelectExecutable),\n  connectRemixRota: async () => await ipcRenderer.invoke(CHANNELS.remixRotaConnect),\n  disconnectRemixRota: async () => await ipcRenderer.invoke(CHANNELS.remixRotaDisconnect),\n  invokeRemixRota: async (command: Parameters<DevBoxBridge["invokeRemixRota"]>[0], args: Record<string, unknown> = {}) => await ipcRenderer.invoke(CHANNELS.remixRotaInvoke, { command, arguments: args }),\n  onRemixRotaEvent: (listener: Parameters<DevBoxBridge["onRemixRotaEvent"]>[0]) => {\n    const handler = (_event: Electron.IpcRendererEvent, payload: unknown): void => listener(payload as Parameters<typeof listener>[0]);\n    ipcRenderer.on(CHANNELS.remixRotaEvent, handler);\n    return () => ipcRenderer.removeListener(CHANNELS.remixRotaEvent, handler);\n  },\n  inspectIntegrations: async (projectId?: string) => await ipcRenderer.invoke(CHANNELS.integrationInspect, projectId ? { projectId } : {}),',
    "preload-methods");
  await save(file, source);
}

{
  const file = "src/main/main.ts"; let source = await load(file);
  source = replaceOnce(source,
    'import { ReleaseGateService } from "./services/release-gate-service.js";\n',
    'import { ReleaseGateService } from "./services/release-gate-service.js";\nimport { RemixRotaService } from "./services/remixrota-service.js";\n',
    "main-import");
  source = replaceOnce(source,
    'let cloudControlService: CloudControlService | null = null;\n',
    'let cloudControlService: CloudControlService | null = null;\nlet remixRotaService: RemixRotaService | null = null;\n',
    "main-global");
  source = replaceOnce(source,
    'function createWindow(): BrowserWindow {\n  const window = new BrowserWindow({\n    title: "DevBox",',
    'function createWindow(themeBase: "light" | "dark"): BrowserWindow {\n  const light = themeBase === "light";\n  const window = new BrowserWindow({\n    title: "DevBox",',
    "main-window-signature");
  source = replaceOnce(source,
    '    backgroundColor: "#0B0D0E",\n    autoHideMenuBar: true,\n    titleBarStyle: "hidden",\n    titleBarOverlay: { color: "#191B1D", symbolColor: "#F3F5F6", height: 40 },',
    '    backgroundColor: light ? "#F6F3EF" : "#0B0D0E",\n    autoHideMenuBar: true,\n    titleBarStyle: "hidden",\n    titleBarOverlay: { color: light ? "#FFFDFA" : "#191B1D", symbolColor: light ? "#342A25" : "#F3F5F6", height: 40 },',
    "main-window-colors");
  source = replaceOnce(source,
    '  cloudControlService = new CloudControlService(database, projects, evolution, findings, releaseGate, memory);\n  const previewRender = new PreviewRenderService(projects);',
    '  cloudControlService = new CloudControlService(database, projects, evolution, findings, releaseGate, memory);\n  const localAppData = process.env.LOCALAPPDATA?.trim() || path.join(app.getPath("home"), "AppData", "Local");\n  remixRotaService = new RemixRotaService(database, { discoveryPath: path.join(localAppData, "RemixRota", "Integration", "companion.json"), appVersion: app.getVersion() });\n  const previewRender = new PreviewRenderService(projects);',
    "main-service-create");
  source = replaceOnce(source, '  mainWindow = createWindow();\n', '  mainWindow = createWindow(settings.get().theme.base);\n', "main-window-call");
  source = replaceOnce(source,
    '    cloudControl: cloudControlService,\n    attachments,',
    '    cloudControl: cloudControlService,\n    remixRota: remixRotaService,\n    attachments,',
    "main-ipc-service");
  source = replaceOnce(source,
    '  cloudControlService?.stop();\n  cloudControlService = null;\n  languageService?.close();',
    '  cloudControlService?.stop();\n  cloudControlService = null;\n  remixRotaService?.close();\n  remixRotaService = null;\n  languageService?.close();',
    "main-close");
  await save(file, source);
}

{
  const file = "src/main/ipc.ts"; let source = await load(file);
  source = replaceOnce(source,
    'import { CloudControlStatusSchema, DevApiControlSnapshotSchema, EvolutionFindingSchema, FindingTransitionInputSchema, ProjectIdControlInputSchema, ReleaseGateRunInputSchema, ReleaseGateRunSchema } from "../shared/devapi-control-contracts.js";\n',
    'import { CloudControlStatusSchema, DevApiControlSnapshotSchema, EvolutionFindingSchema, FindingTransitionInputSchema, ProjectIdControlInputSchema, ReleaseGateRunInputSchema, ReleaseGateRunSchema } from "../shared/devapi-control-contracts.js";\nimport { RemixRotaCommandResultSchema, RemixRotaEventSchema, RemixRotaInvokeInputSchema, RemixRotaStatusSchema } from "../shared/remixrota-contracts.js";\n',
    "ipc-schema-import");
  source = replaceOnce(source,
    'import type { ReleaseGateService } from "./services/release-gate-service.js";\n',
    'import type { ReleaseGateService } from "./services/release-gate-service.js";\nimport type { RemixRotaService } from "./services/remixrota-service.js";\n',
    "ipc-service-import");
  source = replaceOnce(source,
    '  cloudControl: CloudControlService;\n  attachments: AttachmentService;',
    '  cloudControl: CloudControlService;\n  remixRota: RemixRotaService;\n  attachments: AttachmentService;',
    "ipc-service-type");
  source = replaceOnce(source,
    '  registerHandler(IPC_CHANNELS.cloudControlSync, services.rendererWebContentsId, async (unknownInput) => {\n    const input = ProjectIdControlInputSchema.parse(unknownInput);\n    return CloudControlStatusSchema.parse(await services.cloudControl.sync(input.projectId));\n  });\n\n  registerHandler(IPC_CHANNELS.integrationInspect, services.rendererWebContentsId, async (unknownInput) => {',
    '  registerHandler(IPC_CHANNELS.cloudControlSync, services.rendererWebContentsId, async (unknownInput) => {\n    const input = ProjectIdControlInputSchema.parse(unknownInput);\n    return CloudControlStatusSchema.parse(await services.cloudControl.sync(input.projectId));\n  });\n\n  registerHandler(IPC_CHANNELS.remixRotaInspect, services.rendererWebContentsId, async () => RemixRotaStatusSchema.parse(await services.remixRota.inspect()));\n  registerHandler(IPC_CHANNELS.remixRotaSelectExecutable, services.rendererWebContentsId, async (_unknownInput, event) => {\n    const window = BrowserWindow.fromWebContents(event.sender);\n    if (!window) throw new Error("WINDOW_NOT_FOUND");\n    const selection = await dialog.showOpenDialog(window, { title: "DevBox — RemixRota.exe seç", buttonLabel: "Doğrula", properties: ["openFile"], filters: [{ name: "RemixRota", extensions: ["exe"] }] });\n    if (selection.canceled || !selection.filePaths[0]) return RemixRotaStatusSchema.parse(await services.remixRota.inspect());\n    return RemixRotaStatusSchema.parse(await services.remixRota.configureExecutable(selection.filePaths[0]));\n  });\n  registerHandler(IPC_CHANNELS.remixRotaConnect, services.rendererWebContentsId, async () => RemixRotaStatusSchema.parse(await services.remixRota.connect()));\n  registerHandler(IPC_CHANNELS.remixRotaDisconnect, services.rendererWebContentsId, async () => { services.remixRota.disconnect(); return RemixRotaStatusSchema.parse(await services.remixRota.inspect()); });\n  registerHandler(IPC_CHANNELS.remixRotaInvoke, services.rendererWebContentsId, async (unknownInput) => { const input = RemixRotaInvokeInputSchema.parse(unknownInput); return RemixRotaCommandResultSchema.parse(await services.remixRota.invoke(input)); });\n\n  registerHandler(IPC_CHANNELS.integrationInspect, services.rendererWebContentsId, async (unknownInput) => {',
    "ipc-handlers");
  source = replaceOnce(source,
    '  const unsubscribeEvolution = services.evolution.subscribe((activity) => {\n    const target = BrowserWindow.getAllWindows().find((window) => window.webContents.id === services.rendererWebContentsId);\n    if (!target || target.isDestroyed()) return;\n    target.webContents.send(IPC_CHANNELS.evolutionActivity, EvolutionActivityEventSchema.parse(activity));\n  });\n\n  return () => {\n    unsubscribeEvolution();',
    '  const unsubscribeEvolution = services.evolution.subscribe((activity) => {\n    const target = BrowserWindow.getAllWindows().find((window) => window.webContents.id === services.rendererWebContentsId);\n    if (!target || target.isDestroyed()) return;\n    target.webContents.send(IPC_CHANNELS.evolutionActivity, EvolutionActivityEventSchema.parse(activity));\n  });\n  const unsubscribeRemixRota = services.remixRota.subscribe((activity) => {\n    const target = BrowserWindow.getAllWindows().find((window) => window.webContents.id === services.rendererWebContentsId);\n    if (!target || target.isDestroyed()) return;\n    target.webContents.send(IPC_CHANNELS.remixRotaEvent, RemixRotaEventSchema.parse(activity));\n  });\n\n  return () => {\n    unsubscribeEvolution();\n    unsubscribeRemixRota();',
    "ipc-events");
  source = replaceOnce(source,
    '  registerHandler(IPC_CHANNELS.settingsPatch, services.rendererWebContentsId, async (unknownInput) => {\n    const input = SettingsPatchInputSchema.parse(unknownInput);\n    return AppSettingsSchema.parse(services.settings.patch(input));\n  });',
    '  registerHandler(IPC_CHANNELS.settingsPatch, services.rendererWebContentsId, async (unknownInput, event) => {\n    const input = SettingsPatchInputSchema.parse(unknownInput);\n    const next = AppSettingsSchema.parse(services.settings.patch(input));\n    const window = BrowserWindow.fromWebContents(event.sender);\n    if (window && "theme" in input) {\n      const light = next.theme.base === "light";\n      window.setBackgroundColor(light ? "#F6F3EF" : "#0B0D0E");\n      window.setTitleBarOverlay({ color: light ? "#FFFDFA" : "#191B1D", symbolColor: light ? "#342A25" : "#F3F5F6", height: 40 });\n    }\n    return next;\n  });',
    "ipc-window-theme");
  await save(file, source);
}

console.log("DEVBOX_V016_IPC_APPLIED");
