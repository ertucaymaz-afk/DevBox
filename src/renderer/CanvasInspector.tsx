import { CheckCircle2, Code2, Eye, FileCode2, LoaderCircle, RefreshCw, Save, ShieldCheck, SquareTerminal, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Capability, FileSnapshot, ProjectSummary, ThreadSummary, ThreadWorkspaceResult } from "../shared/contracts";

type CanvasTab = "preview" | "code" | "changes" | "console" | "evidence";
type ConsoleEntry = { level: string; message: string; createdAt: string };

function previewUrl(projectId: string, relativePath: string, revision: number): string {
  const encoded = relativePath.replace(/\\/gu, "/").split("/").filter(Boolean).map(encodeURIComponent).join("/");
  return `devbox-preview://preview/${encodeURIComponent(projectId)}/${encoded}?v=${revision}`;
}

function humanState(value: string): string {
  const labels: Record<string, string> = { READY: "HAZIR", COMPLETED: "TAMAMLANDI", RUNNING: "ÇALIŞIYOR", FAILED: "BAŞARISIZ", RECOVERY_REQUIRED: "KURTARMA GEREKİYOR", IDLE: "BEKLİYOR" };
  return labels[value] ?? value;
}

export function CanvasInspector(props: {
  project: ProjectSummary | null;
  result: ThreadWorkspaceResult | null;
  threadTitle: string | null;
  threadState: ThreadSummary["state"] | null;
  gitBranch: string | null;
  coreState: Capability["state"];
  onClose: () => void;
  onRefresh: () => Promise<void>;
}): ReactNode {
  const { project, result, threadTitle, threadState, gitBranch, coreState, onClose, onRefresh } = props;
  const [tab, setTab] = useState<CanvasTab>("changes");
  const [snapshot, setSnapshot] = useState<FileSnapshot | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [consoleEntries, setConsoleEntries] = useState<ConsoleEntry[]>([]);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const defaultTargetPath = result?.previewPath ?? result?.primaryFile ?? null;
  const [selectedPath, setSelectedPath] = useState<string | null>(defaultTargetPath);
  const targetPath = selectedPath ?? defaultTargetPath;
  const canPreview = Boolean(result?.previewPath && project);
  const dirty = Boolean(snapshot && code !== snapshot.content);

  const loadFile = useCallback(async (): Promise<void> => {
    if (!project || !targetPath) { setSnapshot(null); setCode(""); return; }
    setBusy(true); setNotice(null);
    try {
      const next = await window.devbox.readFile(project.id, targetPath);
      setSnapshot(next); setCode(next.content);
    } catch (error) {
      setSnapshot(null); setCode(""); setNotice(error instanceof Error ? error.message : String(error));
    } finally { setBusy(false); }
  }, [project, targetPath]);

  useEffect(() => { setSelectedPath(defaultTargetPath); }, [defaultTargetPath, result?.createdAt]);
  useEffect(() => { void loadFile(); }, [loadFile, result?.createdAt]);
  useEffect(() => {
    if (result?.previewPath) setTab("preview");
    else if (result?.changedFiles.length) setTab("changes");
  }, [result?.createdAt, result?.previewPath, result?.changedFiles.length]);

  useEffect(() => {
    const listener = (event: MessageEvent): void => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const payload = event.data as { source?: unknown; type?: unknown; level?: unknown; message?: unknown; createdAt?: unknown } | null;
      if (!payload || payload.source !== "devbox-preview") return;
      if (payload.type === "console" && typeof payload.message === "string") {
        const message = payload.message.slice(0, 12_000);
        const level = typeof payload.level === "string" ? payload.level : "log";
        const createdAt = typeof payload.createdAt === "string" ? payload.createdAt : new Date().toISOString();
        setConsoleEntries((current) => [...current, { level, message, createdAt }].slice(-200));
      }
    };
    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }, []);

  const save = async (): Promise<void> => {
    if (!project || !snapshot || !dirty) return;
    setBusy(true); setNotice(null);
    try {
      const next = await window.devbox.writeFile(project.id, snapshot.relativePath, snapshot.sha256, code);
      setSnapshot(next); setCode(next.content); setRevision((value) => value + 1);
      await onRefresh();
      setNotice("Dosya diske yazıldı ve SHA-256 geri okuma doğrulaması geçti.");
    } catch (error) { setNotice(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };

  const additions = useMemo(() => result?.changedFiles.reduce((sum, item) => sum + (item.additions ?? 0), 0) ?? 0, [result]);
  const deletions = useMemo(() => result?.changedFiles.reduce((sum, item) => sum + (item.deletions ?? 0), 0) ?? 0, [result]);
  const unknownStats = result?.changedFiles.some((item) => item.additions === null || item.deletions === null) ?? false;

  return <aside className="inspector canvas-inspector">
    <div className="inspector-heading"><div><span>DEVBOX CANVAS</span>{result?.verified && <small><CheckCircle2 size={11} /> disk doğrulandı</small>}</div><button onClick={onClose} aria-label="Canvas denetleyiciyi kapat"><X size={14} /></button></div>
    {!project ? <div className="canvas-empty"><Eye size={24} /><strong>Önizlenecek proje yok</strong><span>Bir çalışma alanı açın.</span></div> : <>
      <nav className="canvas-tabs" aria-label="Canvas sekmeleri">
        <button className={tab === "preview" ? "active" : ""} onClick={() => setTab("preview")} disabled={!canPreview}><Eye size={13} /> Önizleme</button>
        <button className={tab === "code" ? "active" : ""} onClick={() => setTab("code")} disabled={!targetPath}><Code2 size={13} /> Kod</button>
        <button className={tab === "changes" ? "active" : ""} onClick={() => setTab("changes")}><FileCode2 size={13} /> Değişiklik</button>
        <button className={tab === "console" ? "active" : ""} onClick={() => setTab("console")} disabled={!canPreview}><SquareTerminal size={13} /> Konsol</button>
        <button className={tab === "evidence" ? "active" : ""} onClick={() => setTab("evidence")}><ShieldCheck size={13} /> Kanıt</button>
      </nav>
      <div className="canvas-body">
        {tab === "preview" && <section className="canvas-preview"><header><div><strong>{result?.previewPath ?? "HTML önizleme yok"}</strong><small>İzole yerel önizleme</small></div><button onClick={() => { setConsoleEntries([]); setRevision((value) => value + 1); }} disabled={!canPreview}><RefreshCw size={13} /> Yenile</button></header>{canPreview && result?.previewPath ? <iframe ref={iframeRef} title={`Önizleme: ${result.previewPath}`} sandbox="allow-scripts allow-same-origin" src={previewUrl(project.id, result.previewPath, revision)} /> : <div className="canvas-empty"><Eye size={24} /><strong>HTML çıktısı yok</strong><span>Bu tur doğrulanmış bir .html dosyası üretmedi.</span></div>}</section>}
        {tab === "code" && <section className="canvas-code"><header><div><strong>{targetPath ?? "Dosya yok"}</strong><small>{snapshot ? `${snapshot.language} · SHA ${snapshot.sha256.slice(0, 10)}` : "yüklenmedi"}</small></div><button className={dirty ? "primary" : ""} onClick={() => void save()} disabled={!dirty || busy}>{busy ? <LoaderCircle className="spin" size={13} /> : <Save size={13} />} Kaydet</button></header>{busy && !snapshot ? <div className="canvas-empty"><LoaderCircle className="spin" size={22} />Dosya okunuyor…</div> : snapshot ? <textarea spellCheck={false} value={code} onChange={(event) => setCode(event.target.value)} /> : <div className="canvas-empty"><FileCode2 size={22} />Metin önizlemesi kullanılamıyor.</div>}</section>}
        {tab === "changes" && <section className="canvas-changes"><header><div><strong>Bu görevdeki gerçek değişiklikler</strong><small>{result ? `${result.changedFiles.length} dosya · +${additions} -${deletions}${unknownStats ? " · bazı satır sayıları uygulanamaz" : ""}` : "Henüz turn-local kayıt yok"}</small></div></header>{result?.changedFiles.length ? <div>{result.changedFiles.map((item) => <article key={item.path}><span className={`canvas-change-kind ${item.kind}`}>{item.kind.toUpperCase()}</span><div><strong>{item.path}</strong><small>{item.verified ? "diskten doğrulandı" : "doğrulama eksik"}{item.binary ? " · binary" : ""}</small></div><button className="canvas-change-open" onClick={() => { setSelectedPath(item.path); setTab("code"); }} disabled={item.kind === "deleted" || item.binary || !item.afterSha256} title="Dosyayı Canvas kod düzenleyicisinde aç"><Code2 size={12} /> Aç</button><b className="additions">{item.additions === null ? "—" : `+${item.additions}`}</b><b className="deletions">{item.deletions === null ? "—" : `-${item.deletions}`}</b></article>)}</div> : <div className="canvas-empty"><FileCode2 size={22} /><strong>Bu turda doğrulanmış dosya mutasyonu yok</strong><span>Global kirli çalışma ağacı burada görev başarısı gibi gösterilmez.</span></div>}</section>}
        {tab === "console" && <section className="canvas-console"><header><strong>Önizleme konsolu</strong><button onClick={() => setConsoleEntries([])}>Temizle</button></header>{consoleEntries.length ? <div>{consoleEntries.map((item, index) => <p className={item.level} key={`${item.createdAt}:${index}`}><time>{new Date(item.createdAt).toLocaleTimeString("tr-TR")}</time><b>{item.level}</b><span>{item.message}</span></p>)}</div> : <div className="canvas-empty"><SquareTerminal size={22} />Henüz console/error olayı yok.</div>}</section>}
        {tab === "evidence" && <section className="canvas-evidence"><div className="canvas-facts"><div><span>Proje</span><strong>{project.name}</strong></div><div><span>Git dalı</span><strong>{gitBranch ?? "—"}</strong></div><div><span>Çekirdek</span><strong>{humanState(coreState)}</strong></div><div><span>Görev</span><strong>{threadTitle ?? "—"}</strong></div><div><span>Görev durumu</span><strong>{threadState ? humanState(threadState) : "—"}</strong></div><div><span>Intent</span><strong>{result?.intent ?? "—"}</strong></div><div><span>Mutasyon</span><strong>{result?.mutated ? "EVET" : "HAYIR"}</strong></div><div><span>Read-back</span><strong>{result?.verified ? "PASS" : "—"}</strong></div><div><span>Önce / sonra kirli</span><strong>{result ? `${result.baselineDirtyCount} / ${result.finalDirtyCount}` : "—"}</strong></div></div>{result?.gitHeadChanged && <div className="canvas-danger">Görev sırasında Git HEAD değişti. Bu tur güvenli mutasyon olarak onaylanmadı.</div>}{result?.evidence.length ? <div className="canvas-evidence-list">{result.evidence.map((line) => <code key={line}>{line}</code>)}</div> : <div className="canvas-empty"><ShieldCheck size={22} />Henüz görev kanıtı yok.</div>}</section>}
      </div>
      {notice && <div className="canvas-notice">{notice}</div>}
    </>}
  </aside>;
}
