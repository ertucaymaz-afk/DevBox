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

export const CatalogItemSchema = z.object({
  kind: z.enum(["skill", "plugin"]),
  id: z.string().min(1).max(160),
  name: z.string().min(1).max(200),
  productName: z.string().min(1).max(240),
  version: z.string().min(1).max(80),
  publisher: z.string().min(1).max(160),
  license: z.string().min(1).max(240),
  redistributionAllowed: z.boolean(),
  trustClass: z.enum(["PROPRIETARY_SOURCE", "LOCAL_HASH_VERIFIED", "LOCAL_SIDELOAD", "MANAGED_SIGNED_CATALOG"]),
  sourceState: z.enum(["MISSING", "HASH_VERIFIED", "BUNDLE_VERIFIED", "HASH_FAILED"]),
  runtimeState: z.enum(["SOURCE_ONLY", "NOT_INSTALLED", "INSTALLED", "RUNNING", "FAILED"]),
  doctorState: z.enum(["NOT_APPLICABLE", "NOT_RUN", "PASSED", "FAILED"]),
  toolCount: z.number().int().nonnegative(),
  tools: z.array(z.object({
    name: z.string().min(1).max(160),
    description: z.string().max(2_000).nullable(),
    inputSchema: z.record(z.string(), z.unknown())
  }).strict()).max(512),
  requestedPermissions: z.array(z.string().min(1).max(80)).max(64),
  grantedPermissions: z.array(z.string().min(1).max(80)).max(64),
  health: z.object({
    checkedAt: z.string().datetime().nullable(),
    consecutiveFailures: z.number().int().nonnegative(),
    lastError: z.string().max(2_000).nullable()
  }).strict().nullable(),
  detail: z.string(),
  evidence: z.array(z.string())
}).strict();
export type CatalogItem = z.infer<typeof CatalogItemSchema>;

export const CatalogToolCallInputSchema = z.object({
  pluginId: z.string().min(2).max(160),
  toolName: z.string().min(1).max(160),
  arguments: z.record(z.string(), z.unknown())
}).strict().superRefine((value, context) => {
  if (new TextEncoder().encode(JSON.stringify(value.arguments)).byteLength > 1_048_576) {
    context.addIssue({ code: "custom", message: "MCP_TOOL_ARGUMENT_LIMIT_EXCEEDED" });
  }
});
export type CatalogToolCallInput = z.infer<typeof CatalogToolCallInputSchema>;

export const CatalogToolCallResultSchema = z.object({
  pluginId: z.string(),
  toolName: z.string(),
  completedAt: z.string().datetime(),
  durationMs: z.number().int().nonnegative(),
  result: z.unknown()
}).strict();
export type CatalogToolCallResult = z.infer<typeof CatalogToolCallResultSchema>;

export const CatalogSnapshotSchema = z.object({
  inspectedAt: z.string().datetime(),
  skillRoot: z.string().nullable(),
  pluginRoot: z.string().nullable(),
  counts: z.object({
    total: z.number().int().nonnegative(),
    skills: z.number().int().nonnegative(),
    plugins: z.number().int().nonnegative(),
    installed: z.number().int().nonnegative(),
    running: z.number().int().nonnegative(),
    blocked: z.number().int().nonnegative()
  }).strict(),
  items: z.array(CatalogItemSchema),
  issues: z.array(z.string())
}).strict();
export type CatalogSnapshot = z.infer<typeof CatalogSnapshotSchema>;
export const CatalogSourceInputSchema = z.object({ kind: z.enum(["skill", "plugin"]) }).strict();

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
  kind: z.enum(["provider", "command", "evidence", "waiting", "failure"]),
  stage: z.string().trim().min(1).max(64).nullable().optional(),
  provider: z.string().trim().min(1).max(160).nullable().optional(),
  model: z.string().trim().min(1).max(200).nullable().optional(),
  message: z.string().trim().min(1).max(2_000),
  createdAt: z.string().datetime()
}).strict();

export type ThreadActivityEvent = z.infer<typeof ThreadActivityEventSchema>;

export const ThreadWorkspaceChangeSchema = z.object({
  path: z.string().trim().min(1).max(32_768),
  kind: z.enum(["added", "modified", "deleted", "reverted"]),
  beforeSha256: z.string().regex(/^[a-f0-9]{64}$/u).nullable(),
  afterSha256: z.string().regex(/^[a-f0-9]{64}$/u).nullable(),
  additions: z.number().int().nonnegative().nullable(),
  deletions: z.number().int().nonnegative().nullable(),
  binary: z.boolean(),
  verified: z.boolean()
}).strict();
export type ThreadWorkspaceChange = z.infer<typeof ThreadWorkspaceChangeSchema>;

export const ThreadWorkspaceResultSchema = z.object({
  threadId: z.string().min(8).max(128),
  turnId: z.string().min(8).max(128),
  projectId: z.string().min(8).max(128),
  intent: z.enum(["CHAT", "WORKSPACE_MUTATION"]),
  mutated: z.boolean(),
  verified: z.boolean(),
  gitHeadChanged: z.boolean(),
  baselineDirtyCount: z.number().int().nonnegative(),
  finalDirtyCount: z.number().int().nonnegative(),
  changedFiles: z.array(ThreadWorkspaceChangeSchema).max(200),
  primaryFile: z.string().max(32_768).nullable(),
  previewPath: z.string().max(32_768).nullable(),
  evidence: z.array(z.string().max(2_000)).max(64),
  createdAt: z.string().datetime()
}).strict();
export type ThreadWorkspaceResult = z.infer<typeof ThreadWorkspaceResultSchema>;

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
  selfDevelopmentProjectId: z.string().min(8).max(128).nullable(),
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

export const EvolutionTrackSchema = z.enum(["research", "architecture", "api", "coding", "design", "quality", "security", "release", "performance", "observability", "accessibility", "integrations", "documentation", "supply-chain", "cloud-continuity", "deployment-safety", "public-api-contract", "command-delivery", "disaster-recovery", "database-performance", "site-performance", "protocol-compatibility", "secret-rotation", "dependency-provenance"]);
export type EvolutionTrack = z.infer<typeof EvolutionTrackSchema>;
export const EvolutionTaskStateSchema = z.enum(["QUEUED", "PREPARING", "RUNNING", "VERIFYING", "REVIEWING", "SUCCEEDED", "FAILED", "BLOCKED_EXTERNAL", "CANCELLED", "RECOVERY_REQUIRED"]);
export const EvolutionRoutingModeSchema = z.enum(["AUTO", "LOCKED"]);
export const EvolutionProviderIdSchema = z.enum(["codex", "hermes-nvidia"]);
export const EvolutionReasoningEffortSchema = z.enum(["none", "minimal", "low", "medium", "high", "xhigh", "max"]);
export const EvolutionRoutingSchema = z.object({
  mode: EvolutionRoutingModeSchema,
  provider: EvolutionProviderIdSchema,
  model: z.string().trim().min(1).max(160),
  reasoningEffort: EvolutionReasoningEffortSchema,
  allowFallback: z.boolean()
}).strict();
export type EvolutionRouting = z.infer<typeof EvolutionRoutingSchema>;

export const EvolutionRuntimeStageSchema = z.enum([
  "IDLE", "QUEUEING", "PREPARING", "PROVIDER_CHECK", "AUTH_CHECK", "MODEL_ATTEMPT", "PLANNING", "INSPECTING",
  "EDITING", "RUNNING_COMMAND", "TESTING", "VERIFYING", "REVIEWING", "WAITING", "BACKOFF", "SETTLING",
  "COMPLETED", "FAILED", "BLOCKED_EXTERNAL", "CANCELLED", "RECOVERY_REQUIRED"
]);
export const EvolutionActivityEventSchema = z.object({
  id: z.string().uuid(),
  sequence: z.number().int().nonnegative(),
  projectId: z.string().min(8).max(128),
  taskId: z.string().uuid().nullable(),
  specTaskId: z.string().min(1).max(160).nullable(),
  durableJobId: z.string().min(1).max(160).nullable(),
  stage: EvolutionRuntimeStageSchema,
  kind: z.enum(["state", "provider", "command", "evidence", "waiting", "failure"]),
  provider: z.string().min(1).max(80).nullable(),
  model: z.string().min(1).max(160).nullable(),
  message: z.string().min(1).max(2_000),
  createdAt: z.string().datetime()
}).strict();
export type EvolutionActivityEvent = z.infer<typeof EvolutionActivityEventSchema>;

export const EvolutionRuntimeSchema = z.object({
  stage: EvolutionRuntimeStageSchema,
  detail: z.string().min(1).max(2_000),
  waitingReason: z.string().max(1_000).nullable(),
  activeTaskId: z.string().uuid().nullable(),
  activeSpecTaskId: z.string().min(1).max(160).nullable(),
  activePhaseId: z.string().min(1).max(32).nullable(),
  durableJobId: z.string().min(1).max(160).nullable(),
  provider: z.string().min(1).max(80).nullable(),
  model: z.string().min(1).max(160).nullable(),
  worktreePath: z.string().max(32_768).nullable(),
  startedAt: z.string().datetime().nullable(),
  updatedAt: z.string().datetime()
}).strict();
export type EvolutionRuntime = z.infer<typeof EvolutionRuntimeSchema>;

export const EvolutionSpecQueueItemSchema = z.object({
  taskId: z.string().min(1).max(160),
  phaseId: z.string().min(1).max(32),
  title: z.string().min(1).max(1_000),
  sourceLine: z.number().int().positive().nullable(),
  state: z.enum(["TODO", "RUNNING", "PASS", "FAILED", "BLOCKED_EXTERNAL", "CANCELLED", "RECOVERY_REQUIRED"]),
  attempts: z.number().int().nonnegative(),
  blockReason: z.string().max(1_000).nullable(),
  lastError: z.string().max(1_000).nullable(),
  updatedAt: z.string().datetime().nullable(),
  requirementCount: z.number().int().nonnegative(),
  testCount: z.number().int().nonnegative(),
  failureTestCount: z.number().int().nonnegative()
}).strict();
export const EvolutionPhaseSummarySchema = z.object({
  phaseId: z.string().regex(/^FAZ-\d{2}$/u),
  title: z.string().min(1).max(500),
  taskCount: z.number().int().nonnegative(),
  passCount: z.number().int().nonnegative(),
  failedCount: z.number().int().nonnegative(),
  blockedCount: z.number().int().nonnegative(),
  runningCount: z.number().int().nonnegative(),
  recoveryCount: z.number().int().nonnegative(),
  remainingCount: z.number().int().nonnegative(),
  currentTaskIndex: z.number().int().nonnegative().nullable(),
  gateState: z.enum(["TODO", "RUNNING", "PASS", "FAILED", "BLOCKED_EXTERNAL", "RECOVERY_REQUIRED"])
}).strict();
export type EvolutionPhaseSummary = z.infer<typeof EvolutionPhaseSummarySchema>;
export const EvolutionSpecSummarySchema = z.object({
  sourceSha256: z.string().regex(/^[A-Fa-f0-9]{64}$/u),
  phaseCount: z.number().int().positive(),
  totalTaskCount: z.number().int().nonnegative(),
  passCount: z.number().int().nonnegative(),
  failedCount: z.number().int().nonnegative(),
  blockedCount: z.number().int().nonnegative(),
  runningCount: z.number().int().nonnegative(),
  recoveryCount: z.number().int().nonnegative(),
  remainingCount: z.number().int().nonnegative(),
  currentPhaseId: z.string().regex(/^FAZ-\d{2}$/u).nullable(),
  currentPhaseTitle: z.string().max(500).nullable(),
  currentTaskIndex: z.number().int().nonnegative().nullable(),
  currentPhaseTaskCount: z.number().int().nonnegative().nullable(),
  currentGateState: z.enum(["TODO", "RUNNING", "PASS", "FAILED", "BLOCKED_EXTERNAL", "RECOVERY_REQUIRED"]).nullable(),
  phaseSummaries: z.array(EvolutionPhaseSummarySchema).length(22),
  queuePreview: z.array(EvolutionSpecQueueItemSchema).max(80)
}).strict();
export type EvolutionSpecSummary = z.infer<typeof EvolutionSpecSummarySchema>;

export const EvolutionTaskSchema = z.object({
  id: z.string().uuid(),
  specTaskId: z.string().min(1).max(160).nullable(),
  phaseId: z.string().min(1).max(32).nullable(),
  sourceLine: z.number().int().positive().nullable(),
  track: EvolutionTrackSchema,
  title: z.string().min(1).max(1_000),
  prompt: z.string().min(1).max(64_000),
  state: EvolutionTaskStateSchema,
  provider: z.string().nullable(),
  model: z.string().nullable(),
  threadId: z.string().min(8).max(128).nullable(),
  durableJobId: z.string().min(1).max(160).nullable(),
  evidence: z.array(z.string().min(1).max(256)).max(40),
  error: z.string().max(1_000).nullable(),
  attempts: z.number().int().nonnegative(),
  blockReason: z.string().max(1_000).nullable(),
  retryAfterAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  startedAt: z.string().datetime().nullable(),
  completedAt: z.string().datetime().nullable()
}).strict();
export type EvolutionTask = z.infer<typeof EvolutionTaskSchema>;

export const EvolutionLearningSchema = z.object({
  id: z.string().uuid(),
  track: EvolutionTrackSchema,
  title: z.string().min(1).max(1_000),
  summary: z.string().min(1).max(1_200),
  evidence: z.array(z.string().min(1).max(256)).max(40),
  learnedAt: z.string().datetime()
}).strict();
export type EvolutionLearning = z.infer<typeof EvolutionLearningSchema>;

export const EvolutionCampaignSchema = z.object({
  maturityModelVersion: z.literal(2),
  projectId: z.string().min(8).max(128),
  enabled: z.boolean(),
  isRunning: z.boolean(),
  directive: z.string().trim().min(80).max(64_000),
  routing: EvolutionRoutingSchema,
  runtime: EvolutionRuntimeSchema,
  activity: z.array(EvolutionActivityEventSchema).max(240),
  spec: EvolutionSpecSummarySchema,
  score: z.number().int().min(0).max(100),
  level: z.number().int().min(1),
  lifetimeLevel: z.number().int().min(1),
  migrationFloorLevel: z.number().int().min(1),
  lifetimeEvidencePoints: z.number().int().nonnegative(),
  validatedImprovementCount: z.number().int().nonnegative(),
  stablePromotionCount: z.number().int().nonnegative(),
  verifiedResearchCount: z.number().int().nonnegative(),
  verifiedRegressionFixCount: z.number().int().nonnegative(),
  domainScores: z.record(EvolutionTrackSchema, z.number().int().min(0).max(100)),
  stage: z.string().min(1).max(80),
  provider: z.string().min(1).max(80),
  model: z.string().min(1).max(160),
  modelEffort: EvolutionReasoningEffortSchema,
  lastProvider: z.string().min(1).max(80).nullable(),
  lastModel: z.string().min(1).max(160).nullable(),
  completedCycles: z.number().int().nonnegative(),
  failedCycles: z.number().int().nonnegative(),
  cyclesToday: z.number().int().nonnegative(),
  cycleDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
  dailyCycleLimit: z.null(),
  intervalMinutes: z.number().int().min(30).max(10_080),
  lastCycleAt: z.string().datetime().nullable(),
  nextCycleAt: z.string().datetime().nullable(),
  lastCycleDurationMs: z.number().int().nonnegative().nullable(),
  lastError: z.string().max(1_000).nullable(),
  tasks: z.array(EvolutionTaskSchema).max(500),
  learnings: z.array(EvolutionLearningSchema).max(500),
  updatedAt: z.string().datetime()
}).strict();
export type EvolutionCampaign = z.infer<typeof EvolutionCampaignSchema>;
export const EvolutionToggleInputSchema = ProjectIdInputSchema.extend({ enabled: z.boolean() }).strict();
export const EvolutionDirectiveInputSchema = ProjectIdInputSchema.extend({ directive: z.string().trim().min(80).max(64_000) }).strict();
export const EvolutionRoutingInputSchema = ProjectIdInputSchema.extend({ routing: EvolutionRoutingSchema }).strict();
export const EvolutionCancelInputSchema = ProjectIdInputSchema.strict();
export const EvolutionModelCatalogItemSchema = z.object({
  id: z.string().min(1).max(200),
  displayName: z.string().min(1).max(240),
  provider: z.enum(["codex", "hermes-nvidia"]),
  supportedReasoningEfforts: z.array(EvolutionReasoningEffortSchema).max(16),
  hidden: z.boolean(),
  source: z.enum(["codex-app-server", "nvidia-models-api", "configured-fallback"]),
  discoveredAt: z.string().datetime()
}).strict();
export type EvolutionModelCatalogItem = z.infer<typeof EvolutionModelCatalogItemSchema>;

export const EvolutionModelCatalogSchema = z.object({
  provider: z.enum(["codex", "hermes-nvidia"]),
  state: z.enum(["READY", "UNAVAILABLE", "FAILED"]),
  detail: z.string().min(1).max(1_000),
  items: z.array(EvolutionModelCatalogItemSchema).max(500),
  checkedAt: z.string().datetime()
}).strict();
export type EvolutionModelCatalog = z.infer<typeof EvolutionModelCatalogSchema>;

export const EvolutionModelCatalogInputSchema = ProjectIdInputSchema.extend({
  provider: z.enum(["codex", "hermes-nvidia"])
}).strict();
export const EvolutionActivityHistoryInputSchema = ProjectIdInputSchema.extend({
  limit: z.number().int().min(1).max(500).default(120)
}).strict();
export const EvolutionActivityHistorySchema = z.array(EvolutionActivityEventSchema).max(500);


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

export const SourcePositionSchema = z.object({ line: z.number().int().nonnegative(), character: z.number().int().nonnegative() }).strict();
export const SourceRangeSchema = z.object({ start: SourcePositionSchema, end: SourcePositionSchema }).strict();
export const EditorDiagnosticSchema = z.object({
  severity: z.enum(["error", "warning", "information", "hint"]),
  message: z.string().min(1).max(16_000),
  source: z.string().max(160).nullable(),
  code: z.union([z.string(), z.number()]).nullable(),
  range: SourceRangeSchema
}).strict();
export type EditorDiagnostic = z.infer<typeof EditorDiagnosticSchema>;
export const LanguageDiagnosticsInputSchema = FileReadInputSchema.extend({
  language: z.enum(["typescript", "typescriptreact", "javascript", "javascriptreact"]),
  content: z.string().max(1_048_576),
  version: z.number().int().positive()
}).strict();
export const LanguageDiagnosticsResultSchema = z.object({
  provider: z.literal("typescript-language-server"),
  diagnostics: z.array(EditorDiagnosticSchema).max(10_000),
  durationMs: z.number().int().nonnegative()
}).strict();
export type LanguageDiagnosticsResult = z.infer<typeof LanguageDiagnosticsResultSchema>;

export const DebugStartInputSchema = ProjectIdInputSchema.extend({
  executable: z.string().trim().min(1).max(32_768),
  arguments: z.array(z.string().max(8_192)).max(128).default([]),
  request: z.enum(["launch", "attach"]),
  configuration: z.record(z.string(), z.unknown())
}).strict();
export const DebugSessionInputSchema = z.object({ sessionId: z.string().uuid() }).strict();
export const DebugCommandInputSchema = DebugSessionInputSchema.extend({
  command: z.enum(["continue", "pause", "next", "stepIn", "stepOut", "threads", "stackTrace", "scopes", "variables", "setBreakpoints"]),
  arguments: z.record(z.string(), z.unknown()).default({})
}).strict();
export const DebugSessionSchema = z.object({
  id: z.string().uuid(),
  state: z.enum(["STARTING", "RUNNING", "PAUSED", "STOPPED", "FAILED"]),
  adapter: z.string(),
  capabilities: z.record(z.string(), z.unknown()),
  lastEvent: z.record(z.string(), z.unknown()).nullable()
}).strict();
export type DebugSession = z.infer<typeof DebugSessionSchema>;
export const DebugResponseSchema = z.object({ session: DebugSessionSchema, body: z.unknown() }).strict();
export type DebugResponse = z.infer<typeof DebugResponseSchema>;

export const RemoteWorkerSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(80),
  capabilities: z.array(z.string().min(1).max(80)).max(64),
  status: z.enum(["ONLINE", "OFFLINE", "REVOKED"]),
  lastSeenAt: z.string().datetime(),
  pairedAt: z.string().datetime(),
  revokedAt: z.string().datetime().nullable()
}).strict();
export type RemoteWorker = z.infer<typeof RemoteWorkerSchema>;
export const WorkerPairingSchema = z.object({ code: z.string().min(10).max(128), expiresAt: z.string().datetime(), endpoint: z.string().url() }).strict();
export type WorkerPairing = z.infer<typeof WorkerPairingSchema>;
export const RemoteWorkerIdInputSchema = z.object({ workerId: z.string().uuid() }).strict();
export const RemoteJobInputSchema = z.object({ kind: z.string().trim().min(1).max(80), payload: z.unknown() }).strict();
export const RemoteJobIdInputSchema = z.object({ jobId: z.string().uuid() }).strict();
export const DurableJobStateSchema = z.enum(["QUEUED", "LEASED", "RUNNING", "CANCEL_REQUESTED", "SUCCEEDED", "FAILED", "CANCELLED"]);
export const DurableJobSummarySchema = z.object({
  id: z.string().uuid(),
  kind: z.string(),
  aggregateId: z.string().nullable(),
  state: DurableJobStateSchema,
  attempt: z.number().int().nonnegative(),
  payload: z.unknown(),
  result: z.unknown().nullable(),
  leaseOwner: z.string().nullable(),
  leaseExpiresAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
}).passthrough();
export type DurableJobSummary = z.infer<typeof DurableJobSummarySchema>;

export const IPC_CHANNELS = {
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
  evolutionRouting: "devbox:v1:evolution:routing",
  evolutionCancel: "devbox:v1:evolution:cancel",
  evolutionActivity: "devbox:v1:evolution:activity",
  evolutionActivityHistory: "devbox:v1:evolution:activity-history",
  evolutionModelCatalog: "devbox:v1:evolution:model-catalog",
  devApiControlGet: "devbox:v1:devapi:control-get",
  evolutionFindingTransition: "devbox:v1:devapi:finding-transition",
  releaseGateRun: "devbox:v1:devapi:release-gate-run",
  cloudControlSync: "devbox:v1:devapi:cloud-sync",
  remixRotaInspect: "devbox:v1:remixrota:inspect",
  remixRotaSelectExecutable: "devbox:v1:remixrota:select-executable",
  remixRotaConnect: "devbox:v1:remixrota:connect",
  remixRotaDisconnect: "devbox:v1:remixrota:disconnect",
  remixRotaInvoke: "devbox:v1:remixrota:invoke",
  remixRotaEvent: "devbox:v1:remixrota:event",
  integrationInspect: "devbox:v1:integration:inspect",
  vercelAction: "devbox:v1:integration:vercel",
  githubAction: "devbox:v1:integration:github",
  platformAction: "devbox:v1:integration:platform"
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
} as const;
