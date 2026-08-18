import electron = require("electron");
import type { DevBoxBridge } from "../shared/bridge.js";
import type { PlatformAction, TaskPreset } from "../shared/contracts.js";

const { contextBridge, ipcRenderer, webUtils } = electron;

// Keep the sandboxed preload self-contained: Electron executes it as CommonJS,
// while the main process and renderer remain ESM. Type-only imports are erased.
const CHANNELS = Object.freeze({
  bootstrap: "devbox:v1:bootstrap",
  capabilityInspect: "devbox:v1:capability:inspect",
  catalogInspect: "devbox:v1:catalog:inspect",
  catalogSourceSelect: "devbox:v1:catalog:source-select",
  catalogInstallPlugins: "devbox:v1:catalog:install-plugins",
  catalogConnectPlugins: "devbox:v1:catalog:connect-plugins",
  catalogDisconnectPlugins: "devbox:v1:catalog:disconnect-plugins",
  catalogCallTool: "devbox:v1:catalog:call-tool",
  projectOpen: "devbox:v1:project:open",
  projectReveal: "devbox:v1:project:reveal",
  projectTree: "devbox:v1:project:tree",
  fileRead: "devbox:v1:file:read",
  fileWrite: "devbox:v1:file:write",
  fileCreate: "devbox:v1:file:create",
  fileRename: "devbox:v1:file:rename",
  fileDuplicate: "devbox:v1:file:duplicate",
  fileTrash: "devbox:v1:file:trash",
  fileReveal: "devbox:v1:file:reveal",
  pathCopy: "devbox:v1:path:copy",
  gitStatus: "devbox:v1:git:status",
  gitDiff: "devbox:v1:git:diff",
  taskRunPreset: "devbox:v1:task:run-preset",
  threadList: "devbox:v1:thread:list",
  threadCreate: "devbox:v1:thread:create",
  threadGet: "devbox:v1:thread:get",
  threadMessage: "devbox:v1:thread:message",
  threadActivity: "devbox:v1:thread:activity",
  threadSnapshot: "devbox:v1:thread:snapshot",
  threadWorkspaceResult: "devbox:v1:thread:workspace-result",
  threadMessageUpdate: "devbox:v1:thread:message-update",
  threadMessageRegenerate: "devbox:v1:thread:message-regenerate",
  threadRename: "devbox:v1:thread:rename",
  threadPin: "devbox:v1:thread:pin",
  threadArchive: "devbox:v1:thread:archive",
  threadUnread: "devbox:v1:thread:unread",
  threadDelete: "devbox:v1:thread:delete",
  attachmentSelect: "devbox:v1:attachment:select",
  attachmentListDraft: "devbox:v1:attachment:list-draft",
  attachmentImport: "devbox:v1:attachment:import",
  attachmentRemove: "devbox:v1:attachment:remove",
  contextMenu: "devbox:v1:menu:context",
  appMenu: "devbox:v1:menu:application",
  textCopy: "devbox:v1:clipboard:copy"
  ,settingsGet: "devbox:v1:settings:get"
  ,settingsPatch: "devbox:v1:settings:patch"
  ,themeImport: "devbox:v1:theme:import"
  ,themeExport: "devbox:v1:theme:export"
  ,terminalList: "devbox:v1:terminal:list"
  ,terminalStart: "devbox:v1:terminal:start"
  ,terminalWrite: "devbox:v1:terminal:write"
  ,terminalResize: "devbox:v1:terminal:resize"
  ,terminalKill: "devbox:v1:terminal:kill"
  ,terminalEvent: "devbox:v1:terminal:event"
  ,worktreeList: "devbox:v1:worktree:list"
  ,worktreeCreate: "devbox:v1:worktree:create"
  ,worktreeRemove: "devbox:v1:worktree:remove"
  ,evolutionGet: "devbox:v1:evolution:get"
  ,evolutionToggle: "devbox:v1:evolution:toggle"
  ,evolutionDirective: "devbox:v1:evolution:directive"
  ,evolutionRun: "devbox:v1:evolution:run"
  ,evolutionRouting: "devbox:v1:evolution:routing"
  ,evolutionCancel: "devbox:v1:evolution:cancel"
  ,evolutionActivity: "devbox:v1:evolution:activity"
  ,evolutionActivityHistory: "devbox:v1:evolution:activity-history"
  ,evolutionModelCatalog: "devbox:v1:evolution:model-catalog"
  ,integrationInspect: "devbox:v1:integration:inspect"
  ,vercelAction: "devbox:v1:integration:vercel"
  ,githubAction: "devbox:v1:integration:github"
  ,platformAction: "devbox:v1:integration:platform"
  ,languageDiagnostics: "devbox:v1:language:diagnostics"
  ,debugStart: "devbox:v1:debug:start"
  ,debugCommand: "devbox:v1:debug:command"
  ,debugStop: "devbox:v1:debug:stop"
  ,workerPairingCreate: "devbox:v1:worker:pairing-create"
  ,workerList: "devbox:v1:worker:list"
  ,workerRevoke: "devbox:v1:worker:revoke"
  ,workerJobEnqueue: "devbox:v1:worker:job-enqueue"
  ,workerJobList: "devbox:v1:worker:job-list"
  ,workerJobCancel: "devbox:v1:worker:job-cancel"
});

const bridge: DevBoxBridge = Object.freeze({
  bootstrap: async () => await ipcRenderer.invoke(CHANNELS.bootstrap),
  inspectCapabilities: async () => await ipcRenderer.invoke(CHANNELS.capabilityInspect),
  inspectCatalog: async () => await ipcRenderer.invoke(CHANNELS.catalogInspect),
  selectCatalogSource: async (kind: "skill" | "plugin") => await ipcRenderer.invoke(CHANNELS.catalogSourceSelect, { kind }),
  installPortablePlugins: async () => await ipcRenderer.invoke(CHANNELS.catalogInstallPlugins),
  connectPortablePlugins: async () => await ipcRenderer.invoke(CHANNELS.catalogConnectPlugins),
  disconnectPortablePlugins: async () => await ipcRenderer.invoke(CHANNELS.catalogDisconnectPlugins),
  callCatalogTool: async (input: unknown) => await ipcRenderer.invoke(CHANNELS.catalogCallTool, input),
  openProject: async () => await ipcRenderer.invoke(CHANNELS.projectOpen),
  revealProject: async (projectId: string) => await ipcRenderer.invoke(CHANNELS.projectReveal, { projectId }),
  readProjectTree: async (projectId: string) => await ipcRenderer.invoke(CHANNELS.projectTree, { projectId }),
  readFile: async (projectId: string, relativePath: string) => await ipcRenderer.invoke(CHANNELS.fileRead, { projectId, relativePath }),
  writeFile: async (projectId: string, relativePath: string, expectedSha256: string, content: string) => await ipcRenderer.invoke(CHANNELS.fileWrite, { projectId, relativePath, expectedSha256, content }),
  createPath: async (projectId: string, parentRelativePath: string, name: string, kind: "file" | "directory") => await ipcRenderer.invoke(CHANNELS.fileCreate, { projectId, parentRelativePath, name, kind }),
  renamePath: async (projectId: string, relativePath: string, newName: string) => await ipcRenderer.invoke(CHANNELS.fileRename, { projectId, relativePath, newName }),
  duplicatePath: async (projectId: string, relativePath: string) => await ipcRenderer.invoke(CHANNELS.fileDuplicate, { projectId, relativePath }),
  trashPath: async (projectId: string, relativePath: string) => await ipcRenderer.invoke(CHANNELS.fileTrash, { projectId, relativePath }),
  revealPath: async (projectId: string, relativePath: string) => await ipcRenderer.invoke(CHANNELS.fileReveal, { projectId, relativePath }),
  copyPath: async (projectId: string, relativePath: string, absolute: boolean) => await ipcRenderer.invoke(CHANNELS.pathCopy, { projectId, relativePath, absolute }),
  getGitStatus: async (projectId: string) => await ipcRenderer.invoke(CHANNELS.gitStatus, { projectId }),
  getGitDiff: async (projectId: string) => await ipcRenderer.invoke(CHANNELS.gitDiff, { projectId }),
  runTaskPreset: async (projectId: string, preset: TaskPreset) => await ipcRenderer.invoke(CHANNELS.taskRunPreset, { projectId, preset }),
  listThreads: async (projectId?: string) => await ipcRenderer.invoke(CHANNELS.threadList, projectId ? { projectId } : {}),
  createThread: async (projectId: string, title = "Yeni görev") => await ipcRenderer.invoke(CHANNELS.threadCreate, { projectId, title }),
  getThread: async (threadId: string) => await ipcRenderer.invoke(CHANNELS.threadGet, { threadId }),
  sendMessage: async (threadId: string, content: string, attachmentIds: string[] = []) => await ipcRenderer.invoke(CHANNELS.threadMessage, { threadId, content, attachmentIds }),
  onThreadActivity: (listener: Parameters<DevBoxBridge["onThreadActivity"]>[0]) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: unknown): void => listener(payload as Parameters<typeof listener>[0]);
    ipcRenderer.on(CHANNELS.threadActivity, handler);
    return () => ipcRenderer.removeListener(CHANNELS.threadActivity, handler);
  },
  onThreadSnapshot: (listener: Parameters<DevBoxBridge["onThreadSnapshot"]>[0]) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: unknown): void => listener(payload as Parameters<typeof listener>[0]);
    ipcRenderer.on(CHANNELS.threadSnapshot, handler);
    return () => ipcRenderer.removeListener(CHANNELS.threadSnapshot, handler);
  },
  onThreadWorkspaceResult: (listener: Parameters<DevBoxBridge["onThreadWorkspaceResult"]>[0]) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: unknown): void => listener(payload as Parameters<typeof listener>[0]);
    ipcRenderer.on(CHANNELS.threadWorkspaceResult, handler);
    return () => ipcRenderer.removeListener(CHANNELS.threadWorkspaceResult, handler);
  },
  updateMessage: async (threadId: string, itemId: string, content: string) => await ipcRenderer.invoke(CHANNELS.threadMessageUpdate, { threadId, itemId, content }),
  regenerateMessage: async (threadId: string, itemId: string) => await ipcRenderer.invoke(CHANNELS.threadMessageRegenerate, { threadId, itemId }),
  renameThread: async (threadId: string, title: string) => await ipcRenderer.invoke(CHANNELS.threadRename, { threadId, title }),
  setThreadPinned: async (threadId: string, value: boolean) => await ipcRenderer.invoke(CHANNELS.threadPin, { threadId, value }),
  setThreadArchived: async (threadId: string, value: boolean) => await ipcRenderer.invoke(CHANNELS.threadArchive, { threadId, value }),
  setThreadUnread: async (threadId: string, value: boolean) => await ipcRenderer.invoke(CHANNELS.threadUnread, { threadId, value }),
  deleteThread: async (threadId: string) => await ipcRenderer.invoke(CHANNELS.threadDelete, { threadId }),
  selectAttachments: async (threadId: string) => await ipcRenderer.invoke(CHANNELS.attachmentSelect, { threadId }),
  listDraftAttachments: async (threadId: string) => await ipcRenderer.invoke(CHANNELS.attachmentListDraft, { threadId }),
  importDroppedAttachments: async (threadId: string, files: readonly File[]) => {
    const filePaths = files.map((file) => webUtils.getPathForFile(file)).filter((filePath) => filePath.length > 0);
    return await ipcRenderer.invoke(CHANNELS.attachmentImport, { threadId, filePaths });
  },
  removeAttachment: async (threadId: string, attachmentId: string) => await ipcRenderer.invoke(CHANNELS.attachmentRemove, { threadId, attachmentId }),
  showContextMenu: async (kind: "editable" | "selection" | "file" | "directory" | "terminal" | "blank", hasSelection = false, canPaste = false) => await ipcRenderer.invoke(CHANNELS.contextMenu, { kind, hasSelection, canPaste }),
  showAppMenu: async (menu: "file" | "edit" | "view" | "help") => await ipcRenderer.invoke(CHANNELS.appMenu, { menu }),
  copyText: async (text: string) => await ipcRenderer.invoke(CHANNELS.textCopy, { text }),
  getSettings: async () => await ipcRenderer.invoke(CHANNELS.settingsGet),
  patchSettings: async (patch: Parameters<DevBoxBridge["patchSettings"]>[0]) => await ipcRenderer.invoke(CHANNELS.settingsPatch, patch),
  importTheme: async (portable: string) => await ipcRenderer.invoke(CHANNELS.themeImport, { portable }),
  exportTheme: async () => await ipcRenderer.invoke(CHANNELS.themeExport),
  listTerminals: async (projectId?: string) => await ipcRenderer.invoke(CHANNELS.terminalList, projectId ? { projectId } : {}),
  startTerminal: async (projectId: string, cols = 100, rows = 30) => await ipcRenderer.invoke(CHANNELS.terminalStart, { projectId, cols, rows }),
  writeTerminal: async (terminalId: string, data: string) => await ipcRenderer.invoke(CHANNELS.terminalWrite, { terminalId, data }),
  resizeTerminal: async (terminalId: string, cols: number, rows: number) => await ipcRenderer.invoke(CHANNELS.terminalResize, { terminalId, cols, rows }),
  killTerminal: async (terminalId: string) => await ipcRenderer.invoke(CHANNELS.terminalKill, { terminalId }),
  onTerminalEvent: (listener: Parameters<DevBoxBridge["onTerminalEvent"]>[0]) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: unknown): void => listener(payload as Parameters<typeof listener>[0]);
    ipcRenderer.on(CHANNELS.terminalEvent, handler);
    return () => ipcRenderer.removeListener(CHANNELS.terminalEvent, handler);
  },
  listWorktrees: async (projectId: string) => await ipcRenderer.invoke(CHANNELS.worktreeList, { projectId }),
  createWorktree: async (projectId: string, name: string, ref = "HEAD", mode = "detached") => await ipcRenderer.invoke(CHANNELS.worktreeCreate, { projectId, name, ref, mode }),
  removeWorktree: async (projectId: string, worktreePath: string, force = false) => await ipcRenderer.invoke(CHANNELS.worktreeRemove, { projectId, path: worktreePath, force }),
  getEvolution: async (projectId: string) => await ipcRenderer.invoke(CHANNELS.evolutionGet, { projectId }),
  listEvolutionActivity: async (projectId: string, limit = 120) => await ipcRenderer.invoke(CHANNELS.evolutionActivityHistory, { projectId, limit }),
  getEvolutionModelCatalog: async (projectId: string, provider: Parameters<DevBoxBridge["getEvolutionModelCatalog"]>[1]) => await ipcRenderer.invoke(CHANNELS.evolutionModelCatalog, { projectId, provider }),
  setEvolutionEnabled: async (projectId: string, enabled: boolean) => await ipcRenderer.invoke(CHANNELS.evolutionToggle, { projectId, enabled }),
  setEvolutionDirective: async (projectId: string, directive: string) => await ipcRenderer.invoke(CHANNELS.evolutionDirective, { projectId, directive }),
  setEvolutionRouting: async (projectId: string, routing: Parameters<DevBoxBridge["setEvolutionRouting"]>[1]) => await ipcRenderer.invoke(CHANNELS.evolutionRouting, { projectId, routing }),
  cancelEvolutionCycle: async (projectId: string) => await ipcRenderer.invoke(CHANNELS.evolutionCancel, { projectId }),
  onEvolutionActivity: (listener: Parameters<DevBoxBridge["onEvolutionActivity"]>[0]) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: unknown): void => listener(payload as Parameters<typeof listener>[0]);
    ipcRenderer.on(CHANNELS.evolutionActivity, handler);
    return () => ipcRenderer.removeListener(CHANNELS.evolutionActivity, handler);
  },
  runEvolutionCycle: async (projectId: string) => await ipcRenderer.invoke(CHANNELS.evolutionRun, { projectId }),
  inspectIntegrations: async (projectId?: string) => await ipcRenderer.invoke(CHANNELS.integrationInspect, projectId ? { projectId } : {}),
  runVercelAction: async (projectId: string, action: "link" | "preview" | "production" | "inspect" | "logs" | "rollback", target = "") => await ipcRenderer.invoke(CHANNELS.vercelAction, { projectId, action, target }),
  runGitHubAction: async (projectId: string, action: "pr-list" | "pr-create" | "pr-merge" | "issue-list" | "issue-create" | "checks" | "run-list" | "run-log" | "run-rerun" | "release-list" | "release-create", target = "") => await ipcRenderer.invoke(CHANNELS.githubAction, { projectId, action, target }),
  runPlatformAction: async (action: PlatformAction, target = "", projectId?: string) => await ipcRenderer.invoke(CHANNELS.platformAction, { action, target, ...(projectId ? { projectId } : {}) }),
  getLanguageDiagnostics: async (projectId: string, relativePath: string, language: "typescript" | "typescriptreact" | "javascript" | "javascriptreact", content: string, version: number) => await ipcRenderer.invoke(CHANNELS.languageDiagnostics, { projectId, relativePath, language, content, version }),
  startDebugSession: async (projectId: string, executable: string, args: string[], request: "launch" | "attach", configuration: Record<string, unknown>) => await ipcRenderer.invoke(CHANNELS.debugStart, { projectId, executable, arguments: args, request, configuration }),
  runDebugCommand: async (sessionId: string, command: "continue" | "pause" | "next" | "stepIn" | "stepOut" | "threads" | "stackTrace" | "scopes" | "variables" | "setBreakpoints", args: Record<string, unknown> = {}) => await ipcRenderer.invoke(CHANNELS.debugCommand, { sessionId, command, arguments: args }),
  stopDebugSession: async (sessionId: string) => await ipcRenderer.invoke(CHANNELS.debugStop, { sessionId }),
  createWorkerPairing: async () => await ipcRenderer.invoke(CHANNELS.workerPairingCreate),
  listRemoteWorkers: async () => await ipcRenderer.invoke(CHANNELS.workerList),
  revokeRemoteWorker: async (workerId: string) => await ipcRenderer.invoke(CHANNELS.workerRevoke, { workerId }),
  enqueueRemoteJob: async (kind: string, payload: unknown) => await ipcRenderer.invoke(CHANNELS.workerJobEnqueue, { kind, payload }),
  listRemoteJobs: async () => await ipcRenderer.invoke(CHANNELS.workerJobList),
  cancelRemoteJob: async (jobId: string) => await ipcRenderer.invoke(CHANNELS.workerJobCancel, { jobId })
});

contextBridge.exposeInMainWorld("devbox", bridge);
