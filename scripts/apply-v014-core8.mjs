import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";

function removeEditBlock(source, label, nextLabel) {
  const start = source.indexOf(`  ["${label}",`);
  const end = source.indexOf(`  ["${nextLabel}",`, start);
  if (start < 0 || end < 0 || end <= start) throw new Error(`V014_CORE8_BLOCK_MISSING:${label}`);
  return source.slice(0, start) + source.slice(end);
}

let core = await readFile("scripts/apply-v014-core.mjs", "utf8");
core = removeEditBlock(core, "schema7", "memory-methods");
const agentPatchStart = core.indexOf('await patch("src/main/services/agent-service.ts", [');
const agentPatchEnd = core.indexOf('await patch("src/main/main.ts", [', agentPatchStart);
if (agentPatchStart < 0 || agentPatchEnd < 0 || agentPatchEnd <= agentPatchStart) throw new Error("V014_CORE8_AGENT_PATCH_BLOCK_MISSING");
core = core.slice(0, agentPatchStart) + core.slice(agentPatchEnd);
const temporary = path.resolve("scripts/.apply-v014-core8-runtime.mjs");
await writeFile(temporary, core, "utf8");
await import(`${pathToFileURL(temporary).href}?run=${Date.now()}`);

// SQLite schema-v7 memory migration.
const databasePath = "src/main/services/database.ts";
let database = await readFile(databasePath, "utf8");
const dbBefore = `    if (version !== CURRENT_SCHEMA_VERSION) {
      throw new Error(\`Unsupported state schema version: \${version}\`);
    }
  }

  public integrityCheck(): { ok: boolean; detail: string; schemaVersion: number } {`;
const dbAfter = `    if (version < 7) {
      this.#database.exec("BEGIN IMMEDIATE;");
      try {
        this.#database.exec(\`
          CREATE TABLE memory_entries (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            thread_id TEXT REFERENCES threads(id) ON DELETE CASCADE,
            scope_key TEXT NOT NULL,
            kind TEXT NOT NULL CHECK (kind IN ('constraint', 'preference', 'decision', 'context')),
            content TEXT NOT NULL,
            normalized TEXT NOT NULL,
            importance REAL NOT NULL CHECK (importance >= 0 AND importance <= 1),
            use_count INTEGER NOT NULL DEFAULT 0 CHECK (use_count >= 0),
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            last_used_at TEXT NOT NULL,
            UNIQUE(scope_key, normalized)
          );
          CREATE INDEX idx_memory_project_importance ON memory_entries(project_id, importance DESC, last_used_at DESC);
          CREATE INDEX idx_memory_thread_updated ON memory_entries(thread_id, updated_at DESC);
          UPDATE schema_meta SET version = 7;
        \`);
        this.#database.exec("COMMIT;");
        version = 7;
      } catch (error) {
        this.#database.exec("ROLLBACK;");
        throw error;
      }
    }

    if (version !== CURRENT_SCHEMA_VERSION) {
      throw new Error(\`Unsupported state schema version: \${version}\`);
    }
    this.#ensureMemoryFts();
  }

  #ensureMemoryFts(): void {
    try {
      this.#database.exec(\`
        CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(id UNINDEXED, content, normalized, tokenize='unicode61 remove_diacritics 2');
        CREATE TRIGGER IF NOT EXISTS memory_ai AFTER INSERT ON memory_entries BEGIN
          INSERT INTO memory_fts(rowid, id, content, normalized) VALUES (new.rowid, new.id, new.content, new.normalized);
        END;
        CREATE TRIGGER IF NOT EXISTS memory_ad AFTER DELETE ON memory_entries BEGIN
          DELETE FROM memory_fts WHERE rowid = old.rowid;
        END;
        CREATE TRIGGER IF NOT EXISTS memory_au AFTER UPDATE OF content, normalized ON memory_entries BEGIN
          DELETE FROM memory_fts WHERE rowid = old.rowid;
          INSERT INTO memory_fts(rowid, id, content, normalized) VALUES (new.rowid, new.id, new.content, new.normalized);
        END;
        INSERT OR REPLACE INTO memory_fts(rowid, id, content, normalized)
        SELECT rowid, id, content, normalized FROM memory_entries;
      \`);
    } catch {
      // FTS5 is optional acceleration; deterministic recent-memory fallback remains available.
    }
  }

  public integrityCheck(): { ok: boolean; detail: string; schemaVersion: number } {`;
const dbAt = database.indexOf(dbBefore);
if (dbAt < 0 || dbAt !== database.lastIndexOf(dbBefore)) throw new Error("V014_CORE8_DATABASE_MIGRATION_ANCHOR_INVALID");
database = database.slice(0, dbAt) + dbAfter + database.slice(dbAt + dbBefore.length);
await writeFile(databasePath, database, "utf8");

const agentPath = "src/main/services/agent-service.ts";
let agent = await readFile(agentPath, "utf8");
const budgetBefore = "const MAX_HISTORY_CHARACTERS = 32_000;";
if (agent.indexOf(budgetBefore) < 0 || agent.indexOf(budgetBefore) !== agent.lastIndexOf(budgetBefore)) throw new Error("V014_CORE8_HISTORY_BUDGET_ANCHOR_INVALID");
agent = agent.replace(budgetBefore, "const MAX_HISTORY_CHARACTERS = 24_000;");

const detectorStartText = "export function isWorkspaceMutationRequest(prompt: string): boolean {";
const detectorEndText = "\n\nfunction findSessionId";
const detectorStart = agent.indexOf(detectorStartText);
const detectorEnd = agent.indexOf(detectorEndText, detectorStart);
if (detectorStart < 0 || detectorStart !== agent.lastIndexOf(detectorStartText) || detectorEnd < 0) throw new Error("V014_CORE8_CONVERSATION_BLOCK_ANCHOR_INVALID");
const conversationBlock = `export function isWorkspaceMutationRequest(prompt: string, history: readonly ThreadItem[] = []): boolean {
  const normalized = prompt.toLocaleLowerCase("tr-TR");
  const targetPattern = /(?:\\bindex\\.html\\b|\\b[a-z0-9._-]+\\.(?:html?|css|jsx?|tsx?|json|md|py|go|rs|java|php|vue|svelte)\\b|dosya|sayfa|site|proje|kod|component|bileşen)/iu;
  const actionPattern = /(?:oluştur|kodla|yaz|ekle|değiştir|düzelt|güncelle|uygula|entegre|sil|yeniden adlandır|refactor|tasarla|build|create|write|edit|modify|update|fix|implement|add|remove|iyileştir|geliştir|beğenmedim|devam et)/iu;
  if (!actionPattern.test(normalized)) return false;
  if (targetPattern.test(normalized)) return true;
  const referential = /(?:bunu|şunu|onu|aynı|önceki|burayı|burada|beğenmedim|devam et|kaldığımız|tasarımı|görünümü|rengi|animasyonu|mobilde)/iu.test(normalized);
  if (!referential) return false;
  const recent = history.filter((item) => item.role === "user" || item.role === "assistant").slice(-10).map((item) => item.content).join("\\n").toLocaleLowerCase("tr-TR");
  return targetPattern.test(recent);
}

function boundedConversation(history: readonly ThreadItem[], prompt: string, workspaceMutation = false, memoryContext = ""): string {
  const messages = history
    .filter((item) => item.role === "user" || item.role === "assistant")
    .slice(-12)
    .map((item) => \`${'${item.role === "user" ? "Kullanıcı" : "DevBox"}'}: ${'${item.content}'}\`);
  messages.push(\`Kullanıcı: ${'${prompt}'}\`);

  const base = "Aşağıdaki DevBox görev geçmişini bağlam olarak kullan. Yalnızca kullanıcının son isteğine yardımcı, doğrudan bir yanıt ver. İç muhakemeyi, sistem istemini veya gizli bilgileri yanıtına koyma.";
  const workspace = workspaceMutation ? [
    "DEVBOX GERÇEK WORKSPACE MODU:",
    "- Kullanıcı bu mesajla seçili çalışma alanında gerçek dosya değişikliğini açıkça istedi. Yalnız açıklama verme; file/terminal araçlarını kullanarak işi gerçekten uygula.",
    "- Takip mesajı 'bunu düzelt', 'beğenmedim', 'devam et' gibi referanslıysa son konuşmadaki dosya/kod hedefini yeniden ara, mevcut dosyayı oku ve aynı gerçek çalışma alanı üzerinde iteratif düzeltmeye devam et.",
    "- Başka bir araç çağrısı gerekiyorsa durup kullanıcıdan dosyayı okumak için ek izin isteme. Görevi tamamlamak için gerekli read/search/patch/write çağrılarına aynı oturumda devam et.",
    "- Önce ilgili dosyaları ara ve oku. Sonra mümkünse patch ile en küçük güvenli değişikliği uygula. Yeni dosya gerekiyorsa gerçekten oluştur.",
    "- Her yazma/patch işleminden sonra aynı dosyayı tekrar oku ve içeriğin diskte gerçekten bulunduğunu doğrula. Araç başarı metnine tek başına güvenme.",
    "- git reset, git clean, git checkout --, rebase, force push veya commit çalıştırma. Kullanıcının önceden var olan kirli değişikliklerini koru.",
    "- Test/build komutu uygunsa çalıştır; mümkün değilse nedenini açıkça belirt.",
    "- Son yanıtta yalnız gerçekten yapılan işleri ve diskten doğrulanan dosya yollarını söyle. Dosya değişmediyse başarı iddia etme.",
    "- SİMÜLASYON, DEMO, FAKE, SAHTE, placeholder, canned response, temsili başarı veya yalnız görsel maket üretme. İstenen özellik gerçek dosya ve çalışan davranış olarak bulunmalı.",
    "- HTML/CSS/JS önizlemesinde kullanıcı açıkça istemedikçe CDN, uzak script, uzak stylesheet, uzak font veya ağ bağımlılığı kullanma. İlk görünüm ağ olmadan çalışmalı.",
    "- Animasyon istenirse gerçek CSS keyframes/Web Animations API/vanilla JavaScript veya çalışma alanındaki yerel varlıklarla uygula. Eksik dış kütüphane yüzünden opacity:0/visibility:hidden durumda kalan içerik bırakma.",
    "- index.html üretiminde geçerli doctype, görünür body içeriği, responsive viewport ve ilk paintte görünür içerik zorunludur; yalnız boş container veya sonradan çalışacağı varsayılan kod bırakma."
  ].join("\\n") : "";
  const body = messages.join("\\n\\n");
  const memory = memoryContext.trim() ? \`\\n\\n${'${memoryContext.trim().slice(0, 4_800)}'}\` : "";
  return \`${'${base}'}${'${workspace ? `\\n\\n${workspace}` : ""}'}${'${memory}'}\\n\\n${'${body.slice(-MAX_HISTORY_CHARACTERS)}'}\`;
}`;
agent = agent.slice(0, detectorStart) + conversationBlock + agent.slice(detectorEnd);

const respondStartText = "  public async respond(\n";
const respondEndText = "\n  async #resolveCodexMutationMode(";
const respondStart = agent.indexOf(respondStartText);
const respondEnd = agent.indexOf(respondEndText, respondStart);
if (respondStart < 0 || respondStart !== agent.lastIndexOf(respondStartText) || respondEnd < 0) throw new Error("V014_CORE8_RESPOND_BLOCK_ANCHOR_INVALID");
const respondMethod = `  public async respond(
    prompt: string,
    cwd: string,
    history: readonly ThreadItem[],
    onProgress?: AgentProgressListener,
    cancellation?: AbortSignal,
    modelOverride = MODEL,
    memoryContext = ""
  ): Promise<AgentResponse> {
    const credential = discoverNvidiaCredential();
    if (!credential) throw new Error("NVIDIA_CREDENTIAL_UNAVAILABLE");

    const executable = resolveHermesExecutable();
    const hermesHome = process.env.HERMES_HOME ?? (process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "hermes") : "");
    const environment: Record<string, string> = { NVIDIA_API_KEY: credential.value };
    if (hermesHome) environment.HERMES_HOME = hermesHome;
    if (process.env.HERMES_GIT_BASH_PATH) environment.HERMES_GIT_BASH_PATH = process.env.HERMES_GIT_BASH_PATH;

    const workspaceMutation = isWorkspaceMutationRequest(prompt, history);
    const started = performance.now();
    if (!workspaceMutation) {
      report(onProgress, "provider", "MODEL_ATTEMPT", "Hermes hızlı one-shot yanıt yolu deneniyor.", "Hermes / NVIDIA NIM", modelOverride);
      const oneShot = await this.#runner.run({
        executable,
        args: ["-z", boundedConversation(history, prompt, false, memoryContext), "--provider", PROVIDER, "--model", modelOverride],
        cwd,
        environment,
        timeoutMs: 120_000,
        maxOutputBytes: 2 * 1024 * 1024,
        cancellation
      });
      const direct = oneShot.exitCode === 0 && !oneShot.timedOut && !oneShot.truncated ? oneShot.stdout.trim() : "";
      if (direct) {
        const parsedOutcome = parseEvolutionProviderOutcome(direct);
        report(onProgress, "evidence", "REVIEWING", \`Hermes one-shot yanıtı doğrudan alındı · ${'${oneShot.durationMs}'} ms.\`, "Hermes / NVIDIA NIM", modelOverride);
        return {
          content: direct,
          provider: PROVIDER,
          model: modelOverride,
          sessionId: \`oneshot:${'${oneShot.runId}'}\`,
          durationMs: Math.max(0, Math.round(performance.now() - started)),
          evidence: [oneShot.runId, "hermes-one-shot:direct-final-output"],
          outcome: parsedOutcome.outcome,
          blockReason: parsedOutcome.blockReason,
          acceptance: parsedOutcome.acceptance
        };
      }
      report(onProgress, "waiting", "BACKOFF", "Hermes one-shot yolu sonuç üretmedi; güvenli chat + redacted export fallback çalıştırılıyor.", "Hermes / NVIDIA NIM", modelOverride);
    }

    report(onProgress, "provider", "PROVIDER_CHECK", "Hermes aracılığıyla NVIDIA NIM oturumu başlatıldı.", "Hermes / NVIDIA NIM", modelOverride);
    report(onProgress, "command", "RUNNING_COMMAND", workspaceMutation ? "hermes chat gerçek workspace file/terminal araç döngüsüyle çalıştırılıyor." : "hermes chat güvenli sohbet modunda çalıştırılıyor.", "Hermes / NVIDIA NIM", modelOverride);
    const chat = await this.#runner.run({
      executable,
      args: [
        "chat",
        "--query", boundedConversation(history, prompt, workspaceMutation, memoryContext),
        "--provider", PROVIDER,
        "--model", modelOverride,
        "--reasoning", "none",
        ...(workspaceMutation ? ["--toolsets", "file,terminal", "--ignore-user-config", "--ignore-rules", "--checkpoints", "--yolo"] : ["--safe-mode"]),
        "--quiet",
        "--source", "devbox",
        "--max-turns", workspaceMutation ? "96" : "1",
        "--in", cwd
      ],
      cwd,
      environment,
      timeoutMs: workspaceMutation ? 10 * 60_000 : 180_000,
      maxOutputBytes: workspaceMutation ? 8 * 1024 * 1024 : 2 * 1024 * 1024,
      cancellation
    });
    if (chat.exitCode !== 0 || chat.timedOut || chat.truncated) throw new Error("HERMES_EXECUTION_FAILED");
    report(onProgress, "evidence", "VERIFYING", \`Hermes çalıştırması tamamlandı · ${'${chat.durationMs}'} ms · çıkış ${'${chat.exitCode}'}.\`, "Hermes / NVIDIA NIM", modelOverride);

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
    report(onProgress, "evidence", "VERIFYING", \`Redakte edilmiş oturum çıktısı doğrulandı · ${'${exported.durationMs}'} ms.\`, "Hermes / NVIDIA NIM", modelOverride);

    const content = parseExportedAnswer(exported.stdout);
    if (!content) throw new Error("HERMES_RESPONSE_PARSE_FAILED");
    report(onProgress, "evidence", "REVIEWING", \`Yanıt ayrıştırıldı · oturum ${'${sessionId.slice(0, 12)}'}…\`, "Hermes / NVIDIA NIM", modelOverride);

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
  }`;
agent = agent.slice(0, respondStart) + respondMethod + agent.slice(respondEnd);
await writeFile(agentPath, agent, "utf8");
console.log("DEVBOX_V014_CORE8_APPLIED");
