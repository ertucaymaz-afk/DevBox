import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Box,
  Braces,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Code2,
  Command,
  Copy,
  File,
  FileArchive,
  FileCode2,
  FileText,
  Folder,
  FolderOpen,
  GitBranch,
  Globe2,
  HardDrive,
  LayoutPanelLeft,
  LayoutPanelTop,
  ListChecks,
  LoaderCircle,
  MessageSquarePlus,
  Paperclip,
  PanelRight,
  Pencil,
  Play,
  Plug,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  SquareTerminal,
  TestTube2,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  UserRound,
  Wrench,
  Quote,
  X,
  XCircle
} from "lucide-react";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type {
  Attachment,
  Bootstrap,
  Capability,
  CommandResult,
  FileSnapshot,
  GitDiff,
  GitStatus,
  ProjectSummary,
  ProjectTreeNode,
  TaskPreset,
  ThreadDetail,
  ThreadItem,
  ThreadSummary,
  AppSettings,
  PermissionProfile
} from "../shared/contracts";
import {
  AutomationWorkspace,
  IntegrationWorkspace,
  SettingsWorkspace,
  TerminalWorkspace,
  WorktreeWorkspace,
  themeStyle
} from "./AdvancedViews";

type View = "thread" | "files" | "git" | "runs" | "sites" | "capabilities" | "settings" | "terminal" | "worktrees" | "automations" | "integrations";
type PromptState = {
  title: string;
  label: string;
  value: string;
  confirmLabel: string;
  onConfirm: (value: string) => Promise<void>;
};

const TASKS: readonly { id: TaskPreset; label: string; detail: string; icon: ReactNode }[] = [
  { id: "git-status", label: "Git durumu", detail: "Makine-okunur çalışma ağacı özeti", icon: <GitBranch size={16} /> },
  { id: "typecheck", label: "Tür denetimi", detail: "Projenin tanımlı typecheck betiği", icon: <Code2 size={16} /> },
  { id: "test", label: "Test", detail: "Projenin tanımlı test betiği", icon: <TestTube2 size={16} /> },
  { id: "build", label: "Derle", detail: "Projenin tanımlı build betiği", icon: <Wrench size={16} /> }
];

const PERMISSION_OPTIONS: readonly { value: PermissionProfile; label: string; detail: string }[] = [
  { value: "Salt okunur", label: "Onay iste", detail: "Proje yazma, süreç ve ağ işlemlerinden önce her zaman sorar." },
  { value: "Onaylı", label: "Benim için onayla", detail: "Seçili projede çalışır; riskli ve uzak mutasyonları ayrıca sorar." },
  { value: "Tam erişim", label: "Tam erişim", detail: "Açtığınız hedeflerde dosya, süreç ve ağa politika diyaloğu olmadan erişir." }
] as const;

function permissionLabel(profile: PermissionProfile): string {
  return PERMISSION_OPTIONS.find((option) => option.value === profile)?.label ?? "Onay iste";
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message.replace(/^Error invoking remote method '[^']+':\s*/i, "");
  return String(error);
}

function formatThreadTime(value: string): string {
  const date = new Date(value);
  const now = new Date();
  const sameDay = date.toLocaleDateString("tr-TR") === now.toLocaleDateString("tr-TR");
  return sameDay
    ? date.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString("tr-TR", { day: "2-digit", month: "short" });
}

function exactDateTime(value: string): string {
  return new Date(value).toLocaleString("tr-TR", { dateStyle: "long", timeStyle: "short" });
}

function stateClass(state: Capability["state"] | ThreadSummary["state"]): string {
  if (["READY", "COMPLETED", "IDLE"].includes(state)) return "positive";
  if (["UNAVAILABLE", "FAILED", "BLOCKED", "RECOVERY_REQUIRED"].includes(state)) return "negative";
  return "warning";
}

function StateBadge({ state }: { state: Capability["state"] | ThreadSummary["state"] }): ReactNode {
  return <span className={`state-badge ${stateClass(state)}`}>{state}</span>;
}

function DevBoxWordmark(): ReactNode {
  return (
    <svg className="devbox-wordmark" viewBox="0 0 132 32" role="img" aria-label="devbox">
      <defs>
        <linearGradient id="devbox-wordmark-gradient" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f9fbff" />
          <stop offset="0.48" stopColor="#dfe7ed" />
          <stop offset="1" stopColor="#8fa0ad" />
        </linearGradient>
        <linearGradient id="devbox-glyph-gradient" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8fffe1" />
          <stop offset="0.52" stopColor="#27d8ac" />
          <stop offset="1" stopColor="#18a77f" />
        </linearGradient>
        <filter id="devbox-glyph-glow" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="1.8" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <g className="devbox-logo-orbit" aria-hidden="true">
        <circle cx="15" cy="16" r="13" fill="none" stroke="rgba(61, 224, 179, .18)" strokeWidth="1" strokeDasharray="2 5" />
        <circle className="devbox-logo-orbit-dot" cx="15" cy="3" r="1.45" fill="#82f8d9" />
      </g>
      <g className="devbox-logo-glyph" filter="url(#devbox-glyph-glow)" aria-hidden="true">
        <path d="M15 7.2 23.1 11.8 15 16.4 6.9 11.8 15 7.2Z" fill="none" stroke="url(#devbox-glyph-gradient)" strokeWidth="1.55" strokeLinejoin="round" />
        <path d="M6.9 11.8v8.7L15 25.1v-8.7M23.1 11.8v8.7L15 25.1" fill="none" stroke="url(#devbox-glyph-gradient)" strokeWidth="1.55" strokeLinecap="round" strokeLinejoin="round" />
        <path className="devbox-logo-core" d="m11.2 13.9 3.8 2.2 3.8-2.2" fill="none" stroke="#b9ffec" strokeWidth="1.05" strokeLinecap="round" />
      </g>
      <text className="devbox-logo-text" x="35" y="21.4">devbox</text>
      <path className="devbox-logo-scan" d="M36 25.4H124" fill="none" stroke="url(#devbox-glyph-gradient)" strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}

function InlineMarkdown({ text }: { text: string }): ReactNode {
  const pieces = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/gu);
  return pieces.map((piece, index) => {
    if (piece.startsWith("**") && piece.endsWith("**")) return <strong key={index}>{piece.slice(2, -2)}</strong>;
    if (piece.startsWith("`") && piece.endsWith("`")) return <code key={index}>{piece.slice(1, -1)}</code>;
    return <Fragment key={index}>{piece}</Fragment>;
  });
}

function MarkdownMessage({ content }: { content: string }): ReactNode {
  const blocks = content.split("```");
  return (
    <div className="markdown-message">
      {blocks.map((block, blockIndex) => blockIndex % 2 === 1
        ? <pre key={blockIndex}><code>{block.replace(/^\w+\n/u, "")}</code></pre>
        : block.split(/\r?\n/u).map((line, lineIndex) => {
          if (!line) return <div className="md-gap" key={`${blockIndex}:${lineIndex}`} />;
          if (/^#{1,3}\s/u.test(line)) return <h3 key={`${blockIndex}:${lineIndex}`}><InlineMarkdown text={line.replace(/^#{1,3}\s/u, "")} /></h3>;
          if (/^[-*]\s/u.test(line)) return <div className="md-bullet" key={`${blockIndex}:${lineIndex}`}><span>•</span><p><InlineMarkdown text={line.slice(2)} /></p></div>;
          return <p key={`${blockIndex}:${lineIndex}`}><InlineMarkdown text={line} /></p>;
        }))}
    </div>
  );
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function AttachmentGlyph({ attachment }: { attachment: Attachment }): ReactNode {
  if (attachment.kind === "archive") return <FileArchive size={16} />;
  if (attachment.kind === "text") return <FileText size={16} />;
  return <Paperclip size={16} />;
}

function PromptDialog({ prompt, onClose }: { prompt: PromptState; onClose: () => void }): ReactNode {
  const [value, setValue] = useState(prompt.value);
  const [busy, setBusy] = useState(false);
  const submit = async (): Promise<void> => {
    if (!value.trim() || busy) return;
    setBusy(true);
    try {
      await prompt.onConfirm(value.trim());
      onClose();
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div className="prompt-dialog" role="dialog" aria-modal="true" aria-labelledby="prompt-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="dialog-heading"><div><strong id="prompt-title">{prompt.title}</strong><span>{prompt.label}</span></div><button onClick={onClose} aria-label="Pencereyi kapat"><X size={16} /></button></div>
        <input autoFocus value={value} onChange={(event) => setValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void submit(); if (event.key === "Escape") onClose(); }} onContextMenu={(event) => { event.preventDefault(); void window.devbox.showContextMenu("editable", window.getSelection()?.toString().length !== 0, true); }} />
        <div className="dialog-actions"><button onClick={onClose}>Vazgeç</button><button className="primary" disabled={!value.trim() || busy} onClick={() => void submit()}>{busy && <LoaderCircle className="spin" size={14} />}{prompt.confirmLabel}</button></div>
      </div>
    </div>
  );
}

function TreeItem({ node, depth, selectedPath, onOpen, onContext }: {
  node: ProjectTreeNode;
  depth: number;
  selectedPath: string | null;
  onOpen: (node: ProjectTreeNode) => void;
  onContext: (node: ProjectTreeNode) => void;
}): ReactNode {
  const [expanded, setExpanded] = useState(depth < 1);
  const directory = node.kind === "directory";
  return (
    <li>
      <button
        className={`tree-row ${selectedPath === node.relativePath ? "selected" : ""}`}
        style={{ paddingInlineStart: `${8 + Math.min(depth, 12) * 14}px` }}
        onClick={() => directory ? setExpanded((value) => !value) : onOpen(node)}
        onDoubleClick={() => { if (!directory) onOpen(node); }}
        onContextMenu={(event) => { event.preventDefault(); onContext(node); }}
        aria-expanded={directory ? expanded : undefined}
        title={node.relativePath}
      >
        {directory ? expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} /> : <span className="tree-spacer" />}
        {directory ? expanded ? <FolderOpen size={14} /> : <Folder size={14} /> : <FileCode2 size={14} />}
        <span>{node.name}</span>
      </button>
      {directory && expanded && node.children && <ul>{node.children.map((child) => <TreeItem key={child.relativePath} node={child} depth={depth + 1} selectedPath={selectedPath} onOpen={onOpen} onContext={onContext} />)}</ul>}
    </li>
  );
}

type MessageFeedback = "helpful" | "unhelpful" | null;

function feedbackStorageKey(itemId: string): string {
  return `devbox:message-feedback:${itemId}`;
}

function Message({ item, busy, onEdit, onRegenerate, onCopy, onQuote }: {
  item: ThreadItem;
  busy: boolean;
  onEdit: (itemId: string, content: string) => Promise<boolean>;
  onRegenerate: (itemId: string) => Promise<void>;
  onCopy: (content: string) => Promise<void>;
  onQuote: (content: string) => void;
}): ReactNode {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.content);
  const [feedback, setFeedback] = useState<MessageFeedback>(() => {
    try {
      const saved = window.localStorage.getItem(feedbackStorageKey(item.id));
      return saved === "helpful" || saved === "unhelpful" ? saved : null;
    } catch {
      return null;
    }
  });
  const updateFeedback = (next: Exclude<MessageFeedback, null>): void => {
    const value = feedback === next ? null : next;
    setFeedback(value);
    try {
      if (value) window.localStorage.setItem(feedbackStorageKey(item.id), value);
      else window.localStorage.removeItem(feedbackStorageKey(item.id));
    } catch {
      // The pressed state still reflects the current session if persistent storage is unavailable.
    }
  };
  if (item.role === "activity") return <div className="activity-line"><LoaderCircle size={13} /><span>{item.content}</span></div>;
  return (
    <article className={`message ${item.role}`} onContextMenu={(event) => {
      event.preventDefault();
      const selection = window.getSelection()?.toString() ?? "";
      void window.devbox.showContextMenu("selection", selection.length > 0).then((action) => {
        if (action === "copySelection" && selection) void window.devbox.copyText(selection);
      });
    }}>
      <div className="message-avatar">{item.role === "user" ? <UserRound size={15} /> : item.role === "command" ? <SquareTerminal size={15} /> : <Box size={15} />}</div>
      <div className="message-body">
        <div className="message-meta"><strong>{item.role === "user" ? "Siz" : item.role === "assistant" ? "DevBox" : "Komut"}</strong><time dateTime={item.createdAt} title={exactDateTime(item.createdAt)}>{new Date(item.createdAt).toLocaleString("tr-TR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</time></div>
        {editing ? <div className="message-editor"><textarea autoFocus value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") { setDraft(item.content); setEditing(false); } if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) void onEdit(item.id, draft).then((saved) => { if (saved) setEditing(false); }); }} /><div><button onClick={() => { setDraft(item.content); setEditing(false); }}>Vazgeç</button><button className="primary" disabled={!draft.trim() || busy} onClick={() => void onEdit(item.id, draft).then((saved) => { if (saved) setEditing(false); })}><Check size={14} /> Kaydet</button></div></div> : <MarkdownMessage content={item.content} />}
        {item.attachments.length > 0 && <div className="message-attachments">{item.attachments.map((attachment) => <span key={attachment.id} title={`SHA-256 ${attachment.sha256}`}><AttachmentGlyph attachment={attachment} /><span><strong>{attachment.name}</strong><small>{formatBytes(attachment.size)} · {attachment.kind}</small></span></span>)}</div>}
        {!editing && <div className="message-actions" aria-label="Mesaj eylemleri">
          {item.role === "user" && <button disabled={busy} onClick={() => { setDraft(item.content); setEditing(true); }} title="Mesajı düzenle" aria-label="Mesajı düzenle"><Pencil size={14} /></button>}
          <button disabled={busy} onClick={() => void onCopy(item.content)} title="Mesajı kopyala" aria-label="Mesajı kopyala"><Copy size={14} /></button>
          <button disabled={busy} onClick={() => onQuote(item.content)} title="Yanıta alıntıla" aria-label="Mesajı yanıta alıntıla"><Quote size={14} /></button>
          {item.role === "assistant" && <button disabled={busy} onClick={() => void onRegenerate(item.id)} title="Yanıtı yeniden üret" aria-label="Yanıtı yeniden üret"><RotateCcw size={14} /></button>}
          {item.role === "assistant" && <button className={feedback === "helpful" ? "selected" : ""} disabled={busy} onClick={() => updateFeedback("helpful")} title="Yararlı olarak işaretle (yerel)" aria-label="Yanıtı yararlı olarak işaretle" aria-pressed={feedback === "helpful"}><ThumbsUp size={14} /></button>}
          {item.role === "assistant" && <button className={feedback === "unhelpful" ? "selected" : ""} disabled={busy} onClick={() => updateFeedback("unhelpful")} title="Yararlı değil olarak işaretle (yerel)" aria-label="Yanıtı yararlı değil olarak işaretle" aria-pressed={feedback === "unhelpful"}><ThumbsDown size={14} /></button>}
        </div>}
      </div>
    </article>
  );
}

export function App(): ReactNode {
  const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null);
  const [selectedProject, setSelectedProject] = useState<ProjectSummary | null>(null);
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [thread, setThread] = useState<ThreadDetail | null>(null);
  const [tree, setTree] = useState<ProjectTreeNode[]>([]);
  const [file, setFile] = useState<FileSnapshot | null>(null);
  const [editorText, setEditorText] = useState("");
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
  const [gitDiff, setGitDiff] = useState<GitDiff | null>(null);
  const [terminalResult, setTerminalResult] = useState<CommandResult | null>(null);
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);
  const [view, setView] = useState<View>("thread");
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [inspectorVisible, setInspectorVisible] = useState(false);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [composer, setComposer] = useState("");
  const [draftAttachments, setDraftAttachments] = useState<Attachment[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [permission, setPermission] = useState<PermissionProfile>("Onaylı");
  const [permissionMenuOpen, setPermissionMenuOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>("bootstrap");
  const [notice, setNotice] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [prompt, setPrompt] = useState<PromptState | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const terminalRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const conversationRef = useRef<HTMLDivElement>(null);

  const updateThreads = useCallback(async (): Promise<ThreadSummary[]> => {
    const next = await window.devbox.listThreads();
    setThreads(next);
    return next;
  }, []);

  const loadProject = useCallback(async (project: ProjectSummary): Promise<void> => {
    setSelectedProject(project);
    setBusy("project");
    try {
      const nextTree = await window.devbox.readProjectTree(project.id);
      setTree(nextTree);
      if (project.isGitRepository) {
        const status = await window.devbox.getGitStatus(project.id);
        setGitStatus(status);
        setGitDiff(status.available && status.changes.length > 0 ? await window.devbox.getGitDiff(project.id) : null);
      } else {
        setGitStatus(null);
        setGitDiff(null);
      }
    } finally {
      setBusy(null);
    }
  }, []);

  const openThread = useCallback(async (threadId: string, pushHistory = true): Promise<void> => {
    setBusy("thread");
    try {
      const detail = await window.devbox.getThread(threadId);
      setThread(detail);
      setDraftAttachments(await window.devbox.listDraftAttachments(threadId));
      setView("thread");
      const project = bootstrap?.projects.find((item) => item.id === detail.thread.projectId);
      if (project && selectedProject?.id !== project.id) await loadProject(project);
      if (pushHistory) {
        setHistory((current) => {
          const base = current.slice(0, historyIndex + 1);
          return [...base, threadId].slice(-40);
        });
        setHistoryIndex((current) => Math.min(current + 1, 39));
      }
      requestAnimationFrame(() => {
        if (conversationRef.current) conversationRef.current.scrollTop = conversationRef.current.scrollHeight;
      });
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setBusy(null);
    }
  }, [bootstrap?.projects, historyIndex, loadProject, selectedProject?.id]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const boot = await window.devbox.bootstrap();
        if (!active) return;
        setBootstrap(boot);
        const loadedSettings = await window.devbox.getSettings();
        if (!active) return;
        setAppSettings(loadedSettings);
        setPermission(loadedSettings.permissionProfile);
        // DevBox has one task flow. Project tools open from the same task shell;
        // there is no separate Chat/Work product mode.
        setView("thread");
        const nextThreads = await window.devbox.listThreads();
        if (!active) return;
        setThreads(nextThreads);
        const firstProject = boot.projects[0] ?? null;
        if (firstProject) await loadProject(firstProject);
        if (nextThreads[0]) {
          const detail = await window.devbox.getThread(nextThreads[0].id);
          if (active) {
            setThread(detail);
            setDraftAttachments(await window.devbox.listDraftAttachments(detail.thread.id));
            setHistory([detail.thread.id]);
            setHistoryIndex(0);
          }
        }
      } catch (error) {
        if (active) setNotice(errorMessage(error));
      } finally {
        if (active) setBusy(null);
      }
    })();
    return () => { active = false; };
  }, [loadProject]);

  const chooseProject = useCallback(async (): Promise<ProjectSummary | null> => {
    setBusy("open-project");
    setNotice(null);
    try {
      const project = await window.devbox.openProject();
      if (!project) return null;
      setBootstrap((current) => current ? { ...current, projects: [project, ...current.projects.filter((item) => item.id !== project.id)] } : current);
      await loadProject(project);
      setView("files");
      return project;
    } catch (error) {
      setNotice(errorMessage(error));
      return null;
    } finally {
      setBusy(null);
    }
  }, [loadProject]);

  const createThread = useCallback(async (): Promise<ThreadDetail | null> => {
    const project = selectedProject ?? await chooseProject();
    if (!project) return null;
    setBusy("new-thread");
    try {
      const detail = await window.devbox.createThread(project.id, "Yeni görev");
      setThread(detail);
      setDraftAttachments([]);
      await updateThreads();
      setView("thread");
      setHistory((current) => [...current.slice(0, historyIndex + 1), detail.thread.id].slice(-40));
      setHistoryIndex((current) => Math.min(current + 1, 39));
      requestAnimationFrame(() => composerRef.current?.focus());
      return detail;
    } catch (error) {
      setNotice(errorMessage(error));
      return null;
    } finally {
      setBusy(null);
    }
  }, [chooseProject, historyIndex, selectedProject, updateThreads]);

  const sendMessage = useCallback(async (): Promise<void> => {
    const content = composer.trim();
    if (!content && draftAttachments.length === 0) return;
    const activeThread = thread ?? await createThread();
    if (!activeThread) return;
    setComposer("");
    setBusy("message");
    try {
      const detail = await window.devbox.sendMessage(activeThread.thread.id, content, draftAttachments.map((attachment) => attachment.id));
      setThread(detail);
      setDraftAttachments([]);
      await updateThreads();
      requestAnimationFrame(() => {
        if (conversationRef.current) conversationRef.current.scrollTop = conversationRef.current.scrollHeight;
      });
    } catch (error) {
      setComposer(content);
      setNotice(errorMessage(error));
    } finally {
      setBusy(null);
    }
  }, [composer, createThread, draftAttachments, thread, updateThreads]);

  const applyAttachmentResult = useCallback((result: Awaited<ReturnType<typeof window.devbox.selectAttachments>>): void => {
    if (result.attachments.length > 0) {
      setDraftAttachments((current) => [...current, ...result.attachments.filter((attachment) => !current.some((item) => item.id === attachment.id))]);
    }
    if (result.rejected.length > 0) {
      const labels: Record<string, string> = {
        ATTACHMENT_TOO_LARGE: "300 MB sınırını aşıyor",
        ATTACHMENT_NOT_REGULAR_FILE: "normal bir dosya değil",
        ATTACHMENT_LIMIT_EXCEEDED: "20 dosyalık ek sınırı aşıldı",
        ATTACHMENT_CHANGED_DURING_IMPORT: "kopyalama sırasında değişti",
        ATTACHMENT_IMPORT_FAILED: "güvenli biçimde içe aktarılamadı"
      };
      setNotice(result.rejected.map((item) => `${item.name}: ${labels[item.code] ?? item.code}`).join(" · "));
    }
  }, []);

  const selectAttachments = useCallback(async (): Promise<void> => {
    if (busy === "message") return;
    const activeThread = thread ?? await createThread();
    if (!activeThread) return;
    setBusy("attachment");
    try {
      applyAttachmentResult(await window.devbox.selectAttachments(activeThread.thread.id));
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setBusy(null);
    }
  }, [applyAttachmentResult, busy, createThread, thread]);

  const applyPermission = useCallback(async (profile: PermissionProfile): Promise<void> => {
    setBusy("permission");
    setNotice(null);
    try {
      const next = await window.devbox.patchSettings({ permissionProfile: profile });
      setAppSettings(next);
      setPermission(next.permissionProfile);
      setPermissionMenuOpen(false);
      setNotice(`İzin profili “${permissionLabel(next.permissionProfile)}” olarak kalıcı kaydedildi.`);
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setBusy(null);
    }
  }, []);

  const removeAttachment = useCallback(async (attachment: Attachment): Promise<void> => {
    if (!thread) return;
    try {
      await window.devbox.removeAttachment(thread.thread.id, attachment.id);
      setDraftAttachments((current) => current.filter((item) => item.id !== attachment.id));
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }, [thread]);

  const dropAttachments = useCallback(async (files: readonly File[]): Promise<void> => {
    if (files.length === 0 || busy === "message") return;
    const activeThread = thread ?? await createThread();
    if (!activeThread) return;
    setBusy("attachment");
    try {
      applyAttachmentResult(await window.devbox.importDroppedAttachments(activeThread.thread.id, files));
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setDragActive(false);
      setBusy(null);
    }
  }, [applyAttachmentResult, busy, createThread, thread]);

  const updateMessage = useCallback(async (itemId: string, content: string): Promise<boolean> => {
    if (!thread || !content.trim()) return false;
    setBusy(`message:${itemId}`);
    try {
      setThread(await window.devbox.updateMessage(thread.thread.id, itemId, content.trim()));
      await updateThreads();
      return true;
    } catch (error) {
      setNotice(errorMessage(error));
      return false;
    } finally {
      setBusy(null);
    }
  }, [thread, updateThreads]);

  const regenerateMessage = useCallback(async (itemId: string): Promise<void> => {
    if (!thread) return;
    setBusy(`message:${itemId}`);
    try {
      setThread(await window.devbox.regenerateMessage(thread.thread.id, itemId));
      await updateThreads();
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setBusy(null);
    }
  }, [thread, updateThreads]);

  const copyMessage = useCallback(async (content: string): Promise<void> => {
    await window.devbox.copyText(content);
    setNotice("Mesaj panoya kopyalandı.");
    setTimeout(() => setNotice((current) => current === "Mesaj panoya kopyalandı." ? null : current), 1600);
  }, []);

  const quoteMessage = useCallback((content: string): void => {
    const quote = content.split(/\r?\n/u).map((line) => `> ${line}`).join("\n");
    setComposer((current) => current.trim().length > 0 ? `${current.trimEnd()}\n\n${quote}\n\n` : `${quote}\n\n`);
    requestAnimationFrame(() => {
      composerRef.current?.focus();
      const end = composerRef.current?.value.length ?? 0;
      composerRef.current?.setSelectionRange(end, end);
    });
  }, []);

  const openFile = useCallback(async (node: ProjectTreeNode): Promise<void> => {
    if (!selectedProject || node.kind !== "file") return;
    setBusy(`file:${node.relativePath}`);
    try {
      const snapshot = await window.devbox.readFile(selectedProject.id, node.relativePath);
      setFile(snapshot);
      setEditorText(snapshot.content);
      setView("files");
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setBusy(null);
    }
  }, [selectedProject]);

  const saveFile = useCallback(async (): Promise<void> => {
    if (!selectedProject || !file || editorText === file.content) return;
    setBusy("save-file");
    try {
      const snapshot = await window.devbox.writeFile(selectedProject.id, file.relativePath, file.sha256, editorText);
      setFile(snapshot);
      setEditorText(snapshot.content);
      setNotice("Dosya atomik geri-alma günlüğü ve SHA-256 doğrulamasıyla kaydedildi.");
      setTimeout(() => setNotice(null), 2600);
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setBusy(null);
    }
  }, [editorText, file, selectedProject]);

  const refreshGit = useCallback(async (): Promise<void> => {
    if (!selectedProject?.isGitRepository) return;
    setBusy("git");
    try {
      const status = await window.devbox.getGitStatus(selectedProject.id);
      setGitStatus(status);
      setGitDiff(status.available && status.changes.length > 0 ? await window.devbox.getGitDiff(selectedProject.id) : null);
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setBusy(null);
    }
  }, [selectedProject]);

  const runTask = useCallback(async (preset: TaskPreset): Promise<void> => {
    if (!selectedProject) return;
    setTerminalOpen(true);
    setBusy(`task:${preset}`);
    setTerminalResult(null);
    try {
      const result = await window.devbox.runTaskPreset(selectedProject.id, preset);
      setTerminalResult(result);
      if (preset === "git-status") await refreshGit();
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setBusy(null);
    }
  }, [refreshGit, selectedProject]);

  const pathContext = useCallback(async (node: ProjectTreeNode): Promise<void> => {
    if (!selectedProject) return;
    const action = await window.devbox.showContextMenu(node.kind === "directory" ? "directory" : "file");
    try {
      if (action === "open") await openFile(node);
      if (action === "copy" || action === "copyPath") await window.devbox.copyPath(selectedProject.id, node.relativePath, true);
      if (action === "copyRelativePath") await window.devbox.copyPath(selectedProject.id, node.relativePath, false);
      if (action === "reveal") await window.devbox.revealPath(selectedProject.id, node.relativePath);
      if (action === "duplicate") setTree(await window.devbox.duplicatePath(selectedProject.id, node.relativePath));
      if (action === "trash") {
        setTree(await window.devbox.trashPath(selectedProject.id, node.relativePath));
        if (file?.relativePath === node.relativePath) { setFile(null); setEditorText(""); }
      }
      if (action === "rename") setPrompt({ title: "Yeniden adlandır", label: node.relativePath, value: node.name, confirmLabel: "Yeniden adlandır", onConfirm: async (value) => { setTree(await window.devbox.renamePath(selectedProject.id, node.relativePath, value)); if (file?.relativePath === node.relativePath) setFile(null); } });
      if (action === "newFile" || action === "newDirectory") setPrompt({ title: action === "newFile" ? "Yeni dosya" : "Yeni klasör", label: node.relativePath, value: "", confirmLabel: "Oluştur", onConfirm: async (value) => { setTree(await window.devbox.createPath(selectedProject.id, node.relativePath, value, action === "newFile" ? "file" : "directory")); } });
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }, [file?.relativePath, openFile, selectedProject]);

  const deleteThread = useCallback(async (summary: ThreadSummary): Promise<void> => {
    try {
      const deleted = await window.devbox.deleteThread(summary.id);
      if (!deleted) return;
      const wasOpen = thread?.thread.id === summary.id;
      const next = await updateThreads();
      if (wasOpen) setThread(null);
      if (next[0] && wasOpen) await openThread(next[0].id);
      setNotice(`“${summary.title}” görevi ve yerel geçmişi silindi.`);
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }, [openThread, thread?.thread.id, updateThreads]);

  const threadContext = useCallback(async (summary: ThreadSummary): Promise<void> => {
    const action = await window.devbox.showContextMenu("thread");
    if (action === "copyTitle") await window.devbox.copyText(summary.title);
    if (action === "rename") setPrompt({ title: "Görevi yeniden adlandır", label: "Başlık", value: summary.title, confirmLabel: "Kaydet", onConfirm: async (value) => { const renamed = await window.devbox.renameThread(summary.id, value); setThreads((current) => current.map((item) => item.id === renamed.id ? renamed : item)); setThread((current) => current?.thread.id === renamed.id ? { ...current, thread: renamed } : current); } });
    if (action === "delete") await deleteThread(summary);
  }, [deleteThread]);

  const handleMenu = useCallback(async (menu: "file" | "edit" | "view" | "help"): Promise<void> => {
    const action = await window.devbox.showAppMenu(menu);
    if (action === "newTask") await createThread();
    if (action === "openProject") await chooseProject();
    if (action === "toggleSidebar") setSidebarVisible((value) => !value);
    if (action === "toggleInspector") setInspectorVisible((value) => !value);
    if (action === "toggleTerminal") selectedProject ? (setView("terminal"), setTerminalOpen(false)) : setTerminalOpen((value) => !value);
    if (action === "shortcuts") setNotice("Ctrl+N Yeni görev · Ctrl+O Proje aç · Ctrl+K Komut paleti · Ctrl+P Hızlı aç · Ctrl+` Etkileşimli terminal · Ctrl+S Kaydet · Enter Gönder · Esc Kapat");
    if (action === "about") setNotice(`DevBox ${bootstrap?.app.version ?? ""} · Güvenli Windows mühendislik komuta merkezi`);
  }, [bootstrap?.app.version, chooseProject, createThread, selectedProject]);

  const navigateHistory = useCallback(async (direction: -1 | 1): Promise<void> => {
    const nextIndex = historyIndex + direction;
    const id = history[nextIndex];
    if (!id || nextIndex < 0 || nextIndex >= history.length) return;
    setHistoryIndex(nextIndex);
    await openThread(id, false);
  }, [history, historyIndex, openThread]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const ctrl = event.ctrlKey || event.metaKey;
      if (ctrl && event.key.toLocaleLowerCase("tr-TR") === "k") { event.preventDefault(); setPaletteOpen(true); }
      else if (ctrl && event.key.toLocaleLowerCase("tr-TR") === "p") { event.preventDefault(); setPaletteOpen(true); }
      else if (ctrl && event.key.toLocaleLowerCase("tr-TR") === "n") { event.preventDefault(); void createThread(); }
      else if (ctrl && event.key.toLocaleLowerCase("tr-TR") === "o") { event.preventDefault(); void chooseProject(); }
      else if (ctrl && event.key.toLocaleLowerCase("tr-TR") === "s") { event.preventDefault(); void saveFile(); }
      else if (ctrl && event.key === "`") { event.preventDefault(); selectedProject ? (setView("terminal"), setTerminalOpen(false)) : setTerminalOpen((value) => !value); }
      else if (event.key === "Escape") { setPaletteOpen(false); setPrompt(null); setPermissionMenuOpen(false); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [chooseProject, createThread, saveFile, selectedProject]);

  useEffect(() => {
    const preventFileNavigation = (event: DragEvent): void => event.preventDefault();
    window.addEventListener("dragover", preventFileNavigation);
    window.addEventListener("drop", preventFileNavigation);
    return () => {
      window.removeEventListener("dragover", preventFileNavigation);
      window.removeEventListener("drop", preventFileNavigation);
    };
  }, []);

  const capabilities = bootstrap?.capabilities ?? [];
  const readyCount = useMemo(() => capabilities.filter((item) => item.state === "READY").length, [capabilities]);
  const agentReady = capabilities.some((item) => item.id === "hermes-nvidia-agent" && item.state === "READY");
  const vercelCli = capabilities.find((item) => item.id === "vercel-cli");
  const vercelAccount = capabilities.find((item) => item.id === "vercel-account");
  const dirty = file !== null && editorText !== file.content;
  const title = view === "thread" ? thread?.thread.title ?? "Yeni sohbet"
    : view === "files" ? file?.relativePath ?? selectedProject?.name ?? "Dosyalar"
      : view === "git" ? "Git ve değişiklikler"
        : view === "runs" ? "Test ve derleme"
          : view === "sites" ? "Vercel ve Siteler"
            : view === "capabilities" ? "Sistem kabiliyetleri"
              : view === "terminal" ? "Terminal"
                : view === "worktrees" ? "Worktree’ler"
                  : view === "automations" ? "DevBox API gelişimi"
                    : view === "integrations" ? "Eklentiler ve entegrasyonlar"
                      : "Ayarlar";

  if (!bootstrap && busy === "bootstrap" && !notice) return <div className="boot-screen"><Box size={30} /><strong>DevBox</strong><span>Yerel çekirdek ve durum deposu doğrulanıyor…</span></div>;

  return (
    <div style={themeStyle(appSettings)} className={`app-shell ${sidebarVisible ? "" : "sidebar-hidden"} ${inspectorVisible ? "inspector-visible" : ""} ${appSettings?.reduceMotion ? "reduced-motion" : ""} ${appSettings?.theme.contrast === "high" ? "high-contrast" : ""}`}>
      <header className="system-bar">
        <div className="system-left"><button onClick={() => setSidebarVisible((value) => !value)} aria-label="Kenar çubuğu"><LayoutPanelLeft size={16} /></button><button disabled={historyIndex <= 0} onClick={() => void navigateHistory(-1)} aria-label="Geri"><ArrowLeft size={16} /></button><button disabled={historyIndex < 0 || historyIndex >= history.length - 1} onClick={() => void navigateHistory(1)} aria-label="İleri"><ArrowRight size={16} /></button><nav aria-label="Uygulama menüsü"><button onClick={() => void handleMenu("file")}>Dosya</button><button onClick={() => void handleMenu("edit")}>Düzenle</button><button onClick={() => void handleMenu("view")}>Görünüm</button><button onClick={() => void handleMenu("help")}>Yardım</button></nav></div>
      </header>

      <div className="workbench">
        {sidebarVisible && <aside className="sidebar" aria-label="DevBox gezintisi">
          <div className="sidebar-brand"><button className="brand-button" aria-label="DevBox ayarlarını aç" title="DevBox ayarlarını aç" onClick={() => setView("settings")}><DevBoxWordmark /><ChevronDown className="brand-chevron" size={14} /></button><div><button onClick={() => setPaletteOpen(true)} aria-label="Ara"><Search size={16} /></button></div></div>
          <nav className="primary-nav">
            <button onClick={() => void createThread()}><MessageSquarePlus size={16} /><span>Yeni sohbet</span><kbd>Ctrl N</kbd></button>
            <button className={view === "integrations" ? "active" : ""} onClick={() => setView("integrations")}><CircleDot size={16} /><span>Pull request’ler</span></button>
            <button className={view === "sites" ? "active" : ""} onClick={() => setView("sites")}><Globe2 size={16} /><span>Siteler</span></button>
            <button className={view === "automations" ? "active" : ""} onClick={() => setView("automations")}><ListChecks size={16} /><span>API gelişimi</span></button>
            <button className={view === "integrations" ? "active" : ""} onClick={() => setView("integrations")}><Plug size={16} /><span>Eklentiler</span></button>
          </nav>
          <div className="sidebar-scroll">
            <section className="sidebar-section"><div className="section-label"><span>Projeler</span><button onClick={() => void chooseProject()} aria-label="Proje ekle"><Plus size={14} /></button></div>{bootstrap?.projects.length ? bootstrap.projects.map((project) => <button key={project.id} className={`project-row ${selectedProject?.id === project.id ? "selected" : ""}`} onClick={() => { void loadProject(project); setView("thread"); }} title={project.rootPath}><Folder size={15} /><span>{project.name}</span>{project.isGitRepository && <GitBranch size={12} />}</button>) : <p className="empty-label">Proje yok</p>}</section>
            <section className="sidebar-section recent-section"><div className="section-label"><span>Yakın zamanlar</span></div>{threads.length ? threads.map((summary) => <div key={summary.id} className={`thread-entry ${thread?.thread.id === summary.id && view === "thread" ? "selected" : ""}`} onContextMenu={(event) => { event.preventDefault(); void threadContext(summary); }}><button className="thread-row" onClick={() => void openThread(summary.id)} title={`${summary.title}\n${exactDateTime(summary.updatedAt)}`}><span>{summary.title}</span><time dateTime={summary.updatedAt}>{formatThreadTime(summary.updatedAt)}</time>{!["IDLE", "COMPLETED"].includes(summary.state) && <i className={stateClass(summary.state)} title={summary.state} />}</button><button className="thread-delete" onClick={() => void deleteThread(summary)} aria-label={`${summary.title} görevini sil`} title="Görevi sil"><Trash2 size={13} /></button></div>) : <p className="empty-label">Henüz görev yok</p>}</section>
          </div>
          <div className="account-row"><span className="account-avatar">DB</span><span><strong>Yerel kullanıcı</strong><small>{readyCount}/{capabilities.length} READY</small></span><button onClick={() => setView("settings")} aria-label="Ayarlar"><Settings size={15} /></button></div>
        </aside>}

        <main className="main-stage" onContextMenu={(event) => { if (event.target === event.currentTarget) { event.preventDefault(); void window.devbox.showContextMenu("blank", false, true).then((action) => { if (action === "newTask") void createThread(); if (action === "openProject") void chooseProject(); }); } }}>
          <header className="stage-header"><div className="stage-title"><div><strong title={title}>{title}</strong>{view === "thread" && thread && <small title={`${selectedProject?.rootPath ?? "Yerel"} · ${exactDateTime(thread.thread.updatedAt)}`}><FolderOpen size={11} />{selectedProject?.name ?? "Yerel"}<span>/</span>Sohbetler<time dateTime={thread.thread.updatedAt}>{formatThreadTime(thread.thread.updatedAt)}</time></small>}</div>{dirty && <span className="dirty-dot" title="Kaydedilmemiş değişiklik" />}</div><div className="stage-actions"><button className={view === "files" ? "active" : ""} onClick={() => setView("files")} title="Dosyalar"><Braces size={16} /></button><button className={inspectorVisible ? "active" : ""} onClick={() => setInspectorVisible((value) => !value)} title="Denetleyici"><PanelRight size={16} /></button><button className={view === "terminal" ? "active" : ""} onClick={() => { setView("terminal"); setTerminalOpen(false); }} title="Etkileşimli terminal"><LayoutPanelTop size={16} /></button></div></header>

          <div className="stage-body">
            {["files", "git", "terminal", "worktrees", "runs", "integrations", "capabilities"].includes(view) && <nav className="work-tabs" aria-label="Çalışma araçları"><button className={view === "files" ? "active" : ""} onClick={() => setView("files")}>Dosyalar</button><button className={view === "git" ? "active" : ""} onClick={() => setView("git")}>Git</button><button className={view === "terminal" ? "active" : ""} onClick={() => { setView("terminal"); setTerminalOpen(false); }}>Terminal</button><button className={view === "worktrees" ? "active" : ""} onClick={() => setView("worktrees")}>Worktree</button><button className={view === "runs" ? "active" : ""} onClick={() => setView("runs")}>Testler</button><button className={view === "integrations" ? "active" : ""} onClick={() => setView("integrations")}>Araçlar</button><button className={view === "capabilities" ? "active" : ""} onClick={() => setView("capabilities")}>Sistem</button></nav>}
            {view === "thread" && <section className={`thread-view ${dragActive ? "drag-active" : ""}`} onDragEnter={(event) => { event.preventDefault(); if (event.dataTransfer.types.includes("Files")) setDragActive(true); }} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragActive(false); }} onDrop={(event) => { event.preventDefault(); setDragActive(false); void dropAttachments(Array.from(event.dataTransfer.files)); }}>
              {dragActive && <div className="drop-overlay"><Paperclip size={28} /><strong>Dosyaları göreve ekleyin</strong><span>Tüm uzantılar kabul edilir · dosya başına en fazla 300 MB · arşivler çalıştırılmaz</span></div>}
              <div className="conversation" ref={conversationRef}>
                <div className="conversation-inner">
                  {thread ? <>
                    {thread.items.length === 0 && <div className="thread-empty thread-ready"><Sparkles size={30} /><h1>Ne oluşturalım?</h1><p>{selectedProject ? `${selectedProject.name} projesi bu göreve bağlı.` : "Bir proje seçebilir veya doğrudan görevinizi yazabilirsiniz."}</p></div>}
                    {thread.items.map((item) => <Message key={item.id} item={item} busy={busy?.startsWith("message") ?? false} onEdit={updateMessage} onRegenerate={regenerateMessage} onCopy={copyMessage} onQuote={quoteMessage} />)}
                    {busy === "message" && <div className="activity-line running"><LoaderCircle className="spin" size={14} /><span>Görev zaman çizelgesi güncelleniyor…</span></div>}
                  </> : <div className="thread-empty thread-ready"><Sparkles size={30} /><h1>Ne oluşturalım?</h1><p>{selectedProject ? `${selectedProject.name} projesinde yeni bir görev başlatın.` : "Bir proje seçin veya görevinizi yazarak proje seçimine geçin."}</p></div>}
                </div>
              </div>
              <div className="composer-wrap"><button className="composer-project" onClick={() => void chooseProject()} title={selectedProject?.rootPath ?? "Yerel proje klasörü seçin"}><FolderOpen size={14} /><span>{selectedProject?.name ?? "Proje seç"}</span></button><div className={`composer ${busy === "message" ? "busy" : ""}`}>
                {draftAttachments.length > 0 && <div className="composer-attachments" aria-label="Gönderilecek dosyalar">{draftAttachments.map((attachment) => <span key={attachment.id}><AttachmentGlyph attachment={attachment} /><span><strong>{attachment.name}</strong><small>{formatBytes(attachment.size)} · {attachment.extension || attachment.kind}</small></span><button onClick={() => void removeAttachment(attachment)} aria-label={`${attachment.name} ekini kaldır`} title="Eki kaldır"><X size={13} /></button></span>)}</div>}
                <textarea ref={composerRef} value={composer} onChange={(event) => setComposer(event.target.value)} placeholder="DevBox'a bir görev verin" disabled={busy === "message"} rows={1} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void sendMessage(); } }} onContextMenu={(event) => { event.preventDefault(); const target = event.currentTarget; void window.devbox.showContextMenu("editable", target.selectionStart !== target.selectionEnd, true); }} />
                <div className="composer-toolbar"><div><button onClick={() => void selectAttachments()} disabled={busy === "attachment"} title="Dosya ekle — tüm uzantılar, en fazla 300 MB"><Plus size={18} /></button><div className="permission-control"><button className={`permission-button ${permission === "Tam erişim" ? "full" : ""}`} onClick={() => setPermissionMenuOpen((value) => !value)} aria-haspopup="menu" aria-expanded={permissionMenuOpen} disabled={busy === "permission"}><ShieldCheck size={14} /><span>{permissionLabel(permission)}</span><ChevronDown size={12} /></button>{permissionMenuOpen && <div className="permission-menu" role="menu" aria-label="İzin profili">{PERMISSION_OPTIONS.map((option) => <button key={option.value} className={`${permission === option.value ? "selected" : ""} ${option.value === "Tam erişim" ? "full" : ""}`} role="menuitemradio" aria-checked={permission === option.value} onClick={() => void applyPermission(option.value)}><span className="permission-menu-icon"><ShieldCheck size={15} /></span><span><strong>{option.label}</strong><small>{option.detail}</small></span>{permission === option.value && <Check size={15} />}</button>)}</div>}</div></div><div><button className="model-button" onClick={() => setView("capabilities")} title={agentReady ? "Hermes + NVIDIA canlı doğrulandı — kanıtları aç" : "Ajan sağlayıcısı doğrulanmadı — tanılamayı aç"}><span>{agentReady ? "Hermes · NVIDIA" : "Sağlayıcı yok"}</span><small>{agentReady ? "READY" : "DOĞRULANMADI"}</small><ChevronDown size={13} /></button><button className="send-button" onClick={() => void sendMessage()} disabled={(!composer.trim() && draftAttachments.length === 0) || busy === "message"} aria-label="Gönder"><Send size={17} /></button></div></div>
              </div><div className="composer-hint"><kbd>Enter</kbd> gönderir · <kbd>Shift+Enter</kbd> yeni satır · Dosyaları sürükleyip bırakın · Dosya başına 300 MB</div></div>
            </section>}

            {view === "files" && <section className="files-view">
              <aside className="file-explorer"><div className="panel-heading"><span>GEZGİN</span><div><button onClick={() => selectedProject && setPrompt({ title: "Yeni dosya", label: selectedProject.name, value: "", confirmLabel: "Oluştur", onConfirm: async (value) => setTree(await window.devbox.createPath(selectedProject.id, "", value, "file")) })} disabled={!selectedProject} title="Yeni dosya"><File size={14} /></button><button onClick={() => void chooseProject()} title="Proje aç"><FolderOpen size={14} /></button><button onClick={() => selectedProject && void loadProject(selectedProject)} title="Yenile"><RefreshCw size={14} /></button></div></div>{selectedProject && <div className="explorer-project"><ChevronDown size={13} /><strong>{selectedProject.name.toLocaleUpperCase("tr-TR")}</strong></div>}<div className="tree-scroll">{tree.length ? <ul className="tree-root">{tree.map((node) => <TreeItem key={node.relativePath} node={node} depth={0} selectedPath={file?.relativePath ?? null} onOpen={(item) => void openFile(item)} onContext={(item) => void pathContext(item)} />)}</ul> : <p className="empty-label">{selectedProject ? "Klasör boş veya filtrelendi." : "Proje klasörü açın."}</p>}</div></aside>
              <div className="editor-area">{file ? <><div className="editor-tabs"><div className="editor-tab active"><FileCode2 size={14} /><span>{file.relativePath}</span>{dirty && <i />}<button onClick={() => { setFile(null); setEditorText(""); }} aria-label="Sekmeyi kapat"><X size={13} /></button></div></div><div className="breadcrumbs"><span>{selectedProject?.name}</span><ChevronRight size={12} /><span>{file.relativePath}</span><button className={dirty ? "save active" : "save"} disabled={!dirty || busy === "save-file"} onClick={() => void saveFile()} title="Kaydet (Ctrl+S)">{busy === "save-file" ? <LoaderCircle className="spin" size={14} /> : <Save size={14} />}</button></div><div className="code-editor"><div className="line-numbers" aria-hidden="true">{editorText.split(/\r?\n/u).map((_line, index) => <span key={index}>{index + 1}</span>)}</div><textarea aria-label={`${file.relativePath} kod düzenleyicisi`} spellCheck={false} value={editorText} onChange={(event) => setEditorText(event.target.value)} onContextMenu={(event) => { event.preventDefault(); const target = event.currentTarget; void window.devbox.showContextMenu("editable", target.selectionStart !== target.selectionEnd, true); }} /></div><footer className="status-bar"><span>{dirty ? "Değiştirildi" : "Kaydedildi"}</span><span>{file.language}</span><span>UTF-8</span><span>SHA {file.sha256.slice(0, 8)}</span><span>{file.size.toLocaleString("tr-TR")} bayt</span></footer></> : <div className="editor-empty"><Box size={40} /><strong>{selectedProject?.name ?? "DevBox"}</strong><p>Gezginden bir dosya açın. Metin dosyaları düzenlenebilir; ikili ve 1 MiB üzerindeki dosyalar güvenli biçimde reddedilir.</p><div><kbd>Ctrl P</kbd> Hızlı aç <kbd>Ctrl S</kbd> Kaydet <kbd>F2</kbd> Yeniden adlandır</div></div>}</div>
            </section>}

            {view === "git" && <section className="page-scroll"><div className="page-heading"><div><p className="eyebrow">SOURCE CONTROL</p><h1>Git ve değişiklikler</h1><p>{selectedProject?.rootPath ?? "Bir Git projesi açın."}</p></div><button onClick={() => void refreshGit()} disabled={!selectedProject?.isGitRepository || busy === "git"}><RefreshCw className={busy === "git" ? "spin" : ""} size={15} /> Yenile</button></div>{gitStatus?.available ? <><div className="facts-grid"><div><span>Dal</span><strong>{gitStatus.branch ?? "detached HEAD"}</strong></div><div><span>HEAD</span><strong className="mono">{gitStatus.head?.slice(0, 12) ?? "commit yok"}</strong></div><div><span>İleri / geri</span><strong>{gitStatus.ahead} / {gitStatus.behind}</strong></div><div><span>Değişiklik</span><strong>{gitStatus.changes.length}</strong></div></div><section className="content-panel"><h2>Çalışma ağacı</h2>{gitStatus.changes.length ? <ul className="change-list">{gitStatus.changes.map((change) => <li key={`${change.path}:${change.originalPath ?? ""}`}><code>{change.indexStatus}{change.worktreeStatus}</code><span>{change.path}</span></li>)}</ul> : <div className="empty-panel"><CheckCircle2 size={23} /><span>Çalışma ağacı temiz.</span></div>}</section>{gitDiff && (gitDiff.staged || gitDiff.unstaged) && <section className="content-panel"><div className="panel-title"><h2>Diff</h2><button onClick={() => void window.devbox.copyText(`${gitDiff.staged}${gitDiff.unstaged}`)}><Copy size={14} /> Patch'i kopyala</button></div><pre className="diff-preview">{`${gitDiff.staged}${gitDiff.unstaged}`}</pre></section>}</> : <div className="empty-panel large"><GitBranch size={30} /><strong>Git verisi yok</strong><span>{gitStatus?.error ?? "Seçili klasör bir Git deposu değil."}</span></div>}</section>}

            {view === "runs" && <section className="page-scroll"><div className="page-heading"><div><p className="eyebrow">VERIFIED TASKS</p><h1>Test ve derleme</h1><p>Yalnızca proje bildiriminde tanımlı betikler, kabuk genişletmesi kapalı şekilde çalıştırılır.</p></div></div><div className="task-grid">{TASKS.map((task) => <button key={task.id} disabled={!selectedProject || busy !== null} onClick={() => void runTask(task.id)}>{task.icon}<span><strong>{task.label}</strong><small>{task.detail}</small></span><Play size={14} /></button>)}</div>{terminalResult && <section className="content-panel"><div className="panel-title"><h2>Son sonuç</h2><StateBadge state={terminalResult.exitCode === 0 ? "COMPLETED" : "FAILED"} /></div><dl className="facts-list"><div><dt>Komut</dt><dd>{terminalResult.commandDisplay}</dd></div><div><dt>Süre</dt><dd>{terminalResult.durationMs} ms</dd></div><div><dt>Çıkış</dt><dd>{terminalResult.exitCode ?? terminalResult.exitReason}</dd></div></dl></section>}</section>}

            {view === "sites" && <section className="page-scroll"><div className="page-heading"><div><p className="eyebrow">VERCEL / SITES</p><h1>Vercel ve Siteler</h1><p>Yalnız bu makinede gerçekten keşfedilen Vercel CLI, hesap ve seçili proje bilgisi gösterilir.</p></div><StateBadge state={vercelAccount?.state ?? vercelCli?.state ?? "UNAVAILABLE"} /></div><div className="facts-grid"><div><span>Vercel CLI</span><strong>{vercelCli?.version ?? "Bulunamadı"}</strong></div><div><span>Hesap doğrulaması</span><strong>{vercelAccount?.state ?? "UNAVAILABLE"}</strong></div><div><span>Seçili proje</span><strong>{selectedProject?.name ?? "Seçilmedi"}</strong></div><div><span>Proje kökü</span><strong title={selectedProject?.rootPath}>{selectedProject?.rootPath ?? "—"}</strong></div></div><section className="content-panel"><div className="panel-title"><h2>Gerçek Vercel komutları</h2><StateBadge state={selectedProject && vercelCli?.state === "INSTALLED" ? (vercelAccount?.state ?? "UNAVAILABLE") : "UNAVAILABLE"} /></div><p>Bağlama, preview, production deploy, inspect, log ve rollback yalnız Vercel CLI gerçekten kuruluysa çalıştırılır. Her sonuç gerçek komutun çıkış kodu, stdout/stderr ve süresiyle kanıtlanır; doğrulanmamış Functions, Cron, Sandbox, Workflow, Queues, Blob veya AI Gateway yeteneği burada varmış gibi gösterilmez.</p><div className="deployment-actions"><button disabled={!selectedProject || vercelCli?.state !== "INSTALLED"} onClick={() => setView("integrations")}><Globe2 size={15} /> Vercel komuta merkezini aç</button></div></section></section>}

            {view === "capabilities" && <section className="page-scroll"><div className="page-heading"><div><p className="eyebrow">RUNTIME TRUTH</p><h1>Sistem kabiliyetleri</h1><p>READY yalnızca kimlik, yapılandırma, sağlık ve minimum canlı işlem kanıtı birlikte sağlandığında kullanılır.</p></div><StateBadge state={bootstrap?.core.state ?? "FAILED"} /></div><div className="capability-grid">{capabilities.map((capability) => <article key={capability.id}><div><span className="cap-icon">{capability.state === "READY" ? <Check size={16} /> : <Activity size={16} />}</span><div><strong>{capability.displayName}</strong><small>{capability.version ?? "Sürüm doğrulanmadı"}</small></div><StateBadge state={capability.state} /></div><p>{capability.detail}</p>{capability.remediation && <footer>{capability.remediation}</footer>}</article>)}</div></section>}

            {view === "terminal" && <TerminalWorkspace project={selectedProject} />}
            {view === "worktrees" && <WorktreeWorkspace project={selectedProject} />}
            {view === "automations" && <AutomationWorkspace project={selectedProject} />}
            {view === "integrations" && <IntegrationWorkspace project={selectedProject} />}
            {view === "settings" && <SettingsWorkspace settings={appSettings} onSettings={(next) => { setAppSettings(next); setPermission(next.permissionProfile); }} onClose={() => setView(thread ? "thread" : selectedProject ? "files" : "thread")} />}
          </div>

          {inspectorVisible && <aside className="inspector"><div className="inspector-heading"><span>DENETLEYİCİ</span><button onClick={() => setInspectorVisible(false)}><X size={14} /></button></div><div className="inspector-scroll"><section><h3>Çalışma alanı</h3><dl className="facts-list"><div><dt>Proje</dt><dd>{selectedProject?.name ?? "—"}</dd></div><div><dt>Git</dt><dd>{selectedProject?.isGitRepository ? "Depo" : "Yok"}</dd></div><div><dt>Dal</dt><dd>{gitStatus?.branch ?? "—"}</dd></div><div><dt>Core</dt><dd><StateBadge state={bootstrap?.core.state ?? "FAILED"} /></dd></div></dl></section><section><h3>Aktif görev</h3>{thread ? <><strong>{thread.thread.title}</strong><p>{thread.items.length} zaman çizelgesi öğesi</p><StateBadge state={thread.thread.state} /></> : <p>Görev seçilmedi.</p>}</section><section><h3>Güvenlik</h3><div className="security-note"><ShieldCheck size={18} /><span><strong>Bağlam izolasyonu</strong><small>Etkin</small></span></div><div className="security-note"><HardDrive size={18} /><span><strong>Yerel veri</strong><small>SQLite WAL</small></span></div></section></div></aside>}
        </main>
      </div>

      {terminalOpen && <section className="terminal-pane" aria-label="Görev çıktısı"><div className="terminal-heading"><div><SquareTerminal size={14} /><strong>GÖREV ÇIKTISI</strong>{busy?.startsWith("task:") && <LoaderCircle className="spin" size={13} />}</div><div>{terminalResult && <span>{terminalResult.durationMs} ms · çıkış {terminalResult.exitCode ?? terminalResult.exitReason}</span>}<button onClick={() => setTerminalResult(null)}>Temizle</button><button onClick={() => setTerminalOpen(false)} aria-label="Kapat"><X size={14} /></button></div></div><div className="terminal-output" tabIndex={0} ref={terminalRef} onContextMenu={(event) => { event.preventDefault(); const selection = window.getSelection()?.toString() ?? ""; void window.devbox.showContextMenu("terminal", selection.length > 0).then((action) => { if (action === "copyOutput") void window.devbox.copyText(selection); if (action === "clear") setTerminalResult(null); }); }}>{terminalResult ? <><div><span className="prompt">PS&gt;</span> {terminalResult.commandDisplay}</div>{terminalResult.stdout && <pre>{terminalResult.stdout}</pre>}{terminalResult.stderr && <pre className="stderr">{terminalResult.stderr}</pre>}<div className={terminalResult.exitCode === 0 ? "exit-ok" : "exit-bad"}>Süreç {terminalResult.exitReason} · {terminalResult.durationMs} ms{terminalResult.truncated ? " · çıktı kesildi" : ""}</div></> : <p>Test, tür denetimi veya derleme çalıştırıldığında gerçek süreç çıktısı burada görünür.</p>}</div></section>}

      {notice && <div className="toast" role="status"><AlertTriangle size={16} /><span>{notice}</span><button onClick={() => setNotice(null)} aria-label="Bildirimi kapat"><X size={14} /></button></div>}
      {prompt && <PromptDialog prompt={prompt} onClose={() => setPrompt(null)} />}
      {paletteOpen && <div className="palette-backdrop" onMouseDown={() => setPaletteOpen(false)}><div className="palette" role="dialog" aria-modal="true" aria-label="Komut paleti" onMouseDown={(event) => event.stopPropagation()}><div className="palette-input"><Command size={16} /><input autoFocus placeholder="Komut, görev veya dosya ara…" onKeyDown={(event) => { if (event.key === "Escape") setPaletteOpen(false); }} /><kbd>Esc</kbd></div><div className="palette-group"><span>HIZLI EYLEMLER</span><button onClick={() => { setPaletteOpen(false); void createThread(); }}><MessageSquarePlus size={16} /><div><strong>Yeni görev</strong><small>Kalıcı bir görev zaman çizelgesi oluştur</small></div></button><button onClick={() => { setPaletteOpen(false); void chooseProject(); }}><FolderOpen size={16} /><div><strong>Proje klasörü aç</strong><small>Canonical sınırla yerel klasör seç</small></div></button>{selectedProject && TASKS.map((task) => <button key={task.id} onClick={() => { setPaletteOpen(false); void runTask(task.id); }}>{task.icon}<div><strong>{task.label}</strong><small>{task.detail}</small></div></button>)}</div></div></div>}
    </div>
  );
}
