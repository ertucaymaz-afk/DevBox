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
  return <span className={`advanced-status ${healthy ? "healthy" : "limited"}`}>{value}</span>;
}

function EmptyProject(): ReactNode {
  return <div className="advanced-empty"><GitBranch size={30} /><strong>Bir proje seçin</strong><span>Bu çalışma yüzeyi canonical proje kökü olmadan işlem yapmaz.</span></div>;
}

function readableDate(value: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("tr-TR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
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
    <div className="advanced-heading"><div><span className="advanced-eyebrow">INTERACTIVE CONPTY</span><h1>Terminal</h1><p>Gerçek, yeniden boyutlandırılabilir ve çift yönlü Windows pseudo-console oturumu.</p></div><div className="advanced-actions"><button onClick={() => void reload()} disabled={!project}><RefreshCw size={14} /> Yenile</button><button className="primary" onClick={() => void start()} disabled={!project || busy || !terminalReady}><Play size={14} /> {busy ? "Başlatılıyor" : terminalReady ? "Yeni terminal" : "Terminal yükleniyor"}</button><button onClick={() => void stop()} disabled={!activeId}><CircleStop size={14} /> Durdur</button></div></div>
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
    <div className="advanced-heading"><div><span className="advanced-eyebrow">ISOLATED GIT WORK</span><h1>Worktree’ler</h1><p>Her paralel görev için bağımsız çalışma dizini; kayıt, kilit, kurtarma ve prune yaşam döngüsü.</p></div><button onClick={() => void reload()} disabled={!project || busy}><RefreshCw size={14} /> Yenile</button></div>
    {!project ? <EmptyProject /> : <>
      <div className="creation-bar"><label><span>Ad</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="özellik-adi" /></label><label><span>Başlangıç ref’i</span><input value={ref} onChange={(event) => setRef(event.target.value)} /></label><label><span>Tür</span><select value={mode} onChange={(event) => setMode(event.target.value as typeof mode)}><option value="detached">Detached</option><option value="branch">devbox/* dalı</option></select></label><button className="primary" onClick={() => void create()} disabled={!name.trim() || busy}><Plus size={14} /> Oluştur</button></div>
      <div className="advanced-list">{items.map((item) => <article key={item.path}><div className="list-icon"><GitBranch size={16} /></div><div><strong>{item.isMain ? "Ana çalışma ağacı" : item.branch ?? "Detached HEAD"}</strong><span title={item.path}>{item.path}</span><small>{item.head?.slice(0, 12) ?? "HEAD yok"} · {item.locked ? `kilitli${item.lockReason ? `: ${item.lockReason}` : ""}` : "kilitli değil"}</small></div><Status value={item.isMain ? "MAIN" : item.prunable ? "PRUNABLE" : "AVAILABLE"} />{!item.isMain && <button className="icon-danger" onClick={() => void remove(item)} disabled={busy} aria-label="Worktree kaldır"><Trash2 size={15} /></button>}</article>)}</div>
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
    <div className="advanced-heading"><div><span className="advanced-eyebrow">REAL PROVIDER EVIDENCE</span><h1>DevBox API gelişimi</h1><p>Sağlık ve oturum denetimi geçen OpenAI Codex CLI öncelikli çalışır; Codex kullanılamazsa Hermes/NVIDIA NIM’e gerçek fallback yapar. Durable-job, sağlayıcı kanıtı ve kalıcı görev geçmişi olmadan ilerleme yazmaz.</p></div><div className="advanced-actions"><button onClick={() => { setBusy("reload"); void reload().catch((caught) => setError(failure(caught))).finally(() => setBusy(null)); }} disabled={!project || Boolean(busy)}><RefreshCw className={busy === "reload" ? "spin" : ""} size={14} /> Yenile</button><button className="primary" onClick={() => void run()} disabled={!project || Boolean(busy)}>{busy === "run" ? <LoaderCircle className="spin" size={14} /> : <Play size={14} />} Şimdi çalıştır</button></div></div>
    {!project ? <EmptyProject /> : !campaign ? <div className="advanced-empty"><LoaderCircle className="spin" size={24} />Gerçek kampanya durumu yükleniyor…</div> : <>
      <div className="evolution-summary">
        <div className="evolution-score"><strong>{campaign.score}</strong><span>/ 100 kanıt kapsamı</span><small>Seviye {campaign.level} · {campaign.stage}</small></div>
        <dl><div><dt>Sağlayıcı</dt><dd>{campaign.provider}</dd></div><div><dt>Model</dt><dd>{campaign.model}</dd></div><div><dt>Başarılı / hatalı</dt><dd>{campaign.completedCycles} / {campaign.failedCycles}</dd></div><div><dt>Bugünkü kullanım</dt><dd>{campaign.cyclesToday} / {campaign.dailyCycleLimit}</dd></div><div><dt>Son çevrim</dt><dd>{readableDate(campaign.lastCycleAt)}</dd></div><div><dt>Sonraki çevrim</dt><dd>{campaign.enabled ? readableDate(campaign.nextCycleAt) : "Kapalı"}</dd></div></dl>
        <label className="evolution-toggle"><span><strong>Uygulama açıkken sürekli araştır</strong><small>Her {campaign.intervalMinutes} dakikada bir; günde en fazla {campaign.dailyCycleLimit} gerçek sağlayıcı isteği.</small></span><button className={`automation-toggle ${campaign.enabled ? "on" : ""}`} onClick={() => void toggle()} disabled={Boolean(busy)} aria-label={`API gelişim döngüsünü ${campaign.enabled ? "kapat" : "aç"}`}><i /></button></label>
      </div>
      <div className="truth-notice"><ShieldCheck size={17} /><p><strong>Bu bir model eğitimi veya otomatik kod yazımı değildir.</strong> Gösterge yalnız tamamlanan gerçek sağlayıcı çevrimlerinin {new Set(campaign.tasks.map((item) => item.track)).size} mühendislik alanını kapsamasını ölçer. Kampanya, görevler, yönerge ve bulgular proje bazında SQLite WAL deposunda kalıcıdır; uygulama kapanınca silinmez. NVIDIA model ağırlıkları değişmez; kod ancak kullanıcı tarafından açıkça uygulandığında ve test edildiğinde ürün gelişimi sayılır.</p></div>
      <section className="evolution-section directive-editor"><div className="panel-title"><div><h2>Kalıcı gelişim yönergesi</h2><span>Sonraki tüm gerçek NVIDIA çevrimlerine eklenir · {directive.length.toLocaleString("tr-TR")} karakter</span></div><div><button onClick={() => void window.devbox.copyText(directive)} disabled={!directive.trim()} title="Yönergeyi kopyala"><Copy size={14} /> Kopyala</button><button className="primary" onClick={() => void saveDirective()} disabled={Boolean(busy) || directive.trim().length < 80 || directive === campaign.directive}>{busy === "save" ? <LoaderCircle className="spin" size={14} /> : <Check size={14} />} Kaydet</button></div></div><textarea value={directive} onChange={(event) => setDirective(event.target.value)} minLength={80} maxLength={64_000} spellCheck aria-label="DevBox API kalıcı gelişim yönergesi" /><small>Web araması yalnız sağlayıcı çalışma zamanı gerçek bir arama aracı sunduğunda yapılmış sayılır; aksi durumda görev çıktısı doğrulanacak kaynakları açıkça işaretler.</small></section>
      <section className="evolution-section"><div className="panel-title"><h2>Gerçek görev kuyruğu</h2><Status value={campaign.enabled ? "RUNNING" : "DISABLED"} /></div><div className="advanced-list evolution-list">{campaign.tasks.slice(-16).map((item) => <article key={item.id}><div className="list-icon">{item.state === "SUCCEEDED" ? <Check size={16} /> : item.state === "RUNNING" ? <LoaderCircle className="spin" size={16} /> : <Activity size={16} />}</div><div><strong>{item.title}</strong><span>{item.track} · {item.provider ?? "sağlayıcı çağrısı bekliyor"}{item.model ? ` · ${item.model}` : ""}</span><small>{item.error ?? (item.evidence.length ? item.evidence.join(" · ") : "Henüz çalışma kanıtı yok")}</small></div><Status value={item.state} />{item.threadId && <button onClick={() => void window.devbox.copyText(item.threadId!)} title="Görev kimliğini kopyala"><Copy size={14} /></button>}</article>)}</div></section>
      <section className="evolution-section"><div className="panel-title"><h2>Sağlayıcı bulguları</h2><span>{campaign.learnings.length} kayıt</span></div>{campaign.learnings.length === 0 ? <div className="advanced-empty compact"><Activity size={22} /><strong>Henüz doğrulanmış çevrim yok</strong><span>İlk başarılı gerçek NVIDIA yanıtı ve durable-job kanıtı burada görünür.</span></div> : <div className="learning-grid">{campaign.learnings.slice().reverse().slice(0, 8).map((item) => <article key={item.id}><header><strong>{item.title}</strong><span>{item.track} · {readableDate(item.learnedAt)}</span></header><p>{item.summary}</p><footer>{item.evidence.join(" · ")}</footer></article>)}</div>}</section>
    </>}
    {error && <div className="inline-error">{error}</div>}
  </section>;
}

export function IntegrationWorkspace({ project }: { project: ProjectSummary | null }): ReactNode {
  const [statuses, setStatuses] = useState<IntegrationStatus[]>([]);
  const [result, setResult] = useState<CommandResult | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [target, setTarget] = useState("");
  const [platformTarget, setPlatformTarget] = useState("");
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => setStatuses(await window.devbox.inspectIntegrations(project?.id)), [project?.id]);
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
  return <section className="advanced-page">
    <div className="advanced-heading"><div><span className="advanced-eyebrow">TOOLS & SERVICES</span><h1>Eklentiler ve entegrasyonlar</h1><p>GitHub, Vercel, SSH, LSP/DAP, imzalı toolkit ve yayın kapılarının gerçek çalışma zamanı durumu.</p></div><button onClick={() => void reload()} disabled={Boolean(busy)}><RefreshCw className={busy === "inspect" ? "spin" : ""} size={14} /> Yeniden denetle</button></div>
    <div className="integration-grid">{statuses.map((status) => <article key={status.kind}><div className="integration-title"><span>{status.kind === "github" ? <GitBranch size={17} /> : status.kind === "vercel" ? <Globe2 size={17} /> : <ShieldCheck size={17} />}</span><div><strong>{status.kind.toLocaleUpperCase("tr-TR")}</strong><small>{status.version ?? "sürüm yok"}{status.account ? ` · ${status.account}` : ""}</small></div><Status value={status.state} /></div><p>{status.detail}</p><footer>{status.commands.join(" · ")}</footer></article>)}</div>
    <section className="integration-console platform-console"><div className="console-controls"><label><span>Yerel hedef · SSH için host:port, paket için kind/id</span><input value={platformTarget} onChange={(event) => setPlatformTarget(event.target.value)} placeholder="örn. server.example:22 veya plugin/devbox.toolkit" /></label><div><button onClick={() => void platform("protocol-discover")}><Activity size={14} /> LSP/DAP keşfet</button><button onClick={() => void platform("ssh-audit")}><ShieldCheck size={14} /> SSH pinlerini denetle</button><button onClick={() => void platform("ssh-pin")} disabled={!platformTarget.trim()}><ShieldCheck size={14} /> SSH anahtarı sabitle</button><button onClick={() => void platform("package-list")}><Activity size={14} /> Paket envanteri</button><button onClick={() => void platform("package-install")}><Upload size={14} /> İmzalı paket kur</button><button onClick={() => void platform("package-repair")} disabled={!/^(plugin|mcp|toolkit|update)\/[a-z0-9][a-z0-9._-]{1,127}$/u.test(platformTarget)}><RefreshCw size={14} /> Paketi onar</button><button onClick={() => void platform("package-rollback")} disabled={!/^(plugin|mcp|toolkit|update)\/[a-z0-9][a-z0-9._-]{1,127}$/u.test(platformTarget)}><RefreshCw size={14} /> Paketi geri al</button></div></div></section>
    {project && <section className="integration-console"><div className="console-controls"><label><span>Hedef; PR/run no, başlık, tag veya deployment URL</span><input value={target} onChange={(event) => setTarget(event.target.value)} placeholder="örn. 42, v1.2.0 veya deployment-url" /></label><div><button onClick={() => void github("pr-list")}><GitBranch size={14} /> PR’lar</button><button onClick={() => void github("pr-create")} disabled={!target.trim()}><Upload size={14} /> PR oluştur</button><button onClick={() => void github("pr-merge")} disabled={!/^\d+$/u.test(target)}><Check size={14} /> PR birleştir</button><button onClick={() => void github("issue-list")}><GitBranch size={14} /> Issue’lar</button><button onClick={() => void github("issue-create")} disabled={!target.trim()}><Upload size={14} /> Issue oluştur</button><button onClick={() => void github("checks")}><Check size={14} /> Checks</button><button onClick={() => void github("run-list")}><Activity size={14} /> CI çalışmaları</button><button onClick={() => void github("run-log")} disabled={!/^\d+$/u.test(target)}><Activity size={14} /> CI logu</button><button onClick={() => void github("run-rerun")} disabled={!/^\d+$/u.test(target)}><RefreshCw size={14} /> CI tekrar</button><button onClick={() => void github("release-list")}><Upload size={14} /> Release’ler</button><button onClick={() => void github("release-create")} disabled={!target.trim()}><Upload size={14} /> Release oluştur</button><button onClick={() => void vercel("link")}><Globe2 size={14} /> Vercel bağla</button><button onClick={() => void vercel("preview")}><ArrowUpRight size={14} /> Preview</button><button onClick={() => void vercel("production")}><Upload size={14} /> Production</button><button onClick={() => void vercel("inspect")}><Globe2 size={14} /> Inspect</button><button onClick={() => void vercel("logs")}><Activity size={14} /> Logs</button><button onClick={() => void vercel("rollback")}><RefreshCw size={14} /> Rollback</button></div></div></section>}
    {busy && <div className="console-busy"><LoaderCircle className="spin" size={14} /> {busy} çalışıyor…</div>}
    {result && <div className="command-evidence"><header><span>{result.commandDisplay}</span><Status value={result.exitCode === 0 ? "SUCCEEDED" : result.exitReason === "CANCELLED" ? "CANCELLED" : "FAILED"} /><button onClick={() => void window.devbox.copyText(`${result.stdout}\n${result.stderr}`)}><Copy size={13} /> Kopyala</button></header><pre>{result.stdout || result.stderr || (result.exitReason === "CANCELLED" ? "İşlem kullanıcı tarafından iptal edildi." : "Komut çıktı üretmedi.")}</pre><footer>{result.durationMs} ms · {result.exitReason} · çıkış {result.exitCode ?? "—"}</footer></div>}
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
    <div className="advanced-heading"><div><span className="advanced-eyebrow">POLICY CENTER</span><h1>Ayarlar</h1><p>Yalnızca gerçek çalışma zamanında uygulanan görünüm, izin, sandbox, ağ ve terminal politikaları.</p></div><div className="settings-heading-actions"><Status value="SAVED LOCALLY" /><button onClick={onClose} aria-label="Ayarları kapat" title="Ayarları kapat"><X size={16} /></button></div></div>
    <nav className="settings-nav" aria-label="Ayar bölümleri"><button className={section === "appearance" ? "active" : ""} onClick={() => setSection("appearance")}>Görünüm</button><button className={section === "permissions" ? "active" : ""} onClick={() => setSection("permissions")}>İzinler ve sandbox</button><button className={section === "terminal" ? "active" : ""} onClick={() => setSection("terminal")}>Terminal</button></nav>
    <div className="settings-sections">
      {section === "appearance" && <section><h2>Görünüm</h2><div className="settings-grid"><label><span>Tema adı<small>Portable tema manifestinde görünür.</small></span><input value={settings.theme.name} onChange={(event) => void patch({ theme: { name: event.target.value || "DevBox" } })} /></label><label><span>Vurgu rengi<small>Hex renk, kod çalıştırmaz.</small></span><input type="color" value={settings.theme.accent} onChange={(event) => void patch({ theme: { accent: event.target.value } })} /></label><label><span>Arayüz yazı tipi</span><input value={settings.theme.uiFont} onChange={(event) => void patch({ theme: { uiFont: event.target.value || "Segoe UI" } })} /></label><label><span>Kod yazı tipi</span><input value={settings.theme.codeFont} onChange={(event) => void patch({ theme: { codeFont: event.target.value || "Consolas" } })} /></label><label><span>Kontrast</span><select value={settings.theme.contrast} onChange={(event) => void patch({ theme: { contrast: event.target.value as AppSettings["theme"]["contrast"] } })}><option value="normal">Normal</option><option value="high">Yüksek</option></select></label><label className="switch-setting"><span>Hareketi azalt<small>Animasyonları ve geçişleri sınırlar.</small></span><button className={`automation-toggle ${settings.reduceMotion ? "on" : ""}`} onClick={() => void patch({ reduceMotion: !settings.reduceMotion })} aria-label="Hareketi azalt"><i /></button></label></div><div className="theme-row"><textarea value={portable} onChange={(event) => setPortable(event.target.value)} placeholder="devbox-theme-v1:… veya güvenli codex-theme-v1:… veri manifesti" /><button onClick={() => void window.devbox.importTheme(portable).then((next) => { onSettings(next); setNotice("Tema doğrulandı ve içe aktarıldı."); }).catch((caught) => setNotice(failure(caught)))} disabled={!portable.trim()}><Upload size={14} /> İçe aktar</button><button onClick={() => void window.devbox.exportTheme().then((value) => { setPortable(value); void window.devbox.copyText(value); setNotice("Portable tema panoya kopyalandı."); })}><Copy size={14} /> Dışa aktar</button></div></section>}
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
