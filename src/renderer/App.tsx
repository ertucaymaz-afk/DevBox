import {
  Activity,
  AlertTriangle,
  Archive,
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
  Pin,
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
  ThreadActivityEvent,
  ThreadWorkspaceResult,
  ThreadItem,
  ThreadSummary,
  AppSettings,
  PermissionProfile,
  EditorDiagnostic
} from "../shared/contracts";
import {
  AutomationWorkspace,
  CatalogWorkspace,
  IntegrationWorkspace,
  SettingsWorkspace,
  TerminalWorkspace,
  WorktreeWorkspace,
  themeStyle
} from "./AdvancedViews";
import { WhatsNewWorkspace } from "./WhatsNewWorkspace";
import { CanvasInspector } from "./CanvasInspector";

type View = "thread" | "files" | "git" | "runs" | "sites" | "capabilities" | "settings" | "terminal" | "worktrees" | "automations" | "integrations" | "skills" | "pullRequests" | "whatsNew";
type PromptState = {
  title: string;
  label: string;
  value: string;
  confirmLabel: string;
  onConfirm: (value: string) => Promise<void>;
};
type ConfirmState = {
  title: string;
  message: string;
  detail: string;
  confirmLabel: string;
  onConfirm: () => Promise<void>;
};
type ThreadMenuAction = "pin" | "rename" | "archive" | "unread" | "revealProject" | "copyWorkingDirectory" | "copySessionId" | "copyTitle" | "delete";
type ThreadMenuState = { summary: ThreadSummary; x: number; y: number };

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

const SEEN_RELEASE_KEY = "devbox:seen-release";

function hasUnseenRelease(): boolean {
  try {
    return window.localStorage.getItem(SEEN_RELEASE_KEY) !== __DEVBOX_VERSION__;
  } catch {
    return true;
  }
}

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

function editorOffset(content: string, line: number, character: number): number {
  const lines = content.split(/\r?\n/u);
  let offset = 0;
  for (let index = 0; index < Math.min(line, lines.length); index += 1) offset += (lines[index]?.length ?? 0) + 1;
  return Math.min(content.length, offset + Math.min(character, lines[line]?.length ?? 0));
}

function stateClass(state: Capability["state"] | ThreadSummary["state"]): string {
  if (["READY", "COMPLETED", "IDLE"].includes(state)) return "positive";
  if (["UNAVAILABLE", "FAILED", "BLOCKED", "RECOVERY_REQUIRED"].includes(state)) return "negative";
  return "warning";
}

function stateLabel(state: string): string {
  const labels: Record<string, string> = {
    READY: "HAZIR",
    SUCCEEDED: "BAŞARILI",
    COMPLETED: "TAMAMLANDI",
    IDLE: "BEKLİYOR",
    RUNNING: "ÇALIŞIYOR",
    QUEUED: "KUYRUKTA",
    CANCELLED: "İPTAL EDİLDİ",
    UNAVAILABLE: "KULLANILAMIYOR",
    FAILED: "BAŞARISIZ",
    BLOCKED: "ENGELLENDİ",
    RECOVERY_REQUIRED: "KURTARMA GEREKİYOR",
    INSTALLED: "KURULU",
    CONFIGURED: "YAPILANDIRILDI",
    DEGRADED: "KISITLI"
  };
  return labels[state] ?? state;
}

function StateBadge({ state }: { state: Capability["state"] | ThreadSummary["state"] }): ReactNode {
  return <span className={`state-badge ${stateClass(state)}`} title={state}>{stateLabel(state)}</span>;
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

function LaunchIntro({ ready, reducedMotion, onSkip, onNever }: { ready: boolean; reducedMotion: boolean; onSkip: () => void; onNever: () => void }): ReactNode {
  return (
    <div className={`launch-intro ${ready ? "ready" : ""} ${reducedMotion ? "reduced-motion" : ""}`} role="status" aria-live="polite">
      <div className="launch-ambient" aria-hidden="true"><i /><i /><i /></div>
      <div className="launch-content">
        <div className="launch-brand"><DevBoxWordmark /></div>
        <p className="launch-kicker">ÖZERK MÜHENDİSLİK MASAÜSTÜ</p>
        <h1>Fikri, çalışan yazılıma dönüştürün.</h1>
        <p className="launch-copy">Yerel projeleriniz, görevleriniz ve mühendislik araçlarınız tek, kalıcı çalışma alanında.</p>
        <div className="launch-state"><span aria-hidden="true" /><strong>{ready ? "Yerel çalışma alanı hazır" : "Yerel çalışma alanı hazırlanıyor"}</strong></div>
      </div>
      <div className="launch-actions"><button onClick={onNever}>Bir daha gösterme</button><button className="primary" onClick={onSkip}>DevBox’ı aç</button></div>
    </div>
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

function ConfirmDialog({ confirmation, onClose }: { confirmation: ConfirmState; onClose: () => void }): ReactNode {
  const [busy, setBusy] = useState(false);
  const confirm = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    try {
      await confirmation.onConfirm();
      onClose();
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose} onKeyDown={(event) => { if (event.key === "Escape") onClose(); }}>
      <div className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-detail" onMouseDown={(event) => event.stopPropagation()}>
        <div className="confirm-icon" aria-hidden="true"><AlertTriangle size={21} /></div>
        <div className="confirm-copy"><strong id="confirm-title">{confirmation.title}</strong><p>{confirmation.message}</p><small id="confirm-detail">{confirmation.detail}</small></div>
        <button className="dialog-close" onClick={onClose} aria-label="Onay penceresini kapat"><X size={16} /></button>
        <div className="dialog-actions"><button autoFocus disabled={busy} onClick={onClose}>Vazgeç</button><button className="danger" disabled={busy} onClick={() => void confirm()}>{busy ? <LoaderCircle className="spin" size={14} /> : <Trash2 size={14} />}{confirmation.confirmLabel}</button></div>
      </div>
    </div>
  );
}

function ThreadContextMenu({ menu, hasProject, onAction, onClose }: { menu: ThreadMenuState; hasProject: boolean; onAction: (action: ThreadMenuAction) => Promise<void>; onClose: () => void }): ReactNode {
  const run = (action: ThreadMenuAction): void => {
    onClose();
    void onAction(action);
  };
  return (
    <div className="thread-menu-layer" role="presentation" onMouseDown={onClose}>
      <div className="thread-context-menu" role="menu" aria-label={`${menu.summary.title} sohbet eylemleri`} style={{ left: menu.x, top: menu.y }} onMouseDown={(event) => event.stopPropagation()}>
        <button autoFocus role="menuitem" onClick={() => run("pin")}><Pin size={14} /><span>{menu.summary.pinned ? "Sohbetin sabitlemesini kaldır" : "Sohbeti sabitle"}</span></button>
        <button role="menuitem" onClick={() => run("rename")}><Pencil size={14} /><span>Sohbeti yeniden adlandır</span></button>
        <button role="menuitem" onClick={() => run("archive")}><Archive size={14} /><span>{menu.summary.archived ? "Sohbeti arşivden çıkar" : "Sohbeti arşivle"}</span></button>
        <button role="menuitem" onClick={() => run("unread")}><CircleDot size={14} /><span>{menu.summary.unread ? "Okundu olarak işaretle" : "Okunmadı olarak işaretle"}</span></button>
        <div className="menu-separator" role="separator" />
        <button role="menuitem" disabled={!hasProject} onClick={() => run("revealProject")}><FolderOpen size={14} /><span>Dosya Gezgini’nde aç</span></button>
        <button role="menuitem" disabled={!hasProject} onClick={() => run("copyWorkingDirectory")}><Copy size={14} /><span>Çalışma dizinini kopyala</span></button>
        <button role="menuitem" onClick={() => run("copySessionId")}><Copy size={14} /><span>Oturum kimliğini kopyala</span></button>
        <button role="menuitem" onClick={() => run("copyTitle")}><Copy size={14} /><span>Sohbet başlığını kopyala</span></button>
        <div className="menu-separator" role="separator" />
        <button className="danger" role="menuitem" onClick={() => run("delete")}><Trash2 size={14} /><span>Sohbeti kalıcı olarak sil</span></button>
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
  if (item.role === "activity") return <div className="activity-line completed"><CheckCircle2 size={13} /><span>{item.content}</span><time title={exactDateTime(item.createdAt)}>{new Date(item.createdAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}</time></div>;
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
        {editing ? <div className="message-editor"><textarea autoFocus value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") { setDraft(item.content); setEditing(false); } if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) void onEdit(item.id, draft).then((saved) => { if (saved) setEditing(false); }); }} onContextMenu={(event) => { event.preventDefault(); const target = event.currentTarget; void window.devbox.showContextMenu("editable", target.selectionStart !== target.selectionEnd, true); }} /><div><button onClick={() => { setDraft(item.content); setEditing(false); }}>Vazgeç</button><button className="primary" disabled={!draft.trim() || busy} onClick={() => void onEdit(item.id, draft).then((saved) => { if (saved) setEditing(false); })}><Check size={14} /> Kaydet</button></div></div> : <MarkdownMessage content={item.content} />}
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

function LiveActivity({ event }: { event: ThreadActivityEvent }): ReactNode {
  const icon = event.kind === "command"
    ? <SquareTerminal size={13} />
    : event.kind === "evidence"
      ? <CheckCircle2 size={13} />
      : event.kind === "failure"
        ? <XCircle size={13} />
        : <LoaderCircle className="spin" size={13} />;
  const meta = [event.stage, event.provider ? `${event.provider}${event.model ? ` · ${event.model}` : ""}` : null].filter(Boolean).join(" · ");
  return <div className={`activity-line live ${event.kind}`} aria-live="polite">{icon}<div className="activity-copy"><span>{event.message}</span>{meta && <small>{meta}</small>}</div><time title={exactDateTime(event.createdAt)}>{new Date(event.createdAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}</time></div>;
}

function ThreadEmptyState({ project }: { project: ProjectSummary | null }): ReactNode {
  return <div className="thread-empty thread-ready">
    <div className="empty-signal" aria-hidden="true"><i /><Sparkles size={25} /><i /></div>
    <h1>Bugün ne geliştirelim?</h1>
    <p>{project ? <><strong>{project.name}</strong> hazır. Fikrinizi yazın; DevBox bağlamı, araçları ve gerçek işlem kanıtlarını tek görev akışında toplasın.</> : "Bir proje seçin veya görevinizi yazın; proje seçimini gerektiği anda birlikte tamamlayalım."}</p>
    <div className="empty-line" aria-hidden="true"><span /><b /><span /></div>
  </div>;
}

export function App(): ReactNode {
  const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null);
  const [selectedProject, setSelectedProject] = useState<ProjectSummary | null>(null);
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [thread, setThread] = useState<ThreadDetail | null>(null);
  const [tree, setTree] = useState<ProjectTreeNode[]>([]);
  const [file, setFile] = useState<FileSnapshot | null>(null);
  const [editorText, setEditorText] = useState("");
  const [diagnostics, setDiagnostics] = useState<EditorDiagnostic[]>([]);
  const [diagnosticsState, setDiagnosticsState] = useState<"idle" | "loading" | "ready" | "unsupported" | "failed">("idle");
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
  const [gitDiff, setGitDiff] = useState<GitDiff | null>(null);
  const [terminalResult, setTerminalResult] = useState<CommandResult | null>(null);
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);
  const [view, setView] = useState<View>("thread");
  const [releaseUnseen, setReleaseUnseen] = useState(hasUnseenRelease);
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
  const [confirmation, setConfirmation] = useState<ConfirmState | null>(null);
  const [threadMenu, setThreadMenu] = useState<ThreadMenuState | null>(null);
  const [settingsResolved, setSettingsResolved] = useState(false);
  const [introVisible, setIntroVisible] = useState(false);
  const [capabilitiesLoading, setCapabilitiesLoading] = useState(true);
  const [liveActivities, setLiveActivities] = useState<ThreadActivityEvent[]>([]);
  const [workspaceResult, setWorkspaceResult] = useState<ThreadWorkspaceResult | null>(null);
  const [changeSummaryOpen, setChangeSummaryOpen] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const selfDevelopmentProject = bootstrap?.selfDevelopmentProjectId
    ? bootstrap.projects.find((project) => project.id === bootstrap.selfDevelopmentProjectId) ?? null
    : null;
  const terminalRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const diagnosticsVersion = useRef(0);
  const conversationRef = useRef<HTMLDivElement>(null);
  const introStartedAt = useRef(0);

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
      const opened = detail.thread.unread
        ? { ...detail, thread: await window.devbox.setThreadUnread(threadId, false) }
        : detail;
      setThread(opened);
      setWorkspaceResult(null);
      if (detail.thread.unread) setThreads((current) => current.map((item) => item.id === threadId ? opened.thread : item));
      setDraftAttachments(await window.devbox.listDraftAttachments(threadId));
      setView("thread");
      const project = bootstrap?.projects.find((item) => item.id === opened.thread.projectId);
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
        const [boot, loadedSettings] = await Promise.all([window.devbox.bootstrap(), window.devbox.getSettings()]);
        if (!active) return;
        setBootstrap(boot);
        setAppSettings(loadedSettings);
        setPermission(loadedSettings.permissionProfile);
        const shouldShowIntro = loadedSettings.launchIntroMode === "always"
          || (loadedSettings.launchIntroMode === "once" && !loadedSettings.launchIntroSeen);
        if (shouldShowIntro) introStartedAt.current = Date.now();
        setIntroVisible(shouldShowIntro);
        setSettingsResolved(true);
        void window.devbox.inspectCapabilities().then((capabilities) => {
          if (active) setBootstrap((current) => current ? { ...current, capabilities } : current);
        }).catch((error) => {
          if (active) setNotice(`Sistem kabiliyetleri denetlenemedi: ${errorMessage(error)}`);
        }).finally(() => {
          if (active) setCapabilitiesLoading(false);
        });
        // DevBox has one task flow. Project tools open from the same task shell;
        // there is no separate Chat/Work product mode.
        setView("thread");
        const nextThreads = await window.devbox.listThreads();
        if (!active) return;
        setThreads(nextThreads);
        const firstProject = boot.projects[0] ?? null;
        if (firstProject) await loadProject(firstProject);
        const initialThread = nextThreads.find((item) => !item.archived);
        if (initialThread) {
          const detail = await window.devbox.getThread(initialThread.id);
          if (active) {
            setThread(detail);
            setDraftAttachments(await window.devbox.listDraftAttachments(detail.thread.id));
            setHistory([detail.thread.id]);
            setHistoryIndex(0);
          }
        }
      } catch (error) {
        if (active) {
          setSettingsResolved(true);
          setCapabilitiesLoading(false);
          setNotice(errorMessage(error));
        }
      } finally {
        if (active) setBusy(null);
      }
    })();
    return () => { active = false; };
  }, [loadProject]);

  const dismissIntro = useCallback(async (neverAgain = false): Promise<void> => {
    setIntroVisible(false);
    if (!appSettings) return;
    const patch = neverAgain
      ? { launchIntroMode: "never" as const, launchIntroSeen: true }
      : appSettings.launchIntroMode === "once" && !appSettings.launchIntroSeen
        ? { launchIntroSeen: true }
        : null;
    if (!patch) return;
    try {
      setAppSettings(await window.devbox.patchSettings(patch));
    } catch (error) {
      setNotice(`Başlangıç tercihi kaydedilemedi: ${errorMessage(error)}`);
    }
  }, [appSettings]);

  useEffect(() => {
    if (!introVisible || !bootstrap) return;
    const remaining = Math.max(0, 2_100 - (Date.now() - introStartedAt.current));
    const timer = window.setTimeout(() => { void dismissIntro(false); }, remaining);
    return () => window.clearTimeout(timer);
  }, [bootstrap, dismissIntro, introVisible]);

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

  const beginNewThread = useCallback((): void => {
    if (!thread && view === "thread") {
      requestAnimationFrame(() => composerRef.current?.focus());
      return;
    }
    setThread(null);
    setComposer("");
    setDraftAttachments([]);
    setWorkspaceResult(null);
    setView("thread");
    setChangeSummaryOpen(false);
    requestAnimationFrame(() => composerRef.current?.focus());
  }, [thread, view]);

  const sendMessage = useCallback(async (): Promise<void> => {
    const content = composer.trim();
    if (!content && draftAttachments.length === 0) return;
    const activeThread = thread ?? await createThread();
    if (!activeThread) return;
    setComposer("");
    setWorkspaceResult(null);
    setChangeSummaryOpen(false);
    setLiveActivities((current) => current.filter((activity) => activity.threadId !== activeThread.thread.id));
    setBusy("message");
    try {
      const detail = await window.devbox.sendMessage(activeThread.thread.id, content, draftAttachments.map((attachment) => attachment.id));
      setThread(detail);
      setDraftAttachments([]);
      await updateThreads();
      if (selectedProject) await loadProject(selectedProject);
      requestAnimationFrame(() => {
        if (conversationRef.current) conversationRef.current.scrollTop = conversationRef.current.scrollHeight;
      });
    } catch (error) {
      setComposer(content);
      setNotice(errorMessage(error));
    } finally {
      setLiveActivities((current) => current.filter((activity) => activity.threadId !== activeThread.thread.id));
      setBusy(null);
    }
  }, [composer, createThread, draftAttachments, loadProject, selectedProject, thread, updateThreads]);

  useEffect(() => window.devbox.onThreadActivity((activity) => {
    setLiveActivities((current) => [...current, activity].slice(-80));
    requestAnimationFrame(() => {
      if (conversationRef.current) conversationRef.current.scrollTop = conversationRef.current.scrollHeight;
    });
  }), []);

  useEffect(() => window.devbox.onThreadSnapshot((detail) => {
    setThread((current) => current?.thread.id === detail.thread.id ? detail : current);
    setThreads((current) => {
      const index = current.findIndex((item) => item.id === detail.thread.id);
      if (index < 0) return [detail.thread, ...current];
      return current.map((item) => item.id === detail.thread.id ? detail.thread : item);
    });
    requestAnimationFrame(() => {
      if (conversationRef.current) conversationRef.current.scrollTop = conversationRef.current.scrollHeight;
    });
  }), []);

  useEffect(() => window.devbox.onThreadWorkspaceResult((result) => {
    setWorkspaceResult(result);
    setInspectorVisible(true);
    setChangeSummaryOpen(false);
  }), []);

  useEffect(() => {
    if (!selectedProject?.isGitRepository) return;
    let active = true;
    const refresh = (): void => {
      void window.devbox.getGitStatus(selectedProject.id).then((status) => {
        if (active) setGitStatus(status);
      }).catch(() => {
        // The explicit Git view exposes command errors; passive polling stays unobtrusive.
      });
    };
    const timer = window.setInterval(refresh, 5_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [selectedProject]);

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
      setDiagnostics([]);
      setDiagnosticsState("idle");
      setView("files");
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setBusy(null);
    }
  }, [selectedProject]);

  useEffect(() => {
    if (!selectedProject || !file) return;
    const supported = ["typescript", "typescriptreact", "javascript", "javascriptreact"].includes(file.language);
    if (!supported) {
      setDiagnostics([]);
      setDiagnosticsState("unsupported");
      return;
    }
    const version = ++diagnosticsVersion.current;
    let active = true;
    setDiagnosticsState("loading");
    const timer = setTimeout(() => {
      void window.devbox.getLanguageDiagnostics(
        selectedProject.id,
        file.relativePath,
        file.language as "typescript" | "typescriptreact" | "javascript" | "javascriptreact",
        editorText,
        version
      ).then((result) => {
        if (!active || version !== diagnosticsVersion.current) return;
        setDiagnostics(result.diagnostics);
        setDiagnosticsState("ready");
      }).catch(() => {
        if (!active || version !== diagnosticsVersion.current) return;
        setDiagnostics([]);
        setDiagnosticsState("failed");
      });
    }, 650);
    return () => { active = false; clearTimeout(timer); };
  }, [editorText, file, selectedProject]);

  const focusDiagnostic = useCallback((diagnostic: EditorDiagnostic): void => {
    const start = editorOffset(editorText, diagnostic.range.start.line, diagnostic.range.start.character);
    const end = editorOffset(editorText, diagnostic.range.end.line, diagnostic.range.end.character);
    const editor = document.querySelector<HTMLTextAreaElement>(".code-editor textarea");
    editor?.focus();
    editor?.setSelectionRange(start, Math.max(start + 1, end));
  }, [editorText]);

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

  const performDeleteThread = useCallback(async (summary: ThreadSummary): Promise<void> => {
    try {
      const deleted = await window.devbox.deleteThread(summary.id);
      if (!deleted) return;
      const wasOpen = thread?.thread.id === summary.id;
      await updateThreads();
      if (wasOpen) setThread(null);
      if (wasOpen) setView("thread");
      setNotice("Sohbet silindi.");
      window.setTimeout(() => setNotice((current) => current === "Sohbet silindi." ? null : current), 4_000);
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }, [thread?.thread.id, updateThreads]);

  const requestDeleteThread = useCallback((summary: ThreadSummary): void => {
    setConfirmation({
      title: "Sohbeti kalıcı olarak sil",
      message: `“${summary.title}” silinsin mi?`,
      detail: "Bu işlem sohbeti, mesaj geçmişini ve bu sohbete alınmış yerel ek dosya kopyalarını kalıcı olarak kaldırır. Geri alınamaz.",
      confirmLabel: "Kalıcı olarak sil",
      onConfirm: async () => await performDeleteThread(summary)
    });
  }, [performDeleteThread]);

  const executeThreadAction = useCallback(async (summary: ThreadSummary, action: ThreadMenuAction): Promise<void> => {
    try {
      const project = bootstrap?.projects.find((item) => item.id === summary.projectId);
      const replaceSummary = (updated: ThreadSummary): void => {
        setThreads((current) => current.map((item) => item.id === updated.id ? updated : item));
        setThread((current) => current?.thread.id === updated.id ? { ...current, thread: updated } : current);
      };
      if (action === "copyTitle") await window.devbox.copyText(summary.title);
      if (action === "copySessionId") await window.devbox.copyText(summary.id);
      if (action === "copyWorkingDirectory" && project) await window.devbox.copyText(project.rootPath);
      if (action === "revealProject" && project) await window.devbox.revealProject(project.id);
      if (action === "pin") { replaceSummary(await window.devbox.setThreadPinned(summary.id, !summary.pinned)); await updateThreads(); }
      if (action === "unread") replaceSummary(await window.devbox.setThreadUnread(summary.id, !summary.unread));
      if (action === "archive") {
        replaceSummary(await window.devbox.setThreadArchived(summary.id, !summary.archived));
        const next = await updateThreads();
        if (!summary.archived && thread?.thread.id === summary.id) {
          setThread(null);
          const nextActive = next.find((item) => !item.archived);
          if (nextActive) await openThread(nextActive.id);
        }
      }
      if (action === "rename") setPrompt({ title: "Sohbeti yeniden adlandır", label: "Başlık", value: summary.title, confirmLabel: "Kaydet", onConfirm: async (value) => { const renamed = await window.devbox.renameThread(summary.id, value); replaceSummary(renamed); } });
      if (action === "delete") requestDeleteThread(summary);
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }, [bootstrap?.projects, openThread, requestDeleteThread, thread?.thread.id, updateThreads]);

  const handleMenu = useCallback(async (menu: "file" | "edit" | "view" | "help"): Promise<void> => {
    const action = await window.devbox.showAppMenu(menu);
    if (action === "newTask") beginNewThread();
    if (action === "openProject") await chooseProject();
    if (action === "toggleSidebar") setSidebarVisible((value) => !value);
    if (action === "toggleInspector") setInspectorVisible((value) => !value);
    if (action === "toggleTerminal") selectedProject ? (setView((current) => current === "terminal" ? "thread" : "terminal"), setTerminalOpen(false)) : setTerminalOpen((value) => !value);
    if (action === "shortcuts") setNotice("Ctrl+N Yeni görev · Ctrl+O Proje aç · Ctrl+K Komut paleti · Ctrl+P Hızlı aç · Ctrl+` Etkileşimli terminal · Ctrl+S Kaydet · Enter Gönder · Esc Kapat");
    if (action === "about") setNotice(`DevBox ${bootstrap?.app.version ?? ""} · Güvenli Windows mühendislik komuta merkezi`);
  }, [beginNewThread, bootstrap?.app.version, chooseProject, selectedProject]);

  const navigateHistory = useCallback(async (direction: -1 | 1): Promise<void> => {
    if (direction === -1 && view !== "thread") {
      setView("thread");
      requestAnimationFrame(() => composerRef.current?.focus());
      return;
    }
    const nextIndex = historyIndex + direction;
    const id = history[nextIndex];
    if (!id || nextIndex < 0 || nextIndex >= history.length) return;
    setHistoryIndex(nextIndex);
    await openThread(id, false);
  }, [history, historyIndex, openThread, view]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const ctrl = event.ctrlKey || event.metaKey;
      if (ctrl && event.key.toLocaleLowerCase("tr-TR") === "k") { event.preventDefault(); setPaletteOpen(true); }
      else if (ctrl && event.key.toLocaleLowerCase("tr-TR") === "p") { event.preventDefault(); setPaletteOpen(true); }
      else if (ctrl && event.key.toLocaleLowerCase("tr-TR") === "n") { event.preventDefault(); beginNewThread(); }
      else if (ctrl && event.key.toLocaleLowerCase("tr-TR") === "o") { event.preventDefault(); void chooseProject(); }
      else if (ctrl && event.key.toLocaleLowerCase("tr-TR") === "s") { event.preventDefault(); void saveFile(); }
      else if (ctrl && event.key === "`") { event.preventDefault(); selectedProject ? (setView((current) => current === "terminal" ? "thread" : "terminal"), setTerminalOpen(false)) : setTerminalOpen((value) => !value); }
      else if (event.key === "Escape") {
        setPaletteOpen(false); setPrompt(null); setConfirmation(null); setPermissionMenuOpen(false); setThreadMenu(null);
        if (!["thread", "settings"].includes(view)) setView("thread");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [beginNewThread, chooseProject, saveFile, selectedProject, view]);

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
  const pinnedThreads = threads.filter((item) => !item.archived && item.pinned);
  const recentThreads = threads.filter((item) => !item.archived && !item.pinned);
  const archivedThreads = threads.filter((item) => item.archived);
  const gitTotals = useMemo(() => (gitStatus?.stats ?? []).reduce((totals, stat) => ({
    additions: totals.additions + (stat.additions ?? 0),
    deletions: totals.deletions + (stat.deletions ?? 0),
    unknown: totals.unknown + (stat.additions === null || stat.deletions === null ? 1 : 0)
  }), { additions: 0, deletions: 0, unknown: 0 }), [gitStatus?.stats]);
  const renderThreadEntry = (summary: ThreadSummary): ReactNode => (
    <div key={summary.id} className={`thread-entry ${thread?.thread.id === summary.id && view === "thread" ? "selected" : ""} ${summary.unread ? "unread" : ""}`} onContextMenu={(event) => {
      event.preventDefault();
      const width = 254;
      const height = 366;
      setThreadMenu({
        summary,
        x: Math.max(8, Math.min(event.clientX, window.innerWidth - width - 8)),
        y: Math.max(8, Math.min(event.clientY, window.innerHeight - height - 8))
      });
    }}>
      <button className="thread-row" onClick={() => void openThread(summary.id)} title={`${summary.title}\n${exactDateTime(summary.updatedAt)}`}>
        <span className="thread-title">{summary.pinned && <span className="thread-pin" title="Sabit konuşma"><Pin size={12} aria-label="Sabitlendi" /></span>}<b>{summary.title}</b></span>
        <time dateTime={summary.updatedAt}>{formatThreadTime(summary.updatedAt)}</time>
        {summary.unread ? <i className="unread-dot" title="Okunmadı" /> : !["IDLE", "COMPLETED"].includes(summary.state) && <i className={stateClass(summary.state)} title={summary.state} />}
      </button>
      <button className="thread-delete" onClick={() => requestDeleteThread(summary)} aria-label={`${summary.title} görevini sil`} title="Sohbeti sil"><Trash2 size={13} /></button>
    </div>
  );
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
                      : view === "skills" ? "Beceriler ve taşınabilir eklentiler"
                      : view === "pullRequests" ? "GitHub pull request’leri"
                        : view === "whatsNew" ? `DevBox ${__DEVBOX_VERSION__} yenilikleri`
                          : "Ayarlar";

  const openWhatsNew = (): void => {
    setView("whatsNew");
    setReleaseUnseen(false);
    try {
      window.localStorage.setItem(SEEN_RELEASE_KEY, __DEVBOX_VERSION__);
    } catch {
      // Kalıcı depolama kapalıysa rozet bir sonraki açılışta yeniden gösterilir.
    }
  };

  if (!settingsResolved) return <div className="launch-blank" aria-label="DevBox başlatılıyor" />;
  if (introVisible) return <LaunchIntro ready={Boolean(bootstrap)} reducedMotion={appSettings?.reduceMotion ?? false} onSkip={() => void dismissIntro(false)} onNever={() => void dismissIntro(true)} />;
  if (!bootstrap) return <div className="boot-error" role="alert"><AlertTriangle size={24} /><strong>DevBox yerel çalışma alanını açamadı</strong><span>{notice ?? "Başlangıç verisi alınamadı."}</span></div>;

  return (
    <div style={themeStyle(appSettings)} className={`app-shell ${sidebarVisible ? "" : "sidebar-hidden"} ${inspectorVisible ? "inspector-visible" : ""} ${appSettings?.reduceMotion ? "reduced-motion" : ""} ${appSettings?.theme.contrast === "high" ? "high-contrast" : ""}`}>
      <header className="system-bar">
        <div className="system-left"><button onClick={() => setSidebarVisible((value) => !value)} aria-label="Kenar çubuğu"><LayoutPanelLeft size={16} /></button><button disabled={view === "thread" && historyIndex <= 0} onClick={() => void navigateHistory(-1)} aria-label="Geri" title={view === "thread" ? "Önceki sohbete dön" : "Sohbete dön"}><ArrowLeft size={17} /></button><button disabled={view !== "thread" || historyIndex < 0 || historyIndex >= history.length - 1} onClick={() => void navigateHistory(1)} aria-label="İleri" title="Sonraki sohbete git"><ArrowRight size={17} /></button><nav aria-label="Uygulama menüsü"><button onClick={() => void handleMenu("file")}>Dosya</button><button onClick={() => void handleMenu("edit")}>Düzenle</button><button onClick={() => void handleMenu("view")}>Görünüm</button><button onClick={() => void handleMenu("help")}>Yardım</button></nav></div>
      </header>

      <div className="workbench">
        {sidebarVisible && <aside className="sidebar" aria-label="DevBox gezintisi">
          <div className="sidebar-brand"><button className="brand-button" aria-label="DevBox ayarlarını aç" title="DevBox ayarlarını aç" onClick={() => setView("settings")}><DevBoxWordmark /><ChevronDown className="brand-chevron" size={14} /></button><div><button onClick={() => setPaletteOpen(true)} aria-label="Ara"><Search size={16} /></button></div></div>
          <nav className="primary-nav">
            <button onClick={beginNewThread}><MessageSquarePlus size={16} /><span>Yeni sohbet</span><kbd>Ctrl N</kbd></button>
            <button className={view === "whatsNew" ? "active" : ""} onClick={openWhatsNew}><Sparkles size={16} /><span>Yenilikler</span>{releaseUnseen && <b className="release-nav-badge" aria-label={`DevBox ${__DEVBOX_VERSION__} yenilikleri okunmadı`}>Yeni</b>}</button>
            <button className={view === "pullRequests" ? "active" : ""} onClick={() => setView("pullRequests")}><CircleDot size={16} /><span>Pull request’ler</span></button>
            <button className={view === "sites" ? "active" : ""} onClick={() => setView("sites")}><Globe2 size={16} /><span>Siteler</span></button>
            <button className={view === "automations" ? "active" : ""} onClick={() => setView("automations")}><ListChecks size={16} /><span>API gelişimi</span></button>
            <button className={view === "integrations" ? "active" : ""} onClick={() => setView("integrations")}><Plug size={16} /><span>Eklentiler</span></button>
            <button className={view === "skills" ? "active" : ""} onClick={() => setView("skills")}><Sparkles size={16} /><span>Beceriler</span></button>
          </nav>
          <div className="sidebar-scroll">
            <section className="sidebar-section"><div className="section-label"><span>Projeler</span><button onClick={() => void chooseProject()} aria-label="Proje ekle"><Plus size={14} /></button></div>{bootstrap?.projects.length ? bootstrap.projects.map((project) => <button key={project.id} className={`project-row ${selectedProject?.id === project.id ? "selected" : ""}`} onClick={() => { void loadProject(project); setView("thread"); }} title={project.rootPath}><Folder size={15} /><span>{project.name}</span>{project.isGitRepository && <GitBranch size={12} />}</button>) : <p className="empty-label">Proje yok</p>}</section>
            {pinnedThreads.length > 0 && <section className="sidebar-section pinned-section"><div className="section-label"><span><Pin size={12} /> Sabit konuşmalar</span><b>{pinnedThreads.length}</b></div>{pinnedThreads.map(renderThreadEntry)}</section>}
            <section className="sidebar-section recent-section"><div className="section-label"><span>Yakın zamanlar</span></div>{recentThreads.length ? recentThreads.map(renderThreadEntry) : <p className="empty-label">Henüz sohbet yok</p>}</section>
            {archivedThreads.length > 0 && <details className="archived-section"><summary><span><Archive size={12} />Arşivlenenler</span><b>{archivedThreads.length}</b></summary><div>{archivedThreads.map(renderThreadEntry)}</div></details>}
          </div>
          <div className="account-row developer-signature" title="Geliştirici: Yaaertu · GitHub ve Instagram: @yaaertu"><span className="signature-orbit" aria-hidden="true"><i />Y</span><span><strong>devbox <em>by yaaertu</em></strong><small>{capabilitiesLoading ? "Sistem denetleniyor…" : `@yaaertu · ${readyCount}/${capabilities.length} hazır`}</small></span><button onClick={() => setView("settings")} aria-label="Ayarlar"><Settings size={15} /></button></div>
        </aside>}

        <main className="main-stage" onContextMenu={(event) => { if (event.target === event.currentTarget) { event.preventDefault(); void window.devbox.showContextMenu("blank", false, true).then((action) => { if (action === "newTask") beginNewThread(); if (action === "openProject") void chooseProject(); }); } }}>
          <header className="stage-header"><div className="stage-title"><div><strong title={title}>{title}</strong>{view === "thread" && thread && <small title={`${selectedProject?.rootPath ?? "Yerel"} · ${exactDateTime(thread.thread.updatedAt)}`}><FolderOpen size={11} />{selectedProject?.name ?? "Yerel"}<span>/</span>Sohbetler<time dateTime={thread.thread.updatedAt}>{formatThreadTime(thread.thread.updatedAt)}</time></small>}</div>{dirty && <span className="dirty-dot" title="Kaydedilmemiş değişiklik" />}</div><div className="stage-actions"><button className={view === "files" ? "active" : ""} onClick={() => setView(view === "files" ? "thread" : "files")} title={view === "files" ? "Dosyalardan çık ve sohbete dön" : "Dosyalar"}><Braces size={16} /></button><button className={inspectorVisible ? "active" : ""} onClick={() => setInspectorVisible((value) => !value)} title="Denetleyici"><PanelRight size={16} /></button><button className={view === "terminal" ? "active" : ""} onClick={() => { setView(view === "terminal" ? "thread" : "terminal"); setTerminalOpen(false); }} title={view === "terminal" ? "Terminalden çık ve sohbete dön" : "Etkileşimli terminal"}><LayoutPanelTop size={16} /></button></div></header>

          <div className="stage-body">
            {["files", "git", "terminal", "worktrees", "runs", "integrations", "capabilities"].includes(view) && <nav className="work-tabs" aria-label="Çalışma araçları"><button className="work-back" onClick={() => setView("thread")} title="Sohbete dön"><ArrowLeft size={13} /> Sohbete dön</button><span className="work-tab-divider" /><button className={view === "files" ? "active" : ""} onClick={() => setView("files")}>Dosyalar</button><button className={view === "git" ? "active" : ""} onClick={() => setView("git")}>Git</button><button className={view === "terminal" ? "active" : ""} onClick={() => { setView("terminal"); setTerminalOpen(false); }}>Terminal</button><button className={view === "worktrees" ? "active" : ""} onClick={() => setView("worktrees")}>Worktree</button><button className={view === "runs" ? "active" : ""} onClick={() => setView("runs")}>Testler</button><button className={view === "integrations" ? "active" : ""} onClick={() => setView("integrations")}>Araçlar</button><button className={view === "capabilities" ? "active" : ""} onClick={() => setView("capabilities")}>Sistem</button><button className="work-close" onClick={() => setView("thread")} aria-label="Çalışma görünümünü kapat" title="Kapat"><X size={14} /></button></nav>}
            {view === "thread" && <section className={`thread-view ${dragActive ? "drag-active" : ""}`} onDragEnter={(event) => { event.preventDefault(); if (event.dataTransfer.types.includes("Files")) setDragActive(true); }} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragActive(false); }} onDrop={(event) => { event.preventDefault(); setDragActive(false); void dropAttachments(Array.from(event.dataTransfer.files)); }}>
              {dragActive && <div className="drop-overlay"><Paperclip size={28} /><strong>Dosyaları göreve ekleyin</strong><span>Tüm uzantılar kabul edilir · dosya başına en fazla 300 MB · arşivler çalıştırılmaz</span></div>}
              <div className="conversation" ref={conversationRef}>
                <div className="conversation-inner">
                  {thread ? <>
                    {thread.items.length === 0 && <ThreadEmptyState project={selectedProject} />}
                    {thread.items.map((item) => <Message key={item.id} item={item} busy={busy?.startsWith("message") ?? false} onEdit={updateMessage} onRegenerate={regenerateMessage} onCopy={copyMessage} onQuote={quoteMessage} />)}
                    {busy === "message" && liveActivities.filter((activity) => activity.threadId === thread.thread.id).map((activity, index) => <LiveActivity key={`${activity.createdAt}:${index}`} event={activity} />)}
                    {busy === "message" && !liveActivities.some((activity) => activity.threadId === thread.thread.id) && <div className="activity-line running"><LoaderCircle className="spin" size={14} /><span>İstek izin ve ek bağlam kontrollerinden geçiyor…</span></div>}
                  </> : <ThreadEmptyState project={selectedProject} />}
                </div>
              </div>
              <div className="composer-wrap">{workspaceResult && workspaceResult.threadId === thread?.thread.id && <div className={`change-summary-wrap ${changeSummaryOpen ? "open" : ""}`}><button className={`change-summary-button ${workspaceResult.verified ? "" : "unverified"}`} aria-haspopup="dialog" aria-expanded={changeSummaryOpen} onClick={() => setChangeSummaryOpen((value) => !value)} title="Yalnız bu görevde başlangıç snapshot'ına göre gerçekten değişen dosyalar"><span className="change-state-dot" /><span>{workspaceResult.changedFiles.length} dosya bu görevde değişti</span><b className="additions">+{workspaceResult.changedFiles.reduce((sum, item) => sum + (item.additions ?? 0), 0)}</b><b className="deletions">-{workspaceResult.changedFiles.reduce((sum, item) => sum + (item.deletions ?? 0), 0)}</b><ChevronDown size={13} /></button>{changeSummaryOpen && <div className="change-summary-popover" role="dialog" aria-label="Bu görevde değiştirilen dosyalar"><header><strong>{workspaceResult.verified ? "Diskten doğrulandı" : "Doğrulama başarısız"}</strong><button onClick={() => setInspectorVisible(true)}><PanelRight size={13} /> Canvas</button></header><div>{workspaceResult.changedFiles.map((item) => <div className="change-stat-row" key={item.path}><span>{item.path}</span><b className="additions">{item.additions === null ? "—" : `+${item.additions}`}</b><b className="deletions">{item.deletions === null ? "—" : `-${item.deletions}`}</b></div>)}</div><footer>Önce / sonra global kirli çalışma ağacı: {workspaceResult.baselineDirtyCount} / {workspaceResult.finalDirtyCount}. Bu sayılar görev değişikliği olarak sayılmaz.</footer></div>}</div>}<button className="composer-project" onClick={() => void chooseProject()} title={selectedProject?.rootPath ?? "Yerel proje klasörü seçin"}><FolderOpen size={14} /><span>{selectedProject?.name ?? "Proje seç"}</span></button><div className={`composer ${busy === "message" ? "busy" : ""}`}>
                {draftAttachments.length > 0 && <div className="composer-attachments" aria-label="Gönderilecek dosyalar">{draftAttachments.map((attachment) => <span key={attachment.id}><AttachmentGlyph attachment={attachment} /><span><strong>{attachment.name}</strong><small>{formatBytes(attachment.size)} · {attachment.extension || attachment.kind}</small></span><button onClick={() => void removeAttachment(attachment)} aria-label={`${attachment.name} ekini kaldır`} title="Eki kaldır"><X size={13} /></button></span>)}</div>}
                <textarea ref={composerRef} value={composer} onChange={(event) => setComposer(event.target.value)} placeholder="DevBox'a bir görev verin" disabled={busy === "message"} rows={1} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void sendMessage(); } }} onContextMenu={(event) => { event.preventDefault(); const target = event.currentTarget; void window.devbox.showContextMenu("editable", target.selectionStart !== target.selectionEnd, true); }} />
                <div className="composer-toolbar"><div><button onClick={() => void selectAttachments()} disabled={busy === "attachment"} title="Dosya ekle — tüm uzantılar, en fazla 300 MB"><Plus size={18} /></button><div className="permission-control"><button className={`permission-button ${permission === "Tam erişim" ? "full" : ""}`} onClick={() => setPermissionMenuOpen((value) => !value)} aria-haspopup="menu" aria-expanded={permissionMenuOpen} disabled={busy === "permission"}><ShieldCheck size={14} /><span>{permissionLabel(permission)}</span><ChevronDown size={12} /></button>{permissionMenuOpen && <div className="permission-menu" role="menu" aria-label="İzin profili">{PERMISSION_OPTIONS.map((option) => <button key={option.value} className={`${permission === option.value ? "selected" : ""} ${option.value === "Tam erişim" ? "full" : ""}`} role="menuitemradio" aria-checked={permission === option.value} onClick={() => void applyPermission(option.value)}><span className="permission-menu-icon"><ShieldCheck size={15} /></span><span><strong>{option.label}</strong><small>{option.detail}</small></span>{permission === option.value && <Check size={15} />}</button>)}</div>}</div></div><div><button className="model-button" onClick={() => setView("capabilities")} title={capabilitiesLoading ? "Gerçek sağlayıcılar denetleniyor" : agentReady ? "Hermes + NVIDIA canlı doğrulandı — kanıtları aç" : "Ajan sağlayıcısı doğrulanmadı — tanılamayı aç"}><span>{capabilitiesLoading ? "Denetleniyor" : agentReady ? "Hermes · NVIDIA" : "Sağlayıcı yok"}</span><small>{capabilitiesLoading ? "CANLI KONTROL" : agentReady ? "HAZIR" : "DOĞRULANMADI"}</small><ChevronDown size={13} /></button><button className="send-button" onClick={() => void sendMessage()} disabled={(!composer.trim() && draftAttachments.length === 0) || busy === "message"} aria-label="Gönder"><Send size={17} /></button></div></div>
              </div><div className="composer-hint"><kbd>Enter</kbd> gönderir · <kbd>Shift+Enter</kbd> yeni satır · Sağ tık: Kes / Kopyala / Yapıştır · <kbd>Ctrl+V</kbd> yapıştır · Dosya başına 300 MB</div></div>
            </section>}

            {view === "files" && <section className="files-view">
              <aside className="file-explorer"><div className="panel-heading"><span>GEZGİN</span><div><button onClick={() => selectedProject && setPrompt({ title: "Yeni dosya", label: selectedProject.name, value: "", confirmLabel: "Oluştur", onConfirm: async (value) => setTree(await window.devbox.createPath(selectedProject.id, "", value, "file")) })} disabled={!selectedProject} title="Yeni dosya"><File size={14} /></button><button onClick={() => void chooseProject()} title="Proje aç"><FolderOpen size={14} /></button><button onClick={() => selectedProject && void loadProject(selectedProject)} title="Yenile"><RefreshCw size={14} /></button></div></div>{selectedProject && <div className="explorer-project"><ChevronDown size={13} /><strong>{selectedProject.name.toLocaleUpperCase("tr-TR")}</strong></div>}<div className="tree-scroll">{tree.length ? <ul className="tree-root">{tree.map((node) => <TreeItem key={node.relativePath} node={node} depth={0} selectedPath={file?.relativePath ?? null} onOpen={(item) => void openFile(item)} onContext={(item) => void pathContext(item)} />)}</ul> : <p className="empty-label">{selectedProject ? "Klasör boş veya filtrelendi." : "Proje klasörü açın."}</p>}</div></aside>
              <div className="editor-area">{file ? <><div className="editor-tabs"><div className="editor-tab active"><FileCode2 size={14} /><span>{file.relativePath}</span>{dirty && <i />}<button onClick={() => { setFile(null); setEditorText(""); }} aria-label="Sekmeyi kapat"><X size={13} /></button></div></div><div className="breadcrumbs"><span>{selectedProject?.name}</span><ChevronRight size={12} /><span>{file.relativePath}</span><button className={dirty ? "save active" : "save"} disabled={!dirty || busy === "save-file"} onClick={() => void saveFile()} title="Kaydet (Ctrl+S)">{busy === "save-file" ? <LoaderCircle className="spin" size={14} /> : <Save size={14} />}</button></div><div className="code-editor"><div className="line-numbers" aria-hidden="true">{editorText.split(/\r?\n/u).map((_line, index) => <span key={index}>{index + 1}</span>)}</div><textarea aria-label={`${file.relativePath} kod düzenleyicisi`} spellCheck={false} value={editorText} onChange={(event) => setEditorText(event.target.value)} onContextMenu={(event) => { event.preventDefault(); const target = event.currentTarget; void window.devbox.showContextMenu("editable", target.selectionStart !== target.selectionEnd, true); }} /></div><footer className="status-bar"><span>{dirty ? "Değiştirildi" : "Kaydedildi"}</span><span>{file.language}</span><span>UTF-8</span><span>SHA {file.sha256.slice(0, 8)}</span><span>{file.size.toLocaleString("tr-TR")} bayt</span></footer></> : <div className="editor-empty"><Box size={40} /><strong>{selectedProject?.name ?? "DevBox"}</strong><p>Gezginden bir dosya açın. Metin dosyaları düzenlenebilir; ikili ve 1 MiB üzerindeki dosyalar güvenli biçimde reddedilir.</p><div><kbd>Ctrl P</kbd> Hızlı aç <kbd>Ctrl S</kbd> Kaydet <kbd>F2</kbd> Yeniden adlandır</div></div>}</div>
            </section>}

            {view === "git" && <section className="page-scroll"><div className="page-heading"><div><p className="eyebrow">KAYNAK DENETİMİ</p><h1>Git ve değişiklikler</h1><p>{selectedProject?.rootPath ?? "Bir Git projesi açın."}</p></div><button onClick={() => void refreshGit()} disabled={!selectedProject?.isGitRepository || busy === "git"}><RefreshCw className={busy === "git" ? "spin" : ""} size={15} /> Yenile</button></div>{gitStatus?.available ? <><div className="facts-grid"><div><span>Dal</span><strong>{gitStatus.branch ?? "bağımsız HEAD"}</strong></div><div><span>HEAD</span><strong className="mono">{gitStatus.head?.slice(0, 12) ?? "işleme yok"}</strong></div><div><span>İleri / geri</span><strong>{gitStatus.ahead} / {gitStatus.behind}</strong></div><div><span>Değişiklik</span><strong>{gitStatus.changes.length}</strong></div></div><section className="content-panel"><h2>Çalışma ağacı</h2>{gitStatus.changes.length ? <ul className="change-list">{gitStatus.changes.map((change) => <li key={`${change.path}:${change.originalPath ?? ""}`}><code>{change.indexStatus}{change.worktreeStatus}</code><span>{change.path}</span></li>)}</ul> : <div className="empty-panel"><CheckCircle2 size={23} /><span>Çalışma ağacı temiz.</span></div>}</section>{gitDiff && (gitDiff.staged || gitDiff.unstaged) && <section className="content-panel"><div className="panel-title"><h2>Fark</h2><button onClick={() => void window.devbox.copyText(`${gitDiff.staged}${gitDiff.unstaged}`)}><Copy size={14} /> Yamayı kopyala</button></div><pre className="diff-preview">{`${gitDiff.staged}${gitDiff.unstaged}`}</pre></section>}</> : <div className="empty-panel large"><GitBranch size={30} /><strong>Git verisi yok</strong><span>{gitStatus?.error ?? "Seçili klasör bir Git deposu değil."}</span></div>}</section>}

            {view === "runs" && <section className="page-scroll"><div className="page-heading"><div><p className="eyebrow">DOĞRULANMIŞ GÖREVLER</p><h1>Test ve derleme</h1><p>Yalnızca proje bildiriminde tanımlı betikler, kabuk genişletmesi kapalı şekilde çalıştırılır.</p></div></div><div className="task-grid">{TASKS.map((task) => <button key={task.id} disabled={!selectedProject || busy !== null} onClick={() => void runTask(task.id)}>{task.icon}<span><strong>{task.label}</strong><small>{task.detail}</small></span><Play size={14} /></button>)}</div>{terminalResult && <section className="content-panel"><div className="panel-title"><h2>Son sonuç</h2><StateBadge state={terminalResult.exitCode === 0 ? "COMPLETED" : "FAILED"} /></div><dl className="facts-list"><div><dt>Komut</dt><dd>{terminalResult.commandDisplay}</dd></div><div><dt>Süre</dt><dd>{terminalResult.durationMs} ms</dd></div><div><dt>Çıkış</dt><dd>{terminalResult.exitCode ?? terminalResult.exitReason}</dd></div></dl></section>}</section>}

            {view === "sites" && <section className="page-scroll"><div className="page-heading"><div><p className="eyebrow">VERCEL / SİTELER</p><h1>Vercel ve Siteler</h1><p>Yalnız bu makinede gerçekten keşfedilen Vercel komut satırı aracı, hesap ve seçili proje bilgisi gösterilir.</p></div><StateBadge state={vercelAccount?.state ?? vercelCli?.state ?? "UNAVAILABLE"} /></div><div className="facts-grid"><div><span>Vercel komut satırı</span><strong>{vercelCli?.version ?? "Bulunamadı"}</strong></div><div><span>Hesap doğrulaması</span><strong title={vercelAccount?.state ?? "UNAVAILABLE"}>{stateLabel(vercelAccount?.state ?? "UNAVAILABLE")}</strong></div><div><span>Seçili proje</span><strong>{selectedProject?.name ?? "Seçilmedi"}</strong></div><div><span>Proje kökü</span><strong title={selectedProject?.rootPath}>{selectedProject?.rootPath ?? "—"}</strong></div></div><section className="content-panel"><div className="panel-title"><h2>Gerçek Vercel komutları</h2><StateBadge state={selectedProject && vercelCli?.state === "INSTALLED" ? (vercelAccount?.state ?? "UNAVAILABLE") : "UNAVAILABLE"} /></div><p>Bağlama, önizleme, üretime dağıtma, inceleme, günlük ve geri alma yalnız Vercel komut satırı aracı gerçekten kuruluysa çalıştırılır. Her sonuç gerçek komutun çıkış kodu, standart çıktısı, hata çıktısı ve süresiyle kanıtlanır; doğrulanmamış Functions, Cron, Sandbox, Workflow, Queues, Blob veya AI Gateway yeteneği burada varmış gibi gösterilmez.</p><div className="deployment-actions"><button disabled={!selectedProject || vercelCli?.state !== "INSTALLED"} onClick={() => setView("integrations")}><Globe2 size={15} /> Vercel komuta merkezini aç</button></div></section></section>}

            {view === "capabilities" && <section className="page-scroll"><div className="page-heading"><div><p className="eyebrow">ÇALIŞMA ZAMANI GERÇEĞİ</p><h1>Sistem kabiliyetleri</h1><p>HAZIR durumu yalnızca kimlik, yapılandırma, sağlık ve en az bir canlı işlem kanıtı birlikte sağlandığında gösterilir.</p></div><StateBadge state={bootstrap?.core.state ?? "FAILED"} /></div>{capabilitiesLoading && capabilities.length === 0 ? <div className="empty-panel large"><LoaderCircle className="spin" size={26} /><strong>Gerçek sağlayıcılar denetleniyor</strong><span>Kimlik, yürütülebilir dosya ve canlı bağlantı kanıtları arka planda kontrol ediliyor.</span></div> : <div className="capability-grid">{capabilities.map((capability) => <article key={capability.id}><div><span className="cap-icon">{capability.state === "READY" ? <Check size={16} /> : <Activity size={16} />}</span><div><strong>{capability.displayName}</strong><small>{capability.version ?? "Sürüm doğrulanmadı"}</small></div><StateBadge state={capability.state} /></div><p>{capability.detail}</p>{capability.remediation && <footer>{capability.remediation}</footer>}</article>)}</div>}</section>}

            {view === "terminal" && <TerminalWorkspace project={selectedProject} />}
            {view === "worktrees" && <WorktreeWorkspace project={selectedProject} />}
            {view === "automations" && <AutomationWorkspace project={selfDevelopmentProject ?? selectedProject} />}
            {view === "integrations" && <IntegrationWorkspace project={selectedProject} />}
            {view === "skills" && <CatalogWorkspace />}
            {view === "pullRequests" && <IntegrationWorkspace project={selectedProject} scope="github" />}
            {view === "whatsNew" && <WhatsNewWorkspace />}
            {view === "settings" && <SettingsWorkspace settings={appSettings} onSettings={(next) => { setAppSettings(next); setPermission(next.permissionProfile); }} onClose={() => setView(thread ? "thread" : selectedProject ? "files" : "thread")} />}
          </div>

          {inspectorVisible && <CanvasInspector project={selectedProject} result={workspaceResult} threadTitle={thread?.thread.title ?? null} threadState={thread?.thread.state ?? null} gitBranch={gitStatus?.branch ?? null} coreState={bootstrap?.core.state ?? "FAILED"} onClose={() => setInspectorVisible(false)} onRefresh={async () => { if (selectedProject) await loadProject(selectedProject); }} />}
        </main>
      </div>

      {terminalOpen && <section className="terminal-pane" aria-label="Görev çıktısı"><div className="terminal-heading"><div><SquareTerminal size={14} /><strong>GÖREV ÇIKTISI</strong>{busy?.startsWith("task:") && <LoaderCircle className="spin" size={13} />}</div><div>{terminalResult && <span>{terminalResult.durationMs} ms · çıkış {terminalResult.exitCode ?? terminalResult.exitReason}</span>}<button onClick={() => setTerminalResult(null)}>Temizle</button><button onClick={() => setTerminalOpen(false)} aria-label="Kapat"><X size={14} /></button></div></div><div className="terminal-output" tabIndex={0} ref={terminalRef} onContextMenu={(event) => { event.preventDefault(); const selection = window.getSelection()?.toString() ?? ""; void window.devbox.showContextMenu("terminal", selection.length > 0).then((action) => { if (action === "copyOutput") void window.devbox.copyText(selection); if (action === "clear") setTerminalResult(null); }); }}>{terminalResult ? <><div><span className="prompt">PS&gt;</span> {terminalResult.commandDisplay}</div>{terminalResult.stdout && <pre>{terminalResult.stdout}</pre>}{terminalResult.stderr && <pre className="stderr">{terminalResult.stderr}</pre>}<div className={terminalResult.exitCode === 0 ? "exit-ok" : "exit-bad"}>Süreç {terminalResult.exitReason} · {terminalResult.durationMs} ms{terminalResult.truncated ? " · çıktı kesildi" : ""}</div></> : <p>Test, tür denetimi veya derleme çalıştırıldığında gerçek süreç çıktısı burada görünür.</p>}</div></section>}

      {view === "files" && file && <aside className={`diagnostics-tray ${diagnostics.length > 0 ? "open" : ""}`} aria-label="Dil sunucusu tanıları">
        <header><span><Activity size={13} /> Sorunlar</span><strong>{diagnosticsState === "loading" ? "LSP çalışıyor…" : diagnosticsState === "unsupported" ? "Bu dil için kapalı" : diagnosticsState === "failed" ? "LSP kullanılamıyor" : `${diagnostics.length} tanı`}</strong></header>
        {diagnostics.slice(0, 80).map((diagnostic, index) => <button key={`${diagnostic.range.start.line}:${diagnostic.range.start.character}:${index}`} className={diagnostic.severity} onClick={() => focusDiagnostic(diagnostic)} title={diagnostic.message}><AlertTriangle size={13} /><span>{diagnostic.message}</span><code>{diagnostic.range.start.line + 1}:{diagnostic.range.start.character + 1}</code></button>)}
      </aside>}
      {notice && <div className={`toast ${notice === "Sohbet silindi." ? "success" : ""}`} role="status">{notice === "Sohbet silindi." ? <CheckCircle2 size={18} /> : <AlertTriangle size={16} />}<span>{notice}</span><button onClick={() => setNotice(null)} aria-label="Bildirimi kapat"><X size={14} /></button></div>}
      {threadMenu && <ThreadContextMenu menu={threadMenu} hasProject={bootstrap.projects.some((project) => project.id === threadMenu.summary.projectId)} onAction={async (action) => await executeThreadAction(threadMenu.summary, action)} onClose={() => setThreadMenu(null)} />}
      {confirmation && <ConfirmDialog confirmation={confirmation} onClose={() => setConfirmation(null)} />}
      {prompt && <PromptDialog prompt={prompt} onClose={() => setPrompt(null)} />}
      {paletteOpen && <div className="palette-backdrop" onMouseDown={() => setPaletteOpen(false)}><div className="palette" role="dialog" aria-modal="true" aria-label="Komut paleti" onMouseDown={(event) => event.stopPropagation()}><div className="palette-input"><Command size={16} /><input autoFocus placeholder="Komut, görev veya dosya ara…" onKeyDown={(event) => { if (event.key === "Escape") setPaletteOpen(false); }} /><kbd>Esc</kbd></div><div className="palette-group"><span>HIZLI EYLEMLER</span><button onClick={() => { setPaletteOpen(false); beginNewThread(); }}><MessageSquarePlus size={16} /><div><strong>Yeni sohbet</strong><small>İlk mesaj gönderildiğinde kalıcı olur</small></div></button><button onClick={() => { setPaletteOpen(false); void chooseProject(); }}><FolderOpen size={16} /><div><strong>Proje klasörü aç</strong><small>Canonical sınırla yerel klasör seç</small></div></button>{selectedProject && TASKS.map((task) => <button key={task.id} onClick={() => { setPaletteOpen(false); void runTask(task.id); }}>{task.icon}<div><strong>{task.label}</strong><small>{task.detail}</small></div></button>)}</div></div></div>}
    </div>
  );
}
