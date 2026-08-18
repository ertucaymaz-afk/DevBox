import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";

let source = await readFile("scripts/apply-v014-core9.mjs", "utf8");

function replaceOnce(before, after, label) {
  const first = source.indexOf(before);
  const last = source.lastIndexOf(before);
  if (first < 0 || first !== last) throw new Error(`V014_CORE14_WRAPPER_ANCHOR_INVALID:${label}`);
  source = source.slice(0, first) + after + source.slice(first + before.length);
}

for (const [before, after, label] of [
  ['let database = await readFile(databasePath, "utf8");', 'let database = (await readFile(databasePath, "utf8")).replace(/\\r\\n?/gu, "\\n");', "database-normalize"],
  ['let agent = await readFile(agentPath, "utf8");', 'let agent = (await readFile(agentPath, "utf8")).replace(/\\r\\n?/gu, "\\n");', "agent-normalize"],
  ['let main = await readFile(mainPath, "utf8");', 'let main = (await readFile(mainPath, "utf8")).replace(/\\r\\n?/gu, "\\n");', "main-normalize"],
  ['let ipc = await readFile(ipcPath, "utf8");', 'let ipc = (await readFile(ipcPath, "utf8")).replace(/\\r\\n?/gu, "\\n");', "ipc-normalize"],
  ['let api = await readFile(coreApiPath, "utf8");', 'let api = (await readFile(coreApiPath, "utf8")).replace(/\\r\\n?/gu, "\\n");', "api-normalize"]
]) replaceOnce(before, after, label);

const oldMigrationLine = 'database = replaceExact(database, dbBefore, dbAfter, "database-schema7");';
const structuralMigration = `{
  const migrationStart = database.indexOf("  #migrate(): void {");
  const integrityStart = database.indexOf("\\n  public integrityCheck():", migrationStart);
  if (migrationStart < 0 || integrityStart < 0 || integrityStart <= migrationStart) throw new Error("V014_CORE14_DATABASE_SCOPE_INVALID");
  let migration = database.slice(migrationStart, integrityStart);
  const guard = "    if (version !== CURRENT_SCHEMA_VERSION) {";
  const guardAt = migration.lastIndexOf(guard);
  if (guardAt < 0 || migration.indexOf(guard) !== guardAt) throw new Error("V014_CORE14_DATABASE_FINAL_GUARD_INVALID");
  const v7Block = \`    if (version < 7) {\\n      this.#database.exec(\"BEGIN IMMEDIATE;\");\\n      try {\\n        this.#database.exec(\\\`\\n          CREATE TABLE memory_entries (\\n            id TEXT PRIMARY KEY,\\n            project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,\\n            thread_id TEXT REFERENCES threads(id) ON DELETE CASCADE,\\n            scope_key TEXT NOT NULL,\\n            kind TEXT NOT NULL CHECK (kind IN ('constraint', 'preference', 'decision', 'context')),\\n            content TEXT NOT NULL,\\n            normalized TEXT NOT NULL,\\n            importance REAL NOT NULL CHECK (importance >= 0 AND importance <= 1),\\n            use_count INTEGER NOT NULL DEFAULT 0 CHECK (use_count >= 0),\\n            created_at TEXT NOT NULL,\\n            updated_at TEXT NOT NULL,\\n            last_used_at TEXT NOT NULL,\\n            UNIQUE(scope_key, normalized)\\n          );\\n          CREATE INDEX idx_memory_project_importance ON memory_entries(project_id, importance DESC, last_used_at DESC);\\n          CREATE INDEX idx_memory_thread_updated ON memory_entries(thread_id, updated_at DESC);\\n          UPDATE schema_meta SET version = 7;\\n        \\\`);\\n        this.#database.exec(\"COMMIT;\");\\n        version = 7;\\n      } catch (error) {\\n        this.#database.exec(\"ROLLBACK;\");\\n        throw error;\\n      }\\n    }\\n\\n\`;
  const finalTail = \`    if (version !== CURRENT_SCHEMA_VERSION) {\\n      throw new Error(\\\`Unsupported state schema version: \\\${version}\\\`);\\n    }\\n    this.#ensureMemoryFts();\\n  }\\n\`;
  migration = migration.slice(0, guardAt) + v7Block + finalTail;
  database = database.slice(0, migrationStart) + migration + database.slice(integrityStart);
  const ftsMethod = \`\\n  #ensureMemoryFts(): void {\\n    try {\\n      this.#database.exec(\\\`\\n        CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(id UNINDEXED, content, normalized, tokenize='unicode61 remove_diacritics 2');\\n        CREATE TRIGGER IF NOT EXISTS memory_ai AFTER INSERT ON memory_entries BEGIN\\n          INSERT INTO memory_fts(rowid, id, content, normalized) VALUES (new.rowid, new.id, new.content, new.normalized);\\n        END;\\n        CREATE TRIGGER IF NOT EXISTS memory_ad AFTER DELETE ON memory_entries BEGIN\\n          DELETE FROM memory_fts WHERE rowid = old.rowid;\\n        END;\\n        CREATE TRIGGER IF NOT EXISTS memory_au AFTER UPDATE OF content, normalized ON memory_entries BEGIN\\n          DELETE FROM memory_fts WHERE rowid = old.rowid;\\n          INSERT INTO memory_fts(rowid, id, content, normalized) VALUES (new.rowid, new.id, new.content, new.normalized);\\n        END;\\n        INSERT OR REPLACE INTO memory_fts(rowid, id, content, normalized) SELECT rowid, id, content, normalized FROM memory_entries;\\n      \\\`);\\n    } catch {\\n      // FTS5 yalnız hızlandırma katmanıdır; sıralı recent-memory fallback çalışmaya devam eder.\\n    }\\n  }\\n\`;
  const newIntegrityStart = database.indexOf("\\n  public integrityCheck():", migrationStart);
  if (newIntegrityStart < 0 || database.includes("#ensureMemoryFts(): void")) throw new Error("V014_CORE14_FTS_INSERTION_INVALID");
  database = database.slice(0, newIntegrityStart) + ftsMethod + database.slice(newIntegrityStart);
}`;
replaceOnce(oldMigrationLine, structuralMigration, "database-structural-migration");

const temporary = path.resolve("scripts/.apply-v014-core14-runtime.mjs");
await writeFile(temporary, source, "utf8");
await import(`${pathToFileURL(temporary).href}?run=${Date.now()}`);
