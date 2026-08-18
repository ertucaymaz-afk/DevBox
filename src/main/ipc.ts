import { randomUUID } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, type IpcMainInvokeEvent, type MenuItemConstructorOptions } from "electron";
import type { Bootstrap } from "../shared/contracts.js";
import {
  AppMenuInputSchema,
  AppSettingsSchema,
  AttachmentImportPathsInputSchema,
  AttachmentImportResultSchema,
  AttachmentSchema,
  AttachmentRemoveInputSchema,
  BootstrapSchema,
  CapabilitySchema,
  CatalogSnapshotSchema,
  CatalogSourceInputSchema,
  CatalogToolCallInputSchema,
  CatalogToolCallResultSchema,
  CommandResultSchema,
  DebugCommandInputSchema,
  DebugResponseSchema,
  DebugSessionInputSchema,
  DebugSessionSchema,
  DebugStartInputSchema,
  ContextMenuInputSchema,
  EvolutionCampaignSchema,
  EvolutionDirectiveInputSchema,
  EvolutionRoutingInputSchema,
  EvolutionCancelInputSchema,
  EvolutionActivityEventSchema,
  EvolutionActivityHistoryInputSchema,
  EvolutionActivityHistorySchema,
  EvolutionModelCatalogInputSchema,
  EvolutionModelCatalogSchema,
  EvolutionToggleInputSchema,
  FileCreateInputSchema,
  FileDuplicateInputSchema,
  FileReadInputSchema,
  FileRenameInputSchema,
  FileSnapshotSchema,
  FileWriteInputSchema,
  GitDiffSchema,
  GitStatusSchema,
  GitHubActionInputSchema,
  IntegrationInspectInputSchema,
  IntegrationStatusSchema,
  IPC_CHANNELS,
  LanguageDiagnosticsInputSchema,
  LanguageDiagnosticsResultSchema,
  PathCopyInputSchema,
  PlatformActionInputSchema,
  ProjectIdInputSchema,
  ProjectSummarySchema,
  ProjectTreeNodeSchema,
  RemoteJobInputSchema,
  RemoteJobIdInputSchema,
  RemoteWorkerIdInputSchema,
  RemoteWorkerSchema,
  WorkerPairingSchema,
  DurableJobSummarySchema,
  SettingsPatchInputSchema,
  TaskRunInputSchema,
  TextCopyInputSchema,
  TerminalIdInputSchema,
  TerminalResizeInputSchema,
  TerminalStartInputSchema,
  TerminalSummarySchema,
  TerminalWriteInputSchema,
  ThemeImportInputSchema,
  ThreadCreateInputSchema,
  ThreadActivityEventSchema,
  ThreadWorkspaceResultSchema,
  ThreadDetailSchema,
  ThreadFlagInputSchema,
  ThreadIdInputSchema,
  ThreadItemInputSchema,
  ThreadItemUpdateInputSchema,
  ThreadListInputSchema,
  ThreadMessageInputSchema,
  ThreadRenameInputSchema,
  ThreadSummarySchema,
  VercelActionInputSchema,
  WorktreeCreateInputSchema,
  WorktreeRemoveInputSchema,
  WorktreeSchema
} from "../shared/contracts.js";
import type { CapabilityService } from "./services/capability-service.js";
import { isWorkspaceMutationRequest, type AgentService } from "./services/agent-service.js";
import type { ApiEvolutionService } from "./services/api-evolution-service.js";
import type { AttachmentService } from "./services/attachment-service.js";
import type { CoreApi } from "./services/core-api.js";
import type { GitService } from "./services/git-service.js";
import type { IntegrationService } from "./services/integration-service.js";
import type { LocalCatalogService } from "./services/local-catalog-service.js";
import type { DebugService, LanguageService } from "./services/language-debug-service.js";
import type { PackageLifecycleService } from "./services/package-lifecycle-service.js";
import type { ProjectService } from "./services/project-service.js";
import type { RemoteWorkerService } from "./services/remote-worker-service.js";
import type { SettingsService } from "./services/settings-service.js";
import type { SshTrustService } from "./services/ssh-trust-service.js";
import type { TaskService } from "./services/task-service.js";
import type { TerminalService } from "./services/terminal-service.js";
import type { WorktreeService } from "./services/worktree-service.js";
import type { WorkspaceTurnService } from "./services/workspace-turn-service.js";

type IpcServices = {
  coreApi: CoreApi;
  capabilities: CapabilityService;
  agent: AgentService;
  evolution: ApiEvolutionService;
  attachments: AttachmentService;
  projects: ProjectService;
  selfDevelopmentProjectId: string | null;
  git: GitService;
  workspaceTurns: WorkspaceTurnService;
  tasks: TaskService;
  settings: SettingsService;
  terminals: TerminalService;
  worktrees: WorktreeService;
  integrations: IntegrationService;
  catalog: LocalCatalogService;
  packages: PackageLifecycleService;
  sshTrust: SshTrustService;
  language: LanguageService;
  debug: DebugService;
  remoteWorkers: RemoteWorkerService;
  database: import("./services/database.js").StateDatabase;
  probeCwd: string;
  rendererWebContentsId: number;
};

type GuardedOperation = {
  title: string;
  message: string;
  detail: string;
  risky: boolean;
};

async function enforcePermissionPolicy(event: IpcMainInvokeEvent, services: IpcServices, operation: GuardedOperation): Promise<void> {
  const policy = services.settings.get();
  const requiresApproval = policy.approvalPolicy === "always" || (policy.approvalPolicy === "on-request" && operation.risky);
  if (!requiresApproval) return;
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window) throw new Error("WINDOW_NOT_FOUND");
  const confirmation = await dialog.showMessageBox(window, {
    type: operation.risky ? "warning" : "question",
    title: `DevBox — ${operation.title}`,
    message: operation.message,
    detail: `${operation.detail}\n\nEtkin profil: ${policy.permissionProfile} · sandbox: ${policy.sandboxPolicy} · ağ: ${policy.networkAccess ? "açık" : "yalnız bu onayla"}`,
    buttons: ["Vazgeç", "Bu işleme izin ver"],
    defaultId: 0,
    cancelId: 0,
    noLink: true
  });
  if (confirmation.response !== 1) throw new Error("OPERATION_NOT_APPROVED");
}

function localCommandResult(commandDisplay: string, cwd: string, started: number, stdout: string, options: { stderr?: string; cancelled?: boolean } = {}): import("../shared/contracts.js").CommandResult {
  const endedAt = new Date().toISOString();
  return {
    runId: randomUUID(),
    commandDisplay,
    cwd,
    exitCode: options.cancelled ? null : options.stderr ? 1 : 0,
    signal: null,
    stdout,
    stderr: options.stderr ?? "",
    startedAt: new Date(Date.now() - Math.max(0, Math.round(performance.now() - started))).toISOString(),
    endedAt,
    durationMs: Math.max(0, Math.round(performance.now() - started)),
    timedOut: false,
    truncated: false,
    exitReason: options.cancelled ? "CANCELLED" : "EXITED"
  };
}

function packageTarget(value: string): { kind: "plugin" | "mcp" | "toolkit" | "update"; id: string } {
  const match = /^(plugin|mcp|toolkit|update)\/([a-z0-9][a-z0-9._-]{1,127})$/u.exec(value.trim());
  if (!match) throw new Error("PACKAGE_TARGET_EXPECTED_KIND_SLASH_ID");
  return { kind: match[1] as "plugin" | "mcp" | "toolkit" | "update", id: match[2]! };
}

function assertTrustedRenderer(event: IpcMainInvokeEvent, expectedWebContentsId: number): void {
  const senderFrame = event.senderFrame;
  if (!senderFrame || event.sender.id !== expectedWebContentsId || senderFrame !== senderFrame.top) {
    throw new Error("UNTRUSTED_IPC_SENDER");
  }
  const senderUrl = senderFrame.url;
  const trusted = senderUrl.startsWith("app://devbox/") || senderUrl.startsWith("http://127.0.0.1:5173/");
  if (!trusted) throw new Error("UNTRUSTED_IPC_ORIGIN");
}

function registerHandler<TInput, TOutput>(
  channel: string,
  expectedWebContentsId: number,
  handler: (input: TInput, event: IpcMainInvokeEvent) => Promise<TOutput>
): void {
  ipcMain.handle(channel, async (event, input: TInput) => {
    assertTrustedRenderer(event, expectedWebContentsId);
    return await handler(input, event);
  });
}

async function popupMenu(event: IpcMainInvokeEvent, template: MenuItemConstructorOptions[]): Promise<string | null> {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window) throw new Error("WINDOW_NOT_FOUND");
  return await new Promise<string | null>((resolve) => {
    let settled = false;
    const finish = (action: string | null): void => {
      if (settled) return;
      settled = true;
      resolve(action);
    };
    const hydrated = template.map((item) => item.id && !item.role && item.type !== "separator"
      ? { ...item, click: (): void => finish(item.id ?? null) }
      : item);
    const menu = Menu.buildFromTemplate(hydrated);
    menu.popup({ window, callback: () => finish(null) });
  });
}

export function registerIpcHandlers(services: IpcServices): () => void {
  const channels = Object.values(IPC_CHANNELS);

  registerHandler(IPC_CHANNELS.bootstrap, services.rendererWebContentsId, async (): Promise<Bootstrap> => {
    const bootstrap = {
      app: {
        name: "DevBox" as const,
        version: app.getVersion(),
        platform: process.platform,
        architecture: process.arch,
        desktopReady: true
      },
      core: { state: "READY" as const, origin: services.coreApi.origin, apiVersion: "v1" as const },
      projects: services.projects.list(),
      selfDevelopmentProjectId: services.selfDevelopmentProjectId,
      // Live provider probes can take seconds or wait on the network. They are
      // intentionally decoupled from the local shell bootstrap below.
      capabilities: []
    };
    return BootstrapSchema.parse(bootstrap);
  });

  registerHandler(IPC_CHANNELS.capabilityInspect, services.rendererWebContentsId, async () => {
    return CapabilitySchema.array().parse(await services.capabilities.inspect(services.probeCwd));
  });

  registerHandler(IPC_CHANNELS.catalogInspect, services.rendererWebContentsId, async () => {
    return CatalogSnapshotSchema.parse(await services.catalog.inspect());
  });

  registerHandler(IPC_CHANNELS.catalogSourceSelect, services.rendererWebContentsId, async (raw) => {
    const input = CatalogSourceInputSchema.parse(raw);
    const selection = await dialog.showOpenDialog({
      title: input.kind === "skill" ? "DevBox — Beceriler kaynak klasörü" : "DevBox — Eklentiler kaynak klasörü",
      properties: ["openDirectory"]
    });
    if (selection.canceled || !selection.filePaths[0]) return CatalogSnapshotSchema.parse(await services.catalog.inspect());
    return CatalogSnapshotSchema.parse(await services.catalog.setSource(input.kind, selection.filePaths[0]));
  });

  registerHandler(IPC_CHANNELS.catalogInstallPlugins, services.rendererWebContentsId, async (_raw, event) => {
    await enforcePermissionPolicy(event, services, {
      title: "Taşınabilir eklentileri etkinleştir",
      message: "SHA-256 ile doğrulanan 12 MIT eklentisi DevBox yerel çalışma alanına kurulsun mu?",
      detail: "Arşiv yolları denetlenir, ayrı bir alana çıkarılır ve her MCP sunucusunun doktoru yeniden çalıştırılır. Bir kontrol geçmezse kurulum etkinleşmez.",
      risky: true
    });
    return CatalogSnapshotSchema.parse(await services.catalog.installPortablePlugins());
  });

  registerHandler(IPC_CHANNELS.catalogConnectPlugins, services.rendererWebContentsId, async (_raw, event) => {
    await enforcePermissionPolicy(event, services, {
      title: "Yerel MCP sunucularını bağla",
      message: "Kurulu 12 MIT eklentisinin MCP sunucuları ayrı işlemlerde başlatılsın mı?",
      detail: "DevBox her süreçle gerçek MCP initialize ve tools/list görüşmesi yapar. Alt süreçlere API anahtarı aktarılmaz; başarısız süreç çalışıyor olarak gösterilmez.",
      risky: true
    });
    return CatalogSnapshotSchema.parse(await services.catalog.connectPortablePlugins());
  });

  registerHandler(IPC_CHANNELS.catalogDisconnectPlugins, services.rendererWebContentsId, async () => {
    return CatalogSnapshotSchema.parse(await services.catalog.disconnectPortablePlugins());
  });

  registerHandler(IPC_CHANNELS.catalogCallTool, services.rendererWebContentsId, async (raw, event) => {
    const input = CatalogToolCallInputSchema.parse(raw);
    await enforcePermissionPolicy(event, services, {
      title: "Eklenti aracını çalıştır",
      message: `${input.pluginId} eklentisindeki “${input.toolName}” aracı çalıştırılsın mı?`,
      detail: "Araç ayrı bir MCP alt sürecinde çalışır. DevBox giriş ve çıkış boyutunu sınırlar ve API anahtarlarını alt sürece aktarmaz; bu sürüm Windows AppContainer düzeyinde dosya/ağ sandbox'ı sağlamaz.",
      risky: true
    });
    return CatalogToolCallResultSchema.parse(await services.catalog.callPortablePluginTool(input.pluginId, input.toolName, input.arguments));
  });

  registerHandler(IPC_CHANNELS.projectOpen, services.rendererWebContentsId, async () => {
    const result = await dialog.showOpenDialog({
      title: "DevBox — Proje aç",
      properties: ["openDirectory", "createDirectory"],
      securityScopedBookmarks: false
    });
    if (result.canceled || !result.filePaths[0]) return null;
    return ProjectSummarySchema.parse(await services.projects.open(result.filePaths[0]));
  });

  registerHandler(IPC_CHANNELS.projectReveal, services.rendererWebContentsId, async (unknownInput) => {
    const input = ProjectIdInputSchema.parse(unknownInput);
    services.projects.revealProject(input.projectId);
  });

  registerHandler(IPC_CHANNELS.projectTree, services.rendererWebContentsId, async (unknownInput) => {
    const input = ProjectIdInputSchema.parse(unknownInput);
    return ProjectTreeNodeSchema.array().parse(await services.projects.tree(input.projectId));
  });

  registerHandler(IPC_CHANNELS.fileRead, services.rendererWebContentsId, async (unknownInput) => {
    const input = FileReadInputSchema.parse(unknownInput);
    return FileSnapshotSchema.parse(await services.projects.readFile(input.projectId, input.relativePath));
  });

  registerHandler(IPC_CHANNELS.fileWrite, services.rendererWebContentsId, async (unknownInput, event) => {
    const input = FileWriteInputSchema.parse(unknownInput);
    await enforcePermissionPolicy(event, services, { title: "Dosyayı kaydet", message: `“${input.relativePath}” dosyasına yazılsın mı?`, detail: "Yazma yalnız seçili canonical proje kökünde ve beklenen SHA-256 sürümü eşleşirse yapılır.", risky: false });
    return FileSnapshotSchema.parse(await services.projects.writeFile(input.projectId, input.relativePath, input.expectedSha256, input.content));
  });

  registerHandler(IPC_CHANNELS.fileCreate, services.rendererWebContentsId, async (unknownInput, event) => {
    const input = FileCreateInputSchema.parse(unknownInput);
    await enforcePermissionPolicy(event, services, { title: "Proje öğesi oluştur", message: `“${input.name}” oluşturulsun mu?`, detail: "İşlem yalnız seçili proje kökünde gerçekleştirilir.", risky: false });
    return ProjectTreeNodeSchema.array().parse(await services.projects.createPath(input.projectId, input.parentRelativePath, input.name, input.kind));
  });

  registerHandler(IPC_CHANNELS.fileRename, services.rendererWebContentsId, async (unknownInput, event) => {
    const input = FileRenameInputSchema.parse(unknownInput);
    await enforcePermissionPolicy(event, services, { title: "Yeniden adlandır", message: `“${input.relativePath}” yeniden adlandırılsın mı?`, detail: `Yeni ad: ${input.newName}`, risky: false });
    return ProjectTreeNodeSchema.array().parse(await services.projects.renamePath(input.projectId, input.relativePath, input.newName));
  });

  registerHandler(IPC_CHANNELS.fileDuplicate, services.rendererWebContentsId, async (unknownInput, event) => {
    const input = FileDuplicateInputSchema.parse(unknownInput);
    await enforcePermissionPolicy(event, services, { title: "Çoğalt", message: `“${input.relativePath}” çoğaltılsın mı?`, detail: "Kopya yalnız seçili proje kökünde oluşturulur.", risky: false });
    return ProjectTreeNodeSchema.array().parse(await services.projects.duplicatePath(input.projectId, input.relativePath));
  });

  registerHandler(IPC_CHANNELS.fileTrash, services.rendererWebContentsId, async (unknownInput, event) => {
    const input = FileReadInputSchema.parse(unknownInput);
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) throw new Error("WINDOW_NOT_FOUND");
    const confirmation = await dialog.showMessageBox(window, {
      type: "warning",
      title: "DevBox — Geri Dönüşüm Kutusu",
      message: `“${input.relativePath}” Geri Dönüşüm Kutusu'na taşınsın mı?`,
      detail: "Bu işlem dosyayı kalıcı olarak silmez; Windows Geri Dönüşüm Kutusu'ndan kurtarabilirsiniz.",
      buttons: ["Vazgeç", "Taşı"],
      defaultId: 0,
      cancelId: 0,
      noLink: true
    });
    if (confirmation.response !== 1) return ProjectTreeNodeSchema.array().parse(await services.projects.tree(input.projectId));
    return ProjectTreeNodeSchema.array().parse(await services.projects.trashPath(input.projectId, input.relativePath));
  });

  registerHandler(IPC_CHANNELS.fileReveal, services.rendererWebContentsId, async (unknownInput) => {
    const input = FileReadInputSchema.parse(unknownInput);
    await services.projects.revealPath(input.projectId, input.relativePath);
  });

  registerHandler(IPC_CHANNELS.pathCopy, services.rendererWebContentsId, async (unknownInput) => {
    const parsed = PathCopyInputSchema.parse(unknownInput);
    clipboard.writeText(await services.projects.displayPath(parsed.projectId, parsed.relativePath, parsed.absolute));
  });

  registerHandler(IPC_CHANNELS.gitStatus, services.rendererWebContentsId, async (unknownInput) => {
    const input = ProjectIdInputSchema.parse(unknownInput);
    return GitStatusSchema.parse(await services.git.status(services.projects.get(input.projectId).rootPath));
  });

  registerHandler(IPC_CHANNELS.gitDiff, services.rendererWebContentsId, async (unknownInput) => {
    const input = ProjectIdInputSchema.parse(unknownInput);
    return GitDiffSchema.parse(await services.git.diff(services.projects.get(input.projectId).rootPath));
  });

  registerHandler(IPC_CHANNELS.taskRunPreset, services.rendererWebContentsId, async (unknownInput, event) => {
    const input = TaskRunInputSchema.parse(unknownInput);
    const project = services.projects.get(input.projectId);
    await enforcePermissionPolicy(event, services, { title: "Proje komutu", message: `“${input.preset}” görevi çalıştırılsın mı?`, detail: `Çalışma dizini canonical proje köküne sabitlenir: ${project.rootPath}`, risky: input.preset !== "git-status" });
    return CommandResultSchema.parse(await services.tasks.runPreset(project.rootPath, input.preset));
  });

  registerHandler(IPC_CHANNELS.threadList, services.rendererWebContentsId, async (unknownInput) => {
    const input = ThreadListInputSchema.parse(unknownInput ?? {});
    return ThreadSummarySchema.array().parse(services.database.listThreads(input.projectId));
  });

  registerHandler(IPC_CHANNELS.threadCreate, services.rendererWebContentsId, async (unknownInput) => {
    const input = ThreadCreateInputSchema.parse(unknownInput);
    return ThreadDetailSchema.parse(services.database.createThread(input.projectId, input.title));
  });

  registerHandler(IPC_CHANNELS.threadGet, services.rendererWebContentsId, async (unknownInput) => {
    const input = ThreadIdInputSchema.parse(unknownInput);
    return ThreadDetailSchema.parse(services.database.getThread(input.threadId));
  });

  registerHandler(IPC_CHANNELS.threadMessage, services.rendererWebContentsId, async (unknownInput, event) => {
    const input = ThreadMessageInputSchema.parse(unknownInput);
    const current = services.database.getThread(input.threadId);
    const project = services.projects.get(current.thread.projectId);
    const workspaceIntent = isWorkspaceMutationRequest(input.content);
    await enforcePermissionPolicy(event, services, {
      title: workspaceIntent ? "Çalışma alanı değişikliği" : "NVIDIA ajan isteği",
      message: workspaceIntent ? "Bu görev seçili proje dosyalarını gerçekten değiştirebilir. Devam edilsin mi?" : "Bu görev Hermes üzerinden NVIDIA NIM sağlayıcısına gönderilsin mi?",
      detail: workspaceIntent ? `Hedef kök: ${project.rootPath} · DevBox değişiklikten önce/sonra dosya hash'lerini karşılaştırır ve disk geri okuması olmadan başarı göstermez.` : "DevBox, son görev metnini ve sınırlandırılmış sohbet bağlamını gönderir; ortam gizli değerini renderer'a taşımaz.",
      risky: workspaceIntent
    });
    const baseline = workspaceIntent ? await services.workspaceTurns.capture(project.id) : null;
    const started = services.database.beginMessage(input.threadId, input.content, input.attachmentIds);
    if (!event.sender.isDestroyed()) event.sender.send(IPC_CHANNELS.threadSnapshot, ThreadDetailSchema.parse(started.detail));
    const publishActivity = (activity: { kind: "provider" | "command" | "evidence" | "waiting" | "failure"; stage?: string | null; provider?: string | null; model?: string | null; message: string; createdAt: string }): void => {
      const payload = ThreadActivityEventSchema.parse({ threadId: input.threadId, ...activity });
      services.database.appendTurnActivity(input.threadId, started.turnId, payload.message, payload.createdAt);
      if (!event.sender.isDestroyed()) event.sender.send(IPC_CHANNELS.threadActivity, payload);
    };
    let assistantContent: string;
    try {
      const attachmentContext = await services.attachments.buildAgentContext(input.threadId, input.attachmentIds, false);
      const agentPrompt = `${input.content || "Ekli dosyaları incele."}${attachmentContext}`;
      assistantContent = await services.agent.respond(agentPrompt, project.rootPath, current.items, publishActivity)
        .then((response) => response.content);
    } catch (error: unknown) {
        const code = error instanceof Error ? error.message : "AGENT_UNKNOWN_FAILURE";
        publishActivity({ kind: "failure", message: `Ajan çalıştırması başarısız oldu · ${code}.`, createdAt: new Date().toISOString() });
        const remediation = code === "NVIDIA_CREDENTIAL_UNAVAILABLE"
          ? "Windows ortamına NVIDIA_API_KEY ekleyip DevBox'ı yeniden başlatın."
          : code === "HERMES_EXECUTION_FAILED"
            ? "Hermes/NVIDIA çalıştırması başarısız oldu. Sistem kabiliyetlerini ve sağlayıcı erişimini denetleyin."
            : "Hermes yanıtı güvenli biçimde doğrulanıp ayrıştırılamadı. Ham çıktı, iç muhakeme ve sistem istemi güvenlik gereği gösterilmedi.";
        assistantContent = `Ajan yanıtı üretilemedi (**${code}**). ${remediation}`;
    }
    if (baseline) {
      const workspaceResult = ThreadWorkspaceResultSchema.parse(await services.workspaceTurns.finalize({ projectId: project.id, threadId: input.threadId, turnId: started.turnId, intent: "WORKSPACE_MUTATION", before: baseline }));
      if (workspaceResult.gitHeadChanged) {
        publishActivity({ kind: "failure", stage: "VERIFYING", message: "Görev sırasında Git HEAD değişti; DevBox bu turu güvenli dosya mutasyonu olarak onaylamadı.", createdAt: new Date().toISOString() });
        assistantContent = `Dosya görevi güvenli biçimde tamamlanmış sayılmadı: ajan çalışma sırasında Git HEAD'i değiştirdi. Önceden var olan çalışma ağacı korunmadan başarı verilemez.\n\n${assistantContent}`;
      } else if (!workspaceResult.mutated || !workspaceResult.verified) {
        publishActivity({ kind: "failure", stage: "VERIFYING", message: "Ajan yanıt verdi fakat disk üzerinde doğrulanmış dosya değişikliği bulunamadı; başarı reddedildi.", createdAt: new Date().toISOString() });
        assistantContent = `İstenen çalışma alanı değişikliği **gerçekte oluşmadı**; DevBox dosya sistemi hash/read-back kapısı bu turu başarı olarak kabul etmedi.\n\n${assistantContent}`;
      } else {
        publishActivity({ kind: "evidence", stage: "VERIFYING", message: `${workspaceResult.changedFiles.length} dosya bu görevin başlangıç snapshot'ına göre gerçekten değişti ve diskten geri okuma doğrulaması geçti.`, createdAt: new Date().toISOString() });
      }
      try { services.database.appendEvent("thread.workspace-result", input.threadId, workspaceResult, workspaceResult.intent === "WORKSPACE_MUTATION" && !workspaceResult.verified); } catch { /* observability persistence must not crash the completed turn */ }
      if (!event.sender.isDestroyed()) event.sender.send(IPC_CHANNELS.threadWorkspaceResult, workspaceResult);
    }
    return ThreadDetailSchema.parse(services.database.completeMessage(input.threadId, started.turnId, assistantContent));
  });

  registerHandler(IPC_CHANNELS.threadMessageUpdate, services.rendererWebContentsId, async (unknownInput) => {
    const input = ThreadItemUpdateInputSchema.parse(unknownInput);
    return ThreadDetailSchema.parse(services.database.updateUserMessage(input.threadId, input.itemId, input.content));
  });

  registerHandler(IPC_CHANNELS.threadMessageRegenerate, services.rendererWebContentsId, async (unknownInput, event) => {
    const input = ThreadItemInputSchema.parse(unknownInput);
    const current = services.database.getThread(input.threadId);
    await enforcePermissionPolicy(event, services, { title: "NVIDIA yanıtını yenile", message: "Seçili yanıt NVIDIA NIM üzerinden yeniden üretilsin mi?", detail: "Bu işlem yeni bir dış sağlayıcı isteği oluşturur.", risky: false });
    const targetIndex = current.items.findIndex((item) => item.id === input.itemId && item.role === "assistant");
    if (targetIndex < 0) throw new Error("ASSISTANT_MESSAGE_NOT_FOUND");
    const target = current.items[targetIndex];
    const userItem = current.items.slice(0, targetIndex).reverse().find((item) => item.turnId === target?.turnId && item.role === "user");
    if (!userItem) throw new Error("SOURCE_USER_MESSAGE_NOT_FOUND");
    const attachmentContext = await services.attachments.buildAgentContext(input.threadId, userItem.attachments.map((item) => item.id), false);
    const prompt = `${userItem.content || "Ekli dosyaları incele."}${attachmentContext}`;
    const replacement = await services.agent.respond(prompt, services.projects.get(current.thread.projectId).rootPath, current.items.slice(0, targetIndex))
      .then((response) => response.content);
    return ThreadDetailSchema.parse(services.database.replaceAssistantMessage(input.threadId, input.itemId, replacement));
  });

  registerHandler(IPC_CHANNELS.threadRename, services.rendererWebContentsId, async (unknownInput) => {
    const input = ThreadRenameInputSchema.parse(unknownInput);
    return ThreadSummarySchema.parse(services.database.renameThread(input.threadId, input.title));
  });

  registerHandler(IPC_CHANNELS.threadPin, services.rendererWebContentsId, async (unknownInput) => {
    const input = ThreadFlagInputSchema.parse(unknownInput);
    return ThreadSummarySchema.parse(services.database.setThreadFlag(input.threadId, "pinned", input.value));
  });

  registerHandler(IPC_CHANNELS.threadArchive, services.rendererWebContentsId, async (unknownInput) => {
    const input = ThreadFlagInputSchema.parse(unknownInput);
    return ThreadSummarySchema.parse(services.database.setThreadFlag(input.threadId, "archived", input.value));
  });

  registerHandler(IPC_CHANNELS.threadUnread, services.rendererWebContentsId, async (unknownInput) => {
    const input = ThreadFlagInputSchema.parse(unknownInput);
    return ThreadSummarySchema.parse(services.database.setThreadFlag(input.threadId, "unread", input.value));
  });

  registerHandler(IPC_CHANNELS.threadDelete, services.rendererWebContentsId, async (unknownInput) => {
    const input = ThreadIdInputSchema.parse(unknownInput);
    services.database.deleteThread(input.threadId);
    await services.attachments.purgeThreadFiles(input.threadId);
    return true;
  });

  registerHandler(IPC_CHANNELS.attachmentSelect, services.rendererWebContentsId, async (unknownInput, event) => {
    const input = ThreadIdInputSchema.parse(unknownInput);
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) throw new Error("WINDOW_NOT_FOUND");
    const result = await dialog.showOpenDialog(window, {
      title: "DevBox — Dosya ekle (dosya başına en fazla 300 MB)",
      buttonLabel: "Ekle",
      properties: ["openFile", "multiSelections"],
      filters: [{ name: "Tüm dosyalar", extensions: ["*"] }]
    });
    if (result.canceled) return AttachmentImportResultSchema.parse({ attachments: [], rejected: [] });
    return AttachmentImportResultSchema.parse(await services.attachments.importPaths(input.threadId, result.filePaths));
  });

  registerHandler(IPC_CHANNELS.attachmentListDraft, services.rendererWebContentsId, async (unknownInput) => {
    const input = ThreadIdInputSchema.parse(unknownInput);
    return AttachmentSchema.array().parse(services.database.listDraftAttachments(input.threadId));
  });

  registerHandler(IPC_CHANNELS.attachmentImport, services.rendererWebContentsId, async (unknownInput) => {
    const input = AttachmentImportPathsInputSchema.parse(unknownInput);
    return AttachmentImportResultSchema.parse(await services.attachments.importPaths(input.threadId, input.filePaths));
  });

  registerHandler(IPC_CHANNELS.attachmentRemove, services.rendererWebContentsId, async (unknownInput) => {
    const input = AttachmentRemoveInputSchema.parse(unknownInput);
    await services.attachments.removeDraft(input.threadId, input.attachmentId);
  });

  registerHandler(IPC_CHANNELS.contextMenu, services.rendererWebContentsId, async (unknownInput, event) => {
    const input = ContextMenuInputSchema.parse(unknownInput);
    const separator: MenuItemConstructorOptions = { type: "separator" };
    const editable: MenuItemConstructorOptions[] = [
      { label: "Geri al", role: "undo", accelerator: "Ctrl+Z" },
      { label: "Yinele", role: "redo", accelerator: "Ctrl+Y" }, separator,
      { label: "Kes", role: "cut", accelerator: "Ctrl+X" },
      { label: "Kopyala", role: "copy", accelerator: "Ctrl+C", enabled: input.hasSelection },
      { label: "Yapıştır", role: "paste", accelerator: "Ctrl+V", enabled: input.canPaste },
      { label: "Sil", role: "delete" }, separator,
      { label: "Tümünü seç", role: "selectAll", accelerator: "Ctrl+A" }
    ];
    const templates: Record<typeof input.kind, MenuItemConstructorOptions[]> = {
      editable,
      selection: [{ id: "copySelection", label: "Seçileni kopyala", accelerator: "Ctrl+C", enabled: input.hasSelection }],
      file: [{ id: "open", label: "Aç" }, separator, { id: "copy", label: "Kopyala" }, { id: "copyPath", label: "Yolu kopyala" }, { id: "copyRelativePath", label: "Göreli yolu kopyala" }, separator, { id: "rename", label: "Yeniden adlandır", accelerator: "F2" }, { id: "duplicate", label: "Çoğalt" }, { id: "reveal", label: "Dosya Gezgini'nde göster" }, separator, { id: "trash", label: "Geri Dönüşüm Kutusu'na taşı" }],
      directory: [{ id: "newFile", label: "Yeni dosya" }, { id: "newDirectory", label: "Yeni klasör" }, separator, { id: "copyPath", label: "Yolu kopyala" }, { id: "copyRelativePath", label: "Göreli yolu kopyala" }, { id: "reveal", label: "Dosya Gezgini'nde göster" }, separator, { id: "rename", label: "Yeniden adlandır", accelerator: "F2" }, { id: "duplicate", label: "Çoğalt" }, { id: "trash", label: "Geri Dönüşüm Kutusu'na taşı" }],
      terminal: [{ id: "copyOutput", label: "Çıktıyı kopyala", enabled: input.hasSelection }, { label: "Tümünü seç", role: "selectAll", accelerator: "Ctrl+A" }, separator, { id: "clear", label: "Çıktıyı temizle" }],
      blank: [{ id: "newTask", label: "Yeni görev" }, { id: "openProject", label: "Proje klasörü aç" }, separator, { label: "Yapıştır", role: "paste", enabled: input.canPaste }]
    };
    return await popupMenu(event, templates[input.kind]);
  });

  registerHandler(IPC_CHANNELS.appMenu, services.rendererWebContentsId, async (unknownInput, event) => {
    const input = AppMenuInputSchema.parse(unknownInput);
    const separator: MenuItemConstructorOptions = { type: "separator" };
    const templates: Record<typeof input.menu, MenuItemConstructorOptions[]> = {
      file: [{ id: "newTask", label: "Yeni görev", accelerator: "Ctrl+N" }, { id: "openProject", label: "Proje klasörü aç…", accelerator: "Ctrl+O" }, separator, { role: "close", label: "Pencereyi kapat" }, { role: "quit", label: "DevBox'tan çık" }],
      edit: [{ label: "Geri al", role: "undo" }, { label: "Yinele", role: "redo" }, separator, { label: "Kes", role: "cut" }, { label: "Kopyala", role: "copy" }, { label: "Yapıştır", role: "paste" }, { label: "Tümünü seç", role: "selectAll" }],
      view: [{ id: "toggleSidebar", label: "Kenar çubuğunu göster/gizle" }, { id: "toggleInspector", label: "Denetleyiciyi göster/gizle" }, { id: "toggleTerminal", label: "Görev çıktısını göster/gizle", accelerator: "Ctrl+`" }, separator, { role: "zoomIn", label: "Yakınlaştır" }, { role: "zoomOut", label: "Uzaklaştır" }, { role: "resetZoom", label: "Yakınlaştırmayı sıfırla" }, { role: "togglefullscreen", label: "Tam ekran" }],
      help: [{ id: "shortcuts", label: "Klavye kısayolları" }, { id: "about", label: "DevBox hakkında" }]
    };
    return await popupMenu(event, templates[input.menu]);
  });

  registerHandler(IPC_CHANNELS.textCopy, services.rendererWebContentsId, async (unknownInput) => {
    clipboard.writeText(TextCopyInputSchema.parse(unknownInput).text);
  });

  registerHandler(IPC_CHANNELS.settingsGet, services.rendererWebContentsId, async () => {
    return AppSettingsSchema.parse(services.settings.get());
  });

  registerHandler(IPC_CHANNELS.settingsPatch, services.rendererWebContentsId, async (unknownInput) => {
    const input = SettingsPatchInputSchema.parse(unknownInput);
    return AppSettingsSchema.parse(services.settings.patch(input));
  });

  registerHandler(IPC_CHANNELS.themeImport, services.rendererWebContentsId, async (unknownInput) => {
    const input = ThemeImportInputSchema.parse(unknownInput);
    return AppSettingsSchema.parse(services.settings.importTheme(input.portable));
  });

  registerHandler(IPC_CHANNELS.themeExport, services.rendererWebContentsId, async () => {
    return services.settings.exportTheme();
  });

  registerHandler(IPC_CHANNELS.terminalList, services.rendererWebContentsId, async (unknownInput) => {
    const input = IntegrationInspectInputSchema.parse(unknownInput ?? {});
    return TerminalSummarySchema.array().parse(services.terminals.list(input.projectId));
  });

  registerHandler(IPC_CHANNELS.terminalStart, services.rendererWebContentsId, async (unknownInput, event) => {
    const input = TerminalStartInputSchema.parse(unknownInput);
    const project = services.projects.get(input.projectId);
    await enforcePermissionPolicy(event, services, { title: "Etkileşimli terminal", message: "Seçili projede gerçek ConPTY terminali başlatılsın mı?", detail: `Terminal, kullanıcı hesabınızın yetkileriyle ${project.rootPath} dizininde komut çalıştırabilir.`, risky: true });
    const preference = services.settings.get().terminalShell;
    return TerminalSummarySchema.parse(services.terminals.start(input.projectId, project.rootPath, preference, input.cols, input.rows));
  });

  registerHandler(IPC_CHANNELS.terminalWrite, services.rendererWebContentsId, async (unknownInput) => {
    const input = TerminalWriteInputSchema.parse(unknownInput);
    services.terminals.write(input.terminalId, input.data);
  });

  registerHandler(IPC_CHANNELS.terminalResize, services.rendererWebContentsId, async (unknownInput) => {
    const input = TerminalResizeInputSchema.parse(unknownInput);
    return TerminalSummarySchema.parse(services.terminals.resize(input.terminalId, input.cols, input.rows));
  });

  registerHandler(IPC_CHANNELS.terminalKill, services.rendererWebContentsId, async (unknownInput) => {
    const input = TerminalIdInputSchema.parse(unknownInput);
    services.terminals.kill(input.terminalId);
  });

  registerHandler(IPC_CHANNELS.worktreeList, services.rendererWebContentsId, async (unknownInput) => {
    const input = ProjectIdInputSchema.parse(unknownInput);
    const project = services.projects.get(input.projectId);
    return WorktreeSchema.array().parse(await services.worktrees.list(project.rootPath));
  });

  registerHandler(IPC_CHANNELS.worktreeCreate, services.rendererWebContentsId, async (unknownInput, event) => {
    const input = WorktreeCreateInputSchema.parse(unknownInput);
    const project = services.projects.get(input.projectId);
    await enforcePermissionPolicy(event, services, { title: "Git worktree oluştur", message: `“${input.name}” çalışma ağacı oluşturulsun mu?`, detail: `Kaynak ref: ${input.ref} · mod: ${input.mode}`, risky: true });
    return WorktreeSchema.parse(await services.worktrees.create(project.rootPath, input.projectId, input.name, input.ref, input.mode));
  });

  registerHandler(IPC_CHANNELS.worktreeRemove, services.rendererWebContentsId, async (unknownInput, event) => {
    const input = WorktreeRemoveInputSchema.parse(unknownInput);
    const project = services.projects.get(input.projectId);
    await enforcePermissionPolicy(event, services, { title: "Git worktree kaldır", message: `“${input.path}” çalışma ağacı kaldırılsın mı?`, detail: "Değişiklik varsa kurtarma patch'i üretilir; işlem dosya sistemini değiştirir.", risky: true });
    return await services.worktrees.remove(project.rootPath, input.path, input.force);
  });

  registerHandler(IPC_CHANNELS.evolutionGet, services.rendererWebContentsId, async (unknownInput) => {
    const input = ProjectIdInputSchema.parse(unknownInput);
    return EvolutionCampaignSchema.parse(services.evolution.get(input.projectId));
  });

  registerHandler(IPC_CHANNELS.evolutionActivityHistory, services.rendererWebContentsId, async (unknownInput) => {
    const input = EvolutionActivityHistoryInputSchema.parse(unknownInput);
    return EvolutionActivityHistorySchema.parse(services.evolution.listActivity(input.projectId, input.limit));
  });

  registerHandler(IPC_CHANNELS.evolutionModelCatalog, services.rendererWebContentsId, async (unknownInput) => {
    const input = EvolutionModelCatalogInputSchema.parse(unknownInput);
    return EvolutionModelCatalogSchema.parse(await services.evolution.listModels(input.projectId, input.provider));
  });

  registerHandler(IPC_CHANNELS.evolutionToggle, services.rendererWebContentsId, async (unknownInput) => {
    const input = EvolutionToggleInputSchema.parse(unknownInput);
    // Toggle/Şimdi çalıştır yüzeyleri kullanıcı tarafından doğrudan verilen açık onaydır.
    // Sürekli döngü başladıktan sonra her atomik görev için ayrı modal sormak otomasyonu kilitler.
    return EvolutionCampaignSchema.parse(services.evolution.setEnabled(input.projectId, input.enabled));
  });

  registerHandler(IPC_CHANNELS.evolutionDirective, services.rendererWebContentsId, async (unknownInput) => {
    const input = EvolutionDirectiveInputSchema.parse(unknownInput);
    return EvolutionCampaignSchema.parse(services.evolution.setDirective(input.projectId, input.directive));
  });

  registerHandler(IPC_CHANNELS.evolutionRouting, services.rendererWebContentsId, async (unknownInput) => {
    const input = EvolutionRoutingInputSchema.parse(unknownInput);
    return EvolutionCampaignSchema.parse(services.evolution.setRouting(input.projectId, input.routing));
  });

  registerHandler(IPC_CHANNELS.evolutionCancel, services.rendererWebContentsId, async (unknownInput) => {
    const input = EvolutionCancelInputSchema.parse(unknownInput);
    return EvolutionCampaignSchema.parse(services.evolution.cancel(input.projectId));
  });

  registerHandler(IPC_CHANNELS.evolutionRun, services.rendererWebContentsId, async (unknownInput) => {
    const input = ProjectIdInputSchema.parse(unknownInput);
    // “Şimdi çalıştır” tıklaması sürekli self-development döngüsünü başlatan açık kullanıcı eylemidir.
    // Döngü Durdurulana, gerçek harici engel çıkana veya görev grafiği bitene kadar otomatik ilerler.
    return EvolutionCampaignSchema.parse(await services.evolution.runNow(input.projectId));
  });

  registerHandler(IPC_CHANNELS.integrationInspect, services.rendererWebContentsId, async (unknownInput) => {
    const input = IntegrationInspectInputSchema.parse(unknownInput ?? {});
    const cwd = input.projectId ? services.projects.get(input.projectId).rootPath : services.probeCwd;
    return IntegrationStatusSchema.array().parse(await services.integrations.inspect(cwd));
  });

  registerHandler(IPC_CHANNELS.vercelAction, services.rendererWebContentsId, async (unknownInput, event) => {
    const input = VercelActionInputSchema.parse(unknownInput);
    const project = services.projects.get(input.projectId);
    await enforcePermissionPolicy(event, services, { title: "Vercel işlemi", message: `Gerçek Vercel “${input.action}” komutu çalıştırılsın mı?`, detail: `Hedef: ${input.target || "seçili proje"} · kök: ${project.rootPath}`, risky: ["link", "preview", "production", "rollback"].includes(input.action) });
    return CommandResultSchema.parse(await services.integrations.vercel(project.rootPath, input.action, input.target));
  });

  registerHandler(IPC_CHANNELS.githubAction, services.rendererWebContentsId, async (unknownInput, event) => {
    const input = GitHubActionInputSchema.parse(unknownInput);
    const project = services.projects.get(input.projectId);
    await enforcePermissionPolicy(event, services, { title: "GitHub işlemi", message: `Gerçek GitHub “${input.action}” komutu çalıştırılsın mı?`, detail: `Hedef: ${input.target || "seçili depo"} · kök: ${project.rootPath}`, risky: ["pr-create", "pr-merge", "issue-create", "run-rerun", "release-create"].includes(input.action) });
    return CommandResultSchema.parse(await services.integrations.github(project.rootPath, input.action, input.target));
  });

  registerHandler(IPC_CHANNELS.platformAction, services.rendererWebContentsId, async (unknownInput, event) => {
    const input = PlatformActionInputSchema.parse(unknownInput);
    const project = input.projectId ? services.projects.get(input.projectId) : null;
    const cwd = project?.rootPath ?? services.probeCwd;
    const started = performance.now();
    const parent = BrowserWindow.fromWebContents(event.sender);
    if (!parent) throw new Error("WINDOW_NOT_FOUND");
    const mutatesLocalTrustOrPackages = ["ssh-pin", "package-install", "package-repair", "package-rollback"].includes(input.action);
    await enforcePermissionPolicy(event, services, {
      title: "Platform işlemi",
      message: `Gerçek “${input.action}” işlemi çalıştırılsın mı?`,
      detail: `Hedef: ${input.target || "yerel durum"} · çalışma kökü: ${cwd}`,
      risky: mutatesLocalTrustOrPackages
    });

    if (input.action === "protocol-discover") {
      const discovered = await services.integrations.discover(cwd);
      return CommandResultSchema.parse(localCommandResult("devbox protocol discover", cwd, started, `${JSON.stringify(discovered, null, 2)}\n`));
    }
    if (input.action === "ssh-audit") {
      const pins = await services.sshTrust.list();
      return CommandResultSchema.parse(localCommandResult("devbox ssh audit", cwd, started, `${JSON.stringify(pins, null, 2)}\n`));
    }
    if (input.action === "ssh-pin") {
      if (!input.target) throw new Error("SSH_TARGET_REQUIRED");
      const candidate = await services.sshTrust.scan(input.target, cwd);
      const confirmation = await dialog.showMessageBox(parent, {
        type: "warning",
        buttons: ["Bu anahtarı sabitle", "İptal"],
        defaultId: 1,
        cancelId: 1,
        noLink: true,
        title: "SSH sunucu anahtarını doğrulayın",
        message: `${candidate.host}:${candidate.port} için görülen anahtar parmak izleri`,
        detail: `${candidate.fingerprint}\n\nBu parmak izlerini sunucu yöneticinizin güvenilir kanalından doğrulamadan sabitlemeyin.`
      });
      if (confirmation.response !== 0) return CommandResultSchema.parse(localCommandResult("devbox ssh pin", cwd, started, "", { cancelled: true }));
      const pin = await services.sshTrust.pinCandidate(candidate);
      return CommandResultSchema.parse(localCommandResult("devbox ssh pin", cwd, started, `${JSON.stringify(pin, null, 2)}\n`));
    }
    if (input.action === "package-list") {
      const packages = await services.packages.list();
      return CommandResultSchema.parse(localCommandResult("devbox package list", cwd, started, `${JSON.stringify(packages, null, 2)}\n`));
    }
    if (input.action === "package-install") {
      const packageSelection = await dialog.showOpenDialog(parent, { title: "İmzalı DevBox paket klasörünü seçin", properties: ["openDirectory"] });
      if (packageSelection.canceled || !packageSelection.filePaths[0]) return CommandResultSchema.parse(localCommandResult("devbox package install", cwd, started, "", { cancelled: true }));
      const keySelection = await dialog.showOpenDialog(parent, { title: "Yayıncının Ed25519 public key PEM dosyasını seçin", properties: ["openFile"], filters: [{ name: "PEM public key", extensions: ["pem", "pub"] }] });
      if (keySelection.canceled || !keySelection.filePaths[0]) return CommandResultSchema.parse(localCommandResult("devbox package install", cwd, started, "", { cancelled: true }));
      const keyStat = await lstat(keySelection.filePaths[0]);
      if (!keyStat.isFile() || keyStat.isSymbolicLink() || keyStat.size > 64 * 1024) throw new Error("PUBLISHER_KEY_FILE_INVALID");
      const publicKeyPem = await readFile(keySelection.filePaths[0], "utf8");
      const candidate = await services.packages.inspectCandidate(packageSelection.filePaths[0], publicKeyPem);
      const publisherFingerprint = services.packages.publisherFingerprint(publicKeyPem);
      const confirmation = await dialog.showMessageBox(parent, {
        type: "warning",
        buttons: ["Doğrulandı, kur", "İptal"],
        defaultId: 1,
        cancelId: 1,
        noLink: true,
        title: "İmzalı paketi kur",
        message: `${candidate.manifest.kind}/${candidate.manifest.id} · ${candidate.manifest.version}`,
        detail: `Yayıncı: ${candidate.manifest.publicKeyId}\nEd25519 SHA-256 parmak izi: ${publisherFingerprint}\nDosya: ${candidate.verifiedFiles}\nBoyut: ${candidate.totalBytes} bayt\nİzinler: ${candidate.manifest.permissions.join(", ") || "yok"}\n\nBu, yönetici onaylı genel katalog yayını değildir. Anahtar YEREL SIDELOAD güven sınıfıyla kaydedilecek; paket kayıtlı anahtarla yeniden doğrulanıp atomik olarak etkinleştirilecek.`
      });
      if (confirmation.response !== 0) return CommandResultSchema.parse(localCommandResult("devbox package install", cwd, started, "", { cancelled: true }));
      await services.packages.enrollPublisher(candidate.manifest.publicKeyId, publicKeyPem, "LOCAL_SIDELOAD");
      const installed = await services.packages.install(packageSelection.filePaths[0]);
      return CommandResultSchema.parse(localCommandResult("devbox package install", cwd, started, `${JSON.stringify(installed, null, 2)}\n`));
    }
    const target = packageTarget(input.target);
    const pointer = input.action === "package-repair"
      ? await services.packages.repair(target.kind, target.id)
      : await services.packages.rollback(target.kind, target.id);
    return CommandResultSchema.parse(localCommandResult(`devbox ${input.action.replace("package-", "package ")}`, cwd, started, `${JSON.stringify(pointer, null, 2)}\n`));
  });

  registerHandler(IPC_CHANNELS.languageDiagnostics, services.rendererWebContentsId, async (unknownInput) => {
    const input = LanguageDiagnosticsInputSchema.parse(unknownInput);
    return LanguageDiagnosticsResultSchema.parse(await services.language.diagnostics(input));
  });

  registerHandler(IPC_CHANNELS.debugStart, services.rendererWebContentsId, async (unknownInput, event) => {
    const input = DebugStartInputSchema.parse(unknownInput);
    await enforcePermissionPolicy(event, services, {
      title: "Debugger başlat",
      message: "Seçilen gerçek Debug Adapter süreci başlatılsın mı?",
      detail: `Adapter: ${input.executable}\nİstek: ${input.request}`,
      risky: true
    });
    return DebugSessionSchema.parse(await services.debug.start(input));
  });

  registerHandler(IPC_CHANNELS.debugCommand, services.rendererWebContentsId, async (unknownInput) => {
    const input = DebugCommandInputSchema.parse(unknownInput);
    return DebugResponseSchema.parse(await services.debug.command(input.sessionId, input.command, input.arguments));
  });

  registerHandler(IPC_CHANNELS.debugStop, services.rendererWebContentsId, async (unknownInput) => {
    const input = DebugSessionInputSchema.parse(unknownInput);
    await services.debug.stop(input.sessionId);
  });

  registerHandler(IPC_CHANNELS.workerPairingCreate, services.rendererWebContentsId, async (_unknownInput, event) => {
    await enforcePermissionPolicy(event, services, {
      title: "Uzak worker eşleştir",
      message: "On dakika geçerli tek kullanımlık worker eşleştirme kodu oluşturulsun mu?",
      detail: "Kod yalnız güvenilen makineye aktarılmalıdır. Worker kalıcı bearer kimliğini eşleştirme sırasında bir kez alır.",
      risky: true
    });
    return WorkerPairingSchema.parse({ ...services.remoteWorkers.createPairing(), endpoint: services.coreApi.origin });
  });

  registerHandler(IPC_CHANNELS.workerList, services.rendererWebContentsId, async () => (
    RemoteWorkerSchema.array().parse(services.remoteWorkers.list())
  ));

  registerHandler(IPC_CHANNELS.workerRevoke, services.rendererWebContentsId, async (unknownInput, event) => {
    const input = RemoteWorkerIdInputSchema.parse(unknownInput);
    await enforcePermissionPolicy(event, services, {
      title: "Worker yetkisini kaldır",
      message: "Bu uzak worker kimliği kalıcı olarak iptal edilsin mi?",
      detail: `Worker: ${input.workerId}`,
      risky: true
    });
    return RemoteWorkerSchema.parse(services.remoteWorkers.revoke(input.workerId));
  });

  registerHandler(IPC_CHANNELS.workerJobEnqueue, services.rendererWebContentsId, async (unknownInput, event) => {
    const input = RemoteJobInputSchema.parse(unknownInput);
    await enforcePermissionPolicy(event, services, {
      title: "Uzak görev kuyruğa al",
      message: "Görev eşleştirilmiş bir uzak worker tarafından çalıştırılmak üzere kuyruğa alınsın mı?",
      detail: `İş türü: remote:${input.kind}`,
      risky: true
    });
    return DurableJobSummarySchema.parse(services.remoteWorkers.enqueue(input.kind, input.payload));
  });

  registerHandler(IPC_CHANNELS.workerJobList, services.rendererWebContentsId, async () => (
    DurableJobSummarySchema.array().parse(services.remoteWorkers.listJobs())
  ));

  registerHandler(IPC_CHANNELS.workerJobCancel, services.rendererWebContentsId, async (unknownInput, event) => {
    const input = RemoteJobIdInputSchema.parse(unknownInput);
    await enforcePermissionPolicy(event, services, {
      title: "Uzak görevi iptal et",
      message: "Bu uzak görevin çalışan süreç ağacı güvenli biçimde sonlandırılsın mı?",
      detail: `Görev: ${input.jobId}`,
      risky: true
    });
    return DurableJobSummarySchema.parse(services.remoteWorkers.cancelJob(input.jobId));
  });

  const unsubscribeEvolution = services.evolution.subscribe((activity) => {
    const target = BrowserWindow.getAllWindows().find((window) => window.webContents.id === services.rendererWebContentsId);
    if (!target || target.isDestroyed()) return;
    target.webContents.send(IPC_CHANNELS.evolutionActivity, EvolutionActivityEventSchema.parse(activity));
  });

  return () => {
    unsubscribeEvolution();
    for (const channel of channels) ipcMain.removeHandler(channel);
  };
}
