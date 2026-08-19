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
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type {
  AppSettings,
  CommandResult,
  DebugResponse,
  DebugSession,
  DurableJobSummary,
  RemoteWorker,
  WorkerPairing,
  EvolutionActivityEvent,
  EvolutionCampaign,
  EvolutionModelCatalog,
  EvolutionRouting,
  IntegrationStatus,
  ProjectSummary,
  TerminalSummary,
  Worktree
} from "../shared/contracts";

type DapThreadView = { id: number; name: string };
type DapStackFrameView = { id: number; name: string; line: number | null; column: number | null; sourceName: string | null; sourcePath: string | null };
type DapScopeView = { name: string; variablesReference: number; expensive: boolean };
type DapVariableView = { name: string; value: string; type: string | null; variablesReference: number };

function debugBody(response: DebugResponse): Record<string, unknown> {
  const body = response.body;
  return body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : {};
}

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
    QUEUEING: "KUYRUĞA ALINIYOR",
    PREPARING: "HAZIRLANIYOR",
    PROVIDER_CHECK: "SAĞLAYICI DOĞRULANIYOR",
    AUTH_CHECK: "OTURUM DOĞRULANIYOR",
    MODEL_ATTEMPT: "MODEL HAZIRLANIYOR",
    PLANNING: "PLANLANIYOR",
    INSPECTING: "KAYNAK İNCELENİYOR",
    EDITING: "KODLANIYOR",
    RUNNING_COMMAND: "KOMUT YÜRÜTÜLÜYOR",
    TESTING: "TEST EDİLİYOR",
    VERIFYING: "DOĞRULANIYOR",
    REVIEWING: "KANIT İNCELENİYOR",
    WAITING: "BEKLİYOR",
    SETTLING: "SONUÇLANDIRILIYOR",
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
    BLOCKED_EXTERNAL: "HARİCİ ENGEL",
    BACKOFF: "YENİDEN DENEME BEKLİYOR",
    RECOVERY_REQUIRED: "KURTARMA GEREKİYOR",
    "SAVED LOCALLY": "YERELDE KAYITLI"
  };
  return <span className={`advanced-status ${healthy ? "healthy" : "limited"}`} title={value}>{labels[value] ?? value}</span>;
}

function evolutionStageLabel(value: string): string {
  const labels: Record<string, string> = {
    PROVIDER_CHECK: "Sağlayıcı doğrulanıyor",
    AUTH_CHECK: "Oturum doğrulanıyor",
    MODEL_ATTEMPT: "Model hazırlanıyor",
    PLANNING: "Planlanıyor",
    INSPECTING: "Kaynak inceleniyor",
    EDITING: "Kodlanıyor",
    RUNNING_COMMAND: "Komut yürütülüyor",
    TESTING: "Test ediliyor",
    VERIFYING: "Doğrulanıyor",
    REVIEWING: "Kanıt inceleniyor",
    WAITING: "Bekliyor",
    BACKOFF: "Yeniden deneme bekleniyor",
    COMPLETED: "Tamamlandı",
    FAILED: "Başarısız",
    BLOCKED_EXTERNAL: "Harici engel",
    RECOVERY_REQUIRED: "Kurtarma gerekiyor",
    CANCELLED: "Durduruldu",
    IDLE: "Hazır"
  };
  return labels[value] ?? value.replaceAll("_", " ").toLocaleLowerCase("tr-TR");
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

export function TerminalWorkspace({ project, settings }: { project: ProjectSummary | null; settings: AppSettings | null }): ReactNode {
  const hostRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XtermTerminal | null>(null);
  const fitRef = useRef<XtermFitAddon | null>(null);
  const activeIdRef = useRef<string | null>(null);
  const [terminals, setTerminals] = useState<TerminalSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [terminalReady, setTerminalReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [systemDark, setSystemDark] = useState(() => window.matchMedia("(prefers-color-scheme: dark)").matches);
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const listener = (event: MediaQueryListEvent): void => setSystemDark(event.matches);
    setSystemDark(media.matches);
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, []);
  const terminalIsLight = settings?.theme.base === "light" || (settings?.theme.base === "system" && !systemDark);

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
        theme: terminalIsLight
          ? { background: "#ffffff", foreground: "#182027", cursor: "#182027", selectionBackground: "#cfe2f3" }
          : { background: "#0b0b0b", foreground: "#dddddd", cursor: "#f2f2f2", selectionBackground: "#3e3e3e" }
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
  }, [reload, terminalIsLight]);

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
  const [routing, setRouting] = useState<EvolutionRouting | null>(null);
  const [activityHistory, setActivityHistory] = useState<EvolutionActivityEvent[]>([]);
  const [modelCatalog, setModelCatalog] = useState<EvolutionModelCatalog | null>(null);
  const [catalogBusy, setCatalogBusy] = useState(false);
  const [busy, setBusy] = useState<"reload" | "toggle" | "run" | "save" | "route" | "cancel" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [visibleTasks, setVisibleTasks] = useState(24);
  const reload = useCallback(async () => {
    if (!project) { setCampaign(null); setActivityHistory([]); return; }
    const [nextCampaign, history] = await Promise.all([
      window.devbox.getEvolution(project.id),
      window.devbox.listEvolutionActivity(project.id, 120)
    ]);
    setCampaign(nextCampaign);
    setActivityHistory(history);
  }, [project]);

  useEffect(() => { void reload().catch((caught) => setError(failure(caught))); }, [reload]);
  useEffect(() => {
    if (!campaign) return;
    setDirective(campaign.directive);
    setRouting(campaign.routing);
  }, [campaign?.projectId, campaign?.directive, campaign?.routing.mode, campaign?.routing.provider, campaign?.routing.model, campaign?.routing.reasoningEffort, campaign?.routing.allowFallback]);

  useEffect(() => {
    if (!project || !routing) { setModelCatalog(null); return; }
    let disposed = false;
    setCatalogBusy(true);
    void window.devbox.getEvolutionModelCatalog(project.id, routing.provider)
      .then((catalog) => { if (!disposed) setModelCatalog(catalog); })
      .catch((caught) => {
        if (!disposed) setModelCatalog({ provider: routing.provider, state: "FAILED", detail: failure(caught), items: [], checkedAt: new Date().toISOString() });
      })
      .finally(() => { if (!disposed) setCatalogBusy(false); });
    return () => { disposed = true; };
  }, [project?.id, routing?.provider]);

  useEffect(() => {
    if (!project) return;
    return window.devbox.onEvolutionActivity((event) => {
      if (event.projectId !== project.id) return;
      setActivityHistory((current) => [event, ...current.filter((item) => item.id !== event.id)].slice(0, 120));
      setCampaign((current) => current ? {
        ...current,
        isRunning: !["COMPLETED", "FAILED", "BLOCKED_EXTERNAL", "CANCELLED", "RECOVERY_REQUIRED", "BACKOFF", "IDLE"].includes(event.stage),
        runtime: {
          ...current.runtime,
          stage: event.stage,
          detail: event.message,
          waitingReason: event.kind === "waiting" || event.stage === "WAITING" || event.stage === "BACKOFF" ? event.message : null,
          provider: event.provider ?? current.runtime.provider,
          model: event.model ?? current.runtime.model,
          updatedAt: event.createdAt
        },
        activity: [...current.activity, event].slice(-240),
        updatedAt: event.createdAt
      } : current);
    });
  }, [project]);

  useEffect(() => {
    if (!project || (busy !== "run" && !campaign?.isRunning)) return;
    const timer = window.setInterval(() => { void reload().catch(() => undefined); }, 1_200);
    return () => window.clearInterval(timer);
  }, [project, busy, campaign?.isRunning, reload]);

  const toggle = async (): Promise<void> => {
    if (!project || !campaign) return;
    setBusy("toggle"); setError(null);
    try { setCampaign(await window.devbox.setEvolutionEnabled(project.id, !campaign.enabled)); }
    catch (caught) { setError(failure(caught)); }
    finally { setBusy(null); }
  };
  const run = async (): Promise<void> => {
    if (!project || campaign?.isRunning) return;
    setBusy("run"); setError(null);
    try { setCampaign(await window.devbox.runEvolutionCycle(project.id)); }
    catch (caught) { setError(failure(caught)); await reload().catch(() => undefined); }
    finally { setBusy(null); }
  };
  const cancel = async (): Promise<void> => {
    if (!project) return;
    setBusy("cancel"); setError(null);
    try { setCampaign(await window.devbox.cancelEvolutionCycle(project.id)); }
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
  const saveRouting = async (): Promise<void> => {
    if (!project || !routing) return;
    setBusy("route"); setError(null);
    try { setCampaign(await window.devbox.setEvolutionRouting(project.id, routing)); }
    catch (caught) { setError(failure(caught)); }
    finally { setBusy(null); }
  };

  const shownTasks = campaign ? campaign.tasks.slice(-visibleTasks).reverse() : [];
  const activity = activityHistory;
  const active = campaign?.runtime;
  const selectedCatalogModel = routing && modelCatalog?.provider === routing.provider ? modelCatalog.items.find((item) => item.id === routing.model) : undefined;
  const advertisedReasoning = selectedCatalogModel?.supportedReasoningEfforts ?? [];
  const defaultReasoning: EvolutionRouting["reasoningEffort"][] = ["none", "minimal", "low", "medium", "high", "xhigh"];
  const reasoningOptions = Array.from(new Set<EvolutionRouting["reasoningEffort"]>([...(advertisedReasoning.length ? advertisedReasoning : defaultReasoning), ...(routing ? [routing.reasoningEffort] : [])]));
  const reasoningLabels: Record<EvolutionRouting["reasoningEffort"], string> = { none: "Kapalı / provider varsayılanı", minimal: "Minimal", low: "Düşük", medium: "Orta", high: "Yüksek", xhigh: "Çok yüksek", max: "Maksimum (legacy)" };
  const routeLabel = campaign?.routing.mode === "LOCKED"
    ? `${campaign.routing.provider === "codex" ? "Codex" : "Hermes/NVIDIA"} · ${campaign.routing.model} · kilitli`
    : `${campaign?.routing.provider === "codex" ? "Codex" : "Hermes/NVIDIA"} · ${campaign?.routing.model ?? "—"}${campaign?.routing.allowFallback ? " → uyumlu fallback" : ""}`;
  const adaptiveMode = Boolean(campaign && campaign.spec.remainingCount === 0);
  const adaptiveActive = Boolean(campaign?.runtime.activeSpecTaskId?.startsWith("ADAPT-"));
  const phaseProgressLabel = campaign?.spec.currentPhaseId
    ? `${campaign.spec.currentPhaseId}/22 · G${campaign.spec.currentTaskIndex ?? "—"}/${campaign.spec.currentPhaseTaskCount ?? "—"} · ${evolutionStageLabel(campaign.runtime.stage)}`
    : adaptiveMode ? adaptiveActive ? `22/22 çekirdek PASS · ${campaign?.runtime.activeSpecTaskId}` : "22/22 çekirdek PASS · adaptif bakım hazır" : "22/22 Faz tamamlandı";
  const recoveryRequired = campaign?.runtime.stage === "RECOVERY_REQUIRED" || campaign?.spec.currentGateState === "RECOVERY_REQUIRED";
  const externalBlocked = campaign?.runtime.stage === "BLOCKED_EXTERNAL" || campaign?.spec.currentGateState === "BLOCKED_EXTERNAL";
  const runLabel = recoveryRequired ? "Kurtarmayı yeniden dene" : externalBlocked ? "Engeli yeniden dene" : "Şimdi çalıştır";

  return <section className="advanced-page">
    <div className="advanced-heading evolution-heading"><div><span className="advanced-eyebrow">KALICI GELİŞİM KONTROL DÜZLEMİ · ADAPTİF</span><h1>DevBox API gelişimi</h1><p><strong>geliştirme.md</strong> içindeki 22 faz / 3362 atomik çekirdek görevi önce kanıtlı biçimde uygular. Çekirdek plan bittiğinde sistem durmaz; <strong>adaptif bakım döngüsü</strong> repo, test ve runtime kanıtını yeniden inceleyerek kalite, performans, UX, güvenlik, eşzamanlılık, API ve supply-chain alanlarında yeni somut görev üretir. <strong>Simülasyon, demo, fake, sahte, placeholder, no-op ve uydurma kanıt yasaktır.</strong> Recoverable hata aynı görevi FIX → RETEST backoff döngüsünde tutar; yalnız gerçek harici engel, veri kaybı riski taşıyan recovery veya Durdur akışı keser. Kalıcı Git commit + bağımsız verify olmadan PASS yoktur.</p></div><div className="advanced-actions"><button onClick={() => { setBusy("reload"); void reload().catch((caught) => setError(failure(caught))).finally(() => setBusy(null)); }} disabled={!project || busy === "reload"}><RefreshCw className={busy === "reload" ? "spin" : ""} size={14} /> Yenile</button>{campaign?.isRunning || busy === "run" ? <button className="danger-action" onClick={() => void cancel()} disabled={busy === "cancel"}><CircleStop size={14} /> {busy === "cancel" ? "Durduruluyor" : "Durdur"}</button> : <button className={recoveryRequired ? "recovery-action" : "primary"} onClick={() => void run()} disabled={!project || Boolean(busy)}>{recoveryRequired ? <RefreshCw size={14} /> : <Play size={14} />} {runLabel}</button>}</div></div>
    {!project ? <EmptyProject /> : !campaign ? <div className="advanced-empty"><LoaderCircle className="spin" size={24} />Gerçek kampanya durumu yükleniyor…</div> : <>
      {(recoveryRequired || externalBlocked) && <div className={`evolution-recovery-banner ${recoveryRequired ? "recovery" : "blocked"}`}><ShieldCheck size={18} /><div><strong>{recoveryRequired ? "Otomatik ilerleme fail-closed durdu" : "Harici engel nedeniyle ilerleme durdu"}</strong><p>{campaign.runtime.waitingReason ?? campaign.lastError ?? campaign.runtime.detail}</p><small>{recoveryRequired ? "Kör otomatik tekrar yapılmaz. Yukarıdaki kurtarma düğmesi tek bir manuel reconcile/retry çevrimi çalıştırır; gerçek mutasyon + verify + commit olmadan PASS verilmez." : "Engel giderildiyse yukarıdaki manuel yeniden deneme düğmesini kullanın."}</small></div></div>}
      <div className="evolution-summary">
        <div className="evolution-score"><strong>{campaign.lifetimeLevel}</strong><span>kalıcı gelişim seviyesi</span><small>{campaign.spec.passCount.toLocaleString("tr-TR")} / {campaign.spec.totalTaskCount.toLocaleString("tr-TR")} atomik görev kanıtlı PASS</small></div>
        <dl><div><dt>Model rotası</dt><dd title={routeLabel}>{routeLabel}</dd></div><div><dt>Çalışma durumu</dt><dd title={campaign.runtime.stage}>{evolutionStageLabel(campaign.runtime.stage)}</dd></div><div><dt>Aktif görev</dt><dd>{campaign.runtime.activeSpecTaskId ?? "—"}</dd></div><div><dt>Faz</dt><dd>{campaign.runtime.activePhaseId ?? "—"}</dd></div><div><dt>Kalan görev</dt><dd>{campaign.spec.remainingCount.toLocaleString("tr-TR")}</dd></div><div><dt>Başarılı / hatalı</dt><dd>{campaign.completedCycles} / {campaign.failedCycles}</dd></div><div><dt>Son sağlayıcı</dt><dd>{campaign.lastProvider ? `${campaign.lastProvider} · ${campaign.lastModel ?? "model yok"}` : "Henüz yok"}</dd></div><div><dt>Durable job</dt><dd title={campaign.runtime.durableJobId ?? undefined}>{campaign.runtime.durableJobId ?? "—"}</dd></div><div><dt>Son çevrim</dt><dd>{readableDate(campaign.lastCycleAt)}</dd></div></dl>
        <label className="evolution-toggle"><span><strong>Durdurulana kadar otomatik atomik görev uygula</strong><small>Bir görev kanıtlı PASS olunca sıradaki otomatik başlar · managed-source hatasında doğrulanmış rollback + backoff · aynı anda tek çevrim · SQLite durable job + heartbeat.</small></span><button className={`automation-toggle ${campaign.enabled ? "on" : ""}`} onClick={() => void toggle()} disabled={busy === "toggle"} aria-label={`API gelişim döngüsünü ${campaign.enabled ? "kapat" : "aç"}`}><i /></button></label>
      </div>

      {adaptiveMode && <section className={`evolution-adaptive-mode ${adaptiveActive ? "active" : ""}`}><div className="adaptive-orbit" aria-hidden="true"><i /><i /></div><div><span>ADAPTİF SÜREKLİ BAKIM</span><strong>{adaptiveActive ? campaign.runtime.activeSpecTaskId : campaign.enabled ? "Yeni gerçek görev üretmeye hazır" : "Döngü durduruldu"}</strong><p>3362 çekirdek görevin tamamı PASS. Bundan sonraki görevler sırf sayaç artırmak için değil, mevcut ürün kanıtından yeni regresyon, gecikme, kaynak tüketimi, UX, güvenlik veya mimari eksik bularak üretilir. Aynı görev başarısızsa atlanmaz; düzeltilip yeniden test edilir.</p></div><Status value={campaign.enabled ? campaign.runtime.stage : "IDLE"} /></section>}

      <section className="evolution-phase-control" aria-label="22 Faz gerçek ilerleme durumu">
        <header><div><span className="phase-pulse" /><strong>{phaseProgressLabel}</strong></div><span>{campaign.spec.currentPhaseTitle ?? "Bütün Faz gate'leri PASS"}</span></header>
        <div className="evolution-phase-grid">{campaign.spec.phaseSummaries.map((phase) => <article key={phase.phaseId} className={`phase-card ${phase.phaseId === campaign.spec.currentPhaseId ? "active" : ""}`} title={`${phase.title} · ${phase.passCount}/${phase.taskCount} PASS`}><div><strong>{phase.phaseId}</strong><Status value={phase.gateState} /></div><span>{phase.passCount}/{phase.taskCount}</span><small>{phase.gateState === "BLOCKED_EXTERNAL" ? `${phase.blockedCount} harici engel` : phase.gateState === "RECOVERY_REQUIRED" ? `${phase.recoveryCount} recovery` : phase.failedCount ? `${phase.failedCount} hata` : phase.title}</small><i><b style={{ width: `${phase.taskCount ? Math.round((phase.passCount / phase.taskCount) * 100) : 0}%` }} /></i></article>)}</div>
      </section>

      <section className={`evolution-live ${campaign.isRunning ? "running" : ""}`} aria-live="polite"><header><div><span className="live-dot" /><strong>Canlı çalışma</strong><Status value={campaign.runtime.stage} /></div><small>{readableDate(campaign.runtime.updatedAt)}</small></header><h3>{campaign.runtime.detail}</h3><dl><div><dt>Şu an</dt><dd title={campaign.runtime.stage}>{evolutionStageLabel(campaign.runtime.stage)}</dd></div><div><dt>Sağlayıcı / model</dt><dd>{campaign.runtime.provider ? `${campaign.runtime.provider} · ${campaign.runtime.model ?? "—"}` : "Henüz provider seçilmedi"}</dd></div><div><dt>Bekliyor</dt><dd>{campaign.runtime.waitingReason ?? "Hayır"}</dd></div><div><dt>Çalışma alanı</dt><dd title={campaign.runtime.worktreePath ?? undefined}>{campaign.runtime.worktreePath ?? "—"}</dd></div></dl></section>

      <section className="evolution-section routing-editor"><div className="panel-title"><div><h2>Manuel model ve rota</h2><span>Codex modeli app-server <code>model/list</code> kataloğundan keşfedilir. LOCKED router değişikliğini kapatır; katalog bulunamazsa manuel model ID yazımı çalışmaya devam eder.</span></div><div className="routing-actions"><button onClick={() => { if (!project || !routing) return; setCatalogBusy(true); void window.devbox.getEvolutionModelCatalog(project.id, routing.provider).then(setModelCatalog).catch((caught) => setModelCatalog({ provider: routing.provider, state: "FAILED", detail: failure(caught), items: [], checkedAt: new Date().toISOString() })).finally(() => setCatalogBusy(false)); }} disabled={!routing || catalogBusy}><RefreshCw className={catalogBusy ? "spin" : ""} size={14} /> Model listesi</button><button className="primary" onClick={() => void saveRouting()} disabled={!routing || Boolean(campaign.isRunning) || busy === "route"}>{busy === "route" ? <LoaderCircle className="spin" size={14} /> : <Check size={14} />} Uygula</button></div></div>{routing && <><div className="routing-grid"><label><span>Mod</span><select value={routing.mode} onChange={(event) => setRouting({ ...routing, mode: event.target.value as EvolutionRouting["mode"], allowFallback: event.target.value === "LOCKED" ? false : routing.allowFallback })}><option value="AUTO">Otomatik rota</option><option value="LOCKED">Modeli kilitle</option></select></label><label><span>Sağlayıcı</span><select value={routing.provider} onChange={(event) => setRouting({ ...routing, provider: event.target.value as EvolutionRouting["provider"], model: event.target.value === "codex" ? "gpt-5.6-sol" : "nvidia/nemotron-3-super-120b-a12b", reasoningEffort: event.target.value === "codex" ? "high" : "none" })}><option value="codex">OpenAI Codex CLI</option><option value="hermes-nvidia">Hermes / NVIDIA NIM</option></select></label><label className="model-input"><span>Model</span><input list="devbox-evolution-models" value={routing.model} onChange={(event) => setRouting({ ...routing, model: event.target.value })} /><datalist id="devbox-evolution-models">{modelCatalog?.provider === routing.provider && modelCatalog.items.map((item) => <option key={item.id} value={item.id}>{item.displayName}</option>)}</datalist></label><label><span>Muhakeme</span><select value={routing.reasoningEffort} disabled={routing.provider === "hermes-nvidia"} onChange={(event) => setRouting({ ...routing, reasoningEffort: event.target.value as EvolutionRouting["reasoningEffort"] })}>{reasoningOptions.map((effort) => <option key={effort} value={effort}>{reasoningLabels[effort]}</option>)}</select></label><label className="fallback-check"><input type="checkbox" checked={routing.allowFallback} disabled={routing.mode === "LOCKED"} onChange={(event) => setRouting({ ...routing, allowFallback: event.target.checked })} /><span>Uyumlu fallback kullan</span></label></div><div className="model-catalog-state"><div><Status value={catalogBusy ? "VERIFYING" : modelCatalog?.state ?? "UNAVAILABLE"} /><strong>{catalogBusy ? "Model kataloğu sorgulanıyor" : `${modelCatalog?.items.length ?? 0} model keşfedildi`}</strong></div><span>{modelCatalog?.detail ?? "Provider kataloğu henüz sorgulanmadı."}{modelCatalog?.checkedAt ? ` · ${readableDate(modelCatalog.checkedAt)}` : ""}</span></div></>}</section>

      <div className="truth-notice"><ShieldCheck size={17} /><p><strong>“Şimdi çalıştır” Durdurulana kadar çekirdek + adaptif sürekli gerçek uygulama başlatır.</strong> Codex workspace-write önce host dosya probuyla doğrulanır. Windows yazma sandbox'ı gerçek probu geçmezse DevBox Codex'i read-only kullanır, üretilen unified patch'i <code>git apply --check</code> sonrasında kendi path-sınırlı patch motoruyla uygular. Ardından <code>git diff --check</code> ve projenin en güçlü <code>verify</code> kapısı gerçek süreç olarak çalışır; <code>verify</code> yoksa <code>typecheck</code> + <code>test</code> + <code>build</code> uygulanır. Mutasyon veya kanıt yoksa PASS yok.</p></div>

      <div className="evolution-metrics"><article><span>Spec toplamı</span><strong>{campaign.spec.totalTaskCount.toLocaleString("tr-TR")}</strong></article><article><span>PASS</span><strong>{campaign.spec.passCount.toLocaleString("tr-TR")}</strong></article><article><span>FAILED</span><strong>{campaign.spec.failedCount.toLocaleString("tr-TR")}</strong></article><article><span>BLOCKED</span><strong>{campaign.spec.blockedCount.toLocaleString("tr-TR")}</strong></article><article><span>RECOVERY</span><strong>{campaign.spec.recoveryCount.toLocaleString("tr-TR")}</strong></article><article><span>Kalan</span><strong>{campaign.spec.remainingCount.toLocaleString("tr-TR")}</strong></article></div>

      <section className="evolution-section"><div className="panel-title"><div><h2>Canlı işlem günlüğü</h2><span>SQLite kalıcı event store + canlı typed runtime eventleri · en yeni 120 kayıt</span></div><Status value={campaign.isRunning ? "RUNNING" : campaign.runtime.stage} /></div>{activity.length === 0 ? <div className="advanced-empty compact"><Activity size={22} /><strong>Henüz runtime olayı yok</strong><span>“Şimdi çalıştır” sonrası provider, model, sandbox/probe, patch, komut, test, bekleme ve hata adımları burada görünür.</span></div> : <div className="evolution-activity-list">{activity.map((item) => <article key={item.id}><span className={`activity-kind ${item.kind}`} /><div><strong title={item.stage}>{evolutionStageLabel(item.stage)}</strong><p>{item.message}</p><small>{item.provider ? `${item.provider}${item.model ? ` · ${item.model}` : ""} · ` : ""}{readableDate(item.createdAt)}</small></div></article>)}</div>}</section>

      <section className="evolution-section"><div className="panel-title"><div><h2>geliştirme.md uygulama kuyruğu</h2><span>{campaign.spec.phaseCount} Faz · {campaign.spec.totalTaskCount.toLocaleString("tr-TR")} atomik görev · kaynak SHA-256 {campaign.spec.sourceSha256.slice(0, 16)}…</span></div><Status value={campaign.spec.remainingCount === 0 ? "COMPLETED" : campaign.isRunning ? "RUNNING" : "LOADED"} /></div><div className="advanced-list evolution-list" tabIndex={0}>{campaign.spec.queuePreview.slice(0, 40).map((item) => <article key={item.taskId}><div className="list-icon">{item.state === "RUNNING" ? <LoaderCircle className="spin" size={16} /> : <Activity size={16} />}</div><div><strong>{item.taskId} · {item.title}</strong><span>{item.phaseId}{item.sourceLine ? ` · geliştirme.md:${item.sourceLine}` : ""}</span><small>Spec state: {item.state} · deneme {item.attempts}{item.requirementCount ? ` · ${item.requirementCount} req` : ""}{item.testCount ? ` · ${item.testCount} test` : ""}{item.failureTestCount ? ` · ${item.failureTestCount} failure test` : ""}{item.blockReason ? ` · ENGEL: ${item.blockReason}` : item.lastError ? ` · ${item.lastError}` : ""}</small></div><Status value={item.state} /></article>)}</div></section>

      <section className="evolution-section directive-editor"><div className="panel-title"><div><h2>Kalıcı gelişim yönergesi</h2><span>Her atomik göreve eklenir · {directive.length.toLocaleString("tr-TR")} karakter</span></div><div><button onClick={() => void window.devbox.copyText(directive)} disabled={!directive.trim()}><Copy size={14} /> Kopyala</button><button className="primary" onClick={() => void saveDirective()} disabled={Boolean(campaign.isRunning) || busy === "save" || directive.trim().length < 80 || directive === campaign.directive}>{busy === "save" ? <LoaderCircle className="spin" size={14} /> : <Check size={14} />} Kaydet</button></div></div><textarea value={directive} onChange={(event) => setDirective(event.target.value)} minLength={80} maxLength={64_000} spellCheck aria-label="DevBox API kalıcı gelişim yönergesi" /></section>

      <section className="evolution-section"><div className="panel-title"><div><h2>Gerçek yürütme geçmişi</h2><span>{campaign.tasks.length} kalıcı execution kaydı · en yeni {shownTasks.length}</span></div></div><div className="advanced-list evolution-list" tabIndex={0}>{shownTasks.map((item) => <article key={item.id}><div className="list-icon">{item.state === "SUCCEEDED" ? <Check size={16} /> : ["RUNNING", "PREPARING", "VERIFYING", "REVIEWING"].includes(item.state) ? <LoaderCircle className="spin" size={16} /> : <Activity size={16} />}</div><div><strong>{item.title}</strong><span>{item.provider ?? "sağlayıcı bekliyor"}{item.model ? ` · ${item.model}` : ""}</span><small>{`Deneme ${item.attempts} · `}{item.blockReason ? `ENGEL: ${item.blockReason}` : item.error ?? (item.evidence.length ? item.evidence.join(" · ") : "Henüz kanıt yok")}{item.retryAfterAt ? ` · retry ${readableDate(item.retryAfterAt)}` : ""}</small></div><Status value={item.state} /></article>)}</div>{visibleTasks < campaign.tasks.length && <button className="load-more-tasks" onClick={() => setVisibleTasks((current) => Math.min(campaign.tasks.length, current + 24))}>24 eski kaydı daha göster · {campaign.tasks.length - visibleTasks} kayıt kaldı</button>}</section>
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
  const [debugExecutable, setDebugExecutable] = useState("devbox:javascript");
  const [debugArguments, setDebugArguments] = useState("[]");
  const [debugRequest, setDebugRequest] = useState<"launch" | "attach">("launch");
  const [debugConfiguration, setDebugConfiguration] = useState('{\n  "type": "pwa-node",\n  "name": "DevBox JavaScript",\n  "program": "",\n  "cwd": "",\n  "stopOnEntry": true,\n  "console": "internalConsole"\n}');
  const [debugSession, setDebugSession] = useState<DebugSession | null>(null);
  const [debugResponse, setDebugResponse] = useState<DebugResponse | null>(null);
  const [debugThreadId, setDebugThreadId] = useState("1");
  const [debugFrameId, setDebugFrameId] = useState("0");
  const [debugVariablesReference, setDebugVariablesReference] = useState("0");
  const [breakpointSource, setBreakpointSource] = useState("");
  const [breakpointLines, setBreakpointLines] = useState("");
  const [debugThreads, setDebugThreads] = useState<DapThreadView[]>([]);
  const [debugStack, setDebugStack] = useState<DapStackFrameView[]>([]);
  const [debugScopes, setDebugScopes] = useState<DapScopeView[]>([]);
  const [debugVariables, setDebugVariables] = useState<DapVariableView[]>([]);
  const [remoteWorkers, setRemoteWorkers] = useState<RemoteWorker[]>([]);
  const [remoteJobs, setRemoteJobs] = useState<DurableJobSummary[]>([]);
  const [workerPairing, setWorkerPairing] = useState<WorkerPairing | null>(null);
  const [remoteJobPayload, setRemoteJobPayload] = useState('{"command":"node","args":["--version"],"cwd":"."}');
  const [workerNotice, setWorkerNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    const [integrationItems, workerItems, jobItems] = await Promise.all([window.devbox.inspectIntegrations(project?.id), window.devbox.listRemoteWorkers(), window.devbox.listRemoteJobs()]);
    setStatuses(integrationItems); setRemoteWorkers(workerItems); setRemoteJobs(jobItems);
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
  const applyDebugResponse = (command: string, response: DebugResponse): void => {
    const body = debugBody(response);
    if (command === "threads") {
      const threads = Array.isArray(body.threads) ? body.threads.flatMap((candidate: unknown): DapThreadView[] => {
        if (!candidate || typeof candidate !== "object") return [];
        const item = candidate as Record<string, unknown>;
        return typeof item.id === "number" && typeof item.name === "string" ? [{ id: item.id, name: item.name }] : [];
      }) : [];
      setDebugThreads(threads);
      if (threads[0]) setDebugThreadId(String(threads[0].id));
    }
    if (command === "stackTrace") {
      const frames = Array.isArray(body.stackFrames) ? body.stackFrames.flatMap((candidate: unknown): DapStackFrameView[] => {
        if (!candidate || typeof candidate !== "object") return [];
        const item = candidate as Record<string, unknown>;
        if (typeof item.id !== "number" || typeof item.name !== "string") return [];
        const source = item.source && typeof item.source === "object" && !Array.isArray(item.source) ? item.source as Record<string, unknown> : {};
        return [{
          id: item.id,
          name: item.name,
          line: typeof item.line === "number" ? item.line : null,
          column: typeof item.column === "number" ? item.column : null,
          sourceName: typeof source.name === "string" ? source.name : null,
          sourcePath: typeof source.path === "string" ? source.path : null
        }];
      }) : [];
      setDebugStack(frames);
      if (frames[0]) setDebugFrameId(String(frames[0].id));
    }
    if (command === "scopes") {
      const scopes = Array.isArray(body.scopes) ? body.scopes.flatMap((candidate: unknown): DapScopeView[] => {
        if (!candidate || typeof candidate !== "object") return [];
        const item = candidate as Record<string, unknown>;
        return typeof item.name === "string" && typeof item.variablesReference === "number"
          ? [{ name: item.name, variablesReference: item.variablesReference, expensive: item.expensive === true }]
          : [];
      }) : [];
      setDebugScopes(scopes);
      if (scopes[0]) setDebugVariablesReference(String(scopes[0].variablesReference));
    }
    if (command === "variables") {
      const variables = Array.isArray(body.variables) ? body.variables.flatMap((candidate: unknown): DapVariableView[] => {
        if (!candidate || typeof candidate !== "object") return [];
        const item = candidate as Record<string, unknown>;
        return typeof item.name === "string" && typeof item.value === "string"
          ? [{ name: item.name, value: item.value, type: typeof item.type === "string" ? item.type : null, variablesReference: typeof item.variablesReference === "number" ? item.variablesReference : 0 }]
          : [];
      }) : [];
      setDebugVariables(variables);
    }
  };
  const resetDebugInspector = (): void => {
    setDebugThreads([]); setDebugStack([]); setDebugScopes([]); setDebugVariables([]);
    setDebugThreadId("1"); setDebugFrameId("0"); setDebugVariablesReference("0");
  };
  const startDebugger = async (): Promise<void> => {
    if (!project || !debugExecutable.trim()) return;
    setBusy("debug-start"); setError(null);
    try {
      const args = JSON.parse(debugArguments) as unknown;
      const configuration = JSON.parse(debugConfiguration) as unknown;
      if (!Array.isArray(args) || args.some((value) => typeof value !== "string")) throw new Error("Adapter argümanları JSON string dizisi olmalıdır.");
      if (!configuration || typeof configuration !== "object" || Array.isArray(configuration)) throw new Error("Hata ayıklayıcı yapılandırması bir JSON nesnesi olmalıdır.");
      resetDebugInspector();
      const started = await window.devbox.startDebugSession(project.id, debugExecutable.trim(), args, debugRequest, configuration as Record<string, unknown>);
      setDebugSession(started); setDebugResponse(null);
      try {
        const threads = await window.devbox.runDebugCommand(started.id, "threads", {});
        setDebugSession(threads.session); setDebugResponse(threads); applyDebugResponse("threads", threads);
      } catch (caught) {
        setError(`Oturum başlatıldı; iş parçacıkları henüz alınamadı: ${failure(caught)}`);
      }
    } catch (caught) { setError(failure(caught)); }
    finally { setBusy(null); }
  };
  const debugCommand = async (command: Parameters<typeof window.devbox.runDebugCommand>[1], args: Record<string, unknown> = {}): Promise<void> => {
    if (!debugSession) return;
    setBusy(`debug-${command}`); setError(null);
    try {
      const response = await window.devbox.runDebugCommand(debugSession.id, command, args);
      setDebugSession(response.session); setDebugResponse(response); applyDebugResponse(command, response);
    } catch (caught) { setError(failure(caught)); }
    finally { setBusy(null); }
  };
  const stopDebugger = async (): Promise<void> => {
    if (!debugSession) return;
    setBusy("debug-stop");
    try { await window.devbox.stopDebugSession(debugSession.id); setDebugSession(null); setDebugResponse(null); resetDebugInspector(); }
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
      setRemoteJobs(await window.devbox.listRemoteJobs());
    } catch (caught) { setError(failure(caught)); }
    finally { setBusy(null); }
  };
  const inspectDebugThread = async (threadId: number): Promise<void> => {
    setDebugThreadId(String(threadId));
    setDebugStack([]); setDebugScopes([]); setDebugVariables([]);
    await debugCommand("stackTrace", { threadId });
  };
  const inspectDebugFrame = async (frameId: number): Promise<void> => {
    setDebugFrameId(String(frameId));
    setDebugScopes([]); setDebugVariables([]);
    await debugCommand("scopes", { frameId });
  };
  const inspectDebugVariables = async (variablesReference: number): Promise<void> => {
    setDebugVariablesReference(String(variablesReference));
    setDebugVariables([]);
    await debugCommand("variables", { variablesReference });
  };
  const useBuiltInJavaScriptDebugger = (): void => {
    setDebugExecutable("devbox:javascript");
    setDebugArguments("[]");
    setDebugRequest("launch");
    setDebugConfiguration('{\n  "type": "pwa-node",\n  "name": "DevBox JavaScript",\n  "program": "",\n  "cwd": "",\n  "stopOnEntry": true,\n  "console": "internalConsole"\n}');
    setError(null);
  };
  const cancelRemoteJob = async (jobId: string): Promise<void> => {
    setBusy(`worker-job-cancel-${jobId}`); setError(null); setWorkerNotice(null);
    try {
      const job = await window.devbox.cancelRemoteJob(jobId);
      setWorkerNotice(job.state === "CANCELLED" ? "Kuyruktaki uzak görev iptal edildi." : "İptal isteği çalışan uzak workera gönderildi.");
      setRemoteJobs(await window.devbox.listRemoteJobs());
    } catch (caught) { setError(failure(caught)); }
    finally { setBusy(null); }
  };
  const visibleStatuses = scope === "github" ? statuses.filter((status) => status.kind === "github") : statuses;
  return <section className="advanced-page">
    <div className="advanced-heading"><div><span className="advanced-eyebrow">{scope === "github" ? "GITHUB WORKFLOW" : "TOOLS & SERVICES"}</span><h1>{scope === "github" ? "GitHub pull request’leri" : "Eklentiler ve entegrasyonlar"}</h1><p>{scope === "github" ? "PR, issue, check, CI çalışması ve release işlemleri gerçek gh CLI oturumu ve seçili Git deposu üzerinden yürütülür." : "GitHub, Vercel, SSH, LSP/DAP, imzalı toolkit ve yayın kapılarının gerçek çalışma zamanı durumu."}</p></div><button onClick={() => void reload()} disabled={Boolean(busy)}><RefreshCw className={busy === "inspect" ? "spin" : ""} size={14} /> Yeniden denetle</button></div>
    <div className="integration-grid">{visibleStatuses.map((status) => <article key={status.kind}><div className="integration-title"><span>{status.kind === "github" ? <GitBranch size={17} /> : status.kind === "vercel" ? <Globe2 size={17} /> : <ShieldCheck size={17} />}</span><div><strong>{status.kind.toLocaleUpperCase("tr-TR")}</strong><small>{status.version ?? "sürüm yok"}{status.account ? ` · ${status.account}` : ""}</small></div><Status value={status.state} /></div><p>{status.detail}</p><footer>{status.commands.join(" · ")}</footer></article>)}</div>
    {scope === "all" && <section className="integration-console platform-console"><div className="console-controls"><label><span>Yerel hedef · SSH için host:port, paket için kind/id</span><input value={platformTarget} onChange={(event) => setPlatformTarget(event.target.value)} placeholder="örn. server.example:22 veya plugin/devbox.toolkit" /></label><div><button onClick={() => void platform("protocol-discover")}><Activity size={14} /> LSP/DAP keşfet</button><button onClick={() => void platform("ssh-audit")}><ShieldCheck size={14} /> SSH pinlerini denetle</button><button onClick={() => void platform("ssh-pin")} disabled={!platformTarget.trim()}><ShieldCheck size={14} /> SSH anahtarı sabitle</button><button onClick={() => void platform("package-list")}><Activity size={14} /> Paket envanteri</button><button onClick={() => void platform("package-install")}><Upload size={14} /> İmzalı paket kur</button><button onClick={() => void platform("package-repair")} disabled={!/^(plugin|mcp|toolkit|update)\/[a-z0-9][a-z0-9._-]{1,127}$/u.test(platformTarget)}><RefreshCw size={14} /> Paketi onar</button><button onClick={() => void platform("package-rollback")} disabled={!/^(plugin|mcp|toolkit|update)\/[a-z0-9][a-z0-9._-]{1,127}$/u.test(platformTarget)}><RefreshCw size={14} /> Paketi geri al</button></div></div></section>}
    {scope === "all" && <section className="integration-console remote-worker-console"><div className="panel-title"><div><h2>Dayanıklı uzak çalışanlar</h2><span>Tek kullanımlık eşleştirme, iptal edilebilir kimlik, Windows ACL ile korunan token, 45 saniyelik lease, heartbeat iptali, süreç ağacı sonlandırma ve en fazla 60 dakikalık görev süresi.</span></div><button onClick={() => void createWorkerPairing()} disabled={Boolean(busy)}><ShieldCheck size={14} /> Eşleştirme kodu</button></div>{workerPairing && <div className="worker-pairing"><strong>{workerPairing.code}</strong><span>{new Date(workerPairing.expiresAt).toLocaleString("tr-TR")} tarihine kadar bir kez kullanılabilir.</span><code>{`ssh -N -L 43110:127.0.0.1:${new URL(workerPairing.endpoint).port} <kullanıcı>@<devbox-makinesi>`}</code><code>{`$env:DEVBOX_URL='http://127.0.0.1:43110'; $env:DEVBOX_PAIRING_CODE='${workerPairing.code}'; $env:DEVBOX_WORKER_ROOT='<proje-kökü>'; node scripts/remote-worker.mjs`}</code><button onClick={() => void window.devbox.copyText(workerPairing.code)}><Copy size={13} /> Kodu kopyala</button></div>}<div className="worker-list">{remoteWorkers.length === 0 ? <span>Eşleştirilmiş uzak çalışan yok.</span> : remoteWorkers.map((worker) => <article key={worker.id}><div><strong>{worker.name}</strong><small>{worker.id} · {new Date(worker.lastSeenAt).toLocaleString("tr-TR")}</small><small>{worker.capabilities.join(" · ") || "Bildirilen yetenek yok"}</small></div><Status value={worker.status} />{worker.status !== "REVOKED" && <button className="danger" onClick={() => void revokeWorker(worker.id)}><CircleStop size={13} /> Yetkiyi kaldır</button>}</article>)}</div><label className="remote-job"><span>Uzak komut görevi · timeoutMs verilmezse 15 dakika, üst sınır 60 dakika</span><textarea value={remoteJobPayload} onChange={(event) => setRemoteJobPayload(event.target.value)} /><button onClick={() => void enqueueRemoteJob()} disabled={remoteWorkers.every((worker) => worker.status === "REVOKED") || Boolean(busy)}><Upload size={14} /> Kuyruğa al</button></label><div className="remote-job-list"><header><strong>Kalıcı uzak görev geçmişi</strong><span>{remoteJobs.length} kayıt</span></header>{remoteJobs.length === 0 ? <span>Henüz uzak görev yok.</span> : remoteJobs.map((job) => <article key={job.id}><div><strong>{job.kind.replace(/^remote:/u, "")}</strong><small>{job.id} · {readableDate(job.updatedAt)} · deneme {job.attempt}</small></div><Status value={job.state} />{["QUEUED", "LEASED", "RUNNING"].includes(job.state) && <button className="danger" onClick={() => void cancelRemoteJob(job.id)} disabled={Boolean(busy)}><CircleStop size={13} /> İptal et</button>}</article>)}</div>{workerNotice && <div className="inline-success">{workerNotice}</div>}</section>}
    {scope === "all" && <section className="integration-console debugger-console">
      <div className="panel-title"><div><h2>Gerçek DAP hata ayıklayıcı</h2><span>Microsoft vscode-js-debug 1.117.0 yerleşik ve SHA-256 ile sabitlenmiştir. Harici DAP adaptörleri de açık yürütülebilir yoluyla kullanılabilir.</span></div><Status value={debugSession?.state ?? (debugExecutable === "devbox:javascript" ? "CONFIGURED" : "UNAVAILABLE")} /></div>
      <div className="debug-presets"><button onClick={useBuiltInJavaScriptDebugger} disabled={Boolean(debugSession)}><ShieldCheck size={14} /> Yerleşik JavaScript / Node.js</button><span>Program ve çalışma dizini proje kökünün dışına çıkamaz. Boş <code>cwd</code> seçili proje kökünü kullanır.</span></div>
      <div className="debugger-grid">
        <label><span>İstek</span><select value={debugRequest} onChange={(event) => setDebugRequest(event.target.value as "launch" | "attach")} disabled={Boolean(debugSession)}><option value="launch">Yeni süreci başlat</option><option value="attach">Çalışan sürece bağlan</option></select></label>
        <label><span>Adaptör · <code>devbox:javascript</code> veya gerçek yürütülebilir yol</span><input value={debugExecutable} onChange={(event) => setDebugExecutable(event.target.value)} placeholder="C:\\tools\\codelldb.exe" disabled={Boolean(debugSession)} /></label>
        <label><span>Adaptör argümanları · JSON dizisi</span><input value={debugArguments} onChange={(event) => setDebugArguments(event.target.value)} disabled={Boolean(debugSession) || debugExecutable === "devbox:javascript"} /></label>
        <label className="debug-config"><span>Başlatma / bağlanma yapılandırması · <code>program</code> proje köküne göre göreli olabilir</span><textarea value={debugConfiguration} onChange={(event) => setDebugConfiguration(event.target.value)} disabled={Boolean(debugSession)} /></label>
      </div>
      {debugSession && <div className="debugger-grid debugger-references"><label><span>İş parçacığı kimliği</span><input value={debugThreadId} onChange={(event) => setDebugThreadId(event.target.value)} inputMode="numeric" /></label><label><span>Çerçeve kimliği</span><input value={debugFrameId} onChange={(event) => setDebugFrameId(event.target.value)} inputMode="numeric" /></label><label><span>Değişken başvurusu</span><input value={debugVariablesReference} onChange={(event) => setDebugVariablesReference(event.target.value)} inputMode="numeric" /></label><label><span>Kesme noktası kaynak yolu</span><input value={breakpointSource} onChange={(event) => setBreakpointSource(event.target.value)} placeholder="C:\\project\\src\\main.ts" /></label><label><span>Kesme noktası satırları</span><input value={breakpointLines} onChange={(event) => setBreakpointLines(event.target.value)} placeholder="12, 24, 38" /></label></div>}
      <div className="debug-actions">{!debugSession ? <button className="primary" onClick={() => void startDebugger()} disabled={!project || !debugExecutable.trim() || Boolean(busy)}><Play size={14} /> Gerçek oturumu başlat</button> : <><button onClick={() => void debugCommand("continue", { threadId: Number(debugThreadId) })}><Play size={14} /> Devam</button><button onClick={() => void debugCommand("pause", { threadId: Number(debugThreadId) })}><CircleStop size={14} /> Duraklat</button><button onClick={() => void debugCommand("next", { threadId: Number(debugThreadId) })}><ArrowUpRight size={14} /> Satır atla</button><button onClick={() => void debugCommand("stepIn", { threadId: Number(debugThreadId) })}><ArrowUpRight size={14} /> İçeri gir</button><button onClick={() => void debugCommand("stepOut", { threadId: Number(debugThreadId) })}><ArrowUpRight size={14} /> Dışarı çık</button><button onClick={() => void debugCommand("threads")}><Activity size={14} /> İş parçacıklarını yenile</button><button onClick={() => void debugCommand("setBreakpoints", { source: { path: breakpointSource }, breakpoints: breakpointLines.split(",").map((value) => Number(value.trim())).filter((value) => Number.isInteger(value) && value > 0).map((line) => ({ line })) })} disabled={!breakpointSource.trim() || !breakpointLines.trim()}><Activity size={14} /> Kesme noktalarını uygula</button><button className="danger" onClick={() => void stopDebugger()}><CircleStop size={14} /> Oturumu bitir</button></>}</div>
      {debugSession && <div className="debug-inspector-grid" aria-label="Hata ayıklayıcı denetçisi">
        <section><header><strong>İş parçacıkları</strong><span>{debugThreads.length}</span></header><div>{debugThreads.length === 0 ? <p>“İş parçacıklarını yenile” ile adaptörden alın.</p> : debugThreads.map((thread) => <button key={thread.id} className={String(thread.id) === debugThreadId ? "selected" : ""} onClick={() => void inspectDebugThread(thread.id)}><Activity size={13} /><span>{thread.name}</span><code>#{thread.id}</code></button>)}</div></section>
        <section><header><strong>Çağrı yığını</strong><span>{debugStack.length}</span></header><div>{debugStack.length === 0 ? <p>Bir iş parçacığı seçin.</p> : debugStack.map((frame) => <button key={frame.id} className={String(frame.id) === debugFrameId ? "selected" : ""} onClick={() => void inspectDebugFrame(frame.id)} title={frame.sourcePath ?? undefined}><span><strong>{frame.name}</strong><small>{frame.sourceName ?? "Kaynak yok"}{frame.line === null ? "" : `:${frame.line}:${frame.column ?? 1}`}</small></span><code>#{frame.id}</code></button>)}</div></section>
        <section><header><strong>Kapsamlar</strong><span>{debugScopes.length}</span></header><div>{debugScopes.length === 0 ? <p>Bir çağrı çerçevesi seçin.</p> : debugScopes.map((scopeItem) => <button key={`${scopeItem.name}-${scopeItem.variablesReference}`} className={String(scopeItem.variablesReference) === debugVariablesReference ? "selected" : ""} onClick={() => void inspectDebugVariables(scopeItem.variablesReference)}><span>{scopeItem.name}</span><small>{scopeItem.expensive ? "isteğe bağlı" : "hazır"}</small></button>)}</div></section>
        <section><header><strong>Değişkenler</strong><span>{debugVariables.length}</span></header><div>{debugVariables.length === 0 ? <p>Bir kapsam seçin.</p> : debugVariables.map((variable, index) => <button key={`${variable.name}-${index}`} disabled={variable.variablesReference <= 0} onClick={() => void inspectDebugVariables(variable.variablesReference)} title={variable.value}><span><strong>{variable.name}</strong><small>{variable.type ?? "tür bildirilmedi"}</small></span><code>{variable.value}</code></button>)}</div></section>
      </div>}
      {debugSession?.lastEvent && <div className="debug-last-event"><Activity size={13} /><span>Son adaptör olayı</span><code>{String(debugSession.lastEvent.event ?? debugSession.lastEvent.command ?? debugSession.lastEvent.type)}</code></div>}
      {debugResponse && <details className="debug-raw"><summary>Son ham DAP yanıtını göster</summary><pre className="debug-response">{JSON.stringify(debugResponse.body, null, 2)}</pre></details>}
    </section>}
    {project && <section className="integration-console"><div className="console-controls"><label><span>{scope === "github" ? "Hedef; PR/run numarası, issue başlığı veya release etiketi" : "Hedef; PR/run no, başlık, tag veya deployment URL"}</span><input value={target} onChange={(event) => setTarget(event.target.value)} placeholder={scope === "github" ? "örn. 42, hata başlığı veya v1.2.0" : "örn. 42, v1.2.0 veya deployment-url"} /></label><div><button onClick={() => void github("pr-list")}><GitBranch size={14} /> PR’lar</button><button onClick={() => void github("pr-create")} disabled={!target.trim()}><Upload size={14} /> PR oluştur</button><button onClick={() => void github("pr-merge")} disabled={!/^\d+$/u.test(target)}><Check size={14} /> PR birleştir</button><button onClick={() => void github("issue-list")}><GitBranch size={14} /> Issue’lar</button><button onClick={() => void github("issue-create")} disabled={!target.trim()}><Upload size={14} /> Issue oluştur</button><button onClick={() => void github("checks")}><Check size={14} /> Checks</button><button onClick={() => void github("run-list")}><Activity size={14} /> CI çalışmaları</button><button onClick={() => void github("run-log")} disabled={!/^\d+$/u.test(target)}><Activity size={14} /> CI logu</button><button onClick={() => void github("run-rerun")} disabled={!/^\d+$/u.test(target)}><RefreshCw size={14} /> CI tekrar</button><button onClick={() => void github("release-list")}><Upload size={14} /> Release’ler</button><button onClick={() => void github("release-create")} disabled={!target.trim()}><Upload size={14} /> Release oluştur</button>{scope === "all" && <><button onClick={() => void vercel("link")}><Globe2 size={14} /> Vercel bağla</button><button onClick={() => void vercel("preview")}><ArrowUpRight size={14} /> Preview</button><button onClick={() => void vercel("production")}><Upload size={14} /> Production</button><button onClick={() => void vercel("inspect")}><Globe2 size={14} /> Inspect</button><button onClick={() => void vercel("logs")}><Activity size={14} /> Logs</button><button onClick={() => void vercel("rollback")}><RefreshCw size={14} /> Rollback</button></>}</div></div></section>}
    {busy && <div className="console-busy"><LoaderCircle className="spin" size={14} /> {busy} çalışıyor…</div>}
    {result && <div className="command-evidence"><header><span>{result.commandDisplay}</span><Status value={result.exitCode === 0 ? "SUCCEEDED" : result.exitReason === "CANCELLED" ? "CANCELLED" : "FAILED"} /><button onClick={() => void window.devbox.copyText(`${result.stdout}\n${result.stderr}`)}><Copy size={13} /> Kopyala</button></header><pre>{result.stdout || result.stderr || (result.exitReason === "CANCELLED" ? "İşlem kullanıcı tarafından iptal edildi." : "Komut çıktı üretmedi.")}</pre><footer>{result.durationMs} ms · {resultReasonLabel(result.exitReason)} · çıkış {result.exitCode ?? "—"}</footer></div>}
    {error && <div className="inline-error">{error}</div>}
  </section>;
}
