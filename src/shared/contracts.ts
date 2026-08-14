import { z } from "zod";

export const CapabilityStateSchema = z.enum([
  "UNAVAILABLE",
  "DISCOVERED",
  "INSTALLABLE",
  "INSTALLING",
  "INSTALLED",
  "CONFIGURED",
  "VERIFYING",
  "READY",
  "DEGRADED",
  "WAITING_APPROVAL",
  "BLOCKED",
  "FAILED",
  "RECOVERY_REQUIRED",
  "UPDATE_AVAILABLE",
  "RESTART_REQUIRED"
]);

export type CapabilityState = z.infer<typeof CapabilityStateSchema>;

export const CapabilitySchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
  state: CapabilityStateSchema,
  version: z.string().nullable(),
  checkedAt: z.string().datetime(),
  detail: z.string(),
  remediation: z.string().nullable(),
  evidence: z.array(z.string())
});

export type Capability = z.infer<typeof CapabilitySchema>;

export const ProjectSummarySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  rootPath: z.string().min(1),
  isGitRepository: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export type ProjectSummary = z.infer<typeof ProjectSummarySchema>;

export const ProjectIdInputSchema = z.object({ projectId: z.string().min(8).max(128) }).strict();
export const FileReadInputSchema = ProjectIdInputSchema.extend({
  relativePath: z.string().min(1).max(4_096)
}).strict();

export type ProjectTreeNode = {
  name: string;
  relativePath: string;
  kind: "file" | "directory" | "symlink";
  size: number | null;
  children?: ProjectTreeNode[] | undefined;
};

export const ProjectTreeNodeSchema: z.ZodType<ProjectTreeNode> = z.lazy(() =>
  z.object({
    name: z.string(),
    relativePath: z.string(),
    kind: z.enum(["file", "directory", "symlink"]),
    size: z.number().int().nonnegative().nullable(),
    children: z.array(ProjectTreeNodeSchema).optional()
  })
);

export const FileSnapshotSchema = z.object({
  projectId: z.string(),
  relativePath: z.string(),
  language: z.string(),
  encoding: z.literal("utf8"),
  content: z.string(),
  size: z.number().int().nonnegative(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  readOnlyReason: z.string().nullable()
});

export type FileSnapshot = z.infer<typeof FileSnapshotSchema>;

export const FileWriteInputSchema = FileReadInputSchema.extend({
  expectedSha256: z.string().regex(/^[a-f0-9]{64}$/),
  content: z.string().max(1_048_576)
}).strict();

export const FileCreateInputSchema = ProjectIdInputSchema.extend({
  parentRelativePath: z.string().max(4_096),
  name: z.string().min(1).max(255),
  kind: z.enum(["file", "directory"])
}).strict();

export const FileRenameInputSchema = FileReadInputSchema.extend({
  newName: z.string().min(1).max(255)
}).strict();

export const FileDuplicateInputSchema = FileReadInputSchema;
export const PathCopyInputSchema = FileReadInputSchema.extend({ absolute: z.boolean() }).strict();

export const GitChangeSchema = z.object({
  indexStatus: z.string().length(1),
  worktreeStatus: z.string().length(1),
  path: z.string(),
  originalPath: z.string().nullable()
});

export const GitStatusSchema = z.object({
  available: z.boolean(),
  repositoryRoot: z.string().nullable(),
  branch: z.string().nullable(),
  head: z.string().nullable(),
  upstream: z.string().nullable(),
  ahead: z.number().int().nonnegative(),
  behind: z.number().int().nonnegative(),
  changes: z.array(GitChangeSchema),
  stats: z.array(z.object({
    path: z.string(),
    additions: z.number().int().nonnegative().nullable(),
    deletions: z.number().int().nonnegative().nullable(),
    binary: z.boolean()
  })),
  error: z.string().nullable()
});

export type GitStatus = z.infer<typeof GitStatusSchema>;

export const GitDiffSchema = z.object({
  baseline: z.object({
    head: z.string().nullable(),
    includeStaged: z.boolean(),
    includeUnstaged: z.boolean()
  }),
  staged: z.string(),
  unstaged: z.string(),
  truncated: z.boolean()
});

export type GitDiff = z.infer<typeof GitDiffSchema>;

export const CommandResultSchema = z.object({
  runId: z.string(),
  commandDisplay: z.string(),
  cwd: z.string(),
  exitCode: z.number().int().nullable(),
  signal: z.string().nullable(),
  stdout: z.string(),
  stderr: z.string(),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime(),
  durationMs: z.number().int().nonnegative(),
  timedOut: z.boolean(),
  truncated: z.boolean(),
  exitReason: z.enum(["EXITED", "TIMEOUT", "SPAWN_ERROR", "CANCELLED"])
});

export type CommandResult = z.infer<typeof CommandResultSchema>;

export const ThreadStateSchema = z.enum([
  "IDLE",
  "RUNNING",
  "WAITING_APPROVAL",
  "COMPLETED",
  "FAILED",
  "RECOVERY_REQUIRED"
]);

export const ThreadSummarySchema = z.object({
  id: z.string().min(8).max(128),
  projectId: z.string().min(8).max(128),
  title: z.string().min(1).max(160),
  state: ThreadStateSchema,
  pinned: z.boolean(),
  archived: z.boolean(),
  unread: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export type ThreadSummary = z.infer<typeof ThreadSummarySchema>;

export const MAX_ATTACHMENT_BYTES = 300 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_IMPORT = 20;

export const AttachmentSchema = z.object({
  id: z.string().min(8).max(128),
  threadId: z.string().min(8).max(128),
  itemId: z.string().min(8).max(128).nullable(),
  name: z.string().min(1).max(255),
  extension: z.string().max(32),
  mimeType: z.string().min(1).max(128),
  kind: z.enum(["text", "image", "pdf", "archive", "audio", "video", "binary"]),
  size: z.number().int().nonnegative().max(MAX_ATTACHMENT_BYTES),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  canPreview: z.boolean(),
  createdAt: z.string().datetime()
});

export type Attachment = z.infer<typeof AttachmentSchema>;

export const AttachmentRejectionSchema = z.object({
  name: z.string().min(1),
  code: z.enum([
    "ATTACHMENT_TOO_LARGE",
    "ATTACHMENT_NOT_REGULAR_FILE",
    "ATTACHMENT_LIMIT_EXCEEDED",
    "ATTACHMENT_CHANGED_DURING_IMPORT",
    "ATTACHMENT_IMPORT_FAILED"
  ])
});

export const AttachmentImportResultSchema = z.object({
  attachments: z.array(AttachmentSchema),
  rejected: z.array(AttachmentRejectionSchema)
});

export type AttachmentImportResult = z.infer<typeof AttachmentImportResultSchema>;

export const ThreadItemSchema = z.object({
  id: z.string().min(8).max(128),
  turnId: z.string().min(8).max(128),
  sequence: z.number().int().nonnegative(),
  role: z.enum(["user", "assistant", "activity", "command"]),
  content: z.string(),
  attachments: z.array(AttachmentSchema),
  createdAt: z.string().datetime()
});

export type ThreadItem = z.infer<typeof ThreadItemSchema>;

export const ThreadActivityEventSchema = z.object({
  threadId: z.string().min(8).max(128),
  kind: z.enum(["provider", "command", "evidence", "failure"]),
  message: z.string().trim().min(1).max(2_000),
  createdAt: z.string().datetime()
}).strict();

export type ThreadActivityEvent = z.infer<typeof ThreadActivityEventSchema>;

export const ThreadDetailSchema = z.object({
  thread: ThreadSummarySchema,
  items: z.array(ThreadItemSchema)
});

export type ThreadDetail = z.infer<typeof ThreadDetailSchema>;

export const ThreadListInputSchema = z.object({ projectId: z.string().min(8).max(128).optional() }).strict();
export const ThreadCreateInputSchema = ProjectIdInputSchema.extend({ title: z.string().min(1).max(160).default("Yeni görev") }).strict();
export const ThreadIdInputSchema = z.object({ threadId: z.string().min(8).max(128) }).strict();
export const ThreadMessageInputSchema = ThreadIdInputSchema.extend({
  content: z.string().trim().max(64_000),
  attachmentIds: z.array(z.string().min(8).max(128)).max(MAX_ATTACHMENTS_PER_IMPORT).default([])
}).strict().refine((input) => input.content.length > 0 || input.attachmentIds.length > 0, { message: "MESSAGE_CONTENT_OR_ATTACHMENT_REQUIRED" });
export const ThreadRenameInputSchema = ThreadIdInputSchema.extend({ title: z.string().trim().min(1).max(160) }).strict();
export const ThreadFlagInputSchema = ThreadIdInputSchema.extend({ value: z.boolean() }).strict();
export const ThreadItemInputSchema = ThreadIdInputSchema.extend({ itemId: z.string().min(8).max(128) }).strict();
export const ThreadItemUpdateInputSchema = ThreadItemInputSchema.extend({ content: z.string().trim().min(1).max(64_000) }).strict();
export const AttachmentImportPathsInputSchema = ThreadIdInputSchema.extend({
  filePaths: z.array(z.string().min(1).max(32_768)).min(1).max(MAX_ATTACHMENTS_PER_IMPORT)
}).strict();
export const AttachmentRemoveInputSchema = ThreadIdInputSchema.extend({ attachmentId: z.string().min(8).max(128) }).strict();

export const ContextMenuKindSchema = z.enum(["editable", "selection", "file", "directory", "terminal", "blank"]);
export const ContextMenuInputSchema = z.object({
  kind: ContextMenuKindSchema,
  hasSelection: z.boolean().default(false),
  canPaste: z.boolean().default(false)
}).strict();

export type ContextMenuKind = z.infer<typeof ContextMenuKindSchema>;
export const AppMenuInputSchema = z.object({ menu: z.enum(["file", "edit", "view", "help"]) }).strict();
export const TextCopyInputSchema = z.object({ text: z.string().max(2_000_000) }).strict();

export const BootstrapSchema = z.object({
  app: z.object({
    name: z.literal("DevBox"),
    version: z.string(),
    platform: z.string(),
    architecture: z.string(),
    desktopReady: z.boolean()
  }),
  core: z.object({
    state: CapabilityStateSchema,
    origin: z.string(),
    apiVersion: z.literal("v1")
  }),
  projects: z.array(ProjectSummarySchema),
  capabilities: z.array(CapabilitySchema)
});

export type Bootstrap = z.infer<typeof BootstrapSchema>;

export const TaskPresetSchema = z.enum(["git-status", "typecheck", "test", "build"]);
export const TaskRunInputSchema = ProjectIdInputSchema.extend({ preset: TaskPresetSchema }).strict();

export type TaskPreset = z.infer<typeof TaskPresetSchema>;

const HexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/u);

export const DevBoxThemeSchema = z.object({
  version: z.literal(1),
  name: z.string().trim().min(1).max(80),
  base: z.enum(["dark", "light", "system"]),
  accent: HexColorSchema,
  surface: HexColorSchema,
  ink: HexColorSchema,
  sidebar: HexColorSchema,
  panel: HexColorSchema,
  border: HexColorSchema,
  muted: HexColorSchema,
  success: HexColorSchema,
  warning: HexColorSchema,
  danger: HexColorSchema,
  uiFont: z.string().trim().min(1).max(120),
  codeFont: z.string().trim().min(1).max(120),
  codeThemeId: z.string().trim().min(1).max(120),
  contrast: z.enum(["normal", "high"])
}).strict();

export type DevBoxTheme = z.infer<typeof DevBoxThemeSchema>;

export const ApprovalPolicySchema = z.enum(["on-request", "always", "never"]);
export const SandboxPolicySchema = z.enum(["read-only", "workspace-write", "full-access"]);
export const PermissionProfileSchema = z.enum(["Tam erişim", "Onaylı", "Salt okunur"]);
export type PermissionProfile = z.infer<typeof PermissionProfileSchema>;

export const AppSettingsSchema = z.object({
  theme: DevBoxThemeSchema,
  permissionProfile: PermissionProfileSchema,
  approvalPolicy: ApprovalPolicySchema,
  sandboxPolicy: SandboxPolicySchema,
  networkAccess: z.boolean(),
  reduceMotion: z.boolean(),
  launchIntroMode: z.enum(["once", "always", "never"]),
  launchIntroSeen: z.boolean(),
  terminalShell: z.enum(["pwsh", "powershell", "cmd"])
}).strict();

export type AppSettings = z.infer<typeof AppSettingsSchema>;

export const SettingsPatchInputSchema = AppSettingsSchema.partial().extend({
  theme: DevBoxThemeSchema.partial().optional()
}).strict();
export type SettingsPatchInput = z.infer<typeof SettingsPatchInputSchema>;
export const ThemeImportInputSchema = z.object({ portable: z.string().min(1).max(16_384) }).strict();

export const TerminalSummarySchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().min(8).max(128),
  cwd: z.string().min(1),
  shell: z.string().min(1),
  pid: z.number().int().nonnegative(),
  cols: z.number().int().min(20).max(500),
  rows: z.number().int().min(5).max(300),
  state: z.enum(["RUNNING", "EXITED"]),
  exitCode: z.number().int().nullable(),
  createdAt: z.string().datetime()
}).strict();
export type TerminalSummary = z.infer<typeof TerminalSummarySchema>;
export const TerminalStartInputSchema = ProjectIdInputSchema.extend({
  cols: z.number().int().min(20).max(500).default(100),
  rows: z.number().int().min(5).max(300).default(30)
}).strict();
export const TerminalIdInputSchema = z.object({ terminalId: z.string().uuid() }).strict();
export const TerminalWriteInputSchema = TerminalIdInputSchema.extend({ data: z.string().max(64_000) }).strict();
export const TerminalResizeInputSchema = TerminalIdInputSchema.extend({
  cols: z.number().int().min(20).max(500),
  rows: z.number().int().min(5).max(300)
}).strict();
export const TerminalEventSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("data"), terminalId: z.string().uuid(), data: z.string().max(1_048_576) }).strict(),
  z.object({ kind: z.literal("exit"), terminalId: z.string().uuid(), exitCode: z.number().int(), signal: z.number().int().nullable() }).strict()
]);
export type TerminalEvent = z.infer<typeof TerminalEventSchema>;

export const WorktreeSchema = z.object({
  path: z.string().min(1),
  head: z.string().nullable(),
  branch: z.string().nullable(),
  bare: z.boolean(),
  detached: z.boolean(),
  locked: z.boolean(),
  lockReason: z.string().nullable(),
  prunable: z.boolean(),
  pruneReason: z.string().nullable(),
  isMain: z.boolean()
}).strict();
export type Worktree = z.infer<typeof WorktreeSchema>;
export const WorktreeCreateInputSchema = ProjectIdInputSchema.extend({
  name: z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/u),
  ref: z.string().trim().min(1).max(240).default("HEAD"),
  mode: z.enum(["detached", "branch"]).default("detached")
}).strict();
export const WorktreeRemoveInputSchema = ProjectIdInputSchema.extend({ path: z.string().min(1).max(32_768), force: z.boolean().default(false) }).strict();

export const AutomationScheduleSchema = z.object({
  rrule: z.string().trim().min(1).max(500),
  timezone: z.string().trim().min(1).max(120)
}).strict();
export const AutomationSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().min(8).max(128),
  name: z.string().trim().min(1).max(120),
  prompt: z.string().trim().min(1).max(64_000),
  schedule: AutomationScheduleSchema,
  enabled: z.boolean(),
  lastRunAt: z.string().datetime().nullable(),
  nextRunAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
}).strict();
export type Automation = z.infer<typeof AutomationSchema>;
export const AutomationCreateInputSchema = ProjectIdInputSchema.extend({
  name: z.string().trim().min(1).max(120),
  prompt: z.string().trim().min(1).max(64_000),
  schedule: AutomationScheduleSchema
}).strict();
export const AutomationIdInputSchema = z.object({ automationId: z.string().uuid() }).strict();

export const EvolutionTrackSchema = z.enum(["research", "architecture", "api", "coding", "design", "quality", "security", "release", "performance", "observability", "accessibility", "integrations", "documentation", "supply-chain"]);
export const EvolutionTaskSchema = z.object({
  id: z.string().uuid(),
  track: EvolutionTrackSchema,
  title: z.string().min(1).max(160),
  prompt: z.string().min(1).max(64_000),
  state: z.enum(["QUEUED", "RUNNING", "SUCCEEDED", "FAILED"]),
  provider: z.string().nullable(),
  model: z.string().nullable(),
  threadId: z.string().min(8).max(128).nullable(),
  evidence: z.array(z.string().min(1).max(256)).max(20),
  error: z.string().max(1_000).nullable(),
  createdAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable()
}).strict();
export type EvolutionTask = z.infer<typeof EvolutionTaskSchema>;

export const EvolutionLearningSchema = z.object({
  id: z.string().uuid(),
  track: EvolutionTrackSchema,
  title: z.string().min(1).max(160),
  summary: z.string().min(1).max(1_200),
  evidence: z.array(z.string().min(1).max(256)).max(20),
  learnedAt: z.string().datetime()
}).strict();
export type EvolutionLearning = z.infer<typeof EvolutionLearningSchema>;

export const EvolutionCampaignSchema = z.object({
  projectId: z.string().min(8).max(128),
  enabled: z.boolean(),
  directive: z.string().trim().min(80).max(64_000),
  score: z.number().int().min(0).max(100),
  level: z.number().int().min(1).max(10),
  stage: z.string().min(1).max(80),
  provider: z.string().min(1).max(80),
  model: z.string().min(1).max(160),
  completedCycles: z.number().int().nonnegative(),
  failedCycles: z.number().int().nonnegative(),
  cyclesToday: z.number().int().nonnegative(),
  cycleDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
  dailyCycleLimit: z.number().int().min(1).max(48),
  intervalMinutes: z.number().int().min(30).max(10_080),
  lastCycleAt: z.string().datetime().nullable(),
  nextCycleAt: z.string().datetime().nullable(),
  tasks: z.array(EvolutionTaskSchema).max(120),
  learnings: z.array(EvolutionLearningSchema).max(40),
  updatedAt: z.string().datetime()
}).strict();
export type EvolutionCampaign = z.infer<typeof EvolutionCampaignSchema>;
export const EvolutionToggleInputSchema = ProjectIdInputSchema.extend({ enabled: z.boolean() }).strict();
export const EvolutionDirectiveInputSchema = ProjectIdInputSchema.extend({ directive: z.string().trim().min(80).max(64_000) }).strict();

export const IntegrationKindSchema = z.enum(["github", "vercel", "ssh", "lsp", "dap", "marketplace", "updater", "signing"]);
export const IntegrationStatusSchema = z.object({
  kind: IntegrationKindSchema,
  state: CapabilityStateSchema,
  version: z.string().nullable(),
  account: z.string().nullable(),
  detail: z.string(),
  commands: z.array(z.string()),
  checkedAt: z.string().datetime()
}).strict();
export type IntegrationStatus = z.infer<typeof IntegrationStatusSchema>;
export const IntegrationInspectInputSchema = ProjectIdInputSchema.partial().strict();
export const VercelActionInputSchema = ProjectIdInputSchema.extend({
  action: z.enum(["link", "preview", "production", "inspect", "logs", "rollback"]),
  target: z.string().trim().max(2_048).default("")
}).strict();
export const GitHubActionInputSchema = ProjectIdInputSchema.extend({
  action: z.enum(["pr-list", "pr-create", "pr-merge", "issue-list", "issue-create", "checks", "run-list", "run-log", "run-rerun", "release-list", "release-create"]),
  target: z.string().trim().max(240).default("")
}).strict();
export const PlatformActionSchema = z.enum(["protocol-discover", "ssh-pin", "ssh-audit", "package-install", "package-list", "package-repair", "package-rollback"]);
export type PlatformAction = z.infer<typeof PlatformActionSchema>;
export const PlatformActionInputSchema = z.object({
  projectId: z.string().min(8).max(128).optional(),
  action: PlatformActionSchema,
  target: z.string().trim().max(512).default("")
}).strict();

export const IPC_CHANNELS = {
  bootstrap: "devbox:v1:bootstrap",
  capabilityInspect: "devbox:v1:capability:inspect",
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
  textCopy: "devbox:v1:clipboard:copy",
  settingsGet: "devbox:v1:settings:get",
  settingsPatch: "devbox:v1:settings:patch",
  themeImport: "devbox:v1:theme:import",
  themeExport: "devbox:v1:theme:export",
  terminalList: "devbox:v1:terminal:list",
  terminalStart: "devbox:v1:terminal:start",
  terminalWrite: "devbox:v1:terminal:write",
  terminalResize: "devbox:v1:terminal:resize",
  terminalKill: "devbox:v1:terminal:kill",
  terminalEvent: "devbox:v1:terminal:event",
  worktreeList: "devbox:v1:worktree:list",
  worktreeCreate: "devbox:v1:worktree:create",
  worktreeRemove: "devbox:v1:worktree:remove",
  evolutionGet: "devbox:v1:evolution:get",
  evolutionToggle: "devbox:v1:evolution:toggle",
  evolutionDirective: "devbox:v1:evolution:directive",
  evolutionRun: "devbox:v1:evolution:run",
  integrationInspect: "devbox:v1:integration:inspect",
  vercelAction: "devbox:v1:integration:vercel",
  githubAction: "devbox:v1:integration:github",
  platformAction: "devbox:v1:integration:platform"
} as const;
