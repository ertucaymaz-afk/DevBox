import type { FitAddon as XtermFitAddon } from "@xterm/addon-fit";
import type { Terminal as XtermTerminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import {
  Activity,
  ArrowUpRight,
  Check,
  CircleStop,
  Copy,
  GitBranch,
  Globe2,
  LoaderCircle,
  Play,
  Plus,
  RefreshCw,
  ShieldCheck,
  SquareTerminal,
  Trash2,
  Upload,
  X
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type {
  AppSettings,
  CommandResult,
  DebugResponse,
  DebugSession,
  RemoteWorker,
  WorkerPairing,
  EvolutionCampaign,
  IntegrationStatus,
  ProjectSummary,
  TerminalSummary,
  Worktree
} from "../shared/contracts";

function failure(error: unknown): string {
  if (error instanceof Error) return error.message.replace(/^Error invoking remote method '[^']+':\s*/iu, "");
  return String(error);
}

function Status({ value }: { value: string }): ReactNode {
  const healthy = ["READY", "RUNNING", "SUCCEEDED", "COMPLETED"].includes(value);
  const labels: Record<string, string> = {
    READY: "HAZIR",
    RUNNING: "ÇALIŞIYOR",
    SUCCEEDED: "BAŞARILI",
    COMPLETED: "TAMAMLANDI",
    UNAVAILABLE: "KULLANILAMIYOR",
    FAILED: "BAŞARISIZ",
    CANCELLED: "İPTAL EDİLDİ",
    QUEUED: "KUYRUKTA",
    LEASED: "KİRALANDI",
    CANCEL_REQUESTED: "İPTAL BEKLENİYOR",
    DISABLED: "KAPALI",
    IDLE: "BEKLİYOR",
    ONLINE: "ÇEVRİM İÇİ",
    OFFLINE: "ÇEVRİM DIŞI",
    REVOKED: "YETKİSİ KALDIRILDI",
    MAIN: "ANA",
    PRUNABLE: "TEMİZLENEBİLİR",
    AVAILABLE: "KULLANILABİLİR",
    INSTALLED: "KURULU",
    CONFIGURED: "YAPILANDIRILDI",
    DEGRADED: "KISITLI",
    BLOCKED: "ENGELLENDİ",
    RECOVERY_REQUIRED: "KURTARMA GEREKİYOR",
    "SAVED LOCALLY": "YERELDE KAYITLI"
  };
  return <span className={`advanced-status ${healthy ? "healthy" : "limited"}`} title={value}>{labels[value] ?? value}</span>;
}

function EmptyProject(): ReactNode {
  return <div className="advanced-empty"><GitBranch size={30} /><strong>Bir proje seçin</strong><span>Bu çalışma yüzeyi doğrulanmış proje kökü olmadan işlem yapmaz.</span></div>;
}

function readableDate(value: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("tr-TR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function resultReasonLabel(value: string): string {
  const labels: Record<string, string> = {
    COMPLETED: "tamamlandı",
    FAILED: "başarısız",
    CANCELLED: "iptal edildi",
    TIMEOUT: "zaman aşımı",
    SPAWN_FAILED: "süreç başlatılamadı",
    TERMINATED: "sonlandırıldı"
  };
  return labels[value] ?? value;
}

export function TerminalWorkspace({ project }: { project: ProjectSummary | null }): ReactNode {
  const hostRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XtermTerminal | null>(null);
  const fitRef = useRef<XtermFitAddon | null>(null);
  const activeIdRef = useRef<string | null>(null);
  const [terminals, setTerminals] = useState<TerminalSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [terminalReady, setTerminalReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!project) return setTerminals([]);
    setTerminals(await window.devbox.listTerminals(project.id));
  }, [project]);

  useEffect(() => {
    if (!hostRef.current) return;
    let disposed = false;
    let cleanup = (): void => undefined;
    void Promise.all([import("@xterm/xterm"), import("@xterm/addon-fit")]).then(([{ Terminal }, { FitAddon }]) => {
      if (disposed || !hostRef.current) return;
      const terminal = new Terminal({
        allowProposedApi: false,
        cursorBlink: true,
        cursorStyle: "bar",
        fontFamily: '"Cascadia Code", "Cascadia Mono", Consolas, monospace',
        fontSize: 13,
        lineHeight: 1.25,
        scrollback: 20_000,
        theme: { background: "#0b0b0b", foreground: "#dddddd", cursor: "#f2f2f2", selectionBackground: "#3e3e3e" }
      });
      const fit = new FitAddon();
      terminal.loadAddon(fit);
      terminal.open(hostRef.current);
      fit.fit();
      xtermRef.current = terminal;
      fitRef.current = fit;
      setTerminalReady(true);
      terminal.writeln("\u001b[90mDevBox ConPTY — terminal başlatılmayı bekliyor.\u001b[0m");
      const input = terminal.onData((data) => {
        const terminalId = activeIdRef.current;
        if (terminalId) void window.devbox.writeTerminal(terminalId, data).catch((caught) => setError(failure(caught)));
      });
      const resizeObserver = new ResizeObserver(() => {
        fit.fit();
        const terminalId = activeIdRef.current;
        if (terminalId) void window.devbox.resizeTerminal(terminalId, Math.max(20, terminal.cols), Math.max(5, terminal.rows)).catch(() => undefined);
      });
      resizeObserver.observe(hostRef.current);
      const unsubscribe = window.devbox.onTerminalEvent((event) => {
        if (event.terminalId !== activeIdRef.current) return;
        if (event.kind === "data") terminal.write(event.data);
        else {
          terminal.writeln(`\r\n\u001b[90mSüreç kapandı · çıkış ${event.exitCode}${event.signal === null ? "" : ` · sinyal ${event.signal}`}\u001b[0m`);
          void reload();
        }
      });
      cleanup = () => {
        unsubscribe();
        resizeObserver.disconnect();
        input.dispose();
        terminal.dispose();
        xtermRef.current = null;
        fitRef.current = null;
      };
    }).catch((caught) => setError(failure(caught)));
    return () => {
      disposed = true;
      setTerminalReady(false);
      cleanup();
    };
  }, [reload]);

  useEffect(() => { void reload().catch((caught) => setError(failure(caught))); }, [reload]);
  useEffect(() => { activeIdRef.current = activeId; }, [activeId]);

  const start = async (): Promise<void> => {
    if (!project || busy) return;
    setBusy(true);
    setError(null);
    try {
      fitRef.current?.fit();
      const terminal = await window.devbox.startTerminal(project.id, xtermRef.current?.cols ?? 100, xtermRef.current?.rows ?? 30);
      activeIdRef.current = terminal.id;
      setActiveId(terminal.id);
      xtermRef.current?.clear();
      xtermRef.current?.focus();
      await reload();
    } catch (caught) {
      setError(failure(caught));
    } finally {
      setBusy(false);
    }
  };

  const stop = async (): Promise<void> => {
    if (!activeId) return;
    await window.devbox.killTerminal(activeId);
    activeIdRef.current = null;
    setActiveId(null);
    xtermRef.current?.writeln("\r\n\u001b[90mTerminal kullanıcı tarafından kapatıldı.\u001b[0m");
    await reload();
  };

  return <section className="advanced-page terminal-workspace">
    <div className="advanced-heading"><div><span className="advanced-eyebrow">ETKİLEŞİMLİ CONPTY</span><h1>Terminal</h1><p>Gerçek, yeniden boyutlandırılabilir ve çift yönlü Windows sözde konsol oturumu.</p></div><div className="advanced-actions"><button onClick={() => void reload()} disabled={!project}><RefreshCw size={14} /> Yenile</button><button className="primary" onClick={() => void start()} disabled={!project || busy || !terminalReady}><Play size={14} /> {busy ? "Başlatılıyor" : terminalReady ? "Yeni terminal" : "Terminal yükleniyor"}</button><button onClick={() => void stop()} disabled={!activeId}><CircleStop size={14} /> Durdur</button></div></div>
    {!project ? <EmptyProject /> : <>
      <div className="terminal-tabs" role="tablist">{terminals.map((terminal) => <button role="tab" aria-selected={activeId === terminal.id} className={activeId === terminal.id ? "active" : ""} key={terminal.id} onClick={() => { setActiveId(terminal.id); activeIdRef.current = terminal.id; }}><SquareTerminal size={13} /><span>PID {terminal.pid}</span><Status value={terminal.state} /></button>)}</div>
      <div ref={hostRef} className="xterm-host" onContextMenu={(event) => { event.preventDefault(); const selected = xtermRef.current?.getSelection() ?? ""; void window.devbox.showContextMenu("terminal", Boolean(selected)).then((action) => { if (action === "copyOutput" && selected) void window.devbox.copyText(selected); if (action === "clear") xtermRef.current?.clear(); }); }} />
      <div className="advanced-footnote"><ShieldCheck size={13} /> Ortam değişkenleri allowlist ile aktarılır; API anahtarları renderer ve terminal ortamına kopyalanmaz.</div>
    </>}
    {error && <div className="inline-error">{error}</div>}
  </section>;
}

export function WorktreeWorkspace({ project }: { project: ProjectSummary | null }): ReactNode {
  const [items, setItems] = useState<Worktree[]>([]);
  const [name, setName] = useState("");
  const [ref, setRef] = useState("HEAD");
  const [mode, setMode] = useState<"detached" | "branch">("detached");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    if (!project) return setItems([]);
    setItems(await window.devbox.listWorktrees(project.id));
  }, [project]);
  useEffect(() => { void reload().catch((caught) => setError(failure(caught))); }, [reload]);
  const create = async (): Promise<void> => {
    if (!project || !name.trim()) return;
    setBusy(true); setError(null);
    try { await window.devbox.createWorktree(project.id, name.trim(), ref.trim() || "HEAD", mode); setName(""); await reload(); }
    catch (caught) { setError(failure(caught)); }
    finally { setBusy(false); }
  };
  const remove = async (item: Worktree): Promise<void> => {
    if (!project || item.isMain) return;
    setBusy(true); setError(null);
    try {
      const result = await window.devbox.removeWorktree(project.id, item.path, true);
      if (result.recoveryPatch) setError(`Kurtarma patch'i korundu: ${result.recoveryPatch}`);
      await reload();
    } catch (caught) { setError(failure(caught)); }
    finally { setBusy(false); }
  };
  return <section className="advanced-page">
    <div className="advanced-heading"><div><span className="advanced-eyebrow">YALITILMIŞ GIT ÇALIŞMASI</span><h1>Worktree’ler</h1><p>Her paralel görev için bağımsız çalışma dizini; kayıt, kilit, kurtarma ve temizleme yaşam döngüsü.</p></div><button onClick={() => void reload()} disabled={!project || busy}><RefreshCw size={14} /> Yenile</button></div>
    {!project ? <EmptyProject /> : <>
      <div className="creation-bar"><label><span>Ad</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="özellik-adi" /></label><label><span>Başlangıç ref’i</span><input value={ref} onChange={(event) => setRef(event.target.value)} /></label><label><span>Tür</span><select value={mode} onChange={(event) => setMode(event.target.value as typeof mode)}><option value="detached">Detached</option><option value="branch">devbox/* dalı</option></select></label><button className="primary" onClick={() => void create()} disabled={!name.trim() || busy}><Plus size={14} /> Oluştur</button></div>
      <div className="advanced-list">{items.map((item) => <article key={item.path}><div className="list-icon"><GitBranch size={16} /></div><div><strong>{item.isMain ? "Ana çalışma ağacı" : item.branch ?? "Bağımsız HEAD"}</strong><span title={item.path}>{item.path}</span><small>{item.head?.slice(0, 12) ?? "HEAD yok"} · {item.locked ? `kilitli${item.lockReason ? `: ${item.lockReason}` : ""}` : "kilitli değil"}</small></div><Status value={item.isMain ? "MAIN" : item.prunable ? "PRUNABLE" : "AVAILABLE"} />{!item.isMain && <button className="icon-danger" onClick={() => void remove(item)} disabled={busy} aria-label="Çalışma ağacını kaldır"><Trash2 size={15} /></button>}</article>)}</div>
    </>}
    {error && <div className={error.startsWith("Kurtarma") ? "inline-info" : "inline-error"}>{error}</div>}
  </section>;
}

export function AutomationWorkspace({ project }: { project: ProjectSummary | null }): ReactNode {
  const [campaign, setCampaign] = useState<EvolutionCampaign | null>(null);
  const [directive, setDirective] = useState("");
  const [busy, setBusy] = useState<"reload" | "toggle" | "run" | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    if (!project) return setCampaign(null);
    setCampaign(await window.devbox.getEvolution(project.id));
  }, [project]);
  useEffect(() => { void reload().catch((caught) => setError(failure(caught))); }, [reload]);
  useEffect(() => { if (campaign) setDirective(campaign.directive); }, [campaign?.projectId, campaign?.directive]);
  const toggle = async (): Promise<void> => {
    if (!project || !campaign) return;
    setBusy("toggle"); setError(null);
    try { setCampaign(await window.devbox.setEvolutionEnabled(project.id, !campaign.enabled)); }
    catch (caught) { setError(failure(caught)); }
    finally { setBusy(null); }
  };
  const run = async (): Promise<void> => {
    if (!project) return;
    setBusy("run"); setError(null);
    try { setCampaign(await window.devbox.runEvolutionCycle(project.id)); }
    catch (caught) { setError(failure(caught)); }
    finally { setBusy(null); }
  };
  const saveDirective = async (): Promise<void> => {
    if (!project || directive.trim().length < 80) return;
    setBusy("save"); setError(null);
    try { setCampaign(await window.devbox.setEvolutionDirective(project.id, directive)); }
    catch (caught) { setError(failure(caught)); }
    finally { setBusy(null); }
  };
  return <section className="advanced-page">
    <div className="advanced-heading"><div><span className="advanced-eyebrow">GERÇEK SAĞLAYICI KANITI</span><h1>DevBox API gelişimi</h1><p>Sağlık ve oturum denetimi geçen OpenAI Codex CLI öncelikli çalışır; Codex kullanılamazsa Hermes/NVIDIA NIM’e gerçek geri dönüş yapar. Dayanıklı görev, sağlayıcı kanıtı ve kalıcı görev geçmişi olmadan ilerleme yazmaz.</p></div><div className="advanced-actions"><button onClick={() => { setBusy("reload"); void reload().catch((caught) => setError(failure(caught))).finally(() => setBusy(null)); }} disabled={!project || Boolean(busy)}><RefreshCw className={busy === "reload" ? "spin" : ""} size={14} /> Yenile</button><button className="primary" onClick={() => void run()} disabled={!project || Boolean(busy)}>{busy === "run" ? <LoaderCircle className="spin" size={14} /> : <Play size={14} />} Şimdi çalıştır</button></div></div>
    {!project ? <EmptyProject /> : !campaign ? <div className="advanced-empty"><LoaderCircle className="spin" size={24} />Gerçek kampanya durumu yükleniyor…</div> : <>
      <div className="evolution-summary">
        <div className="evolution-score"><strong>{campaign.score}</strong><span>/ 100 kanıt kapsamı</span><small>Seviye {campaign.level} · {campaign.stage}</small></div>
        <dl><div><dt>Sağlayıcı</dt><dd>{campaign.provider}</dd></div><div><dt>Model</dt><dd>{campaign.model}</dd></div><div><dt>Başarılı / hatalı</dt><dd>{campaign.completedCycles} / {campaign.failedCycles}</dd></div><div><dt>Bugünkü kullanım</dt><dd>{campaign.cyclesToday} / {campaign.dailyCycleLimit}</dd></div><div><dt>Son çevrim</dt><dd>{readableDate(campaign.lastCycleAt)}</dd></div><div><dt>Sonraki çevrim</dt><dd>{campaign.enabled ? readableDate(campaign.nextCycleAt) : "Kapalı"}</dd></div></dl>
        <label className="evolution-toggle"><span><strong>Uygulama açıkken sürekli araştır</strong><small>Her {campaign.intervalMinutes} dakikada bir; günde en fazla {campaign.dailyCycleLimit} gerçek sağlayıcı isteği.</small></span><button className={`automation-toggle ${campaign.enabled ? "on" : ""}`} onClick={() => void toggle()} disabled={Boolean(busy)} aria-label={`API gelişim döngüsünü ${campaign.enabled ? "kapat" : "aç"}`}><i /></button></label>
      </div>
      <div className="truth-notice"><ShieldCheck size={17} /><p><strong>Bu bir model eğitimi veya kendi kendine kod değiştirme değildir.</strong> Her çevrimde önce yerel OpenAI Codex CLI oturumu doğrulanır; bu yol kullanılamazsa yalnız gerçek Hermes/NVIDIA NIM çağrısına geçilir. Gösterge, tamamlanan çevrimlerin {new Set(campaign.tasks.map((item) => item.track)).size} mühendislik alanındaki kanıt kapsamını ölçer. Görevler, yönerge, sağlayıcı kimliği ve bulgular proje bazında SQLite WAL deposunda kalır; uygulama kapanınca silinmez. Kod ancak kullanıcı açıkça uyguladığında ve test kanıtı üretildiğinde ürün gelişimi sayılır.</p></div>
      <section className="evolution-section directive-editor"><div className="panel-title"><div><h2>Kalıcı gelişim yönergesi</h2><span>Sonraki tüm Codex-öncelikli gerçek sağlayıcı çevrimlerine eklenir · {directive.length.toLocaleString("tr-TR")} karakter</span></div><div><button onClick={() => void window.devbox.copyText(directive)} disabled={!directive.trim()} title="Yönergeyi kopyala"><Copy size={14} /> Kopyala</button><button className="primary" onClick={() => void saveDirective()} disabled={Boolean(busy) || directive.trim().length < 80 || directive === campaign.directive}>{busy === "save" ? <LoaderCircle className="spin" size={14} /> : <Check size={14} />} Kaydet</button></div></div><textarea value={directive} onChange={(event) => setDirective(event.target.value)} minLength={80} maxLength={64_000} spellCheck aria-label="DevBox API kalıcı gelişim yönergesi" /><small>Codex çalışma zamanı yalnız gerçekten erişebildiği proje bağlamını kullanır. Web araştırması için gerçek bir arama aracı yoksa araştırma yapılmış sayılmaz; doğrulanacak birincil kaynaklar ayrı listelenir.</small></section>
      <section className="evolution-section"><div className="panel-title"><h2>Gerçek görev kuyruğu</h2><span>{campaign.tasks.length} kalıcı görev</span><Status value={campaign.enabled ? "RUNNING" : "DISABLED"} /></div><div className="advanced-list evolution-list">{campaign.tasks.slice(-32).map((item) => <article key={item.id}><div className="list-icon">{item.state === "SUCCEEDED" ? <Check size={16} /> : item.state === "RUNNING" ? <LoaderCircle className="spin" size={16} /> : <Activity size={16} />}</div><div><strong>{item.title}</strong><span>{item.track} · {item.provider ?? "Codex öncelikli sağlayıcı çağrısı bekliyor"}{item.model ? ` · ${item.model}` : ""}</span><small>{item.error ?? (item.evidence.length ? item.evidence.join(" · ") : "Henüz çalışma kanıtı yok")}</small></div><Status value={item.state} />{item.threadId && <button onClick={() => void window.devbox.copyText(item.threadId!)} title="Görev kimliğini kopyala"><Copy size={14} /></button>}</article>)}</div></section>
      <section className="evolution-section"><div className="panel-title"><h2>Sağlayıcı bulguları</h2><span>{campaign.learnings.length} kalıcı kayıt</span></div>{campaign.learnings.length === 0 ? <div className="advanced-empty compact"><Activity size={22} /><strong>Henüz doğrulanmış çevrim yok</strong><span>İlk başarılı gerçek Codex veya Hermes/NVIDIA çevrimi, sağlayıcı ve durable-job kanıtıyla burada görünür.</span></div> : <div className="learning-grid">{campaign.learnings.slice().reverse().slice(0, 20).map((item) => <article key={item.id}><header><strong>{item.title}</strong><span>{item.track} · {readableDate(item.learnedAt)}</span></header><p>{item.summary}</p><footer>{item.evidence.join(" · ")}</footer></article>)}</div>}</section>
    </>}
    {error && <div className="inline-error">{error}</div>}
  </section>;
}

export function IntegrationWorkspace({ project, scope = "all" }: { project: ProjectSummary | null; scope?: "all" | "github" }): ReactNode {
  const [statuses, setStatuses] = useState<IntegrationStatus[]>([]);
  const [result, setResult] = useState<CommandResult | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [target, setTarget] = useState("");
  const [platformTarget, setPlatformTarget] = useState("");
  const [debugExecutable, setDebugExecutable] = useState("");
  const [debugArguments, setDebugArguments] = useState("[]");
  const [debugConfiguration, setDebugConfiguration] = useState('{\n  "program": "",\n  "cwd": ""\n}');
  const [debugSession, setDebugSession] = useState<DebugSession | null>(null);
  const [debugResponse, setDebugResponse] = useState<DebugResponse | null>(null);
  const [debugThreadId, setDebugThreadId] = useState("1");
  const [debugFrameId, setDebugFrameId] = useState("0");
  const [debugVariablesReference, setDebugVariablesReference] = useState("0");
  const [breakpointSource, setBreakpointSource] = useState("");
  const [breakpointLines, setBreakpointLines] = useState("");
  const [remoteWorkers, setRemoteWorkers] = useState<RemoteWorker[]>([]);
  const [workerPairing, setWorkerPairing] = useState<WorkerPairing | null>(null);
  const [remoteJobPayload, setRemoteJobPayload] = useState('{"command":"node","args":["--version"],"cwd":"."}');
  const [workerNotice, setWorkerNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    const [integrationItems, workerItems] = await Promise.all([window.devbox.inspectIntegrations(project?.id), window.devbox.listRemoteWorkers()]);
    setStatuses(integrationItems); setRemoteWorkers(workerItems);
  }, [project?.id]);
  useEffect(() => { void reload().catch((caught) => setError(failure(caught))); }, [reload]);
  const github = async (action: Parameters<typeof window.devbox.runGitHubAction>[1]): Promise<void> => {
    if (!project) return;
    setBusy(action); setError(null);
    try { setResult(await window.devbox.runGitHubAction(project.id, action, target)); }
    catch (caught) { setError(failure(caught)); }
    finally { setBusy(null); }
  };
  const vercel = async (action: Parameters<typeof window.devbox.runVercelAction>[1]): Promise<void> => {
    if (!project) return;
    setBusy(action); setError(null);
    try { setResult(await window.devbox.runVercelAction(project.id, action, target)); await reload(); }
    catch (caught) { setError(failure(caught)); }
    finally { setBusy(null); }
  };
  const platform = async (action: Parameters<typeof window.devbox.runPlatformAction>[0]): Promise<void> => {
    setBusy(action); setError(null);
    try { setResult(await window.devbox.runPlatformAction(action, platformTarget, project?.id)); await reload(); }
    catch (caught) { setError(failure(caught)); }
    finally { setBusy(null); }
  };
  const startDebugger = async (): Promise<void> => {
    if (!project || !debugExecutable.trim()) return;
    setBusy("debug-start"); setError(null);
    try {
      const args = JSON.parse(debugArguments) as unknown;
      const configuration = JSON.parse(debugConfiguration) as unknown;
      if (!Array.isArray(args) || args.some((value) => typeof value !== "string")) throw new Error("Adapter argümanları JSON string dizisi olmalıdır.");
      if (!configuration || typeof configuration !== "object" || Array.isArray(configuration)) throw new Error("Hata ayıklayıcı yapılandırması bir JSON nesnesi olmalıdır.");
      setDebugSession(await window.devbox.startDebugSession(project.id, debugExecutable.trim(), args, "launch", configuration as Record<string, unknown>));
      setDebugResponse(null);
    } catch (caught) { setError(failure(caught)); }
    finally { setBusy(null); }
  };
  const debugCommand = async (command: Parameters<typeof window.devbox.runDebugCommand>[1], args: Record<string, unknown> = {}): Promise<void> => {
    if (!debugSession) return;
    setBusy(`debug-${command}`); setError(null);
    try {
      const response = await window.devbox.runDebugCommand(debugSession.id, command, args);
      setDebugSession(response.session); setDebugResponse(response);
    } catch (caught) { setError(failure(caught)); }
    finally { setBusy(null); }
  };
  const stopDebugger = async (): Promise<void> => {
    if (!debugSession) return;
    setBusy("debug-stop");
    try { await window.devbox.stopDebugSession(debugSession.id); setDebugSession(null); setDebugResponse(null); }
    catch (caught) { setError(failure(caught)); }
    finally { setBusy(null); }
  };
  const createWorkerPairing = async (): Promise<void> => {
    setBusy("worker-pairing"); setError(null);
    try { setWorkerPairing(await window.devbox.createWorkerPairing()); }
    catch (caught) { setError(failure(caught)); }
    finally { setBusy(null); }
  };
  const revokeWorker = async (workerId: string): Promise<void> => {
    setBusy(`worker-revoke-${workerId}`); setError(null);
    try { await window.devbox.revokeRemoteWorker(workerId); setRemoteWorkers(await window.devbox.listRemoteWorkers()); }
    catch (caught) { setError(failure(caught)); }
    finally { setBusy(null); }
  };
  const enqueueRemoteJob = async (): Promise<void> => {
    setBusy("worker-job"); setError(null); setWorkerNotice(null);
    try {
      const payload = JSON.parse(remoteJobPayload) as unknown;
      const job = await window.devbox.enqueueRemoteJob("command", payload);
      setWorkerNotice(`Uzak görev kuyruğa alındı: ${job.id} · ${job.state}`);
    } catch (caught) { setError(failure(caught)); }
    finally { setBusy(null); }
  };
  const visibleStatuses = scope === "github" ? statuses.filter((status) => status.kind === "github") : statuses;
  return <section className="advanced-page">
    <div className="advanced-heading"><div><span className="advanced-eyebrow">{scope === "github" ? "GITHUB WORKFLOW" : "TOOLS & SERVICES"}</span><h1>{scope === "github" ? "GitHub pull request’leri" : "Eklentiler ve entegrasyonlar"}</h1><p>{scope === "github" ? "PR, issue, check, CI çalışması ve release işlemleri gerçek gh CLI oturumu ve seçili Git deposu üzerinden yürütülür." : "GitHub, Vercel, SSH, LSP/DAP, imzalı toolkit ve yayın kapılarının gerçek çalışma zamanı durumu."}</p></div><button onClick={() => void reload()} disabled={Boolean(busy)}><RefreshCw className={busy === "inspect" ? "spin" : ""} size={14} /> Yeniden denetle</button></div>
    <div className="integration-grid">{visibleStatuses.map((status) => <article key={status.kind}><div className="integration-title"><span>{status.kind === "github" ? <GitBranch size={17} /> : status.kind === "vercel" ? <Globe2 size={17} /> : <ShieldCheck size={17} />}</span><div><strong>{status.kind.toLocaleUpperCase("tr-TR")}</strong><small>{status.version ?? "sürüm yok"}{status.account ? ` · ${status.account}` : ""}</small></div><Status value={status.state} /></div><p>{status.detail}</p><footer>{status.commands.join(" · ")}</footer></article>)}</div>
    {scope === "all" && <section className="integration-console platform-console"><div className="console-controls"><label><span>Yerel hedef · SSH için host:port, paket için kind/id</span><input value={platformTarget} onChange={(event) => setPlatformTarget(event.target.value)} placeholder="örn. server.example:22 veya plugin/devbox.toolkit" /></label><div><button onClick={() => void platform("protocol-discover")}><Activity size={14} /> LSP/DAP keşfet</button><button onClick={() => void platform("ssh-audit")}><ShieldCheck size={14} /> SSH pinlerini denetle</button><button onClick={() => void platform("ssh-pin")} disabled={!platformTarget.trim()}><ShieldCheck size={14} /> SSH anahtarı sabitle</button><button onClick={() => void platform("package-list")}><Activity size={14} /> Paket envanteri</button><button onClick={() => void platform("package-install")}><Upload size={14} /> İmzalı paket kur</button><button onClick={() => void platform("package-repair")} disabled={!/^(plugin|mcp|toolkit|update)\/[a-z0-9][a-z0-9._-]{1,127}$/u.test(platformTarget)}><RefreshCw size={14} /> Paketi onar</button><button onClick={() => void platform("package-rollback")} disabled={!/^(plugin|mcp|toolkit|update)\/[a-z0-9][a-z0-9._-]{1,127}$/u.test(platformTarget)}><RefreshCw size={14} /> Paketi geri al</button></div></div></section>}
    {scope === "all" && <section className="integration-console remote-worker-console"><div className="panel-title"><div><h2>Dayanıklı uzak çalışanlar</h2><span>Tek kullanımlık eşleştirme, iptal edilebilir erişim kimliği, sağlık sinyali, süreli görev kiralaması, çökme kurtarması ve yetki iptali.</span></div><button onClick={() => void createWorkerPairing()} disabled={Boolean(busy)}><ShieldCheck size={14} /> Eşleştirme kodu</button></div>{workerPairing && <div className="worker-pairing"><strong>{workerPairing.code}</strong><span>{new Date(workerPairing.expiresAt).toLocaleString("tr-TR")} tarihine kadar bir kez kullanılabilir.</span><code>{`ssh -N -L 43110:127.0.0.1:${new URL(workerPairing.endpoint).port} <kullanıcı>@<devbox-makinesi>`}</code><code>{`$env:DEVBOX_URL='http://127.0.0.1:43110'; $env:DEVBOX_PAIRING_CODE='${workerPairing.code}'; $env:DEVBOX_WORKER_ROOT='<proje-kökü>'; node scripts/remote-worker.mjs`}</code><button onClick={() => void window.devbox.copyText(workerPairing.code)}><Copy size={13} /> Kodu kopyala</button></div>}<div className="worker-list">{remoteWorkers.length === 0 ? <span>Eşleştirilmiş uzak çalışan yok.</span> : remoteWorkers.map((worker) => <article key={worker.id}><div><strong>{worker.name}</strong><small>{worker.id} · {new Date(worker.lastSeenAt).toLocaleString("tr-TR")}</small><small>{worker.capabilities.join(" · ") || "Bildirilen yetenek yok"}</small></div><Status value={worker.status} />{worker.status !== "REVOKED" && <button className="danger" onClick={() => void revokeWorker(worker.id)}><CircleStop size={13} /> Yetkiyi kaldır</button>}</article>)}</div><label className="remote-job"><span>Uzak komut görevi · yalnız uzak çalışan izin listesindeki komutlar çalışır</span><textarea value={remoteJobPayload} onChange={(event) => setRemoteJobPayload(event.target.value)} /><button onClick={() => void enqueueRemoteJob()} disabled={remoteWorkers.every((worker) => worker.status === "REVOKED") || Boolean(busy)}><Upload size={14} /> Kuyruğa al</button></label>{workerNotice && <div className="inline-success">{workerNotice}</div>}</section>}
    {scope === "all" && <section className="integration-console debugger-console"><div className="panel-title"><div><h2>Gerçek DAP hata ayıklayıcı</h2><span>Yalnız seçtiğiniz kurulu hata ayıklama adaptörü süreciyle konuşur; adaptör olmadan oturum başlamaz.</span></div><Status value={debugSession?.state ?? "UNAVAILABLE"} /></div><div className="debugger-grid"><label><span>Adaptör yürütülebilir dosyası</span><input value={debugExecutable} onChange={(event) => setDebugExecutable(event.target.value)} placeholder="C:\\tools\\codelldb.exe" disabled={Boolean(debugSession)} /></label><label><span>Adaptör argümanları · JSON dizisi</span><input value={debugArguments} onChange={(event) => setDebugArguments(event.target.value)} disabled={Boolean(debugSession)} /></label><label className="debug-config"><span>Başlatma yapılandırması · JSON nesnesi</span><textarea value={debugConfiguration} onChange={(event) => setDebugConfiguration(event.target.value)} disabled={Boolean(debugSession)} /></label></div>{debugSession && <div className="debugger-grid debugger-references"><label><span>İş parçacığı kimliği</span><input value={debugThreadId} onChange={(event) => setDebugThreadId(event.target.value)} inputMode="numeric" /></label><label><span>Çerçeve kimliği</span><input value={debugFrameId} onChange={(event) => setDebugFrameId(event.target.value)} inputMode="numeric" /></label><label><span>Değişken başvurusu</span><input value={debugVariablesReference} onChange={(event) => setDebugVariablesReference(event.target.value)} inputMode="numeric" /></label><label><span>Kesme noktası kaynak yolu</span><input value={breakpointSource} onChange={(event) => setBreakpointSource(event.target.value)} placeholder="C:\\project\\src\\main.ts" /></label><label><span>Kesme noktası satırları</span><input value={breakpointLines} onChange={(event) => setBreakpointLines(event.target.value)} placeholder="12, 24, 38" /></label></div>}<div className="debug-actions">{!debugSession ? <button className="primary" onClick={() => void startDebugger()} disabled={!project || !debugExecutable.trim() || Boolean(busy)}><Play size={14} /> Adaptörle başlat</button> : <><button onClick={() => void debugCommand("continue", { threadId: Number(debugThreadId) })}><Play size={14} /> Devam</button><button onClick={() => void debugCommand("pause", { threadId: Number(debugThreadId) })}><CircleStop size={14} /> Duraklat</button><button onClick={() => void debugCommand("next", { threadId: Number(debugThreadId) })}><ArrowUpRight size={14} /> Satır atla</button><button onClick={() => void debugCommand("stepIn", { threadId: Number(debugThreadId) })}><ArrowUpRight size={14} /> İçeri gir</button><button onClick={() => void debugCommand("stepOut", { threadId: Number(debugThreadId) })}><ArrowUpRight size={14} /> Dışarı çık</button><button onClick={() => void debugCommand("threads")}><Activity size={14} /> İş parçacıkları</button><button onClick={() => void debugCommand("stackTrace", { threadId: Number(debugThreadId) })}><Activity size={14} /> Çağrı yığını</button><button onClick={() => void debugCommand("scopes", { frameId: Number(debugFrameId) })}><Activity size={14} /> Kapsamlar</button><button onClick={() => void debugCommand("variables", { variablesReference: Number(debugVariablesReference) })}><Activity size={14} /> Değişkenler</button><button onClick={() => void debugCommand("setBreakpoints", { source: { path: breakpointSource }, breakpoints: breakpointLines.split(",").map((value) => Number(value.trim())).filter((value) => Number.isInteger(value) && value > 0).map((line) => ({ line })) })} disabled={!breakpointSource.trim() || !breakpointLines.trim()}><Activity size={14} /> Kesme noktalarını uygula</button><button className="danger" onClick={() => void stopDebugger()}><CircleStop size={14} /> Oturumu bitir</button></>}</div>{debugResponse && <pre className="debug-response">{JSON.stringify(debugResponse.body, null, 2)}</pre>}</section>}
    {project && <section className="integration-console"><div className="console-controls"><label><span>{scope === "github" ? "Hedef; PR/run numarası, issue başlığı veya release etiketi" : "Hedef; PR/run no, başlık, tag veya deployment URL"}</span><input value={target} onChange={(event) => setTarget(event.target.value)} placeholder={scope === "github" ? "örn. 42, hata başlığı veya v1.2.0" : "örn. 42, v1.2.0 veya deployment-url"} /></label><div><button onClick={() => void github("pr-list")}><GitBranch size={14} /> PR’lar</button><button onClick={() => void github("pr-create")} disabled={!target.trim()}><Upload size={14} /> PR oluştur</button><button onClick={() => void github("pr-merge")} disabled={!/^\d+$/u.test(target)}><Check size={14} /> PR birleştir</button><button onClick={() => void github("issue-list")}><GitBranch size={14} /> Issue’lar</button><button onClick={() => void github("issue-create")} disabled={!target.trim()}><Upload size={14} /> Issue oluştur</button><button onClick={() => void github("checks")}><Check size={14} /> Checks</button><button onClick={() => void github("run-list")}><Activity size={14} /> CI çalışmaları</button><button onClick={() => void github("run-log")} disabled={!/^\d+$/u.test(target)}><Activity size={14} /> CI logu</button><button onClick={() => void github("run-rerun")} disabled={!/^\d+$/u.test(target)}><RefreshCw size={14} /> CI tekrar</button><button onClick={() => void github("release-list")}><Upload size={14} /> Release’ler</button><button onClick={() => void github("release-create")} disabled={!target.trim()}><Upload size={14} /> Release oluştur</button>{scope === "all" && <><button onClick={() => void vercel("link")}><Globe2 size={14} /> Vercel bağla</button><button onClick={() => void vercel("preview")}><ArrowUpRight size={14} /> Preview</button><button onClick={() => void vercel("production")}><Upload size={14} /> Production</button><button onClick={() => void vercel("inspect")}><Globe2 size={14} /> Inspect</button><button onClick={() => void vercel("logs")}><Activity size={14} /> Logs</button><button onClick={() => void vercel("rollback")}><RefreshCw size={14} /> Rollback</button></>}</div></div></section>}
    {busy && <div className="console-busy"><LoaderCircle className="spin" size={14} /> {busy} çalışıyor…</div>}
    {result && <div className="command-evidence"><header><span>{result.commandDisplay}</span><Status value={result.exitCode === 0 ? "SUCCEEDED" : result.exitReason === "CANCELLED" ? "CANCELLED" : "FAILED"} /><button onClick={() => void window.devbox.copyText(`${result.stdout}\n${result.stderr}`)}><Copy size={13} /> Kopyala</button></header><pre>{result.stdout || result.stderr || (result.exitReason === "CANCELLED" ? "İşlem kullanıcı tarafından iptal edildi." : "Komut çıktı üretmedi.")}</pre><footer>{result.durationMs} ms · {resultReasonLabel(result.exitReason)} · çıkış {result.exitCode ?? "—"}</footer></div>}
    {error && <div className="inline-error">{error}</div>}
  </section>;
}

export function SettingsWorkspace({ settings, onSettings, onClose }: { settings: AppSettings | null; onSettings: (settings: AppSettings) => void; onClose: () => void }): ReactNode {
  const [portable, setPortable] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [section, setSection] = useState<"appearance" | "permissions" | "terminal">("appearance");
  const patch = async (value: Parameters<typeof window.devbox.patchSettings>[0]): Promise<void> => {
    try { onSettings(await window.devbox.patchSettings(value)); setNotice("Ayar yerel SQLite deposuna kaydedildi."); }
    catch (caught) { setNotice(failure(caught)); }
  };
  if (!settings) return <section className="advanced-page"><div className="advanced-empty"><LoaderCircle className="spin" size={24} />Ayarlar yükleniyor…</div></section>;
  return <section className="advanced-page settings-workspace">
    <div className="advanced-heading"><div><span className="advanced-eyebrow">POLİTİKA MERKEZİ</span><h1>Ayarlar</h1><p>Yalnızca gerçek çalışma zamanında uygulanan görünüm, izin, sandbox, ağ ve terminal politikaları.</p></div><div className="settings-heading-actions"><Status value="SAVED LOCALLY" /><button onClick={onClose} aria-label="Ayarları kapat" title="Ayarları kapat"><X size={16} /></button></div></div>
    <nav className="settings-nav" aria-label="Ayar bölümleri"><button className={section === "appearance" ? "active" : ""} onClick={() => setSection("appearance")}>Görünüm</button><button className={section === "permissions" ? "active" : ""} onClick={() => setSection("permissions")}>İzinler ve sandbox</button><button className={section === "terminal" ? "active" : ""} onClick={() => setSection("terminal")}>Terminal</button></nav>
    <div className="settings-sections">
      {section === "appearance" && <section><h2>Görünüm</h2><div className="settings-grid"><label><span>Tema adı<small>Portable tema manifestinde görünür.</small></span><input value={settings.theme.name} onChange={(event) => void patch({ theme: { name: event.target.value || "DevBox" } })} /></label><label><span>Vurgu rengi<small>Hex renk, kod çalıştırmaz.</small></span><input type="color" value={settings.theme.accent} onChange={(event) => void patch({ theme: { accent: event.target.value } })} /></label><label><span>Arayüz yazı tipi</span><input value={settings.theme.uiFont} onChange={(event) => void patch({ theme: { uiFont: event.target.value || "Segoe UI" } })} /></label><label><span>Kod yazı tipi</span><input value={settings.theme.codeFont} onChange={(event) => void patch({ theme: { codeFont: event.target.value || "Consolas" } })} /></label><label><span>Kontrast</span><select value={settings.theme.contrast} onChange={(event) => void patch({ theme: { contrast: event.target.value as AppSettings["theme"]["contrast"] } })}><option value="normal">Normal</option><option value="high">Yüksek</option></select></label><label><span>Başlangıç tanıtımı<small>Seçim yerel ayarlarda kalıcı olarak saklanır.</small></span><select value={settings.launchIntroMode} onChange={(event) => { const mode = event.target.value as AppSettings["launchIntroMode"]; void patch({ launchIntroMode: mode, launchIntroSeen: mode === "once" ? false : settings.launchIntroSeen }); }}><option value="once">Yalnız ilk açılışta</option><option value="always">Her açılışta</option><option value="never">Gösterme</option></select></label><label className="switch-setting"><span>Hareketi azalt<small>Animasyonları ve geçişleri sınırlar.</small></span><button className={`automation-toggle ${settings.reduceMotion ? "on" : ""}`} onClick={() => void patch({ reduceMotion: !settings.reduceMotion })} aria-label="Hareketi azalt"><i /></button></label></div><div className="theme-row"><textarea value={portable} onChange={(event) => setPortable(event.target.value)} placeholder="devbox-theme-v1:… veya güvenli codex-theme-v1:… veri manifesti" /><button onClick={() => void window.devbox.importTheme(portable).then((next) => { onSettings(next); setNotice("Tema doğrulandı ve içe aktarıldı."); }).catch((caught) => setNotice(failure(caught)))} disabled={!portable.trim()}><Upload size={14} /> İçe aktar</button><button onClick={() => void window.devbox.exportTheme().then((value) => { setPortable(value); void window.devbox.copyText(value); setNotice("Portable tema panoya kopyalandı."); })}><Copy size={14} /> Dışa aktar</button></div></section>}
      {section === "permissions" && <section><h2>İzinler ve sandbox</h2><div className="permission-settings"><label><span>İzin profili<small>Profil, onay + sandbox + ağ politikasını atomik olarak değiştirir.</small></span><select value={settings.permissionProfile} onChange={(event) => void patch({ permissionProfile: event.target.value as AppSettings["permissionProfile"] })}><option value="Salt okunur">Onay iste</option><option value="Onaylı">Benim için onayla</option><option value="Tam erişim">Tam erişim</option></select></label><dl><div><dt>Onay davranışı</dt><dd>{settings.approvalPolicy === "always" ? "Her proje yazma, süreç ve ağ işleminde sor" : settings.approvalPolicy === "on-request" ? "Yalnız riskli işlemde sor" : "Politika diyaloğu gösterme"}</dd></div><div><dt>Dosya kapsamı</dt><dd>{settings.sandboxPolicy === "read-only" ? "Salt okunur" : settings.sandboxPolicy === "workspace-write" ? "Seçili proje kökü; profil kurallarına bağlı yazma" : "Açılan hedeflerde tam erişim"}</dd></div><div><dt>Ağ</dt><dd>{settings.networkAccess ? "Gerçek sağlayıcı ve entegrasyon çağrıları profil onayıyla açık" : "Kapalı"}</dd></div></dl></div></section>}
      {section === "terminal" && <section><h2>Terminal</h2><div className="settings-grid"><label><span>Terminal kabuğu<small>Yeni ConPTY oturumlarında gerçekten kullanılan çalıştırılabilir dosya.</small></span><select value={settings.terminalShell} onChange={(event) => void patch({ terminalShell: event.target.value as AppSettings["terminalShell"] })}><option value="pwsh">PowerShell 7</option><option value="powershell">Windows PowerShell</option><option value="cmd">Command Prompt</option></select></label></div></section>}
    </div>
    {notice && <div className="inline-info">{notice}</div>}
  </section>;
}

export function themeStyle(settings: AppSettings | null): CSSProperties {
  if (!settings) return {};
  return {
    "--accent": settings.theme.accent,
    "--bg-app": settings.theme.surface,
    "--bg-sidebar": settings.theme.sidebar,
    "--bg-panel": settings.theme.panel,
    "--border": settings.theme.border,
    "--text": settings.theme.ink,
    "--text-muted": settings.theme.muted,
    "--success": settings.theme.success,
    "--warning": settings.theme.warning,
    "--danger": settings.theme.danger,
    fontFamily: `${settings.theme.uiFont}, "Segoe UI", sans-serif`
  } as CSSProperties;
}
