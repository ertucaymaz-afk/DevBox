import type {
  Attachment,
  AttachmentImportResult,
  AppSettings,
  Bootstrap,
  CommandResult,
  EvolutionCampaign,
  FileSnapshot,
  GitDiff,
  GitStatus,
  IntegrationStatus,
  PlatformAction,
  ProjectSummary,
  ProjectTreeNode,
  SettingsPatchInput,
  ThreadDetail,
  ThreadSummary,
  TaskPreset
  ,TerminalEvent
  ,TerminalSummary
  ,Worktree
} from "./contracts.js";

export interface DevBoxBridge {
  bootstrap(): Promise<Bootstrap>;
  openProject(): Promise<ProjectSummary | null>;
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
  updateMessage(threadId: string, itemId: string, content: string): Promise<ThreadDetail>;
  regenerateMessage(threadId: string, itemId: string): Promise<ThreadDetail>;
  renameThread(threadId: string, title: string): Promise<ThreadSummary>;
  deleteThread(threadId: string): Promise<boolean>;
  selectAttachments(threadId: string): Promise<AttachmentImportResult>;
  listDraftAttachments(threadId: string): Promise<Attachment[]>;
  importDroppedAttachments(threadId: string, files: readonly File[]): Promise<AttachmentImportResult>;
  removeAttachment(threadId: string, attachmentId: string): Promise<void>;
  showContextMenu(kind: "editable" | "selection" | "file" | "directory" | "thread" | "terminal" | "blank", hasSelection?: boolean, canPaste?: boolean): Promise<string | null>;
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
}
