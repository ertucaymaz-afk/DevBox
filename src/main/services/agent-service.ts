import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import type { EvolutionModelCatalog, EvolutionRouting, ThreadItem } from "../../shared/contracts.js";
import type { CommandRunner } from "./command-runner.js";
import { discoverNvidiaCredential } from "./environment-discovery.js";

const PROVIDER = "nvidia";
const MODEL = "nvidia/nemotron-3-super-120b-a12b";
export const CODEX_PROVIDER = "OpenAI Codex CLI";
export const DEFAULT_CODEX_MODEL = "gpt-5.6-sol";
export const CODEX_REASONING_EFFORT = "high";
const MAX_HISTORY_CHARACTERS = 32_000;

type ExportedMessage = { role?: unknown; content?: unknown };
type ExportedSession = { messages?: unknown };

export type EvolutionProviderOutcome = "PASS" | "BLOCKED_EXTERNAL" | "FAILED" | "UNSPECIFIED";
export type EvolutionAcceptanceReport = {
  summary: string | null;
  positiveTests: string[];
  negativeTests: string[];
  securityChecks: string[];
  performanceChecks: string[];
  uxChecks: string[];
  evidenceRefs: string[];
};
export type AgentResponse = {
  content: string;
  provider: string;
  model: string;
  sessionId: string;
  durationMs: number;
  evidence: string[];
  outcome: EvolutionProviderOutcome;
  blockReason: string | null;
  acceptance: EvolutionAcceptanceReport;
};

export type AgentProgressEvent = {
  kind: "provider" | "command" | "evidence" | "waiting" | "failure";
  stage: "PROVIDER_CHECK" | "AUTH_CHECK" | "MODEL_ATTEMPT" | "PLANNING" | "INSPECTING" | "EDITING" | "RUNNING_COMMAND" | "TESTING" | "VERIFYING" | "REVIEWING" | "WAITING" | "BACKOFF";
  provider: string | null;
  model: string | null;
  message: string;
  createdAt: string;
};

export type AgentProgressListener = (event: AgentProgressEvent) => void;
export type EvolutionResultValidator = (response: AgentResponse) => Promise<void> | void;

function report(
  listener: AgentProgressListener | undefined,
  kind: AgentProgressEvent["kind"],
  stage: AgentProgressEvent["stage"],
  message: string,
  provider: string | null = null,
  model: string | null = null
): void {
  listener?.({ kind, stage, provider, model, message, createdAt: new Date().toISOString() });
}

type CodexEvent = {
  type?: unknown;
  thread_id?: unknown;
  usage?: unknown;
  item?: { type?: unknown; text?: unknown; command?: unknown; exit_code?: unknown; status?: unknown; changes?: unknown; message?: unknown; error?: unknown };
  message?: unknown;
  error?: unknown;
};

type ParsedCodexExecution = {
  content: string;
  sessionId: string;
  commandCount: number;
  fileChangeCount: number;
  completedTurn: boolean;
};

type EvolutionRoute = { provider: "codex" | "hermes-nvidia"; model: string; reasoningEffort: EvolutionRouting["reasoningEffort"] };

type CodexMutationMode = "workspace-write" | "safe-patch";

function extractDevBoxPatch(content: string): string | null {
  const startMarker = "DEVBOX_PATCH_START";
  const endMarker = "DEVBOX_PATCH_END";
  const start = content.indexOf(startMarker);
  const end = content.indexOf(endMarker);
  if (start < 0 || end <= start) return null;
  const patch = content.slice(start + startMarker.length, end).trim();
  return patch || null;
}

function validateDevBoxPatch(patch: string, cwd: string): string[] {
  if (Buffer.byteLength(patch, "utf8") > 4 * 1024 * 1024) throw new Error("CODEX_SAFE_PATCH_TOO_LARGE");
  const paths: string[] = [];
  for (const line of patch.split(/\r?\n/u)) {
    const match = line.match(/^diff --git a\/(.+?) b\/(.+)$/u);
    if (!match) continue;
    for (const candidate of [match[1], match[2]]) {
      if (!candidate) continue;
      const normalized = candidate.replace(/\\/gu, "/");
      if (normalized.startsWith("/") || normalized.includes("../") || normalized === ".." || normalized.startsWith(".git/") || normalized === ".git") {
        throw new Error("CODEX_SAFE_PATCH_PATH_FORBIDDEN");
      }
      if (/^(?:node_modules|dist|release|\.env(?:$|\.)|secrets?)(?:\/|$)/iu.test(normalized)) throw new Error("CODEX_SAFE_PATCH_GENERATED_OR_SECRET_PATH_FORBIDDEN");
      const resolved = path.resolve(cwd, normalized);
      const root = path.resolve(cwd);
      if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) throw new Error("CODEX_SAFE_PATCH_PATH_OUTSIDE_WORKSPACE");
      paths.push(normalized);
    }
  }
  if (paths.length === 0 || !/^diff --git /mu.test(patch)) throw new Error("CODEX_SAFE_PATCH_EMPTY_OR_INVALID");
  return [...new Set(paths)];
}


type CodexAppServerResponse = {
  id?: unknown;
  result?: unknown;
  error?: unknown;
};

type CodexModelRecord = Record<string, unknown>;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function normalizeReasoningEfforts(value: unknown): EvolutionRouting["reasoningEffort"][] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set<EvolutionRouting["reasoningEffort"]>(["none", "minimal", "low", "medium", "high", "xhigh", "max"]);
  const output: EvolutionRouting["reasoningEffort"][] = [];
  for (const entry of value) {
    const record = asRecord(entry);
    const candidate = typeof entry === "string" ? entry
      : typeof record?.reasoningEffort === "string" ? record.reasoningEffort
      : typeof record?.effort === "string" ? record.effort
      : null;
    if (candidate && allowed.has(candidate as EvolutionRouting["reasoningEffort"]) && !output.includes(candidate as EvolutionRouting["reasoningEffort"])) {
      output.push(candidate as EvolutionRouting["reasoningEffort"]);
    }
  }
  return output;
}

export function parseCodexModelCatalog(stdout: string, checkedAt = new Date().toISOString()): EvolutionModelCatalog | null {
  let response: CodexAppServerResponse | null = null;
  for (const line of stdout.split(/\r?\n/u).map((value) => value.trim()).filter(Boolean)) {
    try {
      const parsed = JSON.parse(line) as CodexAppServerResponse;
      if (parsed.id === 2) response = parsed;
    } catch {
      // App-server stdout is JSONL; unrelated diagnostics are ignored and the response must still be present.
    }
  }
  if (!response || response.error !== undefined || response.result === undefined) return null;
  const result = asRecord(response.result);
  const data = Array.isArray(result?.data) ? result.data : Array.isArray(result?.models) ? result.models : [];
  const items = data.flatMap((raw): EvolutionModelCatalog["items"] => {
    const model = asRecord(raw) as CodexModelRecord | null;
    if (!model) return [];
    const id = [model.model, model.id, model.slug].find((value): value is string => typeof value === "string" && Boolean(value.trim()))?.trim();
    if (!id) return [];
    const displayName = [model.displayName, model.display_name, model.name].find((value): value is string => typeof value === "string" && Boolean(value.trim()))?.trim() ?? id;
    const efforts = normalizeReasoningEfforts(model.supportedReasoningEfforts ?? model.supported_reasoning_efforts ?? model.supportedReasoningLevels ?? model.supported_reasoning_levels);
    return [{
      id: id.slice(0, 200),
      displayName: displayName.slice(0, 240),
      provider: "codex" as const,
      supportedReasoningEfforts: efforts,
      hidden: model.hidden === true || model.visibility === "hide",
      source: "codex-app-server" as const,
      discoveredAt: checkedAt
    }];
  });
  return {
    provider: "codex",
    state: items.length > 0 ? "READY" : "FAILED",
    detail: items.length > 0 ? `Codex app-server model/list ile ${items.length} model keşfedildi.` : "Codex app-server model/list boş katalog döndürdü.",
    items,
    checkedAt
  };
}


export function parseNvidiaModelCatalog(payload: unknown, checkedAt = new Date().toISOString()): EvolutionModelCatalog | null {
  const root = asRecord(payload);
  const data = Array.isArray(root?.data) ? root.data : Array.isArray(root?.models) ? root.models : [];
  const items = data.flatMap((raw): EvolutionModelCatalog["items"] => {
    const model = asRecord(raw);
    if (!model) return [];
    const id = [model.id, model.model, model.name].find((value): value is string => typeof value === "string" && Boolean(value.trim()))?.trim();
    if (!id) return [];
    const displayName = [model.display_name, model.displayName, model.name].find((value): value is string => typeof value === "string" && Boolean(value.trim()))?.trim() ?? id;
    return [{
      id: id.slice(0, 200),
      displayName: displayName.slice(0, 240),
      provider: "hermes-nvidia" as const,
      supportedReasoningEfforts: ["none" as const],
      hidden: false,
      source: "nvidia-models-api" as const,
      discoveredAt: checkedAt
    }];
  });
  return {
    provider: "hermes-nvidia",
    state: items.length > 0 ? "READY" : "FAILED",
    detail: items.length > 0 ? `NVIDIA /v1/models ile ${items.length} model keşfedildi.` : "NVIDIA /v1/models boş katalog döndürdü.",
    items,
    checkedAt
  };
}

function nvidiaModelsUrl(environment: NodeJS.ProcessEnv = process.env): { url: string; hosted: boolean } {
  const configured = environment.DEVBOX_NVIDIA_NIM_BASE_URL?.trim();
  const base = configured || "https://integrate.api.nvidia.com/v1";
  let parsed: URL;
  try { parsed = new URL(base); } catch { throw new Error("NVIDIA_NIM_BASE_URL_INVALID"); }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error("NVIDIA_NIM_BASE_URL_PROTOCOL_UNSUPPORTED");
  if (parsed.username || parsed.password) throw new Error("NVIDIA_NIM_BASE_URL_USERINFO_FORBIDDEN");
  if (parsed.pathname === "/") parsed.pathname = "/v1";
  const normalized = parsed.toString().replace(/\/$/u, "");
  return { url: `${normalized}/models`, hosted: parsed.hostname === "integrate.api.nvidia.com" };
}

export function evolutionRoutePlan(routing: EvolutionRouting): EvolutionRoute[] {
  if (routing.mode === "LOCKED") return [{ provider: routing.provider, model: routing.model, reasoningEffort: routing.reasoningEffort }];
  const routes: EvolutionRoute[] = [{ provider: routing.provider, model: routing.model, reasoningEffort: routing.reasoningEffort }];
  const add = (route: EvolutionRoute): void => { if (!routes.some((item) => item.provider === route.provider && item.model === route.model)) routes.push(route); };
  if (routing.allowFallback) {
    add({ provider: "codex", model: "gpt-5.6-sol", reasoningEffort: "high" });
    add({ provider: "codex", model: "gpt-5.5", reasoningEffort: "high" });
    add({ provider: "hermes-nvidia", model: MODEL, reasoningEffort: "none" });
  }
  return routes;
}

function codexProgressFromLine(line: string, listener: AgentProgressListener | undefined, model: string): void {
  try {
    const event = JSON.parse(line) as CodexEvent;
    if (event.type === "thread.started") return report(listener, "evidence", "MODEL_ATTEMPT", "Codex thread oluşturuldu.", CODEX_PROVIDER, model);
    if (event.type === "turn.started") return report(listener, "provider", "PLANNING", "Codex turn başladı; planlama ve proje incelemesi yürütülüyor.", CODEX_PROVIDER, model);
    const itemType = typeof event.item?.type === "string" ? event.item.type : "";
    if (itemType.includes("command")) return report(listener, "command", "RUNNING_COMMAND", `Komut çalıştırılıyor${typeof event.item?.command === "string" ? `: ${String(event.item.command).slice(0, 240)}` : "."}`, CODEX_PROVIDER, model);
    if (itemType.includes("file") || itemType.includes("patch")) return report(listener, "command", "EDITING", "Dosya değişikliği/patch uygulanıyor.", CODEX_PROVIDER, model);
    if (itemType.includes("test")) return report(listener, "command", "TESTING", "Test adımı çalışıyor.", CODEX_PROVIDER, model);
    if (itemType === "agent_message" && event.type === "item.completed") return report(listener, "evidence", "REVIEWING", "Ajan sonucu tamamlandı; kanıt ve doğrulama sonucu toplanıyor.", CODEX_PROVIDER, model);
    if (event.type === "error") return report(listener, "failure", "BACKOFF", typeof event.message === "string" ? event.message.slice(0, 500) : "Codex çalışma zamanı hata olayı bildirdi.", CODEX_PROVIDER, model);
  } catch {
    // Non-JSON diagnostics are intentionally not promoted to structured progress.
  }
}

function parseSemver(text: string): [number, number, number] | null {
  const match = text.match(/(?:^|\s|v)(\d+)\.(\d+)\.(\d+)(?:\s|$|-)/u);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function resolveCodexExecutable(
  environment: NodeJS.ProcessEnv = process.env,
  fileExists: (candidate: string) => boolean = existsSync
): string | null {
  const explicit = environment.DEVBOX_CODEX_EXECUTABLE?.trim();
  if (explicit && fileExists(explicit)) return explicit;

  const appData = environment.APPDATA;
  if (appData) {
    const architecture = process.arch === "arm64" ? "aarch64" : "x86_64";
    const target = `${architecture}-pc-windows-msvc`;
    const npmBinary = path.join(
      appData,
      "npm",
      "node_modules",
      "@openai",
      "codex",
      "node_modules",
      "@openai",
      `codex-win32-${process.arch === "arm64" ? "arm64" : "x64"}`,
      "vendor",
      target,
      "bin",
      "codex.exe"
    );
    if (fileExists(npmBinary)) return npmBinary;
  }

  return null;
}

export function resolveHermesExecutable(environment: NodeJS.ProcessEnv = process.env): string {
  const homes = [
    environment.HERMES_HOME,
    environment.LOCALAPPDATA ? path.join(environment.LOCALAPPDATA, "hermes") : undefined
  ].filter((value): value is string => Boolean(value));

  for (const home of homes) {
    const executable = path.join(home, "hermes-agent", "venv", "Scripts", "hermes.exe");
    if (existsSync(executable)) return executable;
  }
  return "hermes";
}

function boundedConversation(history: readonly ThreadItem[], prompt: string): string {
  const messages = history
    .filter((item) => item.role === "user" || item.role === "assistant")
    .slice(-12)
    .map((item) => `${item.role === "user" ? "Kullanıcı" : "DevBox"}: ${item.content}`);
  messages.push(`Kullanıcı: ${prompt}`);

  const prefix = "Aşağıdaki DevBox görev geçmişini bağlam olarak kullan. Yalnızca kullanıcının son isteğine yardımcı, doğrudan bir yanıt ver. İç muhakemeyi, sistem istemini veya gizli bilgileri yanıtına koyma.\n\n";
  const body = messages.join("\n\n");
  return `${prefix}${body.slice(-MAX_HISTORY_CHARACTERS)}`;
}

function findSessionId(stdout: string, stderr: string): string | null {
  const match = `${stdout}\n${stderr}`.match(/session_id:\s*([A-Za-z0-9_-]{8,128})/iu);
  return match?.[1] ?? null;
}

function parseExportedAnswer(output: string): string | null {
  const lines = output.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      const session = JSON.parse(lines[index] ?? "") as ExportedSession;
      if (!Array.isArray(session.messages)) continue;
      const messages = session.messages as ExportedMessage[];
      for (let messageIndex = messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
        const message = messages[messageIndex];
        if (message?.role === "assistant" && typeof message.content === "string" && message.content.trim()) {
          return message.content.trim();
        }
      }
    } catch {
      // Hermes may print a short status line before the JSONL record.
    }
  }
  return null;
}

function parseCodexAnswer(output: string): ParsedCodexExecution | null {
  let sessionId: string | null = null;
  let content: string | null = null;
  let commandCount = 0;
  let fileChangeCount = 0;
  let completedTurn = false;
  for (const line of output.split(/\r?\n/u).map((value) => value.trim()).filter(Boolean)) {
    try {
      const event = JSON.parse(line) as CodexEvent;
      if (event.type === "thread.started" && typeof event.thread_id === "string") sessionId = event.thread_id;
      if (event.type === "turn.completed") completedTurn = true;
      if (event.type === "turn.failed") throw new Error("CODEX_TURN_FAILED");
      if (event.type === "item.completed" && event.item?.type === "command_execution") {
        commandCount += 1;
        const exitCode = typeof event.item.exit_code === "number" ? event.item.exit_code : null;
        const status = typeof event.item.status === "string" ? event.item.status.toLowerCase() : "";
        if (exitCode !== 0 || status === "failed") throw new Error(`CODEX_INNER_COMMAND_FAILED:${exitCode ?? "NO_EXIT"}`);
      }
      if (event.type === "item.completed" && (event.item?.type === "file_change" || event.item?.type === "file_change_result")) fileChangeCount += 1;
      if (event.type === "item.completed" && event.item?.type === "error") throw new Error("CODEX_ITEM_ERROR");
      if (event.type === "item.completed" && event.item?.type === "agent_message" && typeof event.item.text === "string" && event.item.text.trim()) content = event.item.text.trim();
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("CODEX_")) throw error;
      // JSONL dışındaki tanılama satırlarını görmezden gel; geçerli terminal eventleri yine zorunludur.
    }
  }
  return content && sessionId && completedTurn ? { content, sessionId, commandCount, fileChangeCount, completedTurn } : null;
}

function boundedStrings(value: unknown, max = 40): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim().slice(0, 1_000)).slice(0, max);
}

const EMPTY_ACCEPTANCE: EvolutionAcceptanceReport = { summary: null, positiveTests: [], negativeTests: [], securityChecks: [], performanceChecks: [], uxChecks: [], evidenceRefs: [] };

export function parseEvolutionProviderOutcome(content: string): { outcome: EvolutionProviderOutcome; blockReason: string | null; acceptance: EvolutionAcceptanceReport } {
  const lines = content.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]!;
    const marker = "DEVBOX_RESULT_JSON:";
    const markerIndex = line.indexOf(marker);
    if (markerIndex < 0) continue;
    try {
      const parsed = JSON.parse(line.slice(markerIndex + marker.length).trim()) as Record<string, unknown>;
      const acceptance: EvolutionAcceptanceReport = {
        summary: typeof parsed.summary === "string" && parsed.summary.trim() ? parsed.summary.trim().slice(0, 1_000) : null,
        positiveTests: boundedStrings(parsed.positiveTests),
        negativeTests: boundedStrings(parsed.negativeTests),
        securityChecks: boundedStrings(parsed.securityChecks),
        performanceChecks: boundedStrings(parsed.performanceChecks),
        uxChecks: boundedStrings(parsed.uxChecks),
        evidenceRefs: boundedStrings(parsed.evidenceRefs)
      };
      if (parsed.status === "PASS") return { outcome: "PASS", blockReason: null, acceptance };
      if (parsed.status === "FAILED") return { outcome: "FAILED", blockReason: null, acceptance };
      if (parsed.status === "BLOCKED_EXTERNAL") {
        const reason = typeof parsed.blockReason === "string" && parsed.blockReason.trim() ? parsed.blockReason.trim().slice(0, 1_000)
          : acceptance.summary ?? "Harici bağımlılık gerekli.";
        return { outcome: "BLOCKED_EXTERNAL", blockReason: reason, acceptance };
      }
    } catch {
      // Malformed provider self-report is not trusted; independent mutation verification remains authoritative.
    }
  }
  return { outcome: "UNSPECIFIED", blockReason: null, acceptance: EMPTY_ACCEPTANCE };
}

export function validateEvolutionAcceptance(outcome: ReturnType<typeof parseEvolutionProviderOutcome>): void {
  if (outcome.outcome !== "PASS") return;
  const missing: string[] = [];
  if (!outcome.acceptance.summary) missing.push("summary");
  if (outcome.acceptance.positiveTests.length === 0) missing.push("positiveTests");
  if (outcome.acceptance.negativeTests.length === 0) missing.push("negativeTests");
  if (outcome.acceptance.securityChecks.length === 0) missing.push("securityChecks");
  if (outcome.acceptance.performanceChecks.length === 0) missing.push("performanceChecks");
  if (outcome.acceptance.uxChecks.length === 0) missing.push("uxChecks");
  if (missing.length > 0) throw new Error(`EVOLUTION_ACCEPTANCE_INCOMPLETE:${missing.join(",")}`);
}

export class AgentService {
  readonly #runner: CommandRunner;
  readonly #clientVersion: string;
  readonly #codexMutationMode = new Map<string, CodexMutationMode>();

  public constructor(runner: CommandRunner, clientVersion = process.env.npm_package_version?.trim() || "unknown") {
    this.#runner = runner;
    this.#clientVersion = clientVersion.trim().slice(0, 80) || "unknown";
  }


  public async listEvolutionModels(provider: EvolutionRouting["provider"], cwd: string, cancellation?: AbortSignal): Promise<EvolutionModelCatalog> {
    const checkedAt = new Date().toISOString();
    if (provider === "hermes-nvidia") {
      let endpoint: { url: string; hosted: boolean };
      try { endpoint = nvidiaModelsUrl(); }
      catch (error) {
        return { provider, state: "FAILED", detail: error instanceof Error ? error.message : String(error), items: [], checkedAt };
      }
      const credential = discoverNvidiaCredential();
      if (endpoint.hosted && !credential) {
        return {
          provider,
          state: "UNAVAILABLE",
          detail: "NVIDIA hosted model kataloğu için NVIDIA_API_KEY bulunamadı. Manuel model ID yazılabilir; task çalıştırması yine gerçek provider doğrulaması ister.",
          items: [{ id: MODEL, displayName: MODEL, provider, supportedReasoningEfforts: ["none"], hidden: false, source: "configured-fallback", discoveredAt: checkedAt }],
          checkedAt
        };
      }
      try {
        const timeout = AbortSignal.timeout(15_000);
        const signal = cancellation ? AbortSignal.any([cancellation, timeout]) : timeout;
        const response = await fetch(endpoint.url, {
          method: "GET",
          headers: {
            accept: "application/json",
            ...(credential ? { authorization: `Bearer ${credential.value}` } : {})
          },
          signal
        });
        if (cancellation?.aborted) throw new Error("EVOLUTION_CANCELLED");
        if (!response.ok) return { provider, state: "FAILED", detail: `NVIDIA /v1/models HTTP ${response.status}; yanıt gövdesi güvenlik nedeniyle gösterilmedi.`, items: [], checkedAt };
        const payload = await response.json() as unknown;
        return parseNvidiaModelCatalog(payload, checkedAt) ?? { provider, state: "FAILED", detail: "NVIDIA /v1/models yanıtı ayrıştırılamadı.", items: [], checkedAt };
      } catch (error) {
        if (cancellation?.aborted || (error instanceof Error && error.name === "AbortError")) throw new Error("EVOLUTION_CANCELLED");
        return { provider, state: "FAILED", detail: `NVIDIA model kataloğu sorgusu başarısız: ${error instanceof Error ? error.message : String(error)}`.slice(0, 1_000), items: [], checkedAt };
      }
    }

    const executable = resolveCodexExecutable();
    if (!executable) return { provider, state: "UNAVAILABLE", detail: "Codex CLI executable bulunamadı.", items: [], checkedAt };
    const environment: Record<string, string> = {};
    if (process.env.CODEX_HOME) environment.CODEX_HOME = process.env.CODEX_HOME;
    const request = [
      { method: "initialize", id: 1, params: { clientInfo: { name: "devbox", title: "DevBox", version: this.#clientVersion } } },
      { method: "initialized", params: {} },
      { method: "model/list", id: 2, params: { limit: 500, includeHidden: false } }
    ].map((message) => JSON.stringify(message)).join("\n") + "\n";
    const result = await this.#runner.run({
      executable,
      args: ["app-server", "--stdio"],
      cwd,
      ...(Object.keys(environment).length ? { environment } : {}),
      stdinText: request,
      ...(cancellation ? { cancellation } : {}),
      timeoutMs: 20_000,
      maxOutputBytes: 4 * 1024 * 1024
    });
    if (cancellation?.aborted || result.exitReason === "CANCELLED") throw new Error("EVOLUTION_CANCELLED");
    if (result.exitCode !== 0 || result.timedOut || result.truncated) {
      return { provider, state: "FAILED", detail: `Codex app-server model/list başarısız: ${result.stderr.trim().slice(0, 700) || result.exitReason}`, items: [], checkedAt };
    }
    return parseCodexModelCatalog(result.stdout, checkedAt) ?? { provider, state: "FAILED", detail: "Codex app-server model/list yanıtı ayrıştırılamadı.", items: [], checkedAt };
  }

  public async respondForEvolution(
    prompt: string,
    cwd: string,
    routing: EvolutionRouting,
    onProgress?: AgentProgressListener,
    cancellation?: AbortSignal,
    validateResult?: EvolutionResultValidator
  ): Promise<AgentResponse> {
    const failures: string[] = [];
    for (const route of evolutionRoutePlan(routing)) {
      if (cancellation?.aborted) throw new Error("EVOLUTION_CANCELLED");
      const providerLabel = route.provider === "codex" ? CODEX_PROVIDER : "Hermes / NVIDIA NIM";
      report(onProgress, "provider", "MODEL_ATTEMPT", `Model denemesi: ${providerLabel} · ${route.model} · ${route.reasoningEffort}`, providerLabel, route.model);
      try {
        const response = route.provider === "codex"
          ? await this.#respondWithCodex(prompt, cwd, route.model, route.reasoningEffort, onProgress, cancellation)
          : await this.respond(prompt, cwd, [], onProgress, cancellation, route.model);
        if (response.outcome === "BLOCKED_EXTERNAL") {
          report(onProgress, "waiting", "WAITING", `Harici engel bildirildi: ${response.blockReason ?? "neden belirtilmedi"}`, providerLabel, route.model);
          return response;
        }
        if (response.outcome === "FAILED") throw new Error("PROVIDER_REPORTED_FAILED");
        if (response.outcome === "UNSPECIFIED") throw new Error("PROVIDER_RESULT_PROTOCOL_MISSING");
        validateEvolutionAcceptance({ outcome: response.outcome, blockReason: response.blockReason, acceptance: response.acceptance });
        if (validateResult) {
          report(onProgress, "evidence", "VERIFYING", "Provider sonucu gerçek çalışma alanı mutasyonu açısından doğrulanıyor.", providerLabel, route.model);
          await validateResult(response);
        }
        return response;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message === "EVOLUTION_CANCELLED" || cancellation?.aborted) throw new Error("EVOLUTION_CANCELLED");
        failures.push(`${providerLabel}/${route.model}: ${message}`);
        report(onProgress, "failure", "BACKOFF", `Model denemesi başarısız: ${message}`, providerLabel, route.model);
      }
    }
    throw new Error(`EVOLUTION_PROVIDER_CHAIN_EXHAUSTED:${failures.join(" | ").slice(0, 1_500)}`);
  }

  public async respond(
    prompt: string,
    cwd: string,
    history: readonly ThreadItem[],
    onProgress?: AgentProgressListener,
    cancellation?: AbortSignal,
    modelOverride = MODEL
  ): Promise<AgentResponse> {
    const credential = discoverNvidiaCredential();
    if (!credential) throw new Error("NVIDIA_CREDENTIAL_UNAVAILABLE");

    const executable = resolveHermesExecutable();
    const hermesHome = process.env.HERMES_HOME ?? (process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "hermes") : "");
    const environment: Record<string, string> = { NVIDIA_API_KEY: credential.value };
    if (hermesHome) environment.HERMES_HOME = hermesHome;
    if (process.env.HERMES_GIT_BASH_PATH) environment.HERMES_GIT_BASH_PATH = process.env.HERMES_GIT_BASH_PATH;

    const started = performance.now();
    report(onProgress, "provider", "PROVIDER_CHECK", "Hermes aracılığıyla NVIDIA NIM oturumu başlatıldı.", "Hermes / NVIDIA NIM", modelOverride);
    report(onProgress, "command", "RUNNING_COMMAND", "hermes chat güvenli modda çalıştırılıyor.", "Hermes / NVIDIA NIM", modelOverride);
    const chat = await this.#runner.run({
      executable,
      args: [
        "chat",
        "--query", boundedConversation(history, prompt),
        "--provider", PROVIDER,
        "--model", modelOverride,
        "--reasoning", "none",
        "--safe-mode",
        "--quiet",
        "--source", "devbox",
        "--max-turns", "1",
        "--in", cwd
      ],
      cwd,
      environment,
      timeoutMs: 180_000,
      maxOutputBytes: 2 * 1024 * 1024,
      cancellation
    });
    if (chat.exitCode !== 0 || chat.timedOut || chat.truncated) throw new Error("HERMES_EXECUTION_FAILED");
    report(onProgress, "evidence", "VERIFYING", `Hermes çalıştırması tamamlandı · ${chat.durationMs} ms · çıkış ${chat.exitCode}.`, "Hermes / NVIDIA NIM", modelOverride);

    const sessionId = findSessionId(chat.stdout, chat.stderr);
    if (!sessionId) throw new Error("HERMES_SESSION_ID_MISSING");

    report(onProgress, "command", "VERIFYING", "Sağlayıcı oturumu redakte edilmiş JSONL olarak dışa aktarılıyor.", "Hermes / NVIDIA NIM", modelOverride);
    const exported = await this.#runner.run({
      executable,
      args: ["sessions", "export", "-", "--format", "jsonl", "--session-id", sessionId, "--yes", "--redact"],
      cwd,
      ...(hermesHome ? { environment: { HERMES_HOME: hermesHome } } : {}),
      timeoutMs: 30_000,
      maxOutputBytes: 8 * 1024 * 1024,
      cancellation
    });
    if (exported.exitCode !== 0 || exported.timedOut || exported.truncated) throw new Error("HERMES_EXPORT_FAILED");
    report(onProgress, "evidence", "VERIFYING", `Redakte edilmiş oturum çıktısı doğrulandı · ${exported.durationMs} ms.`, "Hermes / NVIDIA NIM", modelOverride);

    const content = parseExportedAnswer(exported.stdout);
    if (!content) throw new Error("HERMES_RESPONSE_PARSE_FAILED");
    report(onProgress, "evidence", "REVIEWING", `Yanıt ayrıştırıldı · oturum ${sessionId.slice(0, 12)}…`, "Hermes / NVIDIA NIM", modelOverride);

    const parsedOutcome = parseEvolutionProviderOutcome(content);
    return {
      content,
      provider: PROVIDER,
      model: modelOverride,
      sessionId,
      durationMs: Math.max(0, Math.round(performance.now() - started)),
      evidence: [chat.runId, exported.runId],
      outcome: parsedOutcome.outcome,
      blockReason: parsedOutcome.blockReason,
      acceptance: parsedOutcome.acceptance
    };
  }

  async #resolveCodexMutationMode(
    executable: string,
    versionText: string,
    cwd: string,
    model: string,
    effort: EvolutionRouting["reasoningEffort"],
    environment: Record<string, string>,
    onProgress?: AgentProgressListener,
    cancellation?: AbortSignal
  ): Promise<CodexMutationMode> {
    const cacheKey = `${executable}|${versionText.trim().slice(0, 120)}|${path.resolve(cwd)}`;
    const cached = this.#codexMutationMode.get(cacheKey);
    if (cached) return cached;

    report(onProgress, "provider", "PROVIDER_CHECK", "Codex workspace-write gerçek dosya probu çalıştırılıyor; yalnız başarı metnine güvenilmeyecek.", CODEX_PROVIDER, model);
    const probeRoot = await mkdtemp(path.join(tmpdir(), "devbox-codex-write-probe-"));
    const fileName = `probe-${randomUUID()}.txt`;
    const token = `DEVBOX_REAL_WRITE_${randomUUID()}`;
    const target = path.join(probeRoot, fileName);
    try {
      const probe = await this.#runner.run({
        executable,
        args: [
          "--ask-for-approval", "never",
          "--config", `model_reasoning_effort=\"${effort}\"`,
          "exec", "--ephemeral", "--sandbox", "workspace-write", "--skip-git-repo-check", "--json",
          "--ignore-user-config", "--ignore-rules", "--disable", "plugins", "--model", model, "--cd", probeRoot,
          `Create exactly one UTF-8 file named ${fileName} with exact content ${token}. Do not modify anything else. Then report completion.`
        ],
        cwd: probeRoot,
        ...(Object.keys(environment).length ? { environment } : {}),
        ...(cancellation ? { cancellation } : {}),
        timeoutMs: 90_000,
        maxOutputBytes: 4 * 1024 * 1024
      });
      if (cancellation?.aborted || probe.exitReason === "CANCELLED") throw new Error("EVOLUTION_CANCELLED");
      let verified = false;
      if (probe.exitCode === 0 && !probe.timedOut && !probe.truncated && existsSync(target)) {
        const content = await readFile(target, "utf8").catch(() => "");
        verified = content.trim() === token;
      }
      const mode: CodexMutationMode = verified ? "workspace-write" : "safe-patch";
      this.#codexMutationMode.set(cacheKey, mode);
      if (verified) report(onProgress, "evidence", "PROVIDER_CHECK", "Codex workspace-write host dosya probu PASS; doğrudan mutasyon kullanılacak.", CODEX_PROVIDER, model);
      else report(onProgress, "waiting", "PROVIDER_CHECK", "Codex workspace-write host dosya probu başarısız; uydurma başarı kabul edilmedi. DevBox read-only Codex + doğrulanmış git patch motoruna geçti.", CODEX_PROVIDER, model);
      return mode;
    } finally {
      await rm(probeRoot, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  async #respondWithCodex(
    prompt: string,
    cwd: string,
    model: string,
    effort: EvolutionRouting["reasoningEffort"],
    onProgress?: AgentProgressListener,
    cancellation?: AbortSignal
  ): Promise<AgentResponse> {
    const executable = resolveCodexExecutable();
    if (!executable) throw new Error("CODEX_EXECUTABLE_UNAVAILABLE");

    const environment: Record<string, string> = {};
    if (process.env.CODEX_HOME) environment.CODEX_HOME = process.env.CODEX_HOME;
    report(onProgress, "provider", "PROVIDER_CHECK", "Codex CLI sürümü ve binary kimliği doğrulanıyor.", CODEX_PROVIDER, model);
    const version = await this.#runner.run({
      executable,
      args: ["--version"],
      cwd,
      ...(Object.keys(environment).length ? { environment } : {}),
      ...(cancellation ? { cancellation } : {}),
      timeoutMs: 10_000,
      maxOutputBytes: 64 * 1024
    });
    if (cancellation?.aborted || version.exitReason === "CANCELLED") throw new Error("EVOLUTION_CANCELLED");
    if (version.exitCode !== 0 || version.timedOut || version.truncated) throw new Error("CODEX_VERSION_PROBE_FAILED");
    const versionText = `${version.stdout} ${version.stderr}`;
    const parsedVersion = parseSemver(versionText);
    // Model compatibility is proved by the actual selected-model invocation below. Do not invent a CLI-version threshold.
    report(onProgress, "evidence", "PROVIDER_CHECK", `Codex CLI sürümü doğrulandı: ${parsedVersion?.join(".") ?? version.stdout.trim().slice(0, 80)} · model desteği canlı çağrıda doğrulanacak.`, CODEX_PROVIDER, model);
    report(onProgress, "provider", "AUTH_CHECK", "Codex CLI oturum durumu doğrulanıyor.", CODEX_PROVIDER, model);
    const status = await this.#runner.run({
      executable,
      args: ["login", "status"],
      cwd,
      ...(Object.keys(environment).length ? { environment } : {}),
      ...(cancellation ? { cancellation } : {}),
      timeoutMs: 15_000,
      maxOutputBytes: 128 * 1024
    });
    if (cancellation?.aborted || status.exitReason === "CANCELLED") throw new Error("EVOLUTION_CANCELLED");
    if (status.exitCode !== 0 || status.timedOut || status.truncated || !/logged in/iu.test(`${status.stdout}\n${status.stderr}`)) {
      throw new Error("CODEX_AUTH_UNAVAILABLE");
    }
    report(onProgress, "evidence", "AUTH_CHECK", "Codex CLI oturumu doğrulandı.", CODEX_PROVIDER, model);

    const mutationMode = await this.#resolveCodexMutationMode(executable, versionText, cwd, model, effort, environment, onProgress, cancellation);
    const started = performance.now();
    const effectivePrompt = mutationMode === "workspace-write"
      ? prompt
      : [
          prompt,
          "DEVBOX GÜVENLİ PATCH MODU:",
          "Native Codex workspace-write bu Windows çalışma zamanında canlı dosya probunu geçmedi. Dosyalara doğrudan yazmayı deneme.",
          "İstenen gerçek değişikliği git-compatible unified patch olarak üret. Patch dışında değişiklik yapma.",
          "Yanıt içinde patch tam olarak DEVBOX_PATCH_START ve DEVBOX_PATCH_END işaretleri arasında olmalı. DEVBOX_RESULT_JSON satırı patch işaretinden SONRA en son satırda kalmalı.",
          "PASS diyorsan patch en az bir gerçek kaynak dosyası değiştirmeli. DevBox patch'i git apply --check sonrası kendi güvenli mutasyon katmanıyla kalıcı uygular."
        ].join("\n\n");
    report(onProgress, "provider", "MODEL_ATTEMPT", mutationMode === "workspace-write"
      ? `Codex ${model} · ${effort} başlatılıyor; workspace-write canlı probu geçti.`
      : `Codex ${model} · ${effort} güvenli patch modunda başlatılıyor; DevBox gerçek patch'i kendisi uygulayacak.`, CODEX_PROVIDER, model);
    const execution = await this.#runner.run({
      executable,
      args: [
        "--ask-for-approval", "never",
        "--config", `model_reasoning_effort=\"${effort}\"`,
        "exec",
        "--ephemeral",
        "--sandbox", mutationMode === "workspace-write" ? "workspace-write" : "read-only",
        "--skip-git-repo-check",
        "--json",
        "--ignore-user-config",
        "--ignore-rules",
        "--disable", "plugins",
        "--model", model,
        "--cd", cwd,
        effectivePrompt
      ],
      cwd,
      ...(Object.keys(environment).length ? { environment } : {}),
      ...(cancellation ? { cancellation } : {}),
      timeoutMs: 30 * 60_000,
      maxOutputBytes: 16 * 1024 * 1024,
      onStdoutLine: (line) => codexProgressFromLine(line, onProgress, model),
      onStderrLine: (line) => {
        if (/waiting|retry|rate limit|429/iu.test(line)) report(onProgress, "waiting", "WAITING", line.slice(0, 700), CODEX_PROVIDER, model);
      }
    });
    if (cancellation?.aborted || execution.exitReason === "CANCELLED") throw new Error("EVOLUTION_CANCELLED");
    if (execution.exitCode !== 0 || execution.timedOut || execution.truncated) {
      const detail = execution.stderr.trim().slice(0, 600);
      throw new Error(`CODEX_EXECUTION_FAILED${detail ? `:${detail}` : ""}`);
    }

    const parsed = parseCodexAnswer(execution.stdout);
    if (!parsed) throw new Error("CODEX_RESPONSE_PARSE_FAILED");
    const parsedOutcome = parseEvolutionProviderOutcome(parsed.content);
    const patchEvidence: string[] = [];
    if (mutationMode === "safe-patch" && parsedOutcome.outcome === "PASS") {
      const patch = extractDevBoxPatch(parsed.content);
      if (!patch) throw new Error("CODEX_SAFE_PATCH_MISSING");
      const touchedPaths = validateDevBoxPatch(patch, cwd);
      report(onProgress, "evidence", "VERIFYING", `Güvenli patch doğrulanıyor · ${touchedPaths.length} yol.`, CODEX_PROVIDER, model);
      const check = await this.#runner.run({ executable: "git", args: ["apply", "--check", "--recount", "-"], cwd, stdinText: patch, cancellation, timeoutMs: 60_000, maxOutputBytes: 4 * 1024 * 1024 });
      patchEvidence.push(check.runId);
      if (check.exitCode !== 0 || check.timedOut || check.truncated) throw new Error(`CODEX_SAFE_PATCH_CHECK_FAILED:${check.stderr.slice(0, 500)}`);
      report(onProgress, "command", "EDITING", `DevBox güvenli patch motoru ${touchedPaths.length} yolu gerçek çalışma alanına uyguluyor.`, CODEX_PROVIDER, model);
      const apply = await this.#runner.run({ executable: "git", args: ["apply", "--recount", "--whitespace=nowarn", "-"], cwd, stdinText: patch, cancellation, timeoutMs: 60_000, maxOutputBytes: 4 * 1024 * 1024 });
      patchEvidence.push(apply.runId);
      if (apply.exitCode !== 0 || apply.timedOut || apply.truncated) throw new Error(`CODEX_SAFE_PATCH_APPLY_FAILED:${apply.stderr.slice(0, 500)}`);
    }
    report(onProgress, "evidence", "VERIFYING", `Codex tamamlandı · ${execution.durationMs} ms · çıkış ${execution.exitCode}.`, CODEX_PROVIDER, model);
    report(onProgress, "evidence", "REVIEWING", `Codex transcript gate · ${parsed.commandCount} komut · ${parsed.fileChangeCount} native file-change event · turn.completed doğrulandı · mutation=${mutationMode}.`, CODEX_PROVIDER, model);
    return {
      content: parsed.content,
      provider: CODEX_PROVIDER,
      model,
      sessionId: parsed.sessionId,
      durationMs: Math.max(0, Math.round(performance.now() - started)),
      evidence: [version.runId, status.runId, execution.runId, ...patchEvidence],
      outcome: parsedOutcome.outcome,
      blockReason: parsedOutcome.blockReason,
      acceptance: parsedOutcome.acceptance
    };
  }
}

