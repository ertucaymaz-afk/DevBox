import type {
  Attachment,
  AttachmentImportResult,
  AppSettings,
  Bootstrap,
  Capability,
  CommandResult,
  EvolutionCampaign,
  FileSnapshot,
  GitDiff,
  GitStatus,
  IntegrationStatus,
  LanguageDiagnosticsResult,
  DebugResponse,
  DebugSession,
  RemoteWorker,
  WorkerPairing,
  PlatformAction,
  ProjectSummary,
  ProjectTreeNode,
  SettingsPatchInput,
  ThreadDetail,
  ThreadActivityEvent,
  ThreadSummary,
  TaskPreset
  ,TerminalEvent
  ,TerminalSummary
  ,Worktree
} from "./contracts.js";

export interface DevBoxBridge {
  bootstrap(): Promise<Bootstrap>;
  inspectCapabilities(): Promise<Capability[]>;
  openProject(): Promise<ProjectSummary | null>;
  revealProject(projectId: string): Promise<void>;
  readProjectTree(projectId: string): Promise<ProjectTreeNode[]>;
  readFile(projectId: string, relativePath: string): Promise<FileSnapshot>;
  writeFile(projectId: string, relativePath: string, expectedSha256: string, content: string): Promise<FileSnapshot>;
  createPath(projectId: string, parentRelativePath: string, name: string, kind: "file" | "directory"): Promise<ProjectTreeNode[]>;
  renamePath(projectId: string, relativePath: string, newName: string): Promise<ProjectTreeNode[]>;
  duplicatePath(projectId: string, relativePath: string): Promise<ProjectTreeNode[]>;
  trashPath(projectId: string, relativePath: string): Promise<ProjectTreeNode[]>;
  revealPath(projectId: string, relativePath: string): Promise<void>;
  copyPath(projectId: string, relativePath: string, absolute: boolean): Promise<void>;
  getGitStatus(projectId: string): Promise<GitStatus>;
  getGitDiff(projectId: string): Promise<GitDiff>;
  runTaskPreset(projectId: string, preset: TaskPreset): Promise<CommandResult>;
  listThreads(projectId?: string): Promise<ThreadSummary[]>;
  createThread(projectId: string, title?: string): Promise<ThreadDetail>;
  getThread(threadId: string): Promise<ThreadDetail>;
  sendMessage(threadId: string, content: string, attachmentIds?: string[]): Promise<ThreadDetail>;
  onThreadActivity(listener: (event: ThreadActivityEvent) => void): () => void;
  updateMessage(threadId: string, itemId: string, content: string): Promise<ThreadDetail>;
  regenerateMessage(threadId: string, itemId: string): Promise<ThreadDetail>;
  renameThread(threadId: string, title: string): Promise<ThreadSummary>;
  setThreadPinned(threadId: string, value: boolean): Promise<ThreadSummary>;
  setThreadArchived(threadId: string, value: boolean): Promise<ThreadSummary>;
  setThreadUnread(threadId: string, value: boolean): Promise<ThreadSummary>;
  deleteThread(threadId: string): Promise<boolean>;
  selectAttachments(threadId: string): Promise<AttachmentImportResult>;
  listDraftAttachments(threadId: string): Promise<Attachment[]>;
  importDroppedAttachments(threadId: string, files: readonly File[]): Promise<AttachmentImportResult>;
  removeAttachment(threadId: string, attachmentId: string): Promise<void>;
  showContextMenu(
    kind: "editable" | "selection" | "file" | "directory" | "terminal" | "blank",
    hasSelection?: boolean,
    canPaste?: boolean
  ): Promise<string | null>;
  showAppMenu(menu: "file" | "edit" | "view" | "help"): Promise<string | null>;
  copyText(text: string): Promise<void>;
  getSettings(): Promise<AppSettings>;
  patchSettings(patch: SettingsPatchInput): Promise<AppSettings>;
  importTheme(portable: string): Promise<AppSettings>;
  exportTheme(): Promise<string>;
  listTerminals(projectId?: string): Promise<TerminalSummary[]>;
  startTerminal(projectId: string, cols?: number, rows?: number): Promise<TerminalSummary>;
  writeTerminal(terminalId: string, data: string): Promise<void>;
  resizeTerminal(terminalId: string, cols: number, rows: number): Promise<TerminalSummary>;
  killTerminal(terminalId: string): Promise<void>;
  onTerminalEvent(listener: (event: TerminalEvent) => void): () => void;
  listWorktrees(projectId: string): Promise<Worktree[]>;
  createWorktree(projectId: string, name: string, ref?: string, mode?: "detached" | "branch"): Promise<Worktree>;
  removeWorktree(projectId: string, worktreePath: string, force?: boolean): Promise<{ recoveryPatch: string | null }>;
  getEvolution(projectId: string): Promise<EvolutionCampaign>;
  setEvolutionEnabled(projectId: string, enabled: boolean): Promise<EvolutionCampaign>;
  setEvolutionDirective(projectId: string, directive: string): Promise<EvolutionCampaign>;
  runEvolutionCycle(projectId: string): Promise<EvolutionCampaign>;
  inspectIntegrations(projectId?: string): Promise<IntegrationStatus[]>;
  runVercelAction(projectId: string, action: "link" | "preview" | "production" | "inspect" | "logs" | "rollback", target?: string): Promise<CommandResult>;
  runGitHubAction(projectId: string, action: "pr-list" | "pr-create" | "pr-merge" | "issue-list" | "issue-create" | "checks" | "run-list" | "run-log" | "run-rerun" | "release-list" | "release-create", target?: string): Promise<CommandResult>;
  runPlatformAction(action: PlatformAction, target?: string, projectId?: string): Promise<CommandResult>;
  getLanguageDiagnostics(projectId: string, relativePath: string, language: "typescript" | "typescriptreact" | "javascript" | "javascriptreact", content: string, version: number): Promise<LanguageDiagnosticsResult>;
  startDebugSession(projectId: string, executable: string, args: string[], request: "launch" | "attach", configuration: Record<string, unknown>): Promise<DebugSession>;
  runDebugCommand(sessionId: string, command: "continue" | "pause" | "next" | "stepIn" | "stepOut" | "threads" | "stackTrace" | "scopes" | "variables" | "setBreakpoints", args?: Record<string, unknown>): Promise<DebugResponse>;
  stopDebugSession(sessionId: string): Promise<void>;
  createWorkerPairing(): Promise<WorkerPairing>;
  listRemoteWorkers(): Promise<RemoteWorker[]>;
  revokeRemoteWorker(workerId: string): Promise<RemoteWorker>;
  enqueueRemoteJob(kind: string, payload: unknown): Promise<{ id: string; kind: string; state: string; attempt: number; createdAt: string }>;
}
