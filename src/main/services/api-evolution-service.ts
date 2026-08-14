import { randomUUID } from "node:crypto";
import type { EvolutionCampaign, EvolutionLearning, EvolutionTask } from "../../shared/contracts.js";
import { EvolutionCampaignSchema } from "../../shared/contracts.js";
import type { AgentService } from "./agent-service.js";
import type { StateDatabase } from "./database.js";
import type { ProjectService } from "./project-service.js";
import type { SettingsService } from "./settings-service.js";

const PRIMARY_PROVIDER = "OpenAI Codex CLI";
const PRIMARY_MODEL = "gpt-5.6-sol";
const MODEL_EFFORT = "high" as const;
const DEFAULT_INTERVAL_MINUTES = 60;
const JOB_LEASE_MS = 4 * 60_000;
const MATURITY_MODEL_VERSION = 2 as const;
const DEFAULT_DIRECTIVE = [
  "DevBox'ı gerçek, üretim kalitesinde ve kanıt temelli bir Windows mühendislik masaüstü olarak geliştir.",
  "Her çevrimde kimliği doğrulanmış yerel OpenAI Codex CLI, gpt-5.6-sol modeli ve yüksek muhakeme düzeyi önceliklidir; Codex gerçekten kullanılamıyorsa yalnız çalıştırılan Hermes/NVIDIA NIM sonucunu fallback olarak kaydet.",
  "Gösterilen her veri, başarı, düğme ve yetenek doğrulanabilir gerçek çalışma sonucuna dayanmalı; kanıtlanmamış hiçbir yeteneği başarı gibi sunma.",
  "Her yeni çevrim önceki görevlerin birebir tekrarı olmasın. Proje durumu, açık riskler, son kanıtlar ve en az işlenmiş mühendislik alanına göre yeni ve ölçülebilir bir odak üret.",
  "Kodlama, ürün tasarımı, API sözleşmeleri, güvenlik, performans, erişilebilirlik, gözlemlenebilirlik, entegrasyon, test, dokümantasyon ve yayın zincirini birlikte değerlendir.",
  "Çalışma zamanı gerçek web arama aracı sağlıyorsa güncel iddiaları birincil kaynaklarla doğrula; sağlamıyorsa web araştırması yapılmış gibi davranma ve doğrulanması gereken kaynakları ayrı listele.",
  "Her öneriyi küçük uygulanabilir görevlere böl; dosya ve sorumluluk sınırı, kabul kriteri, test kanıtı, risk, geri dönüş planı ve yinelenmeyi önleyen benzersiz odak ver.",
  "Gizli değerleri isteme veya çıktıya yazma. Test çalıştırılmadıysa geçti deme. Salt-okunur gelişim çevriminde dosya ya da uzak servis üzerinde mutasyon yapma.",
  "Bir sağlayıcı yanıtını, öneriyi veya sıfır çıkış kodunu tek başına ürün olgunluğu sayma. Seviye yalnız uygulanmış, test edilmiş, gerileme denetimi geçmiş ve kanıt parmak iziyle tekilleştirilmiş iyileştirmelerle ilerler."
].join("\n");

type EvolutionTrack = EvolutionTask["track"];
type TaskDefinition = Pick<EvolutionTask, "track" | "title" | "prompt">;

const TASK_DEFINITIONS: readonly TaskDefinition[] = [
  { track: "research", title: "Resmî kaynak ve rakip davranış araştırması", prompt: "DevBox API ve masaüstü ajan ürününün güncel davranışlarını yalnız doğrulanabilir birincil kaynaklara dayalı incele. OpenAI Codex, Electron, Windows ve kullanılan upstream projelerdeki ilgili yeni sözleşme/değişiklikleri; uygulanabilir farkları ve doğrulama bağlantılarını çıkar." },
  { track: "architecture", title: "API sınırları ve dayanıklılık incelemesi", prompt: "Yerel DevBox v1 API, IPC, SQLite WAL, dayanıklı işler, iş kiralama, yeniden başlatma ve hata alanlarını mimari açıdan incele. Yarış, idempotency, backpressure, iptal ve crash recovery açıklarını önem sırasıyla öner." },
  { track: "api", title: "DevBox API sözleşme gelişimi", prompt: "DevBox API için geriye uyumlu endpoint, şema, hata semantiği, sürümleme, pagination, idempotency ve istemci entegrasyon backlog'u üret. Her madde için kabul kriteri ve sözleşme testi öner." },
  { track: "coding", title: "Kodlama ve refactor adayları", prompt: "Seçili DevBox projesini güvenli, salt-okunur analiz et. En yüksek etkili kodlama/refactor adaylarını dosya ve sorumluluk sınırlarıyla; küçük uygulanabilir dilimler, testler ve geri dönüş planıyla sırala." },
  { track: "design", title: "Sohbet öncelikli ürün ve tasarım incelemesi", prompt: "DevBox'ın sohbet öncelikli Windows arayüzünü yoğunluk, tipografi, boşluk, klavye, sağ tık, sürükle-bırak, erişilebilirlik ve uzun görev görünürlüğü açısından değerlendir. Somut tasarım token'ları ve ölçülebilir kabul kriterleri üret." },
  { track: "quality", title: "Test, performans ve arıza matrisi", prompt: "DevBox için birim, sözleşme, hedefli UI, paketli uygulama, CPU/RAM/I/O soak ve failure-injection açığını incele. Disk dolması, yeniden başlatma, ağ bölünmesi, sürücü ve güç kaybı için süre, önkoşul, kanıt ve başarısızlık eşiği üret." },
  { track: "security", title: "Güvenlik ve güven zinciri incelemesi", prompt: "DevBox'ın IPC, renderer sınırı, process çalıştırma, secret yönetimi, SSH pinning, plugin/MCP imza zinciri, Authenticode ve updater tehditlerini incele. İstismar senaryosu, önlem ve doğrulama kanıtı üret; gizli değer isteme veya gösterme." },
  { track: "release", title: "Yayın kapısı ve kalan engeller", prompt: "DevBox'ın gerçek release-ready olmasını engelleyen alanları yeniden değerlendir. Kod imzası, updater/rollback, temiz Windows VM, GitHub/Vercel E2E, LSP/DAP, remote worker ve marketplace için fail-closed kabul kapıları öner." },
  { track: "performance", title: "Performans ve kaynak bütçesi", prompt: "Başlatma, uzun sohbet, büyük proje ağacı, terminal, paralel görev ve paketleme yolları için CPU, RAM, I/O, render ve child-process bütçeleri öner. Ölçüm komutları, eşikler, soak senaryoları ve sızıntı kanıtlarını belirt." },
  { track: "observability", title: "Gözlemlenebilirlik ve olay adli izi", prompt: "Kullanıcı verisini ve sırları sızdırmadan DevBox log, health, durable-job, sağlayıcı, IPC, terminal ve entegrasyon olaylarının nasıl ilişkilendirileceğini incele. Eyleme dönük alanlar, saklama politikası ve crash tanı akışı öner." },
  { track: "accessibility", title: "Erişilebilirlik ve klavye denetimi", prompt: "Ana sohbet, composer, menüler, mesaj eylemleri, terminal ve ayar yüzeylerini klavye, odak, ekran okuyucu, kontrast, yakınlaştırma ve reduced-motion açısından incele. WCAG uyumlu ölçülebilir kabul kriterleri üret." },
  { track: "integrations", title: "Gerçek entegrasyon yaşam döngüleri", prompt: "GitHub, Vercel, SSH, uzak worker, LSP, DAP, plugin, MCP ve toolkit yollarını kimlik, bağlantı, mutasyon, iptal, yeniden deneme, audit ve rollback uçtan uca yaşam döngüsüyle değerlendir. Yalnız sağlık kontrolü ve gerçek işlem kanıtı varsa READY durumu üreten kapılar öner." },
  { track: "documentation", title: "Kullanıcı ve geliştirici belgeleri", prompt: "Kurulum, izin modeli, veri akışı, DevBox API, sağlayıcı kurulumu, sorun giderme, katkı, güvenlik bildirimi ve yayın doğrulaması belgelerindeki boşlukları incele. Gerçek davranışa bağlı örnekler ve doğrulama adımları öner." },
  { track: "supply-chain", title: "Açık kaynak tedarik zinciri", prompt: "Lisans, bağımlılık, SBOM, provenance, GitHub Actions pinleme, artifact bütünlüğü, SignPath origin verification, imza politikası ve güncelleme güven kökünü incele. Fail-closed CI/yayın kontrollerini önem sırasıyla öner." }
] as const;

const TRACKS = TASK_DEFINITIONS.map((item) => item.track);

function dayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function levelForPoints(points: number, floor: number): number {
  let level = 1;
  while (Math.round(100 * Math.pow(level, 1.55)) <= points) level += 1;
  return Math.max(floor, level);
}

function stageFor(level: number, score: number): string {
  if (score === 0) return `Seviye ${level} · kanıt bekliyor`;
  if (score >= 90) return `Seviye ${level} · geniş kapsam`;
  if (score >= 60) return `Seviye ${level} · çok alanlı inceleme`;
  return `Seviye ${level} · temel kapsam`;
}

function nextAt(intervalMinutes: number, from = new Date()): string {
  return new Date(from.getTime() + intervalMinutes * 60_000).toISOString();
}

function conciseLearning(content: string): string {
  return content.replace(/```[\s\S]*?```/gu, " [kod bloğu] ").replace(/\s+/gu, " ").trim().slice(0, 1_200) || "Ajan çıktı üretmedi.";
}

function taskFrom(definition: TaskDefinition, batch: number): EvolutionTask {
  const focusId = `${definition.track}-${batch}-${new Date().toISOString()}`;
  return {
    id: randomUUID(),
    track: definition.track,
    title: `${definition.title} · Döngü ${batch}`,
    prompt: `${definition.prompt}\n\nBu görev ${focusId} odağına özeldir. Önceki çıktıyı tekrar etme; mevcut proje kanıtına göre yeni fark, risk veya doğrulama adımı bul.`,
    state: "QUEUED",
    provider: null,
    model: null,
    threadId: null,
    evidence: [],
    error: null,
    createdAt: new Date().toISOString(),
    completedAt: null
  };
}

function domainScores(tasks: readonly EvolutionTask[], previous?: unknown): Record<EvolutionTrack, number> {
  const previousRecord = previous && typeof previous === "object" && !Array.isArray(previous) ? previous as Record<string, unknown> : {};
  return Object.fromEntries(TRACKS.map((track) => {
    const historical = typeof previousRecord[track] === "number" ? Math.max(0, Math.min(100, Math.round(previousRecord[track]))) : 0;
    const successful = tasks.some((task) => task.track === track && task.state === "SUCCEEDED");
    return [track, Math.max(historical, successful ? 100 : 0)];
  })) as Record<EvolutionTrack, number>;
}

export class ApiEvolutionService {
  readonly #database: StateDatabase;
  readonly #projects: ProjectService;
  readonly #agent: AgentService;
  readonly #settings: SettingsService;
  readonly #inFlight = new Set<string>();
  #timer: NodeJS.Timeout | null = null;

  public constructor(database: StateDatabase, projects: ProjectService, agent: AgentService, settings: SettingsService) {
    this.#database = database;
    this.#projects = projects;
    this.#agent = agent;
    this.#settings = settings;
  }

  public start(): void {
    if (this.#timer) return;
    this.#database.recoverExpiredDurableJobs();
    for (const project of this.#projects.list()) this.get(project.id);
    this.#timer = setInterval(() => void this.#tick(), 60_000);
    this.#timer.unref();
    void this.#tick();
  }

  public stop(): void {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = null;
  }

  public get(projectId: string): EvolutionCampaign {
    this.#projects.get(projectId);
    const stored = this.#database.getSetting<unknown>(this.#key(projectId));
    if (stored && typeof stored === "object" && !Array.isArray(stored)) {
      const record = stored as Record<string, unknown>;
      const existingTasks = Array.isArray(record.tasks) ? record.tasks as EvolutionTask[] : [];
      const existingTracks = new Set(existingTasks.map((task) => task.track));
      const batch = Math.max(1, Math.floor(existingTasks.length / TASK_DEFINITIONS.length) + 1);
      const tasks = [...existingTasks, ...TASK_DEFINITIONS.filter((definition) => !existingTracks.has(definition.track)).map((definition) => taskFrom(definition, batch))];
      const historicalLevel = Math.max(1, Number(record.migrationFloorLevel ?? 1), Number(record.lifetimeLevel ?? 1), Number(record.level ?? 1));
      const points = Math.max(0, Number(record.lifetimeEvidencePoints ?? 0));
      const level = levelForPoints(points, historicalLevel);
      const score = Math.max(0, Math.min(100, Number(record.score ?? 0)));
      const candidate = {
        ...record,
        maturityModelVersion: MATURITY_MODEL_VERSION,
        projectId,
        enabled: typeof record.enabled === "boolean" ? record.enabled : this.#settings.get().networkAccess,
        isRunning: this.#inFlight.has(projectId),
        directive: typeof record.directive === "string" ? record.directive : DEFAULT_DIRECTIVE,
        score,
        level,
        lifetimeLevel: level,
        migrationFloorLevel: historicalLevel,
        lifetimeEvidencePoints: points,
        validatedImprovementCount: Math.max(0, Number(record.validatedImprovementCount ?? 0)),
        stablePromotionCount: Math.max(0, Number(record.stablePromotionCount ?? 0)),
        verifiedResearchCount: Math.max(0, Number(record.verifiedResearchCount ?? 0)),
        verifiedRegressionFixCount: Math.max(0, Number(record.verifiedRegressionFixCount ?? 0)),
        domainScores: domainScores(tasks, record.domainScores),
        stage: stageFor(level, score),
        provider: PRIMARY_PROVIDER,
        model: PRIMARY_MODEL,
        modelEffort: MODEL_EFFORT,
        lastProvider: typeof record.lastProvider === "string" ? record.lastProvider : Number(record.completedCycles ?? 0) > 0 && typeof record.provider === "string" ? record.provider : null,
        lastModel: typeof record.lastModel === "string" ? record.lastModel : Number(record.completedCycles ?? 0) > 0 && typeof record.model === "string" ? record.model : null,
        completedCycles: Math.max(0, Number(record.completedCycles ?? 0)),
        failedCycles: Math.max(0, Number(record.failedCycles ?? 0)),
        cyclesToday: Math.max(0, Number(record.cyclesToday ?? 0)),
        cycleDay: typeof record.cycleDay === "string" ? record.cycleDay : dayKey(),
        dailyCycleLimit: null,
        intervalMinutes: Number(record.intervalMinutes) >= 30 ? Number(record.intervalMinutes) : DEFAULT_INTERVAL_MINUTES,
        lastCycleAt: typeof record.lastCycleAt === "string" ? record.lastCycleAt : null,
        nextCycleAt: typeof record.nextCycleAt === "string" ? record.nextCycleAt : null,
        lastCycleDurationMs: typeof record.lastCycleDurationMs === "number" ? Math.max(0, Math.round(record.lastCycleDurationMs)) : null,
        lastError: typeof record.lastError === "string" ? record.lastError : null,
        tasks,
        learnings: Array.isArray(record.learnings) ? record.learnings : [],
        updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : new Date().toISOString()
      };
      const parsed = EvolutionCampaignSchema.safeParse(candidate);
      if (parsed.success) return this.#resetDaily(this.#save(parsed.data));
    }

    const now = new Date();
    const enabled = this.#settings.get().networkAccess;
    const tasks = TASK_DEFINITIONS.map((definition) => taskFrom(definition, 1));
    const initial: EvolutionCampaign = {
      maturityModelVersion: MATURITY_MODEL_VERSION,
      projectId,
      enabled,
      isRunning: false,
      directive: DEFAULT_DIRECTIVE,
      score: 0,
      level: 1,
      lifetimeLevel: 1,
      migrationFloorLevel: 1,
      lifetimeEvidencePoints: 0,
      validatedImprovementCount: 0,
      stablePromotionCount: 0,
      verifiedResearchCount: 0,
      verifiedRegressionFixCount: 0,
      domainScores: domainScores(tasks),
      stage: stageFor(1, 0),
      provider: PRIMARY_PROVIDER,
      model: PRIMARY_MODEL,
      modelEffort: MODEL_EFFORT,
      lastProvider: null,
      lastModel: null,
      completedCycles: 0,
      failedCycles: 0,
      cyclesToday: 0,
      cycleDay: dayKey(now),
      dailyCycleLimit: null,
      intervalMinutes: DEFAULT_INTERVAL_MINUTES,
      lastCycleAt: null,
      nextCycleAt: enabled ? new Date(now.getTime() + 2 * 60_000).toISOString() : null,
      lastCycleDurationMs: null,
      lastError: null,
      tasks,
      learnings: [],
      updatedAt: now.toISOString()
    };
    return this.#save(initial);
  }

  public setEnabled(projectId: string, enabled: boolean): EvolutionCampaign {
    if (enabled && !this.#settings.get().networkAccess) throw new Error("EVOLUTION_REQUIRES_NETWORK_PROFILE");
    const current = this.get(projectId);
    return this.#save({ ...current, enabled, nextCycleAt: enabled ? (current.nextCycleAt ?? new Date().toISOString()) : null, updatedAt: new Date().toISOString() });
  }

  public setDirective(projectId: string, directive: string): EvolutionCampaign {
    const current = this.get(projectId);
    return this.#save({ ...current, directive: directive.trim(), updatedAt: new Date().toISOString() });
  }

  public async runNow(projectId: string): Promise<EvolutionCampaign> {
    this.#projects.get(projectId);
    if (this.#inFlight.has(projectId)) throw new Error("EVOLUTION_CYCLE_ALREADY_RUNNING");
    this.#inFlight.add(projectId);
    try {
      return await this.#runCycle(projectId, true);
    } finally {
      this.#inFlight.delete(projectId);
    }
  }

  async #tick(): Promise<void> {
    for (const project of this.#projects.list()) {
      const campaign = this.get(project.id);
      if (!this.#settings.get().networkAccess || !campaign.enabled || !campaign.nextCycleAt || Date.parse(campaign.nextCycleAt) > Date.now() || this.#inFlight.has(project.id)) continue;
      this.#inFlight.add(project.id);
      try {
        await this.#runCycle(project.id, false);
      } catch {
        // The persistent campaign records the exact provider failure for the UI.
      } finally {
        this.#inFlight.delete(project.id);
      }
    }
  }

  async #runCycle(projectId: string, manual: boolean): Promise<EvolutionCampaign> {
    if (!this.#settings.get().networkAccess) throw new Error("EVOLUTION_REQUIRES_NETWORK_PROFILE");
    const project = this.#projects.get(projectId);
    let campaign = this.#resetDaily(this.get(projectId));
    if (!campaign.tasks.some((task) => task.state === "QUEUED")) {
      const batch = Math.floor(campaign.tasks.length / TASK_DEFINITIONS.length) + 1;
      campaign = this.#save({ ...campaign, tasks: [...campaign.tasks, ...TASK_DEFINITIONS.map((definition) => taskFrom(definition, batch))], updatedAt: new Date().toISOString() });
    }
    const queued = campaign.tasks.find((task) => task.state === "QUEUED");
    if (!queued) throw new Error("EVOLUTION_QUEUE_EMPTY");

    const workerId = `evolution-${process.pid}`;
    const durable = this.#database.enqueueDurableJob("api-evolution", { projectId, taskId: queued.id, track: queued.track, prompt: queued.prompt }, projectId);
    this.#database.leaseDurableJob(durable.id, workerId, JOB_LEASE_MS);
    this.#database.startDurableJob(durable.id, workerId, JOB_LEASE_MS);
    const runningAt = new Date().toISOString();
    campaign = this.#save({
      ...campaign,
      isRunning: true,
      lastError: null,
      tasks: campaign.tasks.map((task) => task.id === queued.id ? { ...task, state: "RUNNING" as const, error: null } : task),
      updatedAt: runningAt
    });

    const systemPrompt = [
      "DEVBOX API GELİŞİM DÖNGÜSÜ",
      `Benzersiz görev kimliği: ${queued.id}`,
      `Kampanya çevrimi: ${campaign.completedCycles + campaign.failedCycles + 1}`,
      `Proje: ${project.name}`,
      `Kök: ${project.rootPath}`,
      `İz: ${queued.track}`,
      `Öncelikli çalışma zamanı: ${PRIMARY_PROVIDER} · ${PRIMARY_MODEL} · yüksek muhakeme`,
      "KULLANICI TARAFINDAN KAYDEDİLEN ANA YÖNERGE:",
      campaign.directive,
      "BU ÇEVRİMİN BENZERSİZ ODAĞI:",
      queued.prompt,
      "Bu döngü salt-okunur araştırma ve mühendislik backlog'u üretir; dosyaları veya uzak servisleri değiştirme.",
      "Gizli değerleri isteme/gösterme. Test çalıştırmadıysan çalıştırılmış gibi yazma. Önceki görevin metnini tekrar etme.",
      "Çıktıyı Bulgular, Yeni ve uygulanabilir görevler, Kabul kriterleri, Riskler ve Doğrulanacak birincil kaynaklar başlıklarıyla ver."
    ].join("\n\n");

    try {
      const response = await this.#agent.respondForEvolution(systemPrompt, project.rootPath);
      const thread = this.#database.createThread(projectId, `DevBox API · ${queued.title}`);
      this.#database.appendMessage(thread.thread.id, systemPrompt, response.content);
      const completedAt = new Date().toISOString();
      this.#database.settleDurableJob(durable.id, workerId, "SUCCEEDED", { threadId: thread.thread.id, provider: response.provider, model: response.model, evidence: response.evidence });
      const completedTracks = new Set(campaign.tasks.filter((task) => task.state === "SUCCEEDED").map((task) => task.track));
      completedTracks.add(queued.track);
      const score = Math.min(100, Math.round((completedTracks.size / TASK_DEFINITIONS.length) * 100));
      const learning: EvolutionLearning = {
        id: randomUUID(),
        track: queued.track,
        title: queued.title,
        summary: conciseLearning(response.content),
        evidence: [durable.id, response.sessionId, ...response.evidence].slice(0, 20),
        learnedAt: completedAt
      };
      return this.#save({
        ...campaign,
        isRunning: false,
        score,
        stage: stageFor(campaign.lifetimeLevel, score),
        lastProvider: response.provider,
        lastModel: response.model,
        completedCycles: campaign.completedCycles + 1,
        cyclesToday: campaign.cyclesToday + 1,
        lastCycleAt: completedAt,
        lastCycleDurationMs: response.durationMs,
        lastError: null,
        nextCycleAt: campaign.enabled ? nextAt(campaign.intervalMinutes) : null,
        domainScores: { ...campaign.domainScores, [queued.track]: 100 },
        tasks: campaign.tasks.map((task) => task.id === queued.id ? { ...task, state: "SUCCEEDED" as const, provider: response.provider, model: response.model, threadId: thread.thread.id, evidence: [durable.id, response.sessionId, ...response.evidence].slice(0, 20), completedAt } : task),
        learnings: [learning, ...campaign.learnings],
        updatedAt: completedAt
      });
    } catch (error) {
      const failedAt = new Date().toISOString();
      const message = error instanceof Error ? error.message.slice(0, 1_000) : String(error).slice(0, 1_000);
      try { this.#database.settleDurableJob(durable.id, workerId, "FAILED", { error: message }); } catch { /* Lease recovery will requeue an unsettled job. */ }
      const failed = this.#save({
        ...campaign,
        isRunning: false,
        failedCycles: campaign.failedCycles + 1,
        cyclesToday: campaign.cyclesToday + 1,
        lastCycleAt: failedAt,
        lastError: message,
        nextCycleAt: campaign.enabled ? nextAt(campaign.intervalMinutes) : null,
        tasks: campaign.tasks.map((task) => task.id === queued.id ? { ...task, state: "FAILED" as const, provider: null, model: null, error: message, evidence: [durable.id], completedAt: failedAt } : task),
        updatedAt: failedAt
      });
      if (manual) throw new Error(`EVOLUTION_CYCLE_FAILED:${message}`);
      return failed;
    }
  }

  #resetDaily(campaign: EvolutionCampaign): EvolutionCampaign {
    const today = dayKey();
    if (campaign.cycleDay === today) return campaign;
    return this.#save({ ...campaign, cyclesToday: 0, cycleDay: today, updatedAt: new Date().toISOString() });
  }

  #key(projectId: string): string {
    return `api-evolution:${projectId}`;
  }

  #save(campaign: EvolutionCampaign): EvolutionCampaign {
    const previous = this.#database.getSetting<Record<string, unknown>>(this.#key(campaign.projectId));
    const previousLevel = previous ? Math.max(Number(previous.level ?? 1), Number(previous.lifetimeLevel ?? 1), Number(previous.migrationFloorLevel ?? 1)) : 1;
    const floor = Math.max(campaign.migrationFloorLevel, previousLevel);
    const lifetimeLevel = levelForPoints(campaign.lifetimeEvidencePoints, floor);
    const valid = EvolutionCampaignSchema.parse({
      ...campaign,
      level: lifetimeLevel,
      lifetimeLevel,
      migrationFloorLevel: floor,
      stage: stageFor(lifetimeLevel, campaign.score)
    });
    this.#database.setSetting(this.#key(valid.projectId), valid);
    return valid;
  }
}
