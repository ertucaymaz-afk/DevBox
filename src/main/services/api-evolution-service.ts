import { randomUUID } from "node:crypto";
import type { EvolutionCampaign, EvolutionLearning, EvolutionTask } from "../../shared/contracts.js";
import { EvolutionCampaignSchema } from "../../shared/contracts.js";
import type { AgentService } from "./agent-service.js";
import type { StateDatabase } from "./database.js";
import type { ProjectService } from "./project-service.js";
import type { SettingsService } from "./settings-service.js";

const PROVIDER = "OpenAI Codex CLI → Hermes/NVIDIA NIM fallback";
const MODEL = "İlk gerçek çevrimde doğrulanacak";
const INITIAL_SCORE = 0;
const DEFAULT_INTERVAL_MINUTES = 60;
const DEFAULT_DAILY_LIMIT = 24;
const JOB_LEASE_MS = 4 * 60_000;
const DEFAULT_DIRECTIVE = [
  "DevBox'ı gerçek, üretim kalitesinde ve kanıt temelli bir Windows mühendislik masaüstü olarak geliştir.",
  "Her çevrimde önce kimliği doğrulanmış yerel OpenAI Codex CLI yolunu kullan; Codex kullanılamıyorsa yalnız gerçekten çalıştırılan Hermes/NVIDIA NIM fallback sonucunu kaydet.",
  "Gösterilen her veri, başarı, düğme ve yetenek gerçek çalışma sonucuna dayanmalı; doğrulanmamış veya eksik yeteneği açıkça engel olarak işaretle.",
  "Kodlama, ürün tasarımı, API sözleşmeleri, güvenlik, performans, erişilebilirlik, gözlemlenebilirlik, entegrasyon, test ve yayın zincirini birlikte değerlendir.",
  "Çalışma zamanı gerçek web arama aracı sağlıyorsa güncel iddiaları birincil kaynaklarla doğrula; sağlamıyorsa web araştırması yapılmış gibi davranma ve doğrulanması gereken kaynakları ayrı listele.",
  "Her öneriyi küçük uygulanabilir görevlere böl; dosya/sorumluluk sınırı, kabul kriteri, test kanıtı, risk ve geri dönüş planı ver.",
  "Gizli değerleri isteme veya çıktıya yazma. Test çalıştırılmadıysa geçti deme. Dosya ya da uzak servis üzerinde kendiliğinden mutasyon yapma."
].join("\n");

type TaskDefinition = Pick<EvolutionTask, "track" | "title" | "prompt">;

const TASK_DEFINITIONS: readonly TaskDefinition[] = [
  { track: "research", title: "Resmî kaynak ve rakip davranış araştırması", prompt: "DevBox API ve masaüstü ajan ürününün güncel davranışlarını yalnız doğrulanabilir birincil kaynaklara dayalı incele. OpenAI Codex, Electron, Windows ve kullanılan upstream projelerdeki ilgili yeni sözleşme/değişiklikleri; uygulanabilir farkları ve doğrulama bağlantılarını çıkar." },
  { track: "architecture", title: "API sınırları ve dayanıklılık incelemesi", prompt: "Yerel DevBox v1 API, IPC, SQLite WAL, dayanıklı işler, iş kiralama, yeniden başlatma ve hata alanlarını mimari açıdan incele. Yarış, idempotency, backpressure, iptal ve crash recovery açıklarını önem sırasıyla öner." },
  { track: "api", title: "DevBox API sözleşme gelişimi", prompt: "DevBox API için geriye uyumlu endpoint, şema, hata semantiği, sürümleme, pagination, idempotency ve istemci entegrasyon backlog'u üret. Her madde için kabul kriteri ve sözleşme testi öner." },
  { track: "coding", title: "Kodlama ve refactor adayları", prompt: "Seçili DevBox projesini güvenli, salt-okunur analiz et. En yüksek etkili kodlama/refactor adaylarını dosya ve sorumluluk sınırlarıyla; küçük uygulanabilir dilimler, testler ve geri dönüş planıyla sırala." },
  { track: "design", title: "Codex-benzeri ürün ve tasarım incelemesi", prompt: "DevBox'ın sohbet öncelikli Windows arayüzünü yoğunluk, tipografi, boşluk, klavye, sağ tık, sürükle-bırak, erişilebilirlik ve uzun görev görünürlüğü açısından değerlendir. Somut tasarım token'ları ve ölçülebilir kabul kriterleri üret." },
  { track: "quality", title: "Test, performans ve failure matrisi", prompt: "DevBox için birim, sözleşme, hedefli UI, paketli uygulama, CPU/RAM/I/O soak ve failure-injection açığını incele. Her testin süresi, önkoşulu, kanıtı ve başarısızlık eşiğini içeren öncelikli matris oluştur." },
  { track: "security", title: "Güvenlik ve güven zinciri incelemesi", prompt: "DevBox'ın IPC, renderer sınırı, process çalıştırma, secret yönetimi, SSH pinning, plugin/MCP imza zinciri, Authenticode ve updater tehditlerini incele. İstismar senaryosu, önlem ve doğrulama kanıtı üret; gizli değer isteme veya gösterme." },
  { track: "release", title: "Yayın kapısı ve kalan engeller", prompt: "DevBox'ın gerçek release-ready olmasını engelleyen alanları yeniden değerlendir. Kod imzası, updater/rollback, temiz Windows VM, GitHub/Vercel E2E, LSP/DAP, remote worker ve marketplace için fail-closed kabul kapıları öner." },
  { track: "performance", title: "Performans ve kaynak bütçesi", prompt: "Başlatma, uzun sohbet, büyük proje ağacı, terminal, paralel görev ve paketleme yolları için CPU, RAM, I/O, render ve child-process bütçeleri öner. Ölçüm komutları, eşikler, soak senaryoları ve sızıntı kanıtlarını belirt." },
  { track: "observability", title: "Gözlemlenebilirlik ve olay adli izi", prompt: "Kullanıcı verisini ve sırları sızdırmadan DevBox log, health, durable-job, sağlayıcı, IPC, terminal ve entegrasyon olaylarının nasıl ilişkilendirileceğini incele. Eyleme dönük alanlar, saklama politikası ve crash tanı akışı öner." },
  { track: "accessibility", title: "Erişilebilirlik ve klavye denetimi", prompt: "Ana sohbet, composer, menüler, mesaj eylemleri, terminal ve ayar yüzeylerini klavye, odak, ekran okuyucu, kontrast, yakınlaştırma ve reduced-motion açısından incele. WCAG uyumlu ölçülebilir kabul kriterleri üret." },
  { track: "integrations", title: "Gerçek entegrasyon yaşam döngüleri", prompt: "GitHub, Vercel, SSH, uzak worker, LSP, DAP, plugin, MCP ve toolkit yollarını kimlik, bağlantı, mutasyon, iptal, yeniden deneme, audit ve rollback uçtan uca yaşam döngüsüyle değerlendir. Yalnız sağlık kontrolü ve gerçek işlem kanıtı varsa READY durumu üreten kapılar öner." },
  { track: "documentation", title: "Kullanıcı ve geliştirici belgeleri", prompt: "Kurulum, izin modeli, veri akışı, DevBox API, sağlayıcı kurulumu, sorun giderme, katkı, güvenlik bildirimi ve yayın doğrulaması belgelerindeki boşlukları incele. Gerçek davranışa bağlı örnekler ve doğrulama adımları öner." },
  { track: "supply-chain", title: "Açık kaynak tedarik zinciri", prompt: "Lisans, bağımlılık, SBOM, provenance, GitHub Actions pinleme, artifact bütünlüğü, SignPath origin verification, imza politikası ve güncelleme güven kökünü incele. Fail-closed CI/yayın kontrollerini önem sırasıyla öner." }
] as const;

function dayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function levelFor(score: number): number {
  return Math.max(1, Math.min(10, Math.floor(score / 10) + 1));
}

function stageFor(score: number): string {
  if (score === 0) return "Kanıt bekliyor";
  if (score >= 90) return "Yayın adayı";
  if (score >= 75) return "Ürünleştirme";
  if (score >= 60) return "Entegrasyon";
  if (score >= 45) return "Sağlam altyapı";
  return "Temel geliştirme";
}

function nextAt(intervalMinutes: number, from = new Date()): string {
  return new Date(from.getTime() + intervalMinutes * 60_000).toISOString();
}

function conciseLearning(content: string): string {
  return content.replace(/```[\s\S]*?```/gu, " [kod bloğu] ").replace(/\s+/gu, " ").trim().slice(0, 1_200) || "Ajan çıktı üretmedi.";
}

function taskFrom(definition: TaskDefinition): EvolutionTask {
  return {
    id: randomUUID(),
    ...definition,
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
    const candidate = stored && typeof stored === "object" && !Array.isArray(stored)
      ? (() => {
          const record = stored as Record<string, unknown>;
          const existingTasks = Array.isArray(record.tasks) ? record.tasks : [];
          const existingTracks = new Set(existingTasks.flatMap((task) => task && typeof task === "object" && "track" in task && typeof task.track === "string" ? [task.track] : []));
          return {
            ...record,
            directive: typeof record.directive === "string" ? record.directive : DEFAULT_DIRECTIVE,
            provider: Number(record.completedCycles ?? 0) === 0 ? PROVIDER : record.provider,
            model: Number(record.completedCycles ?? 0) === 0 ? MODEL : record.model,
            dailyCycleLimit: record.dailyCycleLimit === 4 ? DEFAULT_DAILY_LIMIT : record.dailyCycleLimit,
            intervalMinutes: record.intervalMinutes === 360 ? DEFAULT_INTERVAL_MINUTES : record.intervalMinutes,
            tasks: [...existingTasks, ...TASK_DEFINITIONS.filter((definition) => !existingTracks.has(definition.track)).map(taskFrom)].slice(-120)
          };
        })()
      : stored;
    const parsed = EvolutionCampaignSchema.safeParse(candidate);
    if (parsed.success) return this.#resetDaily(parsed.data);

    const now = new Date();
    const enabled = this.#settings.get().networkAccess;
    const initial: EvolutionCampaign = {
      projectId,
      enabled,
      directive: DEFAULT_DIRECTIVE,
      score: INITIAL_SCORE,
      level: levelFor(INITIAL_SCORE),
      stage: stageFor(INITIAL_SCORE),
      provider: PROVIDER,
      model: MODEL,
      completedCycles: 0,
      failedCycles: 0,
      cyclesToday: 0,
      cycleDay: dayKey(now),
      dailyCycleLimit: DEFAULT_DAILY_LIMIT,
      intervalMinutes: DEFAULT_INTERVAL_MINUTES,
      lastCycleAt: null,
      nextCycleAt: enabled ? new Date(now.getTime() + 2 * 60_000).toISOString() : null,
      tasks: TASK_DEFINITIONS.map(taskFrom),
      learnings: [],
      updatedAt: now.toISOString()
    };
    return this.#save(initial);
  }

  public setEnabled(projectId: string, enabled: boolean): EvolutionCampaign {
    if (enabled && !this.#settings.get().networkAccess) throw new Error("EVOLUTION_REQUIRES_NETWORK_PROFILE");
    const current = this.get(projectId);
    return this.#save({
      ...current,
      enabled,
      nextCycleAt: enabled ? (current.nextCycleAt ?? new Date().toISOString()) : null,
      updatedAt: new Date().toISOString()
    });
  }

  public setDirective(projectId: string, directive: string): EvolutionCampaign {
    const current = this.get(projectId);
    return this.#save({ ...current, directive: directive.trim(), updatedAt: new Date().toISOString() });
  }

  public async runNow(projectId: string): Promise<EvolutionCampaign> {
    this.#projects.get(projectId);
    if (this.#inFlight.has(projectId)) return this.get(projectId);
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
        // Failure details are persisted by #runCycle and surfaced in the campaign UI.
      } finally {
        this.#inFlight.delete(project.id);
      }
    }
  }

  async #runCycle(projectId: string, manual: boolean): Promise<EvolutionCampaign> {
    if (!this.#settings.get().networkAccess) throw new Error("EVOLUTION_REQUIRES_NETWORK_PROFILE");
    const project = this.#projects.get(projectId);
    let campaign = this.#resetDaily(this.get(projectId));
    if (!manual && campaign.cyclesToday >= campaign.dailyCycleLimit) {
      const tomorrow = new Date();
      tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
      tomorrow.setUTCHours(0, 5, 0, 0);
      return this.#save({ ...campaign, nextCycleAt: tomorrow.toISOString(), updatedAt: new Date().toISOString() });
    }

    if (!campaign.tasks.some((task) => task.state === "QUEUED")) {
      campaign = { ...campaign, tasks: [...campaign.tasks, ...TASK_DEFINITIONS.map(taskFrom)].slice(-120) };
    }
    const queued = campaign.tasks.find((task) => task.state === "QUEUED");
    if (!queued) return campaign;

    const workerId = `evolution-${process.pid}`;
    const durable = this.#database.enqueueDurableJob("api-evolution", { projectId, taskId: queued.id, track: queued.track, prompt: queued.prompt }, projectId);
    this.#database.leaseDurableJob(durable.id, workerId, JOB_LEASE_MS);
    this.#database.startDurableJob(durable.id, workerId, JOB_LEASE_MS);
    const runningAt = new Date().toISOString();
    campaign = this.#save({
      ...campaign,
      tasks: campaign.tasks.map((task) => task.id === queued.id ? { ...task, state: "RUNNING" as const, error: null } : task),
      updatedAt: runningAt
    });

    const systemPrompt = [
      "DEVBOX API GELİŞİM DÖNGÜSÜ",
      `Proje: ${project.name}`,
      `Kök: ${project.rootPath}`,
      `İz: ${queued.track}`,
      "KULLANICI TARAFINDAN KAYDEDİLEN ANA YÖNERGE:",
      campaign.directive,
      "BU ÇEVRİMİN ODAĞI:",
      queued.prompt,
      "Bu döngü araştırma ve mühendislik backlog'u üretir; dosyaları veya uzak servisleri değiştirme.",
      "Gizli değerleri isteme/gösterme. Test çalıştırmadıysan çalıştırılmış gibi yazma.",
      "Çıktıyı Bulgular, Önerilen görevler, Kabul kriterleri, Riskler ve Doğrulanacak birincil kaynaklar başlıklarıyla ver."
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
        score,
        level: levelFor(score),
        stage: stageFor(score),
        provider: response.provider,
        model: response.model,
        completedCycles: campaign.completedCycles + 1,
        cyclesToday: campaign.cyclesToday + 1,
        lastCycleAt: completedAt,
        nextCycleAt: campaign.enabled ? nextAt(campaign.intervalMinutes) : null,
        tasks: campaign.tasks.map((task) => task.id === queued.id ? { ...task, state: "SUCCEEDED" as const, provider: response.provider, model: response.model, threadId: thread.thread.id, evidence: [durable.id, response.sessionId, ...response.evidence].slice(0, 20), completedAt } : task),
        learnings: [learning, ...campaign.learnings].slice(0, 40),
        updatedAt: completedAt
      });
    } catch (error) {
      const failedAt = new Date().toISOString();
      const message = error instanceof Error ? error.message.slice(0, 1_000) : String(error).slice(0, 1_000);
      try { this.#database.settleDurableJob(durable.id, workerId, "FAILED", { error: message }); } catch { /* Lease recovery will requeue an unsettled job. */ }
      const failed = this.#save({
        ...campaign,
        failedCycles: campaign.failedCycles + 1,
        cyclesToday: campaign.cyclesToday + 1,
        lastCycleAt: failedAt,
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
    const valid = EvolutionCampaignSchema.parse(campaign);
    this.#database.setSetting(this.#key(valid.projectId), valid);
    return valid;
  }
}
