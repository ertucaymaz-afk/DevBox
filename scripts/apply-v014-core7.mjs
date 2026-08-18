import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";

function removeEditBlock(source, label, nextLabel) {
  const start = source.indexOf(`  ["${label}",`);
  const end = source.indexOf(`  ["${nextLabel}",`, start);
  if (start < 0 || end < 0 || end <= start) throw new Error(`V014_CORE7_BLOCK_MISSING:${label}`);
  return source.slice(0, start) + source.slice(end);
}

let core = await readFile("scripts/apply-v014-core.mjs", "utf8");
core = removeEditBlock(core, "schema7", "memory-methods");
core = removeEditBlock(core, "workspace-followup", "bounded-memory");
const temporary = path.resolve("scripts/.apply-v014-core7-runtime.mjs");
await writeFile(temporary, core, "utf8");
await import(`${pathToFileURL(temporary).href}?run=${Date.now()}`);

// Exact standalone SQLite schema-v7 migration.
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
if (dbAt < 0 || dbAt !== database.lastIndexOf(dbBefore)) throw new Error("V014_CORE7_DATABASE_MIGRATION_ANCHOR_INVALID");
database = database.slice(0, dbAt) + dbAfter + database.slice(dbAt + dbBefore.length);
await writeFile(databasePath, database, "utf8");

// Exact structural replacement of the detector avoids nested-regex escape ambiguity.
const agentPath = "src/main/services/agent-service.ts";
let agent = await readFile(agentPath, "utf8");
const detectorStartText = "export function isWorkspaceMutationRequest(prompt: string): boolean {";
const detectorEndText = "\n\nfunction boundedConversation";
const detectorStart = agent.indexOf(detectorStartText);
const detectorEnd = agent.indexOf(detectorEndText, detectorStart);
if (detectorStart < 0 || detectorStart !== agent.lastIndexOf(detectorStartText) || detectorEnd < 0) throw new Error("V014_CORE7_WORKSPACE_DETECTOR_ANCHOR_INVALID");
const detector = `export function isWorkspaceMutationRequest(prompt: string, history: readonly ThreadItem[] = []): boolean {
  const normalized = prompt.toLocaleLowerCase("tr-TR");
  const targetPattern = /(?:\\bindex\\.html\\b|\\b[a-z0-9._-]+\\.(?:html?|css|jsx?|tsx?|json|md|py|go|rs|java|php|vue|svelte)\\b|dosya|sayfa|site|proje|kod|component|bileşen)/iu;
  const actionPattern = /(?:oluştur|kodla|yaz|ekle|değiştir|düzelt|güncelle|uygula|entegre|sil|yeniden adlandır|refactor|tasarla|build|create|write|edit|modify|update|fix|implement|add|remove|iyileştir|geliştir|beğenmedim|devam et)/iu;
  if (!actionPattern.test(normalized)) return false;
  if (targetPattern.test(normalized)) return true;
  const referential = /(?:bunu|şunu|onu|aynı|önceki|burayı|burada|beğenmedim|devam et|kaldığımız|tasarımı|görünümü|rengi|animasyonu|mobilde)/iu.test(normalized);
  if (!referential) return false;
  const recent = history.filter((item) => item.role === "user" || item.role === "assistant").slice(-10).map((item) => item.content).join("\\n").toLocaleLowerCase("tr-TR");
  return targetPattern.test(recent);
}`;
agent = agent.slice(0, detectorStart) + detector + agent.slice(detectorEnd);
await writeFile(agentPath, agent, "utf8");
console.log("DEVBOX_V014_CORE7_APPLIED");
