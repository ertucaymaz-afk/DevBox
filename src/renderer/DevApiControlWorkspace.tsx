import { Activity, AlertTriangle, CheckCircle2, Cloud, CloudOff, Gauge, LoaderCircle, MessageSquare, Play, RefreshCw, Send, ShieldCheck, Square, Wrench, XCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { ProjectSummary, ThreadDetail } from "../shared/contracts";
import type { DevApiControlSnapshot, EvolutionFinding, ReleaseGateRun } from "../shared/devapi-control-contracts";

function failure(error: unknown): string {
  if (error instanceof Error) return error.message.replace(/^Error invoking remote method '[^']+':\s*/iu, "");
  return String(error);
}
function date(value: string | null): string { return value ? new Date(value).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" }) : "—"; }
function severityClass(value: string): string { return value.toLocaleLowerCase("en-US"); }
function gateIcon(gate: ReleaseGateRun | null): ReactNode {
  if (!gate) return <Activity size={18} />;
  return gate.state === "PASS" ? <CheckCircle2 size={18} /> : <XCircle size={18} />;
}

export function DevApiControlWorkspace({ project }: { project: ProjectSummary | null }): ReactNode {
  const [snapshot, setSnapshot] = useState<DevApiControlSnapshot | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [findingStatus, setFindingStatus] = useState<"ALL" | "OPEN" | "RESOLVED" | "REJECTED">("OPEN");
  const [chat, setChat] = useState<ThreadDetail | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);

  const reload = useCallback(async (): Promise<void> => {
    if (!project) { setSnapshot(null); return; }
    setSnapshot(await window.devbox.getDevApiControl(project.id));
  }, [project]);

  useEffect(() => { void reload().catch((caught) => setError(failure(caught))); }, [reload]);
  useEffect(() => {
    if (!project) return;
    let timer: number | null = null;
    return window.devbox.onEvolutionActivity((event) => {
      if (event.projectId !== project.id || timer !== null) return;
      timer = window.setTimeout(() => { timer = null; void reload().catch(() => undefined); }, 700);
    });
  }, [project, reload]);

  useEffect(() => {
    setChat(null);
    if (!project) return;
    const key = `devbox:devapi-thread:${project.id}`;
    let threadId: string | null = null;
    try { threadId = window.localStorage.getItem(key); } catch { /* localStorage is optional */ }
    if (!threadId) return;
    void window.devbox.getThread(threadId).then(setChat).catch(() => {
      try { window.localStorage.removeItem(key); } catch { /* ignore */ }
    });
  }, [project?.id]);

  const runGate = async (mode: "PREFLIGHT" | "FULL"): Promise<void> => {
    if (!project) return;
    setBusy(`gate-${mode}`); setError(null);
    try { await window.devbox.runReleaseGate(project.id, mode); await reload(); }
    catch (caught) { setError(failure(caught)); }
    finally { setBusy(null); }
  };
  const toggle = async (): Promise<void> => {
    if (!project || !snapshot) return;
    setBusy("toggle"); setError(null);
    try { await window.devbox.setEvolutionEnabled(project.id, !snapshot.campaign.enabled); await reload(); }
    catch (caught) { setError(failure(caught)); }
    finally { setBusy(null); }
  };
  const runEvolution = async (): Promise<void> => {
    if (!project) return;
    setBusy("run"); setError(null);
    try { await window.devbox.runEvolutionCycle(project.id); await reload(); }
    catch (caught) { setError(failure(caught)); }
    finally { setBusy(null); }
  };
  const cancelEvolution = async (): Promise<void> => {
    if (!project) return;
    setBusy("cancel"); setError(null);
    try { await window.devbox.cancelEvolutionCycle(project.id); await reload(); }
    catch (caught) { setError(failure(caught)); }
    finally { setBusy(null); }
  };
  const syncCloud = async (): Promise<void> => {
    if (!project) return;
    setBusy("cloud"); setError(null);
    try { await window.devbox.syncDevApiCloud(project.id); await reload(); }
    catch (caught) { setError(failure(caught)); }
    finally { setBusy(null); }
  };
  const transition = async (finding: EvolutionFinding, status: "RESOLVED" | "REJECTED"): Promise<void> => {
    if (!project) return;
    const note = window.prompt(status === "RESOLVED" ? "Çözüm/kanıt notu" : "Reddetme gerekçesi", status === "RESOLVED" ? "Düzeltme doğrulandı ve ilgili kapı PASS oldu." : "Yanlış pozitif veya uygulanamaz olduğu kanıtlandı.");
    if (!note?.trim()) return;
    setBusy(`finding-${finding.id}`); setError(null);
    try { await window.devbox.transitionEvolutionFinding(project.id, finding.id, status, note.trim()); await reload(); }
    catch (caught) { setError(failure(caught)); }
    finally { setBusy(null); }
  };

  const ensureChat = async (): Promise<ThreadDetail> => {
    if (!project) throw new Error("PROJECT_REQUIRED");
    if (chat) return chat;
    const created = await window.devbox.createThread(project.id, "DevAPI Geliştirme");
    try { window.localStorage.setItem(`devbox:devapi-thread:${project.id}`, created.thread.id); } catch { /* optional */ }
    setChat(created);
    return created;
  };
  const sendChat = async (): Promise<void> => {
    const message = chatInput.trim();
    if (!project || !message || chatBusy) return;
    setChatInput(""); setChatBusy(true); setError(null);
    try {
      const thread = await ensureChat();
      const directive = [
        "[DEVAPI CONTROL PLANE]",
        "Bu istek DevBox API geliştirme sohbetinden geliyor. Mevcut repo ve önceki konuşma bağlamını koru. Gerçek dosya değişikliği isteniyorsa workspace araçlarını kullan; simülasyon/demo/fake/no-op başarı üretme. Release gate, TypeScript, finding, severity, ownership, IPC/Core API ve evolution gerçeklik kurallarını bozma.",
        `Kullanıcı isteği: ${message}`
      ].join("\n");
      const next = await window.devbox.sendMessage(thread.thread.id, directive);
      setChat(next);
      await reload();
    } catch (caught) { setError(failure(caught)); setChatInput((current) => current || message); }
    finally { setChatBusy(false); }
  };

  const findings = useMemo(() => snapshot?.findings.items.filter((item) => findingStatus === "ALL" || item.status === findingStatus) ?? [], [snapshot?.findings.items, findingStatus]);

  if (!project) return <section className="advanced-page devapi-control"><div className="advanced-empty"><Wrench size={30} /><strong>DevAPI için bir proje seçin</strong><span>Kontrol düzlemi sahipsiz bir klasör üzerinde release/evolution işlemi çalıştırmaz.</span></div></section>;
  if (!snapshot) return <section className="advanced-page devapi-control"><div className="advanced-empty"><LoaderCircle className="spin" size={26} /><strong>DevAPI gerçek durumunu okuyorum</strong><span>Evolution, findings, release gate ve cloud state tek snapshot altında birleştiriliyor.</span></div>{error && <div className="inline-error">{error}</div>}</section>;

  const campaign = snapshot.campaign;
  const gate = snapshot.releaseGate;
  return <section className="advanced-page devapi-control">
    <div className="advanced-heading devapi-heading"><div><span className="advanced-eyebrow">DEVAPI CONTROL PLANE · V0.1.15</span><h1>DevBox API komuta merkezi</h1><p>API gelişim seviyesi, kalıcı bulgular, severity/ownership, release gate, TypeScript gerçekliği, cloud senkronu ve aynı gerçek sohbet ajanı tek yüzeyde. Sayaç yükseltmek için görev üretmek yok; kanıtlanmamış durum READY veya PASS gösterilmez.</p></div><div className="advanced-actions"><button onClick={() => void reload()} disabled={Boolean(busy)}><RefreshCw size={14} /> Yenile</button>{campaign.isRunning ? <button className="danger-action" onClick={() => void cancelEvolution()} disabled={busy === "cancel"}><Square size={14} /> Durdur</button> : <button className="primary" onClick={() => void runEvolution()} disabled={Boolean(busy)}><Play size={14} /> Gelişimi çalıştır</button>}</div></div>

    <div className="devapi-hero-grid">
      <article className="devapi-level-card"><div className="devapi-level-ring"><strong>{campaign.lifetimeLevel}</strong><span>SEVİYE</span></div><div><span>Kalıcı öğrenim/gelişim</span><h2>{campaign.stage}</h2><p>{campaign.lifetimeEvidencePoints.toLocaleString("tr-TR")} evidence point · {campaign.validatedImprovementCount} doğrulanmış iyileştirme · {campaign.stablePromotionCount} kalıcı promotion</p></div></article>
      <article><Gauge size={20} /><span>Çekirdek plan</span><strong>{campaign.spec.passCount.toLocaleString("tr-TR")} / {campaign.spec.totalTaskCount.toLocaleString("tr-TR")}</strong><small>{campaign.spec.remainingCount === 0 ? "22 faz tamam · adaptif bakım" : `${campaign.spec.remainingCount.toLocaleString("tr-TR")} görev kaldı`}</small></article>
      <article><ShieldCheck size={20} /><span>Blocking finding</span><strong>{snapshot.findings.blocking}</strong><small>{snapshot.findings.open} açık · {snapshot.findings.resolved} çözüldü · {snapshot.findings.rejected} reddedildi</small></article>
      <article className={gate?.state === "FAIL" ? "danger" : ""}>{gateIcon(gate)}<span>Son release gate</span><strong>{gate?.state ?? "Çalıştırılmadı"}</strong><small>{gate ? `${gate.mode} · ${date(gate.completedAt)} · ${gate.durationMs} ms` : "Gerçek gate kanıtı henüz yok"}</small></article>
      <article className={snapshot.cloud.state === "READY" ? "ready" : "limited"}>{snapshot.cloud.state === "READY" ? <Cloud size={20} /> : <CloudOff size={20} />}<span>Cloud kontrol</span><strong>{snapshot.cloud.state}</strong><small>{snapshot.cloud.configured ? snapshot.cloud.endpoint : "DEVBOX_CONTROL_PLANE_URL/TOKEN yapılandırılmadı"}</small></article>
      <article><Activity size={20} /><span>FIFO / aktif turn</span><strong>{snapshot.queues.filter((item) => item.running).length}</strong><small>{snapshot.queues.reduce((sum, item) => sum + item.queued, 0)} aynı-thread istek kuyrukta · farklı thread'ler paralel</small></article>
    </div>

    <section className="devapi-control-strip"><div><strong>API gelişimi</strong><span>{campaign.enabled ? "Durdurulana kadar sürekli" : "Kapalı"}</span></div><button className={`automation-toggle ${campaign.enabled ? "on" : ""}`} onClick={() => void toggle()} disabled={busy === "toggle"} aria-label="API gelişimini aç/kapat"><i /></button><div className="spacer" /><button onClick={() => void runGate("PREFLIGHT")} disabled={Boolean(busy)}>{busy === "gate-PREFLIGHT" ? <LoaderCircle className="spin" size={14} /> : <ShieldCheck size={14} />} Preflight gate</button><button className="primary" onClick={() => void runGate("FULL")} disabled={Boolean(busy)}>{busy === "gate-FULL" ? <LoaderCircle className="spin" size={14} /> : <CheckCircle2 size={14} />} Full release gate</button><button onClick={() => void syncCloud()} disabled={!snapshot.cloud.configured || busy === "cloud"}><Cloud size={14} /> Cloud senkron</button></section>

    <section className="devapi-section"><header><div><span className="advanced-eyebrow">YETENEK / SEVİYE MATRİSİ</span><h2>Kanıtlanmış alan puanları</h2></div><span>{campaign.score}/100 anlık kapsama</span></header><div className="devapi-domain-grid">{Object.entries(campaign.domainScores).map(([domain, score]) => <article key={domain}><div><span>{domain}</span><strong>{score}</strong></div><i><b style={{ width: `${Math.max(0, Math.min(100, score))}%` }} /></i></article>)}</div></section>

    <section className="devapi-section"><header><div><span className="advanced-eyebrow">EVOLUTION FINDINGS</span><h2>Severity · ownership · yaşam döngüsü</h2></div><div className="devapi-tabs">{(["OPEN", "RESOLVED", "REJECTED", "ALL"] as const).map((state) => <button key={state} className={findingStatus === state ? "active" : ""} onClick={() => setFindingStatus(state)}>{state}</button>)}</div></header><div className="finding-summary"><span className="critical">CRITICAL <b>{snapshot.findings.bySeverity.CRITICAL}</b></span><span className="high">HIGH <b>{snapshot.findings.bySeverity.HIGH}</b></span><span>MEDIUM <b>{snapshot.findings.bySeverity.MEDIUM}</b></span><span>LOW <b>{snapshot.findings.bySeverity.LOW}</b></span><span>INFO <b>{snapshot.findings.bySeverity.INFO}</b></span></div><div className="finding-list">{findings.length === 0 ? <div className="advanced-empty compact"><CheckCircle2 size={20} /><strong>Bu filtrede bulgu yok</strong></div> : findings.slice(0, 160).map((finding) => <article key={finding.id} className={`finding-card ${severityClass(finding.severity)} ${finding.status.toLocaleLowerCase("en-US")}`}><div className="finding-severity">{finding.severity}</div><div className="finding-body"><div><strong>{finding.title}</strong><span>{finding.owner} · {finding.source} · {finding.status} · ×{finding.occurrences}</span></div><p>{finding.detail}</p><small>İlk: {date(finding.firstSeenAt)} · Son: {date(finding.lastSeenAt)}{finding.specTaskId ? ` · ${finding.specTaskId}` : ""}</small>{finding.evidence.length > 0 && <details><summary>Kanıt ({finding.evidence.length})</summary>{finding.evidence.map((line) => <code key={line}>{line}</code>)}</details>}</div>{finding.status === "OPEN" && <div className="finding-actions"><button onClick={() => void transition(finding, "RESOLVED")} disabled={Boolean(busy)}><CheckCircle2 size={13} /> Çözüldü</button><button onClick={() => void transition(finding, "REJECTED")} disabled={Boolean(busy)}><XCircle size={13} /> Reddet</button></div>}</article>)}</div></section>

    <section className="devapi-section"><header><div><span className="advanced-eyebrow">RELEASE GATE</span><h2>Fail-closed yayın kanıtı</h2></div>{gate && <strong className={`gate-state ${gate.state.toLocaleLowerCase("en-US")}`}>{gate.state}</strong>}</header>{gate ? <div className="release-check-grid">{gate.checks.map((check) => <article key={check.id} className={`${check.state.toLocaleLowerCase("en-US")} ${check.blocking ? "blocking" : ""}`}><div>{check.state === "PASS" ? <CheckCircle2 size={16} /> : check.state === "FAIL" ? <AlertTriangle size={16} /> : <Activity size={16} />}<strong>{check.title}</strong><span>{check.state}</span></div><p>{check.detail}</p><small>{check.command ?? "yerel durum denetimi"} · {check.durationMs} ms</small>{check.evidence.length > 0 && <details><summary>Kanıt</summary>{check.evidence.map((line) => <code key={line}>{line}</code>)}</details>}</article>)}</div> : <div className="advanced-empty compact"><ShieldCheck size={22} /><strong>Release gate henüz çalıştırılmadı</strong><span>Preflight hızlı kapıları; Full ise test/build dahil daha ağır gerçek doğrulamayı çalıştırır.</span></div>}</section>

    <section className="devapi-section devapi-chat"><header><div><span className="advanced-eyebrow">DEVAPI CHATBOX</span><h2>API’yi sohbet ederek geliştir</h2></div><MessageSquare size={20} /></header><div className="devapi-chat-log">{chat?.items.length ? chat.items.slice(-40).map((item) => <article key={item.id} className={item.role}><span>{item.role === "user" ? "Siz" : "DevBox"}</span><p>{item.content}</p></article>) : <div className="advanced-empty compact"><MessageSquare size={20} /><strong>DevAPI geliştirme sohbeti hazır</strong><span>Buradan verilen kodlama/düzeltme istekleri ana sohbet ile aynı gerçek AgentService, FIFO, workspace read-back ve release kurallarından geçer.</span></div>}{chatBusy && <div className="devapi-chat-working"><LoaderCircle className="spin" size={14} /> AgentService çalışıyor…</div>}</div><div className="devapi-chat-composer"><textarea value={chatInput} onChange={(event) => setChatInput(event.target.value)} placeholder="Örn. Core API hata semantiğini incele, bulduğun sorunu gerçek kodla düzelt ve test et…" rows={3} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void sendChat(); } }} /><button className="primary" onClick={() => void sendChat()} disabled={!chatInput.trim() || chatBusy}><Send size={15} /> Gönder</button></div></section>

    <section className="devapi-section cloud-contract"><header><div><span className="advanced-eyebrow">CLOUD CONTINUITY</span><h2>Masaüstü ölse bile kontrol state’i</h2></div>{snapshot.cloud.state === "READY" ? <Cloud size={19} /> : <CloudOff size={19} />}</header><p>Cloud endpoint yapılandırıldığında DevBox; seviye, domain puanları, öğrenimler, bulgular, release gate ve çalışma durumunu imzalı snapshot olarak yollar. Site komutları yalnız allowlist <code>evolution.setEnabled</code>, <code>evolution.run</code>, <code>evolution.cancel</code> biçiminde ve idempotency ile uygulanır.</p><dl><div><dt>Durum</dt><dd>{snapshot.cloud.state}</dd></div><div><dt>Endpoint</dt><dd>{snapshot.cloud.endpoint ?? "Yapılandırılmadı"}</dd></div><div><dt>Son senkron</dt><dd>{date(snapshot.cloud.lastSyncAt)}</dd></div><div><dt>Son cloud komutu</dt><dd>{date(snapshot.cloud.lastCommandAt)}</dd></div></dl>{snapshot.cloud.lastError && <div className="inline-error">{snapshot.cloud.lastError}</div>}</section>
    {error && <div className="inline-error devapi-error">{error}</div>}
  </section>;
}
