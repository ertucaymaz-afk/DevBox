import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";

let core = await readFile("scripts/apply-v014-core.mjs", "utf8");
const schemaStart = core.indexOf('  ["schema7", `');
const schemaEnd = core.indexOf('  ["memory-methods",', schemaStart);
if (schemaStart < 0 || schemaEnd < 0 || schemaEnd <= schemaStart) throw new Error("V014_CORE6_SCHEMA_PATCH_BLOCK_MISSING");
core = core.slice(0, schemaStart) + core.slice(schemaEnd);
const temporary = path.resolve("scripts/.apply-v014-core6-runtime.mjs");
await writeFile(temporary, core, "utf8");
await import(`${pathToFileURL(temporary).href}?run=${Date.now()}`);

const databasePath = "src/main/services/database.ts";
let database = await readFile(databasePath, "utf8");
const before = `    if (version !== CURRENT_SCHEMA_VERSION) {
      throw new Error(\`Unsupported state schema version: \${version}\`);
    }
  }

  public integrityCheck(): { ok: boolean; detail: string; schemaVersion: number } {`;
const after = `    if (version < 7) {
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
      // FTS5 is an acceleration layer. Deterministic recent-memory fallback remains available.
    }
  }

  public integrityCheck(): { ok: boolean; detail: string; schemaVersion: number } {`;
const first = database.indexOf(before);
if (first < 0 || first !== database.lastIndexOf(before)) throw new Error("V014_CORE6_DATABASE_MIGRATION_ANCHOR_INVALID");
database = database.slice(0, first) + after + database.slice(first + before.length);
await writeFile(databasePath, database, "utf8");
console.log("DEVBOX_V014_CORE6_APPLIED");
