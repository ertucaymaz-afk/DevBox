import { createHash, randomUUID } from "node:crypto";
import { createReadStream, existsSync, lstatSync, readFileSync, readlinkSync } from "node:fs";
import { redactUnknown } from "../security/redaction.js";
import path from "node:path";
import type {
  EvolutionActivityEvent,
  EvolutionCampaign,
  EvolutionLearning,
  EvolutionModelCatalog,
  EvolutionRouting,
  EvolutionTask,
  EvolutionTrack
} from "../../shared/contracts.js";
import { EvolutionActivityEventSchema, EvolutionCampaignSchema, EvolutionRoutingSchema } from "../../shared/contracts.js";
import type { AgentProgressEvent, AgentService } from "./agent-service.js";
import type { CommandRunner } from "./command-runner.js";
import type { StateDatabase } from "./database.js";
import type { DevelopmentSpecService, DevelopmentSpecTask } from "./development-spec-service.js";
import type { GitService } from "./git-service.js";
import type { ProjectService } from "./project-service.js";
import type { SettingsService } from "./settings-service.js";
import type { WorktreeService } from "./worktree-service.js";

const PRIMARY_PROVIDER = "OpenAI Codex CLI";
const PRIMARY_MODEL = "gpt-5.6-sol";
const DEFAULT_INTERVAL_MINUTES = 60;
const JOB_LEASE_MS = 4 * 60_000;
const JOB_HEARTBEAT_MS = 60_000;
const MATURITY_MODEL_VERSION = 2 as const;
const MAX_ACTIVITY = 240;
const MAX_EXECUTION_HISTORY = 400;
const MAX_LEARNINGS = 400;
const MAX_AUTOMATIC_RETRIES = 3;
const RETRY_BASE_MS = 5_000;
const RETRY_MAX_MS = 5 * 60_000;
const DEFAULT_ROUTING: EvolutionRouting = {
  mode: "AUTO",
  provider: "codex",
  model: PRIMARY_MODEL,
  reasoningEffort: "high",
  allowFallback: true
};
const DEFAULT_DIRECTIVE = [
  "DevBox'ı gerçek, üretim kalitesinde ve kanıt temelli bir Windows mühendislik masaüstü olarak geliştir.",
  "geliştirme.md kaynaklı atomik görev grafiğini sırayla uygula; görevi yalnız gerçek dosya/çalışma sonucu ve doğrulama kanıtı varsa tamamlanmış say.",
  "SİMÜLASYON, DEMO, FAKE, SAHTE, gerçek dışı/temsili başarı, placeholder capability ve uydurma kanıt kesinlikle yasaktır. Test-double yalnız izole unit testte kullanılabilir ve READY/PASS kanıtı sayılamaz.",
  "UI butonu, model yanıtı, process'in açılması veya exit code 0 tek başına PASS değildir.",
  "Her mutasyondan sonra uygun statik analiz, test, negatif/failure kontrolü ve git diff doğrulaması yap; test çalıştırılmadıysa geçti deme.",
  "Gizli değerleri isteme veya çıktıya yazma. Sağlayıcı, model, komut, bekleme ve fallback durumlarını gerçek kimliğiyle kaydet.",
  "Mevcut kullanıcı değişikliklerini silme; destructive işlem yapma. Çakışmada güvenli biçimde dur ve nedeni açıkla.",
  "Bir görev başarısızsa kök nedeni düzelt, tekrar test et ve ancak kanıtlı sonuçtan sonra sonraki atomik göreve geç."
].join("\n");

type RuntimeStage = EvolutionCampaign["runtime"]["stage"];
type ActivityListener = (event: EvolutionActivityEvent) => void;

type VerificationResult = {
  ok: boolean;
  evidence: string[];
  detail: string;
};

function dayKey(date = new Date()): string { return date.toISOString().slice(0, 10); }
function nextAt(intervalMinutes: number, from = new Date()): string { return new Date(from.getTime() + intervalMinutes * 60_000).toISOString(); }
function conciseLearning(content: string): string { return content.replace(/```[\s\S]*?```/gu, " [kod bloğu] ").replace(/\s+/gu, " ").trim().slice(0, 1_200) || "Ajan çıktı üretmedi."; }
function levelForPoints(points: number, floor: number): number { let level = 1; while (Math.round(100 * Math.pow(level, 1.55)) <= points) level += 1; return Math.max(floor, level); }
function stageFor(level: number, score: number): string { if (score === 0) return `Seviye ${level} · kanıt bekliyor`; if (score >= 90) return `Seviye ${level} · geniş kapsam`; if (score >= 60) return `Seviye ${level} · çok alanlı`; return `Seviye ${level} · uygulanıyor`; }

const TRACKS: readonly EvolutionTrack[] = ["research", "architecture", "api", "coding", "design", "quality", "security", "release", "performance", "observability", "accessibility", "integrations", "documentation", "supply-chain"];
function domainScores(tasks: readonly EvolutionTask[], previous?: unknown): Record<EvolutionTrack, number> {
  const source = previous && typeof previous === "object" && !Array.isArray(previous) ? previous as Record<string, unknown> : {};
  return Object.fromEntries(TRACKS.map((track) => {
    const old = typeof source[track] === "number" ? Math.max(0, Math.min(100, Math.round(source[track]))) : 0;
    return [track, Math.max(old, tasks.some((task) => task.track === track && task.state === "SUCCEEDED") ? 100 : 0)];
  })) as Record<EvolutionTrack, number>;
}

function executionTask(specTask: DevelopmentSpecTask): EvolutionTask {
  const now = new Date().toISOString();
  return {
    id: randomUUID(), specTaskId: specTask.taskId, phaseId: specTask.phaseId, sourceLine: specTask.sourceLine,
    track: specTask.track, title: `${specTask.phaseId} · ${specTask.taskId} · ${specTask.title}`,
    prompt: specTask.objective, state: "QUEUED", provider: null, model: null, threadId: null, durableJobId: null,
    evidence: [], error: null, attempts: 0, blockReason: null, retryAfterAt: null, createdAt: now, startedAt: null, completedAt: null
  };
}

function normalizeOldTask(value: unknown): EvolutionTask | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || typeof record.title !== "string" || typeof record.prompt !== "string" || typeof record.track !== "string") return null;
  const state = ["QUEUED", "PREPARING", "RUNNING", "VERIFYING", "REVIEWING", "SUCCEEDED", "FAILED", "BLOCKED_EXTERNAL", "CANCELLED", "RECOVERY_REQUIRED"].includes(String(record.state)) ? String(record.state) as EvolutionTask["state"] : "FAILED";
  return {
    id: record.id, specTaskId: typeof record.specTaskId === "string" ? record.specTaskId : null, phaseId: typeof record.phaseId === "string" ? record.phaseId : null,
    sourceLine: typeof record.sourceLine === "number" && record.sourceLine > 0 ? Math.trunc(record.sourceLine) : null,
    track: TRACKS.includes(record.track as EvolutionTrack) ? record.track as EvolutionTrack : "coding", title: record.title, prompt: record.prompt, state,
    provider: typeof record.provider === "string" ? record.provider : null, model: typeof record.model === "string" ? record.model : null,
    threadId: typeof record.threadId === "string" ? record.threadId : null, durableJobId: typeof record.durableJobId === "string" ? record.durableJobId : null,
    evidence: Array.isArray(record.evidence) ? record.evidence.filter((item): item is string => typeof item === "string").slice(0, 40) : [],
    error: typeof record.error === "string" ? record.error.slice(0, 1_000) : null,
    attempts: typeof record.attempts === "number" && Number.isFinite(record.attempts) ? Math.max(0, Math.trunc(record.attempts)) : 0,
    blockReason: typeof record.blockReason === "string" ? record.blockReason.slice(0, 1_000) : null,
    retryAfterAt: typeof record.retryAfterAt === "string" ? record.retryAfterAt : null,
    createdAt: typeof record.createdAt === "string" ? record.createdAt : new Date().toISOString(),
    startedAt: typeof record.startedAt === "string" ? record.startedAt : null,
    completedAt: typeof record.completedAt === "string" ? record.completedAt : null
  };
}

export class ApiEvolutionService {
  readonly #database: StateDatabase;
  readonly #projects: ProjectService;
  readonly #agent: AgentService;
  readonly #settings: SettingsService;
  readonly #spec: DevelopmentSpecService;
  readonly #git: GitService;
  readonly #runner: CommandRunner;
  readonly #worktrees: WorktreeService | null;
  readonly #inFlight = new Set<string>();
  readonly #controllers = new Map<string, AbortController>();
  readonly #listeners = new Set<ActivityListener>();
  readonly #sequence = new Map<string, number>();
  readonly #continuations = new Map<string, NodeJS.Timeout>();
  #timer: NodeJS.Timeout | null = null;

  public constructor(database: StateDatabase, projects: ProjectService, agent: AgentService, settings: SettingsService, spec: DevelopmentSpecService, git: GitService, runner: CommandRunner, worktrees: WorktreeService | null = null) {
    this.#database = database; this.#projects = projects; this.#agent = agent; this.#settings = settings; this.#spec = spec; this.#git = git; this.#runner = runner; this.#worktrees = worktrees;
  }

  public start(): void {
    if (this.#timer) return;
    this.#database.recoverExpiredDurableJobs();
    for (const project of this.#projects.list()) {
      const before = this.get(project.id);
      const recovered = this.#spec.recoverRunning(project.id);
      if (recovered > 0) {
        const now = new Date().toISOString();
        const detail = `${recovered} yarım kalmış atomik görev RECOVERY_REQUIRED durumuna alındı. Kör tekrar yapılmadı; Şimdi çalıştır ile açık recovery yeniden denemesi gerekir.`;
        this.#save({
          ...before,
          isRunning: false,
          nextCycleAt: null,
          lastError: detail,
          spec: this.#spec.summary(project.id),
          runtime: { ...before.runtime, stage: "RECOVERY_REQUIRED", detail, waitingReason: detail, updatedAt: now },
          updatedAt: now
        });
        this.#publish(project.id, { stage: "RECOVERY_REQUIRED", kind: "failure", message: detail, provider: before.runtime.provider, model: before.runtime.model });
      } else {
        this.get(project.id);
      }
    }
    this.#timer = setInterval(() => void this.#tick(), 60_000); this.#timer.unref();
    void this.#tick();
  }

  public stop(): void {
    if (this.#timer) clearInterval(this.#timer); this.#timer = null;
    for (const timer of this.#continuations.values()) clearTimeout(timer);
    this.#continuations.clear();
    for (const controller of this.#controllers.values()) controller.abort();
    this.#controllers.clear();
  }

  public subscribe(listener: ActivityListener): () => void { this.#listeners.add(listener); return () => this.#listeners.delete(listener); }


  public listActivity(projectId: string, limit = 120): EvolutionActivityEvent[] {
    this.#projects.get(projectId);
    const rows = this.#database.listEvents({ type: "api-evolution.activity", aggregateId: projectId, limit: Math.max(1, Math.min(500, Math.trunc(limit))), order: "desc" });
    return rows.flatMap((row) => {
      const parsed = EvolutionActivityEventSchema.safeParse(row.payload);
      return parsed.success ? [parsed.data] : [];
    });
  }

  public async listModels(projectId: string, provider: EvolutionRouting["provider"]): Promise<EvolutionModelCatalog> {
    const project = this.#projects.get(projectId);
    return await this.#agent.listEvolutionModels(provider, project.rootPath);
  }

  public get(projectId: string): EvolutionCampaign {
    this.#projects.get(projectId);
    const stored = this.#database.getSetting<unknown>(this.#key(projectId));
    const now = new Date();
    if (stored && typeof stored === "object" && !Array.isArray(stored)) {
      const record = stored as Record<string, unknown>;
      const tasks = Array.isArray(record.tasks) ? record.tasks.map(normalizeOldTask).filter((item): item is EvolutionTask => Boolean(item)).slice(-MAX_EXECUTION_HISTORY) : [];
      const routingParsed = EvolutionRoutingSchema.safeParse(record.routing);
      const routing = routingParsed.success ? routingParsed.data : DEFAULT_ROUTING;
      const previousLevel = Math.max(1, Number(record.level ?? 1), Number(record.lifetimeLevel ?? 1), Number(record.migrationFloorLevel ?? 1));
      const candidate: EvolutionCampaign = {
        maturityModelVersion: MATURITY_MODEL_VERSION, projectId, enabled: Boolean(record.enabled ?? this.#settings.get().networkAccess), isRunning: Boolean(record.isRunning),
        directive: typeof record.directive === "string" && record.directive.trim().length >= 80 ? record.directive : DEFAULT_DIRECTIVE,
        routing,
        runtime: record.runtime && typeof record.runtime === "object" ? record.runtime as EvolutionCampaign["runtime"] : { stage: "IDLE", detail: "Hazır.", waitingReason: null, activeTaskId: null, activeSpecTaskId: null, activePhaseId: null, durableJobId: null, provider: null, model: null, worktreePath: null, startedAt: null, updatedAt: now.toISOString() },
        activity: Array.isArray(record.activity) ? record.activity.slice(-MAX_ACTIVITY) as EvolutionActivityEvent[] : [],
        spec: this.#spec.summary(projectId), score: Math.max(0, Math.min(100, Number(record.score ?? 0))), level: previousLevel, lifetimeLevel: previousLevel,
        migrationFloorLevel: previousLevel, lifetimeEvidencePoints: Math.max(0, Number(record.lifetimeEvidencePoints ?? 0)), validatedImprovementCount: Math.max(0, Number(record.validatedImprovementCount ?? 0)),
        stablePromotionCount: Math.max(0, Number(record.stablePromotionCount ?? 0)), verifiedResearchCount: Math.max(0, Number(record.verifiedResearchCount ?? 0)),
        verifiedRegressionFixCount: Math.max(0, Number(record.verifiedRegressionFixCount ?? 0)), domainScores: domainScores(tasks, record.domainScores), stage: stageFor(previousLevel, Number(record.score ?? 0)),
        provider: routing.provider === "codex" ? PRIMARY_PROVIDER : "Hermes / NVIDIA NIM", model: routing.model, modelEffort: routing.reasoningEffort,
        lastProvider: typeof record.lastProvider === "string" ? record.lastProvider : null, lastModel: typeof record.lastModel === "string" ? record.lastModel : null,
        completedCycles: Math.max(0, Number(record.completedCycles ?? 0)), failedCycles: Math.max(0, Number(record.failedCycles ?? 0)), cyclesToday: Math.max(0, Number(record.cyclesToday ?? 0)),
        cycleDay: typeof record.cycleDay === "string" ? record.cycleDay : dayKey(now), dailyCycleLimit: null,
        intervalMinutes: Number(record.intervalMinutes) >= 30 ? Number(record.intervalMinutes) : DEFAULT_INTERVAL_MINUTES,
        lastCycleAt: typeof record.lastCycleAt === "string" ? record.lastCycleAt : null, nextCycleAt: typeof record.nextCycleAt === "string" ? record.nextCycleAt : null,
        lastCycleDurationMs: typeof record.lastCycleDurationMs === "number" ? Math.max(0, Math.round(record.lastCycleDurationMs)) : null,
        lastError: typeof record.lastError === "string" ? record.lastError.slice(0, 1_000) : null,
        tasks, learnings: Array.isArray(record.learnings) ? (record.learnings as EvolutionLearning[]).slice(0, MAX_LEARNINGS) : [], updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : now.toISOString()
      };
      const parsed = EvolutionCampaignSchema.safeParse(candidate);
      if (parsed.success) return this.#resetDaily(this.#save({ ...parsed.data, spec: this.#spec.summary(projectId) }));
    }
    const routing = DEFAULT_ROUTING;
    return this.#save({
      maturityModelVersion: MATURITY_MODEL_VERSION, projectId, enabled: false, isRunning: false, directive: DEFAULT_DIRECTIVE, routing,
      runtime: { stage: "IDLE", detail: "Hazır. Şimdi çalıştır ile geliştirme.md atomik görev kuyruğu başlatılabilir.", waitingReason: null, activeTaskId: null, activeSpecTaskId: null, activePhaseId: null, durableJobId: null, provider: null, model: null, worktreePath: null, startedAt: null, updatedAt: now.toISOString() },
      activity: [], spec: this.#spec.summary(projectId), score: 0, level: 1, lifetimeLevel: 1, migrationFloorLevel: 1, lifetimeEvidencePoints: 0,
      validatedImprovementCount: 0, stablePromotionCount: 0, verifiedResearchCount: 0, verifiedRegressionFixCount: 0, domainScores: domainScores([]), stage: stageFor(1, 0),
      provider: PRIMARY_PROVIDER, model: routing.model, modelEffort: routing.reasoningEffort, lastProvider: null, lastModel: null, completedCycles: 0, failedCycles: 0,
      cyclesToday: 0, cycleDay: dayKey(now), dailyCycleLimit: null, intervalMinutes: DEFAULT_INTERVAL_MINUTES, lastCycleAt: null,
      nextCycleAt: null, lastCycleDurationMs: null, lastError: null, tasks: [], learnings: [], updatedAt: now.toISOString()
    });
  }

  public setEnabled(projectId: string, enabled: boolean): EvolutionCampaign {
    if (enabled && !this.#settings.get().networkAccess) throw new Error("EVOLUTION_REQUIRES_NETWORK_PROFILE");
    const current = this.get(projectId);
    if (!enabled) { const timer = this.#continuations.get(projectId); if (timer) clearTimeout(timer); this.#continuations.delete(projectId); }
    const next = this.#save({ ...current, enabled, nextCycleAt: enabled ? new Date().toISOString() : null, updatedAt: new Date().toISOString() });
    if (enabled && !next.isRunning) this.#scheduleContinuation(projectId, 250);
    return next;
  }
  public setDirective(projectId: string, directive: string): EvolutionCampaign { const current = this.get(projectId); return this.#save({ ...current, directive: directive.trim(), updatedAt: new Date().toISOString() }); }
  public setRouting(projectId: string, routing: EvolutionRouting): EvolutionCampaign {
    const parsed = EvolutionRoutingSchema.parse(routing);
    const valid = parsed.provider === "hermes-nvidia" ? { ...parsed, reasoningEffort: "none" as const } : parsed;
    const current = this.get(projectId);
    if (current.isRunning) throw new Error("EVOLUTION_ROUTING_CHANGE_WHILE_RUNNING");
    const provider = valid.provider === "codex" ? PRIMARY_PROVIDER : "Hermes / NVIDIA NIM";
    return this.#save({ ...current, routing: valid, provider, model: valid.model, modelEffort: valid.reasoningEffort, updatedAt: new Date().toISOString() });
  }

  public cancel(projectId: string): EvolutionCampaign {
    let current = this.get(projectId);
    const timer = this.#continuations.get(projectId); if (timer) clearTimeout(timer); this.#continuations.delete(projectId);
    if (current.enabled) current = this.#save({ ...current, enabled: false, nextCycleAt: null, updatedAt: new Date().toISOString() });
    const controller = this.#controllers.get(projectId);
    if (!controller || !current.isRunning) return current;
    if (current.runtime.durableJobId) { try { this.#database.requestDurableJobCancellation(current.runtime.durableJobId); } catch { /* active process cancellation remains authoritative */ } }
    this.#publish(projectId, { stage: "CANCELLED", kind: "state", message: "Kullanıcı durdurma istedi; aktif provider/komut iptal ediliyor.", provider: current.runtime.provider, model: current.runtime.model });
    controller.abort();
    return this.get(projectId);
  }

  public async runNow(projectId: string): Promise<EvolutionCampaign> {
    this.#projects.get(projectId);
    if (!this.#settings.get().networkAccess) throw new Error("EVOLUTION_REQUIRES_NETWORK_PROFILE");
    if (this.#inFlight.has(projectId)) throw new Error("EVOLUTION_CYCLE_ALREADY_RUNNING");
    const current = this.get(projectId);
    if (!current.enabled) {
      this.#save({ ...current, enabled: true, nextCycleAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
      this.#publish(projectId, { stage: "PREPARING", kind: "state", message: "Şimdi çalıştır: sürekli gerçek API geliştirme etkinleştirildi; Durdurulana kadar atomik görevler otomatik ilerleyecek.", provider: null, model: null });
    }
    this.#inFlight.add(projectId);
    try { return await this.#runCycle(projectId, true); } finally {
      this.#inFlight.delete(projectId);
      const next = this.get(projectId); if (this.#canContinue(next)) this.#scheduleContinuation(projectId, 500);
    }
  }

  async #tick(): Promise<void> {
    for (const project of this.#projects.list()) {
      const campaign = this.get(project.id);
      if (!this.#settings.get().networkAccess || !campaign.enabled || !campaign.nextCycleAt || Date.parse(campaign.nextCycleAt) > Date.now() || this.#inFlight.has(project.id)) continue;
      this.#inFlight.add(project.id); try { await this.#runCycle(project.id, false); } catch { /* persistent state is the UI truth */ } finally {
        this.#inFlight.delete(project.id);
        const current = this.get(project.id); if (this.#canContinue(current)) this.#scheduleContinuation(project.id, 500);
      }
    }
  }

  async #runCycle(projectId: string, manual: boolean): Promise<EvolutionCampaign> {
    if (!this.#settings.get().networkAccess) throw new Error("EVOLUTION_REQUIRES_NETWORK_PROFILE");
    const project = this.#projects.get(projectId); let campaign = this.#resetDaily(this.get(projectId));
    const evolutionWorktree = this.#worktrees ? await this.#worktrees.ensureEvolution(project.rootPath, projectId) : null;
    const executionRoot = evolutionWorktree?.path ?? project.rootPath;
    const isolatedEvolutionRoot = Boolean(evolutionWorktree && path.resolve(executionRoot).toLocaleLowerCase("en-US") !== path.resolve(project.rootPath).toLocaleLowerCase("en-US"));
    const specTask = this.#spec.next(projectId, { ignoreRetryAfter: manual, allowBlockedExternalRetry: manual, allowRecoveryRetry: manual });
    if (!specTask) {
      const summary = this.#spec.summary(projectId);
      if (summary.remainingCount === 0) throw new Error("EVOLUTION_SPEC_QUEUE_COMPLETE");
      if (summary.currentGateState === "BLOCKED_EXTERNAL") throw new Error("EVOLUTION_PHASE_BLOCKED_EXTERNAL");
      if (summary.currentGateState === "RECOVERY_REQUIRED") throw new Error("EVOLUTION_PHASE_RECOVERY_REQUIRED");
      throw new Error("EVOLUTION_SPEC_TASK_NOT_RUNNABLE_YET");
    }
    const task = executionTask(specTask); const controller = new AbortController(); this.#controllers.set(projectId, controller);
    const workerId = `evolution-${process.pid}`;
    const durable = this.#database.enqueueDurableJob("api-evolution", { projectId, taskId: task.id, specTaskId: specTask.taskId, phaseId: specTask.phaseId }, projectId);
    this.#database.leaseDurableJob(durable.id, workerId, JOB_LEASE_MS); this.#database.startDurableJob(durable.id, workerId, JOB_LEASE_MS);
    this.#spec.mark(projectId, specTask.taskId, "RUNNING", { lastError: null, blockReason: null, retryAfterAt: null });
    const persistedAttempt = this.#spec.getState(projectId, specTask.taskId)?.attempts ?? 1;
    const startedAt = new Date().toISOString();
    task.state = "PREPARING"; task.durableJobId = durable.id; task.startedAt = startedAt; task.attempts = persistedAttempt;
    campaign = this.#save({ ...campaign, isRunning: true, lastError: null, tasks: [...campaign.tasks, task].slice(-MAX_EXECUTION_HISTORY), spec: this.#spec.summary(projectId), runtime: { stage: "PREPARING", detail: `Görev hazırlanıyor: ${specTask.taskId} · deneme ${persistedAttempt}`, waitingReason: null, activeTaskId: task.id, activeSpecTaskId: specTask.taskId, activePhaseId: specTask.phaseId, durableJobId: durable.id, provider: null, model: null, worktreePath: executionRoot, startedAt, updatedAt: startedAt }, updatedAt: startedAt });
    this.#publish(projectId, { stage: "PREPARING", kind: "state", message: `${specTask.phaseId} / ${specTask.taskId} · deneme ${persistedAttempt} hazırlanıyor: ${specTask.title}`, provider: null, model: null });

    const heartbeat = setInterval(() => { try { this.#database.heartbeatDurableJob(durable.id, workerId, JOB_LEASE_MS); } catch { /* settlement/recovery handles terminal lease */ } }, JOB_HEARTBEAT_MS); heartbeat.unref();
    let baselineFingerprint: string | null = null;
    let baselineHead: string | null = null;
    let baselineWasClean = false;
    let baselineManaged = false;
    const systemPrompt = [
      "DEVBOX GELİŞTİRME.MD GERÇEK UYGULAMA DÖNGÜSÜ",
      `Execution ID: ${task.id}`, `Spec task: ${specTask.taskId}`, `Faz: ${specTask.phaseId}`, `Kaynak satır: ${specTask.sourceLine ?? "bilinmiyor"}`,
      `Proje: ${project.name}`, `Yazılabilir kök: ${executionRoot}`,
      "BU ATOMİK GÖREV:", specTask.objective,
      "KALICI ANA YÖNERGE:", campaign.directive,
      "ZORUNLU UYGULAMA KURALI:",
      "SİMÜLASYON / DEMO / FAKE / SAHTE başarı, gerçek dışı/temsili başarı, uydurma test sonucu, placeholder ve canned response kesinlikle yasaktır. Gerçek mutasyon + bağımsız doğrulama yoksa PASS yazma.",
      "Bu görev salt-okunur backlog üretimi değildir. İstenen değişikliği gerçek dosyalara uygula. Mevcut kullanıcı değişikliklerini koru. Gerekli testleri gerçekten çalıştır. Hata bulursan aynı görev içinde düzelt ve yeniden test et.",
      "Tamamlandı demeden önce source/diff, ilgili test/komut sonucu, en az bir anlamlı negatif/failure değerlendirmesi, security/performance/UX değerlendirmesi ve bilinen sınırlamaları üret. Uygulanmayan kategori varsa NOT_APPLICABLE_VERIFIED: <somut gerekçe> yaz. Kanıt yoksa PASS iddiası kurma.",
      "Gizli değerleri çıktılamadan çalış. Destructive/irreversible harici işlem, eksik zorunlu credential/login, fiziksel erişim veya yeni ücret gerektiren işlem gerekiyorsa dosya uydurma ve en son satırda BLOCKED_EXTERNAL sonucu üret.",
      "SONUÇ PROTOKOLÜ: Yanıtının EN SON satırı tam olarak DEVBOX_RESULT_JSON: ile başlayan tek satırlık JSON olsun.",
      'Başarı: DEVBOX_RESULT_JSON: {"status":"PASS","summary":"kısa gerçek sonuç","positiveTests":["gerçek test/sonuç"],"negativeTests":["gerçek failure testi/sonuç"],"securityChecks":["sonuç veya NOT_APPLICABLE_VERIFIED: gerekçe"],"performanceChecks":["sonuç veya NOT_APPLICABLE_VERIFIED: gerekçe"],"uxChecks":["sonuç veya NOT_APPLICABLE_VERIFIED: gerekçe"],"evidenceRefs":["dosya/komut/test referansı"]}',
      'Gerçek harici engel: DEVBOX_RESULT_JSON: {"status":"BLOCKED_EXTERNAL","summary":"kısa durum","blockReason":"kullanıcıdan/sağlayıcıdan gereken somut şey"}',
      'Uygulama başarısızlığı: DEVBOX_RESULT_JSON: {"status":"FAILED","summary":"kök neden"}'
    ].join("\n\n");

    try {
      let baselineStatus = await this.#git.status(executionRoot);
      if (!baselineStatus.available) throw new Error(`EVOLUTION_REQUIRES_GIT_REPOSITORY:${baselineStatus.error ?? "NOT_A_GIT_REPOSITORY"}`);
      if (!baselineStatus.head || !/^[a-f0-9]{40}$/u.test(baselineStatus.head)) throw new Error("EVOLUTION_BASELINE_HEAD_INVALID");
      if (baselineStatus.changes.length > 0 && isolatedEvolutionRoot) {
        await this.#restoreManagedWorkspace(executionRoot, baselineStatus.head);
        baselineStatus = await this.#git.status(executionRoot);
      }
      if (baselineStatus.changes.length > 0) throw new Error(`EVOLUTION_WORKSPACE_DIRTY_BASELINE:${baselineStatus.changes.slice(0, 12).map((item) => item.path).join(",")}`);
      baselineHead = baselineStatus.head;
      baselineManaged = isolatedEvolutionRoot || this.#isManagedWorkspace(executionRoot);
      baselineWasClean = true;
      baselineFingerprint = await this.#workspaceFingerprint(executionRoot, controller.signal);
      if (!baselineFingerprint) throw new Error("EVOLUTION_REQUIRES_GIT_REPOSITORY");
      const response = await this.#agent.respondForEvolution(
        systemPrompt, executionRoot, campaign.routing, (progress) => this.#fromAgentProgress(projectId, progress), controller.signal,
        async () => {
          const candidateFingerprint = await this.#workspaceFingerprint(executionRoot, controller.signal);
          if (!candidateFingerprint || candidateFingerprint === baselineFingerprint) throw new Error("PROVIDER_COMPLETED_WITHOUT_WORKSPACE_MUTATION");
        }
      );
      if (controller.signal.aborted) throw new Error("EVOLUTION_CANCELLED");

      if (response.outcome === "BLOCKED_EXTERNAL") {
        const blockedAt = new Date().toISOString(); const reason = response.blockReason ?? "Harici bağımlılık gerekli.";
        const rollbackEvidence = baselineWasClean && baselineHead && baselineManaged ? await this.#restoreManagedWorkspace(executionRoot, baselineHead) : [];
        const evidence = [durable.id, response.sessionId, ...response.evidence, ...rollbackEvidence].slice(0, 40);
        this.#database.settleDurableJob(durable.id, workerId, "FAILED", { status: "BLOCKED_EXTERNAL", specTaskId: specTask.taskId, provider: response.provider, model: response.model, blockReason: reason, evidence });
        this.#spec.mark(projectId, specTask.taskId, "BLOCKED_EXTERNAL", { blockReason: reason, evidence });
        const phaseEvidence: string[] = [];
        const current = this.get(projectId);
        this.#save({ ...current, isRunning: false, lastProvider: response.provider, lastModel: response.model, lastCycleAt: blockedAt, lastCycleDurationMs: response.durationMs, lastError: null, nextCycleAt: null,
          tasks: current.tasks.map((item) => item.id === task.id ? { ...item, state: "BLOCKED_EXTERNAL" as const, provider: response.provider, model: response.model, evidence: [...evidence, ...phaseEvidence].slice(0, 40), blockReason: reason, error: null, completedAt: blockedAt } : item),
          runtime: { ...current.runtime, stage: "BLOCKED_EXTERNAL", detail: `${specTask.taskId} harici bağımlılık bekliyor: ${reason}`, waitingReason: reason, provider: response.provider, model: response.model, updatedAt: blockedAt }, updatedAt: blockedAt });
        this.#publish(projectId, { stage: "BLOCKED_EXTERNAL", kind: "waiting", message: `${specTask.taskId} BLOCKED_EXTERNAL · ${reason}`, provider: response.provider, model: response.model });
        return this.get(projectId);
      }

      this.#setTaskState(projectId, task.id, "VERIFYING");
      this.#publish(projectId, { stage: "VERIFYING", kind: "state", message: "Provider tamamlandı; bağımsız git ve proje doğrulaması çalışıyor.", provider: response.provider, model: response.model });
      const verification = await this.#verifyWorkspace(executionRoot, baselineFingerprint, controller.signal);
      if (!verification.ok) throw new Error(`EVOLUTION_VERIFICATION_FAILED:${verification.detail}`);
      this.#setTaskState(projectId, task.id, "REVIEWING");
      this.#publish(projectId, { stage: "REVIEWING", kind: "evidence", message: "Doğrulanmış değişiklik kalıcı Git commit'ine yazılıyor. Commit oluşmadan PASS verilmeyecek.", provider: response.provider, model: response.model });
      const commitEvidence = await this.#commitVerifiedMutation(executionRoot, specTask, controller.signal);
      const thread = this.#database.createThread(projectId, `DevBox · ${specTask.taskId} · ${specTask.title.slice(0, 80)}`);
      this.#database.appendMessage(thread.thread.id, systemPrompt, response.content);
      const completedAt = new Date().toISOString(); const evidence = [durable.id, response.sessionId, ...response.evidence, ...verification.evidence, ...commitEvidence].slice(0, 40);
      this.#database.settleDurableJob(durable.id, workerId, "SUCCEEDED", { specTaskId: specTask.taskId, threadId: thread.thread.id, provider: response.provider, model: response.model, evidence });
      this.#spec.mark(projectId, specTask.taskId, "PASS", { evidence, lastError: null, blockReason: null, acceptance: response.acceptance, deterministicReviewer: "DEVBOX_DETERMINISTIC_GATE_V1" });
      const phaseEvidence = this.#spec.writePhaseEvidence(projectId, executionRoot, specTask.phaseId);
      const phaseEvidenceCommit = await this.#commitEvidenceSnapshot(executionRoot, specTask, controller.signal);
      const finalEvidence = [...evidence, ...phaseEvidence, ...phaseEvidenceCommit].slice(0, 40);
      this.#spec.mark(projectId, specTask.taskId, "PASS", { evidence: finalEvidence, lastError: null, blockReason: null, acceptance: response.acceptance, deterministicReviewer: "DEVBOX_DETERMINISTIC_GATE_V1" });
      const learning: EvolutionLearning = { id: randomUUID(), track: specTask.track, title: `${specTask.taskId} · ${specTask.title}`, summary: conciseLearning(response.content), evidence: finalEvidence, learnedAt: completedAt };
      const updated = this.get(projectId); const specSummary = this.#spec.summary(projectId); const score = specSummary.totalTaskCount ? Math.round((specSummary.passCount / specSummary.totalTaskCount) * 100) : 0;
      this.#save({
        ...updated, isRunning: false, score, lastProvider: response.provider, lastModel: response.model, completedCycles: updated.completedCycles + 1, cyclesToday: updated.cyclesToday + 1,
        lastCycleAt: completedAt, lastCycleDurationMs: response.durationMs, lastError: null, nextCycleAt: updated.enabled && specSummary.remainingCount > 0 && specSummary.currentGateState !== "BLOCKED_EXTERNAL" && specSummary.currentGateState !== "RECOVERY_REQUIRED" ? new Date(Date.now() + 500).toISOString() : null,
        domainScores: { ...updated.domainScores, [specTask.track]: Math.max(updated.domainScores[specTask.track], score) },
        tasks: updated.tasks.map((item) => item.id === task.id ? { ...item, state: "SUCCEEDED" as const, provider: response.provider, model: response.model, threadId: thread.thread.id, evidence: [...evidence, ...phaseEvidence].slice(0, 40), error: null, blockReason: null, retryAfterAt: null, completedAt } : item),
        learnings: [learning, ...updated.learnings].slice(0, MAX_LEARNINGS), spec: specSummary,
        runtime: { ...updated.runtime, stage: "COMPLETED", detail: `${specTask.taskId} doğrulandı ve tamamlandı.`, waitingReason: null, provider: response.provider, model: response.model, updatedAt: completedAt }, updatedAt: completedAt
      });
      this.#publish(projectId, { stage: "COMPLETED", kind: "evidence", message: `${specTask.taskId} PASS · gerçek değişiklik doğrulandı, kalıcı Git commit oluşturuldu ve faz evidence kayıtları yazıldı.`, provider: response.provider, model: response.model });
      return this.get(projectId);
    } catch (error) {
      const failedAt = new Date().toISOString(); const raw = error instanceof Error ? error.message : String(error); let message = raw.slice(0, 1_000); const cancelled = message.includes("EVOLUTION_CANCELLED") || controller.signal.aborted;
      let rollbackEvidence: string[] = [];
      let rollbackFailed = false;
      if (baselineWasClean && baselineHead && baselineManaged) {
        try { rollbackEvidence = await this.#restoreManagedWorkspace(executionRoot, baselineHead); }
        catch (rollbackError) {
          rollbackFailed = true;
          const rollbackMessage = rollbackError instanceof Error ? rollbackError.message : String(rollbackError);
          message = `${message} | EVOLUTION_ROLLBACK_FAILED:${rollbackMessage}`.slice(0, 1_000);
        }
      }
      const blocker = !cancelled && !rollbackFailed && this.#isExternalBlocker(message);
      const attempts = this.#spec.getState(projectId, specTask.taskId)?.attempts ?? persistedAttempt;
      const recovery = !cancelled && (rollbackFailed || (!isolatedEvolutionRoot && (message.includes("EVOLUTION_WORKSPACE_DIRTY_BASELINE") || message.includes("EVOLUTION_BASELINE_HEAD_INVALID"))));
      const retryDelay = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * Math.pow(2, Math.max(0, attempts - 1))) + Math.floor(Math.random() * 1_000);
      const retryAfterAt = !cancelled && !blocker && !recovery ? new Date(Date.now() + retryDelay).toISOString() : null;
      const specState = cancelled ? "CANCELLED" as const : blocker ? "BLOCKED_EXTERNAL" as const : recovery ? "RECOVERY_REQUIRED" as const : "FAILED" as const;
      try { this.#database.settleDurableJob(durable.id, workerId, cancelled ? "CANCELLED" : "FAILED", { specTaskId: specTask.taskId, status: specState, error: message, attempt: attempts, retryAfterAt }); } catch { /* lease recovery is durable fallback */ }
      this.#spec.mark(projectId, specTask.taskId, specState, { blockReason: blocker ? message : null, lastError: cancelled ? "Kullanıcı tarafından durduruldu." : message, evidence: [durable.id, ...rollbackEvidence], retryAfterAt });
      let phaseEvidence: string[] = [];
      try { phaseEvidence = this.#spec.writePhaseEvidence(projectId, project.rootPath, specTask.phaseId); } catch (evidenceError) {
        const evidenceMessage = evidenceError instanceof Error ? evidenceError.message : String(evidenceError);
        if (!recovery && !blocker && !cancelled) this.#spec.mark(projectId, specTask.taskId, "RECOVERY_REQUIRED", { lastError: `EVIDENCE_WRITE_FAILED:${evidenceMessage}`, evidence: [durable.id] });
      }
      const current = this.get(projectId);
      const stage: RuntimeStage = cancelled ? "CANCELLED" : blocker ? "BLOCKED_EXTERNAL" : recovery ? "RECOVERY_REQUIRED" : "BACKOFF";
      const detail = cancelled ? "Çevrim kullanıcı tarafından durduruldu."
        : blocker ? `Harici engel: ${message}`
        : recovery ? `${specTask.taskId} güvenli recovery gerektiriyor; otomatik ilerleme veri kaybı riski nedeniyle durdu.`
        : `${specTask.taskId} başarısız. FIX → RETEST için ${Math.ceil(retryDelay / 1000)} sn backoff: ${message}`;
      this.#save({
        ...current, isRunning: false, failedCycles: current.failedCycles + (cancelled ? 0 : 1), cyclesToday: current.cyclesToday + 1, lastCycleAt: failedAt,
        lastError: cancelled ? "Kullanıcı tarafından durduruldu." : message, nextCycleAt: retryAfterAt, spec: this.#spec.summary(projectId),
        tasks: current.tasks.map((item) => item.id === task.id ? { ...item, state: cancelled ? "CANCELLED" as const : blocker ? "BLOCKED_EXTERNAL" as const : recovery ? "RECOVERY_REQUIRED" as const : "FAILED" as const,
          attempts, blockReason: blocker ? message : null, retryAfterAt, error: cancelled ? "Kullanıcı tarafından durduruldu." : message, evidence: [...item.evidence, durable.id, ...rollbackEvidence, ...phaseEvidence].slice(0, 40), completedAt: failedAt } : item),
        runtime: { ...current.runtime, stage, detail, waitingReason: retryAfterAt ? detail : blocker ? message : null, updatedAt: failedAt }, updatedAt: failedAt
      });
      this.#publish(projectId, { stage, kind: cancelled ? "state" : blocker ? "waiting" : recovery ? "failure" : "waiting", message: detail, provider: current.runtime.provider, model: current.runtime.model });
      if (manual && !cancelled && !blocker) throw new Error(`EVOLUTION_CYCLE_FAILED:${message}`);
      return this.get(projectId);
    } finally {
      clearInterval(heartbeat); this.#controllers.delete(projectId);
    }
  }

  async #commitEvidenceSnapshot(rootPath: string, specTask: DevelopmentSpecTask, cancellation: AbortSignal): Promise<string[]> {
    if (cancellation.aborted) throw new Error("EVOLUTION_CANCELLED");
    const status = await this.#git.status(rootPath);
    if (!status.available) throw new Error(`EVOLUTION_EVIDENCE_GIT_REQUIRED:${status.error ?? "NOT_A_GIT_REPOSITORY"}`);
    if (status.changes.length === 0) return ["phase-evidence:no-change"];
    const outsideEvidence = status.changes.filter((item) => !item.path.replace(/\\/gu, "/").startsWith("evidence/"));
    if (outsideEvidence.length > 0) throw new Error(`EVOLUTION_EVIDENCE_UNEXPECTED_WORKSPACE_CHANGE:${outsideEvidence.slice(0, 12).map((item) => item.path).join(",")}`);
    const add = await this.#runner.run({ executable: "git", args: ["-C", rootPath, "add", "-A", "--", "evidence"], cwd: rootPath, cancellation, timeoutMs: 60_000, maxOutputBytes: 2 * 1024 * 1024 });
    if (add.exitCode !== 0 || add.timedOut || add.truncated) throw new Error(`EVOLUTION_EVIDENCE_GIT_ADD_FAILED:${add.stderr.slice(0, 500)}`);
    const commit = await this.#runner.run({ executable: "git", args: ["-C", rootPath, "-c", "user.name=DevBox", "-c", "user.email=devbox@local.invalid", "commit", "--no-gpg-sign", "-m", `DevBox evidence ${specTask.phaseId} ${specTask.taskId}`], cwd: rootPath, cancellation, timeoutMs: 2 * 60_000, maxOutputBytes: 4 * 1024 * 1024 });
    if (commit.exitCode !== 0 || commit.timedOut || commit.truncated) throw new Error(`EVOLUTION_EVIDENCE_COMMIT_FAILED:${commit.stderr.slice(0, 700) || commit.stdout.slice(0, 700)}`);
    const head = await this.#runner.run({ executable: "git", args: ["-C", rootPath, "rev-parse", "HEAD"], cwd: rootPath, cancellation, timeoutMs: 30_000, maxOutputBytes: 64 * 1024 });
    const commitSha = head.stdout.trim();
    if (head.exitCode !== 0 || !/^[a-f0-9]{40}$/u.test(commitSha)) throw new Error("EVOLUTION_EVIDENCE_COMMIT_SHA_INVALID");
    return [add.runId, commit.runId, `evidence-git-commit:${commitSha}`];
  }

  async #commitVerifiedMutation(rootPath: string, specTask: DevelopmentSpecTask, cancellation: AbortSignal): Promise<string[]> {
    if (cancellation.aborted) throw new Error("EVOLUTION_CANCELLED");
    const status = await this.#git.status(rootPath);
    if (!status.available) throw new Error(`EVOLUTION_COMMIT_GIT_REQUIRED:${status.error ?? "NOT_A_GIT_REPOSITORY"}`);
    if (status.changes.length === 0) throw new Error("EVOLUTION_COMMIT_REQUIRES_REAL_CHANGE");

    const add = await this.#runner.run({ executable: "git", args: ["-C", rootPath, "add", "-A", "--", "."], cwd: rootPath, cancellation, timeoutMs: 60_000, maxOutputBytes: 2 * 1024 * 1024 });
    if (add.exitCode !== 0 || add.timedOut || add.truncated) throw new Error(`EVOLUTION_GIT_ADD_FAILED:${add.stderr.slice(0, 500)}`);

    const staged = await this.#runner.run({ executable: "git", args: ["-C", rootPath, "diff", "--cached", "--quiet", "--exit-code", "--", "."], cwd: rootPath, cancellation, timeoutMs: 30_000, maxOutputBytes: 256 * 1024 });
    if (staged.exitCode === 0) throw new Error("EVOLUTION_COMMIT_STAGED_DIFF_EMPTY");
    if (staged.exitCode !== 1) throw new Error(`EVOLUTION_COMMIT_STAGED_DIFF_CHECK_FAILED:${staged.stderr.slice(0, 500)}`);

    const commit = await this.#runner.run({
      executable: "git",
      args: ["-C", rootPath, "-c", "user.name=DevBox", "-c", "user.email=devbox@local.invalid", "commit", "--no-gpg-sign", "-m", `DevBox evolution ${specTask.phaseId} ${specTask.taskId}`],
      cwd: rootPath, cancellation, timeoutMs: 2 * 60_000, maxOutputBytes: 4 * 1024 * 1024
    });
    if (commit.exitCode !== 0 || commit.timedOut || commit.truncated) throw new Error(`EVOLUTION_GIT_COMMIT_FAILED:${commit.stderr.slice(0, 700) || commit.stdout.slice(0, 700)}`);

    const head = await this.#runner.run({ executable: "git", args: ["-C", rootPath, "rev-parse", "HEAD"], cwd: rootPath, cancellation, timeoutMs: 30_000, maxOutputBytes: 64 * 1024 });
    const commitSha = head.stdout.trim();
    if (head.exitCode !== 0 || !/^[a-f0-9]{40}$/u.test(commitSha)) throw new Error("EVOLUTION_GIT_COMMIT_SHA_INVALID");
    return [add.runId, commit.runId, `git-commit:${commitSha}`];
  }

  async #verifyWorkspace(rootPath: string, baselineFingerprint: string | null, cancellation: AbortSignal): Promise<VerificationResult> {
    if (cancellation.aborted) throw new Error("EVOLUTION_CANCELLED");
    const evidence: string[] = [];
    const status = await this.#git.status(rootPath);
    if (!status.available) return { ok: false, evidence, detail: `GIT_REQUIRED:${status.error ?? "NOT_A_GIT_REPOSITORY"}` };
    const currentFingerprint = await this.#workspaceFingerprint(rootPath, cancellation);
    if (!baselineFingerprint) return { ok: false, evidence, detail: "GIT_BASELINE_UNAVAILABLE" };
    if (!currentFingerprint) return { ok: false, evidence, detail: "GIT_CURRENT_FINGERPRINT_UNAVAILABLE" };
    if (baselineFingerprint === currentFingerprint) return { ok: false, evidence, detail: "NO_OBSERVED_GIT_CHANGE" };
    evidence.push(`git-head:${status.head ?? "unborn"}`, `git-changes:${status.changes.length}`, `workspace-fingerprint:${currentFingerprint.slice(0, 16)}`);
    const diffCheck = await this.#runner.run({ executable: "git", args: ["-C", rootPath, "diff", "--check"], cwd: rootPath, cancellation, timeoutMs: 30_000, maxOutputBytes: 512 * 1024 });
    evidence.push(diffCheck.runId);
    if (diffCheck.exitCode !== 0 || diffCheck.timedOut || diffCheck.truncated) return { ok: false, evidence, detail: `GIT_DIFF_CHECK_FAILED:${diffCheck.stderr.slice(0, 400)}` };

    const packagePath = path.join(rootPath, "package.json");
    if (existsSync(packagePath)) {
      try {
        const pkg = JSON.parse(readFileSync(packagePath, "utf8")) as { scripts?: Record<string, string>; packageManager?: string; engines?: { node?: string } };
        const scripts = pkg.scripts ?? {};
        const packageManager = pkg.packageManager?.startsWith("pnpm") || existsSync(path.join(rootPath, "pnpm-lock.yaml")) ? "pnpm" : existsSync(path.join(rootPath, "yarn.lock")) ? "yarn" : "npm";
        if (packageManager === "pnpm") {
          const nodeProbe = await this.#runner.run({ executable: "node", args: ["--version"], cwd: rootPath, cancellation, timeoutMs: 15_000, maxOutputBytes: 64 * 1024 });
          evidence.push(nodeProbe.runId);
          const major = Number(nodeProbe.stdout.trim().match(/^v?(\d+)/u)?.[1] ?? 0);
          if (nodeProbe.exitCode !== 0 || nodeProbe.timedOut || major < 24) return { ok: false, evidence, detail: `NODE_24_REQUIRED: detected=${nodeProbe.stdout.trim() || "unavailable"}` };
          const corepack = process.platform === "win32" ? "corepack.cmd" : "corepack";
          const pinned = pkg.packageManager?.startsWith("pnpm@") ? pkg.packageManager : "pnpm@11.19.0";
          const expectedPnpmVersion = pinned.slice("pnpm@".length).trim();
          this.#publishByRoot(rootPath, { stage: "VERIFYING", kind: "command", message: `${pinned} doğrudan Corepack meta-command ile doğrulanıyor; global pnpm shim veya Program Files yazımı kullanılmıyor.`, provider: null, model: null });
          const managerProbe = await this.#runner.run({ executable: corepack, args: ["pnpm", "--version"], cwd: rootPath, cancellation, timeoutMs: 2 * 60_000, maxOutputBytes: 2 * 1024 * 1024 });
          evidence.push(managerProbe.runId);
          if (managerProbe.exitCode !== 0 || managerProbe.timedOut || managerProbe.truncated) return { ok: false, evidence, detail: `COREPACK_PNPM_PROBE_FAILED:${managerProbe.stderr.slice(0, 500)}` };
          const detectedPnpmVersion = managerProbe.stdout.trim().split(/\r?\n/u)[0]?.trim() ?? "";
          if (expectedPnpmVersion && detectedPnpmVersion !== expectedPnpmVersion) return { ok: false, evidence, detail: `PNPM_VERSION_MISMATCH:expected=${expectedPnpmVersion}:detected=${detectedPnpmVersion || "unknown"}` };
          if (!existsSync(path.join(rootPath, "node_modules"))) {
            this.#publishByRoot(rootPath, { stage: "VERIFYING", kind: "command", message: "İlk gerçek çalışma: bağımlılıklar kilit dosyasından corepack pnpm ile kuruluyor.", provider: null, model: null });
            const install = await this.#runner.run({ executable: corepack, args: ["pnpm", "install", "--frozen-lockfile"], cwd: rootPath, cancellation, timeoutMs: 20 * 60_000, maxOutputBytes: 12 * 1024 * 1024 });
            evidence.push(install.runId);
            if (install.exitCode !== 0 || install.timedOut || install.truncated) return { ok: false, evidence, detail: `PNPM_INSTALL_FAILED:${install.stderr.slice(0, 500)}` };
          }
        }
        const commandFor = (script: string): { executable: string; args: string[] } => {
          if (packageManager === "pnpm") return { executable: process.platform === "win32" ? "corepack.cmd" : "corepack", args: ["pnpm", script] };
          if (packageManager === "npm") return { executable: "npm", args: ["run", script] };
          return { executable: "yarn", args: [script] };
        };
        const verificationScripts = scripts.verify ? ["verify"] : ["typecheck", "test", "build"].filter((script) => Boolean(scripts[script]));
        for (const script of verificationScripts) {
          const command = commandFor(script);
          const stage = script === "test" ? "TESTING" as const : "VERIFYING" as const;
          const timeoutMs = script === "verify" ? 35 * 60_000 : script === "test" || script === "build" ? 20 * 60_000 : 8 * 60_000;
          this.#publishByRoot(rootPath, { stage, kind: "command", message: `${packageManager} ${script} bağımsız doğrulaması çalışıyor.`, provider: null, model: null });
          const result = await this.#runner.run({ executable: command.executable, args: command.args, cwd: rootPath, cancellation, timeoutMs, maxOutputBytes: 16 * 1024 * 1024 });
          evidence.push(result.runId);
          if (result.exitCode !== 0 || result.timedOut || result.truncated) return { ok: false, evidence, detail: `${script.toUpperCase()}_FAILED:${result.stderr.slice(0, 700) || result.stdout.slice(0, 700)}` };
        }
      } catch (error) { return { ok: false, evidence, detail: `PACKAGE_VERIFICATION_ERROR:${error instanceof Error ? error.message : String(error)}` }; }
    }
    return { ok: true, evidence, detail: "git diff --check ve mevcut en güçlü verify/typecheck/test/build kapıları PASS" };
  }

  async #workspaceFingerprint(rootPath: string, cancellation: AbortSignal): Promise<string | null> {
    if (cancellation.aborted) throw new Error("EVOLUTION_CANCELLED");
    const status = await this.#git.status(rootPath);
    if (!status.available) return null;
    const repositoryRoot = path.resolve(status.repositoryRoot ?? rootPath);
    const digest = createHash("sha256");
    digest.update(JSON.stringify({ head: status.head, branch: status.branch, changes: status.changes }));

    // Staged state can change without changing worktree bytes, so include the index blob identities too.
    const indexState = await this.#runner.run({
      executable: "git",
      args: ["-C", repositoryRoot, "diff", "--cached", "--raw", "--full-index", "-z", "--", "."],
      cwd: repositoryRoot, cancellation, timeoutMs: 30_000, maxOutputBytes: 8 * 1024 * 1024
    });
    if (indexState.exitCode !== 0 || indexState.timedOut || indexState.truncated) throw new Error(`GIT_BASELINE_INDEX_FAILED:${indexState.stderr.slice(0, 400)}`);
    digest.update(indexState.stdout);

    // Hash current bytes of every changed/untracked path. This detects edits to a file that was already dirty
    // before the evolution task, where a status-only comparison would incorrectly claim "no change".
    const seen = new Set<string>();
    for (const change of [...status.changes].sort((left, right) => left.path.localeCompare(right.path))) {
      if (cancellation.aborted) throw new Error("EVOLUTION_CANCELLED");
      const relativePath = change.path;
      if (seen.has(relativePath)) continue;
      seen.add(relativePath);
      const absolutePath = path.resolve(repositoryRoot, relativePath);
      if (absolutePath !== repositoryRoot && !absolutePath.startsWith(`${repositoryRoot}${path.sep}`)) throw new Error("GIT_CHANGE_PATH_OUTSIDE_REPOSITORY");
      digest.update(`\0path:${relativePath}\0`);
      if (!existsSync(absolutePath)) { digest.update("missing"); continue; }
      const stat = lstatSync(absolutePath);
      if (stat.isSymbolicLink()) { digest.update(`symlink:${readlinkSync(absolutePath)}`); continue; }
      if (!stat.isFile()) { digest.update(`nonfile:${stat.mode}:${stat.size}`); continue; }
      const fileDigest = createHash("sha256");
      await new Promise<void>((resolve, reject) => {
        const stream = createReadStream(absolutePath);
        const abort = () => { stream.destroy(new Error("EVOLUTION_CANCELLED")); };
        cancellation.addEventListener("abort", abort, { once: true });
        stream.on("data", (chunk) => fileDigest.update(chunk));
        stream.once("error", (error) => { cancellation.removeEventListener("abort", abort); reject(error); });
        stream.once("end", () => { cancellation.removeEventListener("abort", abort); resolve(); });
      });
      digest.update(fileDigest.digest("hex"));
    }
    return digest.digest("hex");
  }

  #isManagedWorkspace(rootPath: string): boolean {
    const markerPath = path.join(rootPath, ".devbox-managed-source.json");
    if (!existsSync(markerPath)) return false;
    try {
      const marker = JSON.parse(readFileSync(markerPath, "utf8")) as Record<string, unknown>;
      return marker.product === "DevBox" && marker.purpose === "persistent-self-development-source" && marker.realityContract === "NO_FABRICATED_OR_REPRESENTATIVE_SUCCESS";
    } catch {
      return false;
    }
  }

  async #restoreManagedWorkspace(rootPath: string, baselineHead: string): Promise<string[]> {
    if (!/^[a-f0-9]{40}$/u.test(baselineHead)) throw new Error("EVOLUTION_ROLLBACK_BASELINE_SHA_INVALID");
    const reset = await this.#runner.run({ executable: "git", args: ["-C", rootPath, "reset", "--hard", baselineHead], cwd: rootPath, timeoutMs: 2 * 60_000, maxOutputBytes: 2 * 1024 * 1024 });
    if (reset.exitCode !== 0 || reset.timedOut || reset.truncated) throw new Error(`EVOLUTION_ROLLBACK_RESET_FAILED:${reset.stderr.slice(0, 500)}`);
    const clean = await this.#runner.run({ executable: "git", args: ["-C", rootPath, "clean", "-fd"], cwd: rootPath, timeoutMs: 2 * 60_000, maxOutputBytes: 2 * 1024 * 1024 });
    if (clean.exitCode !== 0 || clean.timedOut || clean.truncated) throw new Error(`EVOLUTION_ROLLBACK_CLEAN_FAILED:${clean.stderr.slice(0, 500)}`);
    const status = await this.#git.status(rootPath);
    if (!status.available || status.head !== baselineHead || status.changes.length !== 0) throw new Error("EVOLUTION_ROLLBACK_VERIFICATION_FAILED");
    return [reset.runId, clean.runId, `rollback-head:${baselineHead}`];
  }

  #publishByRoot(rootPath: string, event: Omit<EvolutionActivityEvent, "id" | "sequence" | "projectId" | "taskId" | "specTaskId" | "durableJobId" | "createdAt">): void {
    const project = this.#projects.list().find((item) => path.resolve(item.rootPath) === path.resolve(rootPath)); if (project) this.#publish(project.id, event);
  }

  #fromAgentProgress(projectId: string, progress: AgentProgressEvent): void {
    this.#publish(projectId, { stage: progress.stage, kind: progress.kind, message: progress.message, provider: progress.provider, model: progress.model });
  }

  #setTaskState(projectId: string, taskId: string, state: EvolutionTask["state"]): void {
    const campaign = this.get(projectId); this.#save({ ...campaign, tasks: campaign.tasks.map((task) => task.id === taskId ? { ...task, state } : task), updatedAt: new Date().toISOString() });
  }

  #publish(projectId: string, input: Omit<EvolutionActivityEvent, "id" | "sequence" | "projectId" | "taskId" | "specTaskId" | "durableJobId" | "createdAt">): void {
    const campaign = this.get(projectId); const sequence = (this.#sequence.get(projectId) ?? campaign.activity.at(-1)?.sequence ?? 0) + 1; this.#sequence.set(projectId, sequence);
    const event: EvolutionActivityEvent = { id: randomUUID(), sequence, projectId, taskId: campaign.runtime.activeTaskId, specTaskId: campaign.runtime.activeSpecTaskId, durableJobId: campaign.runtime.durableJobId, stage: input.stage, kind: input.kind, provider: input.provider, model: input.model, message: input.message, createdAt: new Date().toISOString() };
    const waiting = input.kind === "waiting" || input.stage === "WAITING" || input.stage === "BACKOFF" ? input.message : null;
    const next = this.#save({ ...campaign, isRunning: !["COMPLETED", "FAILED", "BLOCKED_EXTERNAL", "CANCELLED", "RECOVERY_REQUIRED", "IDLE", "BACKOFF"].includes(input.stage), activity: [...campaign.activity, event].slice(-MAX_ACTIVITY), runtime: { ...campaign.runtime, stage: input.stage, detail: input.message, waitingReason: waiting, provider: input.provider ?? campaign.runtime.provider, model: input.model ?? campaign.runtime.model, updatedAt: event.createdAt }, updatedAt: event.createdAt });
    void next;
    try { this.#database.appendEvent("api-evolution.activity", projectId, redactUnknown(event), ["FAILED", "BLOCKED_EXTERNAL", "RECOVERY_REQUIRED"].includes(event.stage)); } catch { /* UI execution must not be crashed by observability persistence failure; DB health will expose it. */ }
    for (const listener of this.#listeners) listener(event);
  }

  #scheduleContinuation(projectId: string, delayMs: number): void {
    if (this.#continuations.has(projectId)) return;
    const timer = setTimeout(() => {
      this.#continuations.delete(projectId);
      const campaign = this.get(projectId);
      if (!campaign.enabled || campaign.isRunning) return;
      if (campaign.nextCycleAt && Date.parse(campaign.nextCycleAt) > Date.now()) {
        this.#scheduleContinuation(projectId, Math.min(60_000, Math.max(500, Date.parse(campaign.nextCycleAt) - Date.now())));
        return;
      }
      if (this.#inFlight.has(projectId)) { this.#scheduleContinuation(projectId, 500); return; }
      this.#inFlight.add(projectId);
      void this.#runCycle(projectId, false).catch(() => undefined).finally(() => {
        this.#inFlight.delete(projectId);
        const current = this.get(projectId);
        if (this.#canContinue(current)) this.#scheduleContinuation(projectId, 500);
      });
    }, Math.max(100, delayMs));
    timer.unref();
    this.#continuations.set(projectId, timer);
  }

  #isExternalBlocker(message: string): boolean {
    return /EVOLUTION_REQUIRES_GIT_REPOSITORY|EVOLUTION_REQUIRES_NETWORK_PROFILE|CODEX_AUTH_UNAVAILABLE|CODEX_EXECUTABLE_UNAVAILABLE|NVIDIA_CREDENTIAL_UNAVAILABLE|HERMES.*UNAVAILABLE|NODE_24_REQUIRED|COREPACK_PREPARE_FAILED|COREPACK_PNPM_PROBE_FAILED|PNPM_VERSION_MISMATCH|PNPM_INSTALL_FAILED|PROVIDER_CHAIN_EXHAUSTED:.*(?:AUTH_UNAVAILABLE|EXECUTABLE_UNAVAILABLE|CREDENTIAL_UNAVAILABLE)/iu.test(message);
  }

  #canContinue(campaign: EvolutionCampaign): boolean {
    if (!campaign.enabled || campaign.isRunning || campaign.spec.remainingCount <= 0) return false;
    return campaign.spec.currentGateState !== "BLOCKED_EXTERNAL" && campaign.spec.currentGateState !== "RECOVERY_REQUIRED";
  }

  #resetDaily(campaign: EvolutionCampaign): EvolutionCampaign { const today = dayKey(); if (campaign.cycleDay === today) return campaign; return this.#save({ ...campaign, cyclesToday: 0, cycleDay: today, updatedAt: new Date().toISOString() }); }
  #key(projectId: string): string { return `api-evolution:${projectId}`; }
  #save(campaign: EvolutionCampaign): EvolutionCampaign {
    const previous = this.#database.getSetting<Record<string, unknown>>(this.#key(campaign.projectId)); const previousLevel = previous ? Math.max(Number(previous.level ?? 1), Number(previous.lifetimeLevel ?? 1), Number(previous.migrationFloorLevel ?? 1)) : 1;
    const floor = Math.max(campaign.migrationFloorLevel, previousLevel); const lifetimeLevel = levelForPoints(campaign.lifetimeEvidencePoints, floor);
    const valid = EvolutionCampaignSchema.parse({ ...campaign, level: lifetimeLevel, lifetimeLevel, migrationFloorLevel: floor, stage: stageFor(lifetimeLevel, campaign.score), spec: this.#spec.summary(campaign.projectId), tasks: campaign.tasks.slice(-MAX_EXECUTION_HISTORY), learnings: campaign.learnings.slice(0, MAX_LEARNINGS), activity: campaign.activity.slice(-MAX_ACTIVITY) });
    this.#database.setSetting(this.#key(valid.projectId), valid); return valid;
  }
}
