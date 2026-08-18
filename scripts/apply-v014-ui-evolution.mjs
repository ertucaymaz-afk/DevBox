import { readFile, writeFile } from "node:fs/promises";

async function patch(file, edits) {
  let source = await readFile(file, "utf8");
  for (const [label, before, after] of edits) {
    const first = source.indexOf(before);
    const last = source.lastIndexOf(before);
    if (first < 0) throw new Error(`PATCH_ANCHOR_MISSING:${file}:${label}`);
    if (first !== last) throw new Error(`PATCH_ANCHOR_NOT_UNIQUE:${file}:${label}`);
    source = source.slice(0, first) + after + source.slice(first + before.length);
  }
  await writeFile(file, source, "utf8");
}

await patch("src/renderer/App.tsx", [
  ["followup-helper", `function formatThreadTime(value: string): string {`, `function isWorkspaceFollowupIntent(content: string): boolean {
  return /(?:düzelt|değiştir|güncelle|iyileştir|geliştir|ekle|sil|beğenmedim|devam et|bunu|şunu|onu|aynı|önceki|rengi|tasarımı|görünümü|animasyonu|mobilde)/iu.test(content);
}

function formatThreadTime(value: string): string {`],
  ["pending-state", `  const [busy, setBusy] = useState<string | null>("bootstrap");`, `  const [busy, setBusy] = useState<string | null>("bootstrap");
  const [pendingTurns, setPendingTurns] = useState<Record<string, number>>({});`],
  ["thread-ref", `  const introStartedAt = useRef(0);

  const updateThreads`, `  const introStartedAt = useRef(0);
  const openThreadIdRef = useRef<string | null>(null);
  useEffect(() => { openThreadIdRef.current = thread?.thread.id ?? null; }, [thread?.thread.id]);

  const updateThreads`],
  ["send-message", `  const sendMessage = useCallback(async (): Promise<void> => {
    const content = composer.trim();
    if (!content && draftAttachments.length === 0) return;
    const activeThread = thread ?? await createThread();
    if (!activeThread) return;
    const liveTarget = inferWorkspaceTargetPath(content);
    setComposer("");
    setWorkspaceResult(null);
    setLiveWorkspacePath(liveTarget);
    setLiveWorkspaceActive(Boolean(liveTarget));
    if (liveTarget) setInspectorVisible(true);
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
      setLiveWorkspaceActive(false);
      setBusy(null);
    }
  }, [composer, createThread, draftAttachments, loadProject, selectedProject, thread, updateThreads]);`, `  const sendMessage = useCallback(async (): Promise<void> => {
    const content = composer.trim();
    if (!content && draftAttachments.length === 0) return;
    const activeThread = thread ?? await createThread();
    if (!activeThread) return;
    const threadId = activeThread.thread.id;
    const attachmentIds = draftAttachments.map((attachment) => attachment.id);
    const explicitTarget = inferWorkspaceTargetPath(content);
    const previousTarget = workspaceResult?.threadId === threadId ? workspaceResult.primaryFile ?? workspaceResult.previewPath : null;
    const liveTarget = explicitTarget ?? (isWorkspaceFollowupIntent(content) ? previousTarget ?? null : null);
    setComposer("");
    setDraftAttachments([]);
    if (liveTarget) {
      setLiveWorkspacePath(liveTarget);
      setLiveWorkspaceActive(true);
      setInspectorVisible(true);
    }
    setChangeSummaryOpen(false);
    setLiveActivities((current) => current.filter((activity) => activity.threadId !== threadId));
    setPendingTurns((current) => ({ ...current, [threadId]: (current[threadId] ?? 0) + 1 }));
    try {
      const detail = await window.devbox.sendMessage(threadId, content, attachmentIds);
      setThread((current) => current?.thread.id === detail.thread.id ? detail : current);
      await updateThreads();
      if (selectedProject?.id === activeThread.thread.projectId && liveTarget) await loadProject(selectedProject);
      if (openThreadIdRef.current === threadId) {
        requestAnimationFrame(() => {
          if (conversationRef.current) conversationRef.current.scrollTop = conversationRef.current.scrollHeight;
        });
      }
    } catch (error) {
      setNotice(errorMessage(error));
      if (openThreadIdRef.current === threadId) setComposer((current) => current.trim() ? current : content);
    } finally {
      setPendingTurns((current) => {
        const nextCount = Math.max(0, (current[threadId] ?? 1) - 1);
        const next = { ...current };
        if (nextCount === 0) delete next[threadId]; else next[threadId] = nextCount;
        return next;
      });
      setLiveActivities((current) => current.filter((activity) => activity.threadId !== threadId));
      if (openThreadIdRef.current === threadId) setLiveWorkspaceActive(false);
    }
  }, [composer, createThread, draftAttachments, loadProject, selectedProject, thread, updateThreads, workspaceResult]);`],
  ["workspace-result-thread", `  useEffect(() => window.devbox.onThreadWorkspaceResult((result) => {
    setWorkspaceResult(result);
    setLiveWorkspaceActive(false);
    setLiveWorkspacePath(result.previewPath ?? result.primaryFile ?? null);
    setInspectorVisible(true);
    setChangeSummaryOpen(false);
  }), []);`, `  useEffect(() => window.devbox.onThreadWorkspaceResult((result) => {
    if (openThreadIdRef.current !== result.threadId) return;
    setWorkspaceResult(result);
    setLiveWorkspaceActive(false);
    setLiveWorkspacePath(result.previewPath ?? result.primaryFile ?? null);
    setInspectorVisible(true);
    setChangeSummaryOpen(false);
  }), []);`],
  ["git-poll", `  useEffect(() => {
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
  }, [selectedProject]);`, `  useEffect(() => {
    if (!selectedProject?.isGitRepository) return;
    let active = true;
    const refresh = (): void => {
      if (document.hidden) return;
      void window.devbox.getGitStatus(selectedProject.id).then((status) => {
        if (active) setGitStatus(status);
      }).catch(() => {
        // The explicit Git view exposes command errors; passive polling stays unobtrusive.
      });
    };
    const onVisibility = (): void => { if (!document.hidden) refresh(); };
    const timer = window.setInterval(refresh, 15_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [selectedProject]);`],
  ["active-pending", `  const capabilities = bootstrap?.capabilities ?? [];`, `  const activePendingTurns = thread ? pendingTurns[thread.thread.id] ?? 0 : 0;
  const capabilities = bootstrap?.capabilities ?? [];`],
  ["pending-line", `                    {busy === "message" && <div className="activity-line running compact"><LoaderCircle className="spin" size={14} /><span>{liveWorkspaceActive ? "Gerçek dosya değişiklikleri diske yazılıyor ve Canvas kod görünümü canlı okunuyor…" : "DevBox yanıt hazırlıyor…"}</span></div>}`, `                    {activePendingTurns > 0 && <div className="activity-line running compact"><LoaderCircle className="spin" size={14} /><span>{liveWorkspaceActive ? "Gerçek dosya değişiklikleri diske yazılıyor ve Canvas kod görünümü canlı okunuyor…" : activePendingTurns > 1 ? \`DevBox yanıt üretiyor · ${'${activePendingTurns - 1}'} ek istek aynı sohbet kuyruğunda\` : "DevBox yanıt hazırlıyor…"}</span></div>}`],
  ["composer-busy", `<div className={\`composer ${'${busy === "message" ? "busy" : ""}'}\`}>`, `<div className={\`composer ${'${activePendingTurns > 0 ? "busy" : ""}'}\`}>`],
  ["textarea-enabled", `                <textarea ref={composerRef} value={composer} onChange={(event) => setComposer(event.target.value)} placeholder="DevBox'a bir görev verin" disabled={busy === "message"} rows={1}`, `                <textarea ref={composerRef} value={composer} onChange={(event) => setComposer(event.target.value)} placeholder={activePendingTurns > 0 ? "Yeni mesaj yazabilirsiniz; aynı sohbet içinde sıraya alınır" : "DevBox'a bir görev verin"} rows={1}`],
  ["send-enabled", `disabled={(!composer.trim() && draftAttachments.length === 0) || busy === "message"}`, `disabled={!composer.trim() && draftAttachments.length === 0}`]
]);

await patch("src/main/services/api-evolution-service.ts", [
  ["spec-types", `import type { DevelopmentSpecService, DevelopmentSpecTask } from "./development-spec-service.js";`, `import type { DevelopmentSpecMarkDetails, DevelopmentSpecPersistedStateName, DevelopmentSpecService, DevelopmentSpecTask } from "./development-spec-service.js";`],
  ["directive-adaptive", `  "Bir görev başarısızsa kök nedeni düzelt, tekrar test et ve ancak kanıtlı sonuçtan sonra sonraki atomik göreve geç."
].join("\\n");`, `  "Bir görev başarısızsa kök nedeni düzelt, tekrar test et ve ancak kanıtlı sonuçtan sonra sonraki atomik göreve geç.",
  "3362 sabit çekirdek görev kanıtlı tamamlandıktan sonra durma; adaptif bakım modunda mevcut repo/runtime kanıtını yeniden incele, yeni somut darboğaz/regresyon/UX/güvenlik/performans fırsatı bul, gerçek kaynak değişikliği + regresyon testi + verify ile sürekli ilerle."
].join("\\n");`],
  ["adaptive-types", `type VerificationResult = {
  ok: boolean;
  evidence: string[];
  detail: string;
};`, `type VerificationResult = {
  ok: boolean;
  evidence: string[];
  detail: string;
};

type AdaptiveMissionState = {
  task: DevelopmentSpecTask;
  state: DevelopmentSpecPersistedStateName;
  attempts: number;
  retryAfterAt: string | null;
  lastError: string | null;
  updatedAt: string;
};
type AdaptiveState = {
  schemaVersion: 1;
  sequence: number;
  completed: number;
  failed: number;
  current: AdaptiveMissionState | null;
  recent: Array<{ taskId: string; title: string; track: EvolutionTrack; state: string; completedAt: string }>;
};

const ADAPTIVE_FOCUS: ReadonlyArray<{ track: EvolutionTrack; title: string; objective: string }> = [
  { track: "quality", title: "Regresyon avı", objective: "mevcut testler ve hata yollarında henüz kapsanmayan somut bir regresyon riski bul ve kalıcı düzelt" },
  { track: "performance", title: "Kaynak ve gecikme bütçesi", objective: "RAM/CPU/disk polling/provider latency açısından ölçülebilir bir darboğaz bul, davranışı koruyarak azalt ve regresyon kapısı ekle" },
  { track: "design", title: "Akış ve etkileşim", objective: "ChatGPT/Gemini/Claude sınıfı akıcı masaüstü UX açısından gerçek bir etkileşim sürtünmesi bul ve erişilebilir biçimde düzelt" },
  { track: "security", title: "Fail-closed güvenlik", objective: "izin, path sınırı, secret, supply-chain veya provider doğrulamasında somut bir bypass/fail-open ihtimali bul ve negatif testle kapat" },
  { track: "architecture", title: "Eşzamanlılık ve dayanıklılık", objective: "queue, crash/restart, durable job, worktree veya state geçişlerinde yarış/iyileşme kusuru bul ve deterministik olarak düzelt" },
  { track: "api", title: "API sözleşmesi", objective: "Core API hata semantiği, idempotency, doğrulama veya kaynak modelinde gerçek bir eksik bul ve uyumluluk testiyle düzelt" },
  { track: "accessibility", title: "Erişilebilirlik", objective: "klavye, focus, reduced-motion, aria veya okunabilirlikte gerçek bir sorun bul ve doğrulanabilir biçimde düzelt" },
  { track: "integrations", title: "Araç entegrasyonu", objective: "mevcut açık kaynak/izinli araç zincirinde doğrulanabilir bir entegrasyon veya health-check eksikliği bul ve sahte READY üretmeden tamamla" },
  { track: "supply-chain", title: "Bağımlılık güveni", objective: "kilit dosyası, kaynak kimliği, binary/tool doğrulaması veya güncelleme zincirinde somut bir güven açığı bul ve fail-closed kapat" },
  { track: "documentation", title: "Gerçeklik ve işletilebilirlik", objective: "kullanıcıya yanlış güven verebilecek güncelliğini yitirmiş bir ürün sözleşmesi/diagnostic açıklaması bul ve gerçek runtime davranışıyla eşleştir" }
];

export function createAdaptiveEvolutionTask(sequence: number): DevelopmentSpecTask {
  const safeSequence = Math.max(1, Math.trunc(sequence));
  const focus = ADAPTIVE_FOCUS[(safeSequence - 1) % ADAPTIVE_FOCUS.length]!;
  const taskId = \`ADAPT-${'${String(safeSequence).padStart(6, "0") }'}\`;
  return {
    taskId,
    phaseId: "ADAPT",
    family: "ADAPTIVE_CONTINUOUS_MAINTENANCE",
    parentTaskId: null,
    title: \`${'${focus.title}'} · sürekli bakım ${'${safeSequence}'}\`,
    objective: [
      \`Adaptif odak: ${'${focus.objective}'}.\`,
      "Önce mevcut repo, son görev geçmişi, testler ve runtime kanıtlarını incele; daha önce çözülmüş işi sırf aktivite üretmek için tekrarlama.",
      "Tek bir somut, yeniden üretilebilir eksik seç. Gerçek kaynak koduna en küçük güvenli değişikliği uygula ve ilgili regresyon/negatif testi ekle veya güçlendir.",
      "Sadece yorum, backlog, demo, placeholder, sahte metrik veya no-op biçim değişikliği PASS değildir. Ölçülemeyen alanda uydurma benchmark yazma.",
      "Projenin en güçlü verify/typecheck/test/build kapısını gerçekten çalıştır. Başarısızsa aynı görevi düzeltip tekrar test et; kanıtlı PASS olmadan yeni adaptif göreve geçme."
    ].join(" "),
    sourceLine: null,
    sourceResearch: [],
    requirementIds: [\`REQ-${'${taskId}'}\`],
    dependencies: [],
    plannedFiles: [],
    touchedFiles: [],
    commands: ["repo/runtime incele", "en güçlü doğrulama kapısını çalıştır"],
    tests: ["değişiklik için gerçek pozitif regresyon testi"],
    failureTests: ["kök nedene karşı gerçek negatif/failure testi"],
    securityChecks: ["güvenlik etkisini gerçek değişikliğe göre değerlendir"],
    performanceChecks: ["performans etkisini gerçek değişikliğe göre değerlendir"],
    uxChecks: ["UX/erişilebilirlik etkisini gerçek değişikliğe göre değerlendir"],
    evidence: ["git diff", "test/verify komut çıktısı", "kalıcı git commit"],
    reviewer: "DEVBOX_ADAPTIVE_DETERMINISTIC_GATE_V1",
    track: focus.track
  };
}`],
  ["adaptive-methods", `  public start(): void {`, `  #adaptiveKey(projectId: string): string { return \`api-evolution:adaptive:${'${projectId}'}\`; }
  #adaptiveState(projectId: string): AdaptiveState {
    const stored = this.#database.getSetting<AdaptiveState>(this.#adaptiveKey(projectId));
    return stored?.schemaVersion === 1 ? stored : { schemaVersion: 1, sequence: 0, completed: 0, failed: 0, current: null, recent: [] };
  }
  #saveAdaptive(projectId: string, state: AdaptiveState): AdaptiveState { this.#database.setSetting(this.#adaptiveKey(projectId), state); return state; }
  #isAdaptive(task: DevelopmentSpecTask): boolean { return task.taskId.startsWith("ADAPT-"); }
  #nextAdaptiveTask(projectId: string): DevelopmentSpecTask {
    const state = this.#adaptiveState(projectId);
    if (state.current) return state.current.task;
    const sequence = state.sequence + 1;
    const task = createAdaptiveEvolutionTask(sequence);
    this.#saveAdaptive(projectId, { ...state, sequence, current: { task, state: "FAILED", attempts: 0, retryAfterAt: null, lastError: null, updatedAt: new Date().toISOString() } });
    return task;
  }
  #attemptsFor(projectId: string, task: DevelopmentSpecTask): number {
    if (!this.#isAdaptive(task)) return this.#spec.getState(projectId, task.taskId)?.attempts ?? 1;
    return Math.max(1, this.#adaptiveState(projectId).current?.attempts ?? 1);
  }
  #markSpecTask(projectId: string, task: DevelopmentSpecTask, stateName: DevelopmentSpecPersistedStateName, details: DevelopmentSpecMarkDetails = {}): void {
    if (!this.#isAdaptive(task)) { this.#spec.mark(projectId, task.taskId, stateName, details); return; }
    const adaptive = this.#adaptiveState(projectId);
    if (stateName === "PASS") {
      if (adaptive.recent.some((item) => item.taskId === task.taskId && item.state === "PASS")) return;
      this.#saveAdaptive(projectId, {
        ...adaptive,
        completed: adaptive.completed + 1,
        current: null,
        recent: [{ taskId: task.taskId, title: task.title, track: task.track, state: "PASS", completedAt: new Date().toISOString() }, ...adaptive.recent].slice(0, 120)
      });
      return;
    }
    const current = adaptive.current?.task.taskId === task.taskId ? adaptive.current : { task, state: stateName, attempts: 0, retryAfterAt: null, lastError: null, updatedAt: new Date().toISOString() };
    const attempts = current.attempts + (stateName === "RUNNING" ? 1 : 0);
    this.#saveAdaptive(projectId, {
      ...adaptive,
      failed: adaptive.failed + (stateName === "FAILED" ? 1 : 0),
      current: {
        ...current,
        task,
        state: stateName,
        attempts,
        retryAfterAt: details.retryAfterAt ?? null,
        lastError: details.lastError ?? current.lastError,
        updatedAt: new Date().toISOString()
      }
    });
  }

  public start(): void {`],
  ["choose-adaptive", `    const specTask = this.#spec.next(projectId, { ignoreRetryAfter: manual, allowBlockedExternalRetry: manual, allowRecoveryRetry: manual });
    if (!specTask) {
      const summary = this.#spec.summary(projectId);
      if (summary.remainingCount === 0) throw new Error("EVOLUTION_SPEC_QUEUE_COMPLETE");`, `    const coreSummary = this.#spec.summary(projectId);
    const specTask = this.#spec.next(projectId, { ignoreRetryAfter: manual, allowBlockedExternalRetry: manual, allowRecoveryRetry: manual })
      ?? (coreSummary.remainingCount === 0 ? this.#nextAdaptiveTask(projectId) : null);
    if (!specTask) {
      const summary = this.#spec.summary(projectId);`],
  ["mark-running", `    this.#spec.mark(projectId, specTask.taskId, "RUNNING", { lastError: null, blockReason: null, retryAfterAt: null });
    const persistedAttempt = this.#spec.getState(projectId, specTask.taskId)?.attempts ?? 1;`, `    this.#markSpecTask(projectId, specTask, "RUNNING", { lastError: null, blockReason: null, retryAfterAt: null });
    const persistedAttempt = this.#attemptsFor(projectId, specTask);`],
  ["system-adaptive", `      "BU ATOMİK GÖREV:", specTask.objective,
      "KALICI ANA YÖNERGE:", campaign.directive,`, `      this.#isAdaptive(specTask) ? "ADAPTİF SÜREKLİ BAKIM GÖREVİ: sabit 3362 çekirdek plan tamamlandı; mevcut ürün kanıtından yeni somut iyileştirme seçildi." : "ÇEKİRDEK ATOMİK GÖREV:",
      "BU ATOMİK GÖREV:", specTask.objective,
      "KALICI ANA YÖNERGE:", campaign.directive,`],
  ["mark-blocked", `        this.#spec.mark(projectId, specTask.taskId, "BLOCKED_EXTERNAL", { blockReason: reason, evidence });`, `        this.#markSpecTask(projectId, specTask, "BLOCKED_EXTERNAL", { blockReason: reason, evidence });`],
  ["success-evidence", `      this.#spec.mark(projectId, specTask.taskId, "PASS", { evidence, lastError: null, blockReason: null, acceptance: response.acceptance, deterministicReviewer: "DEVBOX_DETERMINISTIC_GATE_V1" });
      const phaseEvidence = this.#spec.writePhaseEvidence(projectId, executionRoot, specTask.phaseId);
      const phaseEvidenceCommit = await this.#commitEvidenceSnapshot(executionRoot, specTask, controller.signal);
      const finalEvidence = [...evidence, ...phaseEvidence, ...phaseEvidenceCommit].slice(0, 40);
      this.#spec.mark(projectId, specTask.taskId, "PASS", { evidence: finalEvidence, lastError: null, blockReason: null, acceptance: response.acceptance, deterministicReviewer: "DEVBOX_DETERMINISTIC_GATE_V1" });`, `      this.#markSpecTask(projectId, specTask, "PASS", { evidence, lastError: null, blockReason: null, acceptance: response.acceptance, deterministicReviewer: this.#isAdaptive(specTask) ? "DEVBOX_ADAPTIVE_DETERMINISTIC_GATE_V1" : "DEVBOX_DETERMINISTIC_GATE_V1" });
      const phaseEvidence = this.#isAdaptive(specTask) ? ["adaptive-mission:verified-source-commit"] : this.#spec.writePhaseEvidence(projectId, executionRoot, specTask.phaseId);
      const phaseEvidenceCommit = this.#isAdaptive(specTask) ? [] : await this.#commitEvidenceSnapshot(executionRoot, specTask, controller.signal);
      const finalEvidence = [...evidence, ...phaseEvidence, ...phaseEvidenceCommit].slice(0, 40);
      this.#markSpecTask(projectId, specTask, "PASS", { evidence: finalEvidence, lastError: null, blockReason: null, acceptance: response.acceptance, deterministicReviewer: this.#isAdaptive(specTask) ? "DEVBOX_ADAPTIVE_DETERMINISTIC_GATE_V1" : "DEVBOX_DETERMINISTIC_GATE_V1" });`],
  ["next-cycle-adaptive", `        lastCycleAt: completedAt, lastCycleDurationMs: response.durationMs, lastError: null, nextCycleAt: updated.enabled && specSummary.remainingCount > 0 && specSummary.currentGateState !== "BLOCKED_EXTERNAL" && specSummary.currentGateState !== "RECOVERY_REQUIRED" ? new Date(Date.now() + 500).toISOString() : null,`, `        lastCycleAt: completedAt, lastCycleDurationMs: response.durationMs, lastError: null, nextCycleAt: updated.enabled && (specSummary.remainingCount === 0 || (specSummary.currentGateState !== "BLOCKED_EXTERNAL" && specSummary.currentGateState !== "RECOVERY_REQUIRED")) ? new Date(Date.now() + 500).toISOString() : null,`],
  ["attempts-failure", `      const attempts = this.#spec.getState(projectId, specTask.taskId)?.attempts ?? persistedAttempt;`, `      const attempts = this.#attemptsFor(projectId, specTask);`],
  ["mark-failure", `      this.#spec.mark(projectId, specTask.taskId, specState, { blockReason: blocker ? message : null, lastError: cancelled ? "Kullanıcı tarafından durduruldu." : message, evidence: [durable.id, ...rollbackEvidence], retryAfterAt });`, `      this.#markSpecTask(projectId, specTask, specState, { blockReason: blocker ? message : null, lastError: cancelled ? "Kullanıcı tarafından durduruldu." : message, evidence: [durable.id, ...rollbackEvidence], retryAfterAt });`],
  ["completed-message", `      this.#publish(projectId, { stage: "COMPLETED", kind: "evidence", message: \`${'${specTask.taskId}'} PASS · gerçek değişiklik doğrulandı, kalıcı Git commit oluşturuldu ve faz evidence kayıtları yazıldı.\`, provider: response.provider, model: response.model });`, `      this.#publish(projectId, { stage: "COMPLETED", kind: "evidence", message: this.#isAdaptive(specTask) ? \`${'${specTask.taskId}'} PASS · adaptif gerçek değişiklik doğrulandı ve kalıcı Git commit oluşturuldu; sıradaki bakım görevi üretilecek.\` : \`${'${specTask.taskId}'} PASS · gerçek değişiklik doğrulandı, kalıcı Git commit oluşturuldu ve faz evidence kayıtları yazıldı.\`, provider: response.provider, model: response.model });`]
]);

await patch("src/main/services/api-evolution-service.test.ts", [
  ["adaptive-import", `import { ApiEvolutionService } from "./api-evolution-service.js";`, `import { ApiEvolutionService, createAdaptiveEvolutionTask } from "./api-evolution-service.js";`],
  ["adaptive-tests", `describe("API evolution persistence", () => {`, `describe("adaptive API evolution tasks", () => {
  it("rotates real maintenance domains after the fixed core graph", () => {
    const first = createAdaptiveEvolutionTask(1);
    const second = createAdaptiveEvolutionTask(2);
    const eleventh = createAdaptiveEvolutionTask(11);
    expect(first.taskId).toBe("ADAPT-000001");
    expect(second.track).not.toBe(first.track);
    expect(eleventh.track).toBe(first.track);
    expect(first.objective).toMatch(/gerçek kaynak|regresyon|verify/iu);
    expect(first.objective).toMatch(/demo|placeholder|no-op/iu);
  });
});

describe("API evolution persistence", () => {`]
]);

await patch("src/renderer/AdvancedViews.tsx", [
  ["adaptive-flags", `  const phaseProgressLabel = campaign?.spec.currentPhaseId
    ? \`${'${campaign.spec.currentPhaseId}'}/22 · G${'${campaign.spec.currentTaskIndex ?? "—"}'}/${'${campaign.spec.currentPhaseTaskCount ?? "—"}'} · ${'${campaign.runtime.stage}'}\`
    : "22/22 Faz tamamlandı";`, `  const adaptiveMode = Boolean(campaign && campaign.spec.remainingCount === 0);
  const adaptiveActive = Boolean(campaign?.runtime.activeSpecTaskId?.startsWith("ADAPT-"));
  const phaseProgressLabel = campaign?.spec.currentPhaseId
    ? \`${'${campaign.spec.currentPhaseId}'}/22 · G${'${campaign.spec.currentTaskIndex ?? "—"}'}/${'${campaign.spec.currentPhaseTaskCount ?? "—"}'} · ${'${campaign.runtime.stage}'}\`
    : adaptiveMode ? adaptiveActive ? \`22/22 çekirdek PASS · ${'${campaign?.runtime.activeSpecTaskId}'}\` : "22/22 çekirdek PASS · adaptif bakım hazır" : "22/22 Faz tamamlandı";`],
  ["heading-copy", `<div className="advanced-heading evolution-heading"><div><span className="advanced-eyebrow">KALICI GELİŞİM KONTROL DÜZLEMİ · V8</span><h1>DevBox API gelişimi</h1><p><strong>geliştirme.md</strong> atomik görev grafiğini DevBox'ın kalıcı self-development kaynak deposunda uygular. <strong>Gerçek dışı/temsili başarı ve uydurma kanıt yasaktır.</strong> Model seçimi kullanıcı kontrolündedir; provider/model/komut/test/bekleme durumu canlı runtime eventlerinden gösterilir. “Şimdi çalıştır” tek kullanıcı eylemiyle sürekli döngüyü başlatır; Durdurulana kadar görevler otomatik ilerler. Gerçek harici engel, üç başarısız doğrulama sonrası recovery veya tamamlanmış görev grafiği fail-closed olarak akışı durdurabilir. Doğrulanmış dosya değişikliği kalıcı Git commit olmadan PASS değildir.</p></div>`, `<div className="advanced-heading evolution-heading"><div><span className="advanced-eyebrow">KALICI GELİŞİM KONTROL DÜZLEMİ · V9 ADAPTIVE</span><h1>DevBox API gelişimi</h1><p><strong>geliştirme.md</strong> içindeki 22 faz / 3362 atomik çekirdek görevi önce kanıtlı biçimde uygular. Çekirdek plan bittiğinde sistem durmaz; <strong>adaptif bakım döngüsü</strong> repo, test ve runtime kanıtını yeniden inceleyerek kalite, performans, UX, güvenlik, eşzamanlılık, API ve supply-chain alanlarında yeni somut görev üretir. <strong>Simülasyon, demo, fake, sahte, placeholder, no-op ve uydurma kanıt yasaktır.</strong> Recoverable hata aynı görevi FIX → RETEST backoff döngüsünde tutar; yalnız gerçek harici engel, veri kaybı riski taşıyan recovery veya Durdur akışı keser. Kalıcı Git commit + bağımsız verify olmadan PASS yoktur.</p></div>`],
  ["adaptive-card", `      <section className="evolution-phase-control" aria-label="22 Faz gerçek ilerleme durumu">`, `      {adaptiveMode && <section className={\`evolution-adaptive-mode ${'${adaptiveActive ? "active" : ""}'}\`}><div className="adaptive-orbit" aria-hidden="true"><i /><i /></div><div><span>ADAPTİF SÜREKLİ BAKIM</span><strong>{adaptiveActive ? campaign.runtime.activeSpecTaskId : campaign.enabled ? "Yeni gerçek görev üretmeye hazır" : "Döngü durduruldu"}</strong><p>3362 çekirdek görevin tamamı PASS. Bundan sonraki görevler sırf sayaç artırmak için değil, mevcut ürün kanıtından yeni regresyon, gecikme, kaynak tüketimi, UX, güvenlik veya mimari eksik bularak üretilir. Aynı görev başarısızsa atlanmaz; düzeltilip yeniden test edilir.</p></div><Status value={campaign.enabled ? campaign.runtime.stage : "IDLE"} /></section>}

      <section className="evolution-phase-control" aria-label="22 Faz gerçek ilerleme durumu">`],
  ["truth-adaptive", `<strong>“Şimdi çalıştır” Durdurulana kadar sürekli gerçek uygulama başlatır.</strong>`, `<strong>“Şimdi çalıştır” Durdurulana kadar çekirdek + adaptif sürekli gerçek uygulama başlatır.</strong>`]
]);

const stylesPath = "src/renderer/styles.css";
let styles = await readFile(stylesPath, "utf8");
const marker = "/* DEVBOX_V014_ADAPTIVE_UI */";
if (styles.includes(marker)) throw new Error("PATCH_ALREADY_PRESENT:styles-v014");
styles += `\n\n${marker}\n.evolution-adaptive-mode{position:relative;display:grid;grid-template-columns:1fr auto;gap:18px;align-items:center;overflow:hidden;margin:14px 0;padding:18px 20px;border:1px solid rgba(72,220,177,.24);border-radius:16px;background:linear-gradient(135deg,rgba(28,62,58,.42),rgba(17,24,31,.78));box-shadow:inset 0 1px 0 rgba(255,255,255,.025)}\n.evolution-adaptive-mode>div:not(.adaptive-orbit){position:relative;z-index:1;display:grid;gap:6px}.evolution-adaptive-mode span{font-size:10px;letter-spacing:.16em;color:var(--accent)}.evolution-adaptive-mode strong{font-size:15px}.evolution-adaptive-mode p{max-width:900px;margin:0;color:var(--text-muted);font-size:12px;line-height:1.55}.adaptive-orbit{position:absolute;right:56px;width:120px;height:120px;border:1px solid rgba(91,238,197,.14);border-radius:50%;pointer-events:none}.adaptive-orbit:before{content:"";position:absolute;inset:20px;border:1px dashed rgba(91,238,197,.16);border-radius:50%}.adaptive-orbit i{position:absolute;left:50%;top:50%;width:5px;height:5px;margin:-2.5px;border-radius:50%;background:var(--accent);transform-origin:0 0;animation:devbox-adaptive-orbit 5s linear infinite}.adaptive-orbit i+ i{animation-duration:8s;animation-direction:reverse}@keyframes devbox-adaptive-orbit{from{transform:rotate(0deg) translateX(48px)}to{transform:rotate(360deg) translateX(48px)}}.composer.busy textarea{opacity:1}.composer.busy:focus-within{box-shadow:0 0 0 1px rgba(78,219,180,.16)}@media (prefers-reduced-motion:reduce){.adaptive-orbit i{animation:none}.evolution-adaptive-mode{scroll-behavior:auto}}\n`;
await writeFile(stylesPath, styles, "utf8");

console.log("DEVBOX_V014_UI_EVOLUTION_PATCH_APPLIED");
