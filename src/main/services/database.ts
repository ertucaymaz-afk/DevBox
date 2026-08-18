import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Attachment, Automation, ProjectSummary, ThreadDetail, ThreadItem, ThreadSummary } from "../../shared/contracts.js";

const CURRENT_SCHEMA_VERSION = 7;
const GENERIC_THREAD_TITLES = new Set(["Yeni görev", "Yeni sohbet"]);

export function deriveThreadTitle(content: string, hasAttachments = false): string {
  const cleaned = content
    .replace(/```[\s\S]*?```/gu, " Kod incelemesi ")
    .replace(/https?:\/\/\S+/giu, " ")
    .replace(/^\s{0,3}#{1,6}\s+/gmu, "")
    .replace(/[*_~`>|[\]{}()]/gu, " ")
    .replace(/^(?:[İi]ş akışını bozma üzerine ekle devam et|[Ll]ütfen|[Rr]ica etsem)\s*[:;,.-]?\s*/u, "")
    .replace(/\s+/gu, " ")
    .trim();
  const meaningful = cleaned.split(/(?<=[.!?])\s+|\s*[;\n]\s*/u).find((part) => part.trim().length >= 3)?.trim() ?? cleaned;
  if (!meaningful) return hasAttachments ? "Dosya inceleme görevi" : "Yeni sohbet";
  if (meaningful.length <= 64) return meaningful.replace(/[,:;.!?\s]+$/u, "");
  const clipped = meaningful.slice(0, 61);
  const wordBoundary = clipped.lastIndexOf(" ");
  return `${(wordBoundary >= 34 ? clipped.slice(0, wordBoundary) : clipped).trimEnd()}…`;
}

type ProjectRow = {
  id: string;
  name: string;
  root_path: string;
  is_git_repository: number;
  created_at: string;
  updated_at: string;
};

type ThreadRow = {
  id: string;
  project_id: string;
  title: string;
  state: ThreadSummary["state"];
  pinned: number;
  archived: number;
  unread: number;
  created_at: string;
  updated_at: string;
};

type ItemRow = {
  id: string;
  turn_id: string;
  sequence: number;
  payload_json: string;
  created_at: string;
};

type AttachmentRow = {
  id: string;
  thread_id: string;
  item_id: string | null;
  original_name: string;
  stored_path: string;
  extension: string;
  mime_type: string;
  kind: Attachment["kind"];
  size_bytes: number;
  sha256: string;
  can_preview: number;
  created_at: string;
};

type AutomationRow = {
  id: string;
  project_id: string;
  name: string;
  prompt: string;
  rrule: string;
  timezone: string;
  enabled: number;
  last_run_at: string | null;
  next_run_at: string | null;
  created_at: string;
  updated_at: string;
};

export type DurableJobState = "QUEUED" | "LEASED" | "RUNNING" | "CANCEL_REQUESTED" | "SUCCEEDED" | "FAILED" | "CANCELLED";
export type DurableJob = {
  id: string;
  kind: string;
  aggregateId: string | null;
  state: DurableJobState;
  attempt: number;
  payload: unknown;
  result: unknown | null;
  leaseOwner: string | null;
  leaseExpiresAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type StoredEvent = {
  sequence: number;
  type: string;
  aggregateId: string | null;
  payload: unknown;
  critical: boolean;
  createdAt: string;
};

type EventRow = {
  sequence: number;
  type: string;
  aggregate_id: string | null;
  payload_json: string;
  critical: number;
  created_at: string;
};

type DurableJobRow = {
  id: string;
  kind: string;
  aggregate_id: string | null;
  state: DurableJobState;
  attempt: number;
  payload_json: string;
  result_json: string | null;
  lease_owner: string | null;
  lease_expires_at: string | null;
  created_at: string;
  updated_at: string;
};

export type RemoteWorker = {
  id: string;
  name: string;
  capabilities: string[];
  status: "ONLINE" | "OFFLINE" | "REVOKED";
  lastSeenAt: string;
  pairedAt: string;
  revokedAt: string | null;
};

type RemoteWorkerRow = {
  id: string;
  name: string;
  token_hash: string;
  capabilities_json: string;
  last_seen_at: string;
  paired_at: string;
  revoked_at: string | null;
};

export type MemoryEntryRecord = {
  id: string;
  projectId: string;
  threadId: string | null;
  kind: "constraint" | "preference" | "decision" | "context";
  content: string;
  normalized: string;
  importance: number;
  useCount: number;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string;
};

type MemoryRow = {
  id: string;
  project_id: string;
  thread_id: string | null;
  scope_key: string;
  kind: MemoryEntryRecord["kind"];
  content: string;
  normalized: string;
  importance: number;
  use_count: number;
  created_at: string;
  updated_at: string;
  last_used_at: string;
};

export type StoredAttachment = Attachment & { storedPath: string };
export type NewAttachmentRecord = Omit<StoredAttachment, "id" | "itemId" | "createdAt">;

export class StateDatabase {
  readonly #database: DatabaseSync;

  public constructor(databasePath: string) {
    mkdirSync(path.dirname(databasePath), { recursive: true });
    this.#database = new DatabaseSync(databasePath);
    this.#database.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
    this.#migrate();
  }

  #migrate(): void {
    this.#database.exec("CREATE TABLE IF NOT EXISTS schema_meta (version INTEGER NOT NULL);");
    const row = this.#database.prepare("SELECT version FROM schema_meta LIMIT 1").get() as { version: number } | undefined;
    let version = row?.version ?? 0;
    if (!row) this.#database.prepare("INSERT INTO schema_meta(version) VALUES (0)").run();

    if (version < 1) {
      this.#database.exec("BEGIN IMMEDIATE;");
      try {
        this.#database.exec(`
          CREATE TABLE projects (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            root_path TEXT NOT NULL UNIQUE,
            is_git_repository INTEGER NOT NULL CHECK (is_git_repository IN (0, 1)),
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          );
          CREATE TABLE threads (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            title TEXT NOT NULL,
            state TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          );
          CREATE TABLE turns (
            id TEXT PRIMARY KEY,
            thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
            status TEXT NOT NULL,
            input TEXT NOT NULL,
            started_at TEXT NOT NULL,
            ended_at TEXT
          );
          CREATE TABLE items (
            id TEXT PRIMARY KEY,
            turn_id TEXT NOT NULL REFERENCES turns(id) ON DELETE CASCADE,
            sequence INTEGER NOT NULL,
            type TEXT NOT NULL,
            payload_json TEXT NOT NULL,
            created_at TEXT NOT NULL,
            UNIQUE(turn_id, sequence)
          );
          CREATE TABLE events (
            sequence INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT NOT NULL,
            aggregate_id TEXT,
            payload_json TEXT NOT NULL,
            critical INTEGER NOT NULL DEFAULT 0 CHECK (critical IN (0, 1)),
            created_at TEXT NOT NULL
          );
          CREATE TABLE idempotency (
            key TEXT PRIMARY KEY,
            request_hash TEXT NOT NULL,
            response_json TEXT,
            state TEXT NOT NULL,
            created_at TEXT NOT NULL,
            expires_at TEXT NOT NULL
          );
          CREATE TABLE settings (
            key TEXT PRIMARY KEY,
            value_json TEXT NOT NULL,
            updated_at TEXT NOT NULL
          );
          CREATE INDEX idx_threads_project_updated ON threads(project_id, updated_at DESC);
          CREATE INDEX idx_turns_thread_started ON turns(thread_id, started_at DESC);
          CREATE INDEX idx_events_type_sequence ON events(type, sequence);
          UPDATE schema_meta SET version = 1;
        `);
        this.#database.exec("COMMIT;");
        version = 1;
      } catch (error) {
        this.#database.exec("ROLLBACK;");
        throw error;
      }
    }

    if (version < 2) {
      this.#database.exec("BEGIN IMMEDIATE;");
      try {
        this.#database.exec(`
          CREATE TABLE attachments (
            id TEXT PRIMARY KEY,
            thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
            item_id TEXT REFERENCES items(id) ON DELETE CASCADE,
            original_name TEXT NOT NULL,
            stored_path TEXT NOT NULL UNIQUE,
            extension TEXT NOT NULL,
            mime_type TEXT NOT NULL,
            kind TEXT NOT NULL,
            size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
            sha256 TEXT NOT NULL,
            can_preview INTEGER NOT NULL CHECK (can_preview IN (0, 1)),
            created_at TEXT NOT NULL
          );
          CREATE INDEX idx_attachments_thread_item ON attachments(thread_id, item_id, created_at);
          UPDATE schema_meta SET version = 2;
        `);
        this.#database.exec("COMMIT;");
        version = 2;
      } catch (error) {
        this.#database.exec("ROLLBACK;");
        throw error;
      }
    }

    if (version < 3) {
      this.#database.exec("BEGIN IMMEDIATE;");
      try {
        this.#database.exec(`
          CREATE TABLE automations (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            prompt TEXT NOT NULL,
            rrule TEXT NOT NULL,
            timezone TEXT NOT NULL,
            enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
            last_run_at TEXT,
            next_run_at TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          );
          CREATE INDEX idx_automations_project_updated ON automations(project_id, updated_at DESC);
          CREATE TABLE durable_jobs (
            id TEXT PRIMARY KEY,
            kind TEXT NOT NULL,
            aggregate_id TEXT,
            state TEXT NOT NULL,
            attempt INTEGER NOT NULL DEFAULT 0,
            payload_json TEXT NOT NULL,
            result_json TEXT,
            lease_owner TEXT,
            lease_expires_at TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          );
          CREATE INDEX idx_durable_jobs_state_updated ON durable_jobs(state, updated_at);
          UPDATE schema_meta SET version = 3;
        `);
        this.#database.exec("COMMIT;");
        version = 3;
      } catch (error) {
        this.#database.exec("ROLLBACK;");
        throw error;
      }
    }

    if (version < 4) {
      this.#database.exec("BEGIN IMMEDIATE;");
      try {
        this.#database.exec(`
          ALTER TABLE threads ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1));
          ALTER TABLE threads ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1));
          ALTER TABLE threads ADD COLUMN unread INTEGER NOT NULL DEFAULT 0 CHECK (unread IN (0, 1));
          CREATE INDEX idx_threads_navigation ON threads(archived, pinned DESC, updated_at DESC);
          UPDATE schema_meta SET version = 4;
        `);
        this.#database.exec("COMMIT;");
        version = 4;
      } catch (error) {
        this.#database.exec("ROLLBACK;");
        throw error;
      }
    }

    if (version < 5) {
      this.#database.exec("BEGIN IMMEDIATE;");
      try {
        this.#database.exec(`
          CREATE TABLE worker_pairings (
            id TEXT PRIMARY KEY,
            code_hash TEXT NOT NULL UNIQUE,
            expires_at TEXT NOT NULL,
            used_at TEXT,
            created_at TEXT NOT NULL
          );
          CREATE TABLE remote_workers (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            token_hash TEXT NOT NULL UNIQUE,
            capabilities_json TEXT NOT NULL,
            last_seen_at TEXT NOT NULL,
            paired_at TEXT NOT NULL,
            revoked_at TEXT
          );
          CREATE INDEX idx_worker_pairings_expiry ON worker_pairings(expires_at, used_at);
          CREATE INDEX idx_remote_workers_seen ON remote_workers(revoked_at, last_seen_at DESC);
          UPDATE schema_meta SET version = 5;
        `);
        this.#database.exec("COMMIT;");
        version = 5;
      } catch (error) {
        this.#database.exec("ROLLBACK;");
        throw error;
      }
    }

    if (version < 6) {
      this.#database.exec("BEGIN IMMEDIATE;");
      try {
        this.#database.exec(`
          CREATE INDEX IF NOT EXISTS idx_events_aggregate_sequence ON events(aggregate_id, sequence DESC);
          CREATE INDEX IF NOT EXISTS idx_events_type_aggregate_sequence ON events(type, aggregate_id, sequence DESC);
          UPDATE schema_meta SET version = 6;
        `);
        this.#database.exec("COMMIT;");
        version = 6;
      } catch (error) {
        this.#database.exec("ROLLBACK;");
        throw error;
      }
    }

    if (version < 7) {
      this.#database.exec("BEGIN IMMEDIATE;");
      try {
        this.#database.exec(`
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
        `);
        this.#database.exec("COMMIT;");
        version = 7;
      } catch (error) {
        this.#database.exec("ROLLBACK;");
        throw error;
      }
    }

    if (version !== CURRENT_SCHEMA_VERSION) {
      throw new Error(`Unsupported state schema version: ${version}`);
    }
    this.#ensureMemoryFts();
  }

  #ensureMemoryFts(): void {
    try {
      this.#database.exec(`
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
        INSERT OR REPLACE INTO memory_fts(rowid, id, content, normalized) SELECT rowid, id, content, normalized FROM memory_entries;
      `);
    } catch {
      // FTS5 yalnız hızlandırma katmanıdır; sıralı recent-memory fallback çalışmaya devam eder.
    }
  }

  public integrityCheck(): { ok: boolean; detail: string; schemaVersion: number } {
    const row = this.#database.prepare("PRAGMA integrity_check;").get() as { integrity_check: string };
    return { ok: row.integrity_check === "ok", detail: row.integrity_check, schemaVersion: CURRENT_SCHEMA_VERSION };
  }

  public getSetting<T>(key: string): T | null {
    const row = this.#database.prepare("SELECT value_json FROM settings WHERE key = ?").get(key) as { value_json: string } | undefined;
    return row ? JSON.parse(row.value_json) as T : null;
  }

  public setSetting<T>(key: string, value: T): void {
    const now = new Date().toISOString();
    this.#database.prepare(`
      INSERT INTO settings(key, value_json, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at
    `).run(key, JSON.stringify(value), now);
  }

  public appendEvent(type: string, aggregateId: string | null, payload: unknown, critical = false): StoredEvent {
    const normalizedType = type.trim().slice(0, 160);
    if (!normalizedType) throw new Error("EVENT_TYPE_REQUIRED");
    const now = new Date().toISOString();
    const result = this.#database.prepare(`
      INSERT INTO events(type, aggregate_id, payload_json, critical, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(normalizedType, aggregateId, JSON.stringify(payload), critical ? 1 : 0, now);
    const sequence = Number(result.lastInsertRowid);
    const row = this.#database.prepare("SELECT * FROM events WHERE sequence = ?").get(sequence) as EventRow;
    return this.#mapEvent(row);
  }

  public listEvents(input: { type?: string; aggregateId?: string; afterSequence?: number; limit?: number; order?: "asc" | "desc" } = {}): StoredEvent[] {
    const limit = Math.max(1, Math.min(1_000, Math.trunc(input.limit ?? 240)));
    const after = Math.max(0, Math.trunc(input.afterSequence ?? 0));
    const clauses = ["sequence > ?"];
    const params: Array<string | number> = [after];
    if (input.type) { clauses.push("type = ?"); params.push(input.type); }
    if (input.aggregateId) { clauses.push("aggregate_id = ?"); params.push(input.aggregateId); }
    params.push(limit);
    const order = input.order === "desc" ? "DESC" : "ASC";
    const rows = this.#database.prepare(`SELECT * FROM events WHERE ${clauses.join(" AND ")} ORDER BY sequence ${order} LIMIT ?`).all(...params) as unknown as EventRow[];
    return rows.map((row) => this.#mapEvent(row));
  }

  public upsertMemoryEntry(input: {
    projectId: string;
    threadId: string | null;
    kind: MemoryEntryRecord["kind"];
    content: string;
    normalized: string;
    importance: number;
  }): MemoryEntryRecord {
    if (!this.getProject(input.projectId)) throw new Error("PROJECT_NOT_FOUND");
    if (input.threadId && !this.#database.prepare("SELECT id FROM threads WHERE id = ? AND project_id = ?").get(input.threadId, input.projectId)) throw new Error("THREAD_NOT_FOUND");
    const id = randomUUID();
    const now = new Date().toISOString();
    const scopeKey = input.threadId ? `thread:${input.threadId}` : `project:${input.projectId}`;
    this.#database.prepare(`
      INSERT INTO memory_entries(id, project_id, thread_id, scope_key, kind, content, normalized, importance, use_count, created_at, updated_at, last_used_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
      ON CONFLICT(scope_key, normalized) DO UPDATE SET
        content = excluded.content,
        kind = excluded.kind,
        importance = MAX(memory_entries.importance, excluded.importance),
        updated_at = excluded.updated_at,
        last_used_at = excluded.last_used_at
    `).run(id, input.projectId, input.threadId, scopeKey, input.kind, input.content.slice(0, 1_500), input.normalized.slice(0, 1_500), Math.max(0, Math.min(1, input.importance)), now, now, now);
    const row = this.#database.prepare("SELECT * FROM memory_entries WHERE scope_key = ? AND normalized = ?").get(scopeKey, input.normalized.slice(0, 1_500)) as MemoryRow;
    return this.#mapMemory(row);
  }

  public searchMemoryEntries(input: { projectId: string; threadId: string; query: string; limit?: number }): MemoryEntryRecord[] {
    const limit = Math.max(1, Math.min(20, Math.trunc(input.limit ?? 8)));
    let rows: MemoryRow[] = [];
    const ftsEnabled = Boolean(this.#database.prepare("SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = 'memory_fts'").get());
    if (ftsEnabled && input.query.trim()) {
      try {
        rows = this.#database.prepare(`
          SELECT m.* FROM memory_fts
          INNER JOIN memory_entries m ON m.rowid = memory_fts.rowid
          WHERE memory_fts MATCH ? AND m.project_id = ? AND (m.thread_id IS NULL OR m.thread_id = ?)
          ORDER BY bm25(memory_fts) ASC, m.importance DESC, m.last_used_at DESC
          LIMIT ?
        `).all(input.query, input.projectId, input.threadId, limit) as unknown as MemoryRow[];
      } catch {
        rows = [];
      }
    }
    if (rows.length === 0) {
      rows = this.#database.prepare(`
        SELECT * FROM memory_entries
        WHERE project_id = ? AND (thread_id IS NULL OR thread_id = ?)
        ORDER BY importance DESC, last_used_at DESC
        LIMIT ?
      `).all(input.projectId, input.threadId, limit) as unknown as MemoryRow[];
    }
    const now = new Date().toISOString();
    const touch = this.#database.prepare("UPDATE memory_entries SET use_count = use_count + 1, last_used_at = ? WHERE id = ?");
    for (const row of rows) touch.run(now, row.id);
    return rows.map((row) => this.#mapMemory({ ...row, use_count: row.use_count + 1, last_used_at: now }));
  }

  public listRecentMemory(projectId: string, limit = 40): MemoryEntryRecord[] {
    const bounded = Math.max(1, Math.min(200, Math.trunc(limit)));
    const rows = this.#database.prepare("SELECT * FROM memory_entries WHERE project_id = ? ORDER BY importance DESC, updated_at DESC LIMIT ?").all(projectId, bounded) as unknown as MemoryRow[];
    return rows.map((row) => this.#mapMemory(row));
  }

  public pruneProjectMemory(projectId: string, maxEntries: number): number {
    const max = Math.max(100, Math.min(10_000, Math.trunc(maxEntries)));
    const count = Number((this.#database.prepare("SELECT COUNT(*) AS count FROM memory_entries WHERE project_id = ?").get(projectId) as { count: number }).count);
    const excess = Math.max(0, count - max);
    if (!excess) return 0;
    const result = this.#database.prepare(`
      DELETE FROM memory_entries WHERE id IN (
        SELECT id FROM memory_entries WHERE project_id = ?
        ORDER BY importance ASC, use_count ASC, last_used_at ASC LIMIT ?
      )
    `).run(projectId, excess);
    return Number(result.changes);
  }

  public clearProjectMemory(projectId: string): number {
    return Number(this.#database.prepare("DELETE FROM memory_entries WHERE project_id = ?").run(projectId).changes);
  }

  public memoryStats(projectId: string): { total: number; projectScoped: number; threadScoped: number; ftsEnabled: boolean } {
    const row = this.#database.prepare(`
      SELECT COUNT(*) AS total,
        SUM(CASE WHEN thread_id IS NULL THEN 1 ELSE 0 END) AS project_scoped,
        SUM(CASE WHEN thread_id IS NOT NULL THEN 1 ELSE 0 END) AS thread_scoped
      FROM memory_entries WHERE project_id = ?
    `).get(projectId) as { total: number; project_scoped: number | null; thread_scoped: number | null };
    const ftsEnabled = Boolean(this.#database.prepare("SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = 'memory_fts'").get());
    return { total: Number(row.total), projectScoped: Number(row.project_scoped ?? 0), threadScoped: Number(row.thread_scoped ?? 0), ftsEnabled };
  }

  public listAutomations(projectId?: string): Automation[] {
    const rows = (projectId
      ? this.#database.prepare("SELECT * FROM automations WHERE project_id = ? ORDER BY updated_at DESC").all(projectId)
      : this.#database.prepare("SELECT * FROM automations ORDER BY updated_at DESC").all()) as unknown as AutomationRow[];
    return rows.map((row) => this.#mapAutomation(row));
  }

  public createAutomation(input: Pick<Automation, "projectId" | "name" | "prompt" | "schedule">): Automation {
    if (!this.getProject(input.projectId)) throw new Error("PROJECT_NOT_FOUND");
    const id = randomUUID();
    const now = new Date().toISOString();
    this.#database.prepare(`
      INSERT INTO automations(id, project_id, name, prompt, rrule, timezone, enabled, last_run_at, next_run_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, NULL, NULL, ?, ?)
    `).run(id, input.projectId, input.name, input.prompt, input.schedule.rrule, input.schedule.timezone, now, now);
    return this.#mapAutomation(this.#database.prepare("SELECT * FROM automations WHERE id = ?").get(id) as AutomationRow);
  }

  public toggleAutomation(id: string): Automation {
    const now = new Date().toISOString();
    const result = this.#database.prepare("UPDATE automations SET enabled = CASE enabled WHEN 1 THEN 0 ELSE 1 END, updated_at = ? WHERE id = ?").run(now, id);
    if (result.changes !== 1) throw new Error("AUTOMATION_NOT_FOUND");
    return this.#mapAutomation(this.#database.prepare("SELECT * FROM automations WHERE id = ?").get(id) as AutomationRow);
  }

  public deleteAutomation(id: string): void {
    const result = this.#database.prepare("DELETE FROM automations WHERE id = ?").run(id);
    if (result.changes !== 1) throw new Error("AUTOMATION_NOT_FOUND");
  }

  public enqueueDurableJob(kind: string, payload: unknown, aggregateId: string | null = null): DurableJob {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.#database.prepare(`
      INSERT INTO durable_jobs(id, kind, aggregate_id, state, attempt, payload_json, result_json, lease_owner, lease_expires_at, created_at, updated_at)
      VALUES (?, ?, ?, 'QUEUED', 0, ?, NULL, NULL, NULL, ?, ?)
    `).run(id, kind, aggregateId, JSON.stringify(payload), now, now);
    return this.getDurableJob(id);
  }

  public getDurableJob(id: string): DurableJob {
    const row = this.#database.prepare("SELECT * FROM durable_jobs WHERE id = ?").get(id) as DurableJobRow | undefined;
    if (!row) throw new Error("DURABLE_JOB_NOT_FOUND");
    return this.#mapDurableJob(row);
  }

  public listDurableJobs(limit = 100): DurableJob[] {
    const bounded = Math.max(1, Math.min(500, Math.trunc(limit)));
    const rows = this.#database.prepare("SELECT * FROM durable_jobs ORDER BY created_at ASC LIMIT ?").all(bounded) as unknown as DurableJobRow[];
    return rows.map((row) => this.#mapDurableJob(row));
  }

  public listRemoteDurableJobs(limit = 100): DurableJob[] {
    const bounded = Math.max(1, Math.min(500, Math.trunc(limit)));
    const rows = this.#database.prepare(`
      SELECT * FROM durable_jobs
      WHERE kind LIKE 'remote:%'
      ORDER BY created_at DESC LIMIT ?
    `).all(bounded) as unknown as DurableJobRow[];
    return rows.map((row) => this.#mapDurableJob(row));
  }

  public createWorkerPairing(codeHash: string, expiresAt: string): void {
    const now = new Date().toISOString();
    this.#database.prepare("DELETE FROM worker_pairings WHERE expires_at <= ? OR used_at IS NOT NULL").run(now);
    this.#database.prepare(`
      INSERT INTO worker_pairings(id, code_hash, expires_at, used_at, created_at)
      VALUES (?, ?, ?, NULL, ?)
    `).run(randomUUID(), codeHash, expiresAt, now);
  }

  public consumePairingAndCreateWorker(input: {
    codeHash: string;
    workerId: string;
    name: string;
    tokenHash: string;
    capabilities: string[];
  }): RemoteWorker {
    const now = new Date().toISOString();
    this.#database.exec("BEGIN IMMEDIATE;");
    try {
      const pairing = this.#database.prepare(`
        SELECT id FROM worker_pairings
        WHERE code_hash = ? AND used_at IS NULL AND expires_at > ?
      `).get(input.codeHash, now) as { id: string } | undefined;
      if (!pairing) throw new Error("WORKER_PAIRING_INVALID_OR_EXPIRED");
      this.#database.prepare("UPDATE worker_pairings SET used_at = ? WHERE id = ?").run(now, pairing.id);
      this.#database.prepare(`
        INSERT INTO remote_workers(id, name, token_hash, capabilities_json, last_seen_at, paired_at, revoked_at)
        VALUES (?, ?, ?, ?, ?, ?, NULL)
      `).run(input.workerId, input.name, input.tokenHash, JSON.stringify(input.capabilities), now, now);
      this.#database.exec("COMMIT;");
      return this.getRemoteWorker(input.workerId);
    } catch (error) {
      this.#database.exec("ROLLBACK;");
      throw error;
    }
  }

  public getRemoteWorkerByTokenHash(tokenHash: string): RemoteWorker | null {
    const row = this.#database.prepare("SELECT * FROM remote_workers WHERE token_hash = ?").get(tokenHash) as RemoteWorkerRow | undefined;
    return row ? this.#mapRemoteWorker(row) : null;
  }

  public getRemoteWorker(id: string): RemoteWorker {
    const row = this.#database.prepare("SELECT * FROM remote_workers WHERE id = ?").get(id) as RemoteWorkerRow | undefined;
    if (!row) throw new Error("REMOTE_WORKER_NOT_FOUND");
    return this.#mapRemoteWorker(row);
  }

  public listRemoteWorkers(): RemoteWorker[] {
    const rows = this.#database.prepare("SELECT * FROM remote_workers ORDER BY paired_at DESC").all() as unknown as RemoteWorkerRow[];
    return rows.map((row) => this.#mapRemoteWorker(row));
  }

  public heartbeatRemoteWorker(id: string, capabilities?: string[]): RemoteWorker {
    const now = new Date().toISOString();
    const result = capabilities
      ? this.#database.prepare(`
          UPDATE remote_workers SET last_seen_at = ?, capabilities_json = ?
          WHERE id = ? AND revoked_at IS NULL
        `).run(now, JSON.stringify(capabilities), id)
      : this.#database.prepare("UPDATE remote_workers SET last_seen_at = ? WHERE id = ? AND revoked_at IS NULL").run(now, id);
    if (result.changes !== 1) throw new Error("REMOTE_WORKER_REVOKED_OR_MISSING");
    return this.getRemoteWorker(id);
  }

  public revokeRemoteWorker(id: string): RemoteWorker {
    const now = new Date().toISOString();
    this.#database.exec("BEGIN IMMEDIATE;");
    try {
      const result = this.#database.prepare(`
        UPDATE remote_workers SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL
      `).run(now, id);
      if (result.changes !== 1) throw new Error("REMOTE_WORKER_REVOKED_OR_MISSING");
      this.#database.prepare(`
        UPDATE durable_jobs SET state = 'CANCEL_REQUESTED', updated_at = ?
        WHERE kind LIKE 'remote:%' AND lease_owner = ? AND state IN ('LEASED', 'RUNNING')
      `).run(now, id);
      this.#database.exec("COMMIT;");
      return this.getRemoteWorker(id);
    } catch (error) {
      this.#database.exec("ROLLBACK;");
      throw error;
    }
  }

  public leaseNextRemoteJob(workerId: string, leaseMs = 30_000, maxAttempts = 3): DurableJob | null {
    const now = new Date();
    const nowIso = now.toISOString();
    const expiresAt = new Date(now.getTime() + Math.max(1_000, Math.min(10 * 60_000, leaseMs))).toISOString();
    this.#database.exec("BEGIN IMMEDIATE;");
    try {
      const row = this.#database.prepare(`
        SELECT * FROM durable_jobs
        WHERE kind LIKE 'remote:%' AND attempt < ? AND (
          state = 'QUEUED' OR
          (state IN ('LEASED', 'RUNNING') AND lease_expires_at IS NOT NULL AND lease_expires_at <= ?)
        )
        ORDER BY created_at ASC LIMIT 1
      `).get(maxAttempts, nowIso) as DurableJobRow | undefined;
      if (!row) {
        this.#database.exec("COMMIT;");
        return null;
      }
      this.#database.prepare(`
        UPDATE durable_jobs
        SET state = 'LEASED', attempt = attempt + 1, lease_owner = ?, lease_expires_at = ?, updated_at = ?
        WHERE id = ?
      `).run(workerId, expiresAt, nowIso, row.id);
      const leased = this.#database.prepare("SELECT * FROM durable_jobs WHERE id = ?").get(row.id) as DurableJobRow;
      this.#database.exec("COMMIT;");
      return this.#mapDurableJob(leased);
    } catch (error) {
      this.#database.exec("ROLLBACK;");
      throw error;
    }
  }

  public leaseNextDurableJob(workerId: string, leaseMs = 30_000, maxAttempts = 3): DurableJob | null {
    const now = new Date();
    const nowIso = now.toISOString();
    const expiresAt = new Date(now.getTime() + Math.max(1_000, Math.min(10 * 60_000, leaseMs))).toISOString();
    this.#database.exec("BEGIN IMMEDIATE;");
    try {
      const row = this.#database.prepare(`
        SELECT * FROM durable_jobs
        WHERE attempt < ? AND (
          state = 'QUEUED' OR
          (state IN ('LEASED', 'RUNNING') AND lease_expires_at IS NOT NULL AND lease_expires_at <= ?)
        )
        ORDER BY created_at ASC LIMIT 1
      `).get(maxAttempts, nowIso) as DurableJobRow | undefined;
      if (!row) {
        this.#database.exec("COMMIT;");
        return null;
      }
      this.#database.prepare(`
        UPDATE durable_jobs
        SET state = 'LEASED', attempt = attempt + 1, lease_owner = ?, lease_expires_at = ?, updated_at = ?
        WHERE id = ?
      `).run(workerId, expiresAt, nowIso, row.id);
      const leased = this.#database.prepare("SELECT * FROM durable_jobs WHERE id = ?").get(row.id) as DurableJobRow;
      this.#database.exec("COMMIT;");
      return this.#mapDurableJob(leased);
    } catch (error) {
      this.#database.exec("ROLLBACK;");
      throw error;
    }
  }

  public leaseDurableJob(id: string, workerId: string, leaseMs = 30_000): DurableJob {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + Math.max(1_000, Math.min(10 * 60_000, leaseMs))).toISOString();
    const result = this.#database.prepare(`
      UPDATE durable_jobs
      SET state = 'LEASED', attempt = attempt + 1, lease_owner = ?, lease_expires_at = ?, updated_at = ?
      WHERE id = ? AND state = 'QUEUED'
    `).run(workerId, expiresAt, now.toISOString(), id);
    if (result.changes !== 1) throw new Error("DURABLE_JOB_NOT_LEASABLE");
    return this.getDurableJob(id);
  }

  public startDurableJob(id: string, workerId: string, leaseMs = 30_000): DurableJob {
    const now = new Date();
    const result = this.#database.prepare(`
      UPDATE durable_jobs SET state = 'RUNNING', lease_expires_at = ?, updated_at = ?
      WHERE id = ? AND state = 'LEASED' AND lease_owner = ?
    `).run(new Date(now.getTime() + Math.max(1_000, leaseMs)).toISOString(), now.toISOString(), id, workerId);
    if (result.changes !== 1) throw new Error("DURABLE_JOB_LEASE_MISMATCH");
    return this.getDurableJob(id);
  }

  public heartbeatDurableJob(id: string, workerId: string, leaseMs = 30_000): DurableJob {
    const now = new Date();
    const result = this.#database.prepare(`
      UPDATE durable_jobs SET lease_expires_at = ?, updated_at = ?
      WHERE id = ? AND state IN ('LEASED', 'RUNNING', 'CANCEL_REQUESTED') AND lease_owner = ?
    `).run(new Date(now.getTime() + Math.max(1_000, leaseMs)).toISOString(), now.toISOString(), id, workerId);
    if (result.changes !== 1) throw new Error("DURABLE_JOB_LEASE_MISMATCH");
    return this.getDurableJob(id);
  }

  public requestDurableJobCancellation(id: string): DurableJob {
    const now = new Date().toISOString();
    const result = this.#database.prepare(`
      UPDATE durable_jobs
      SET state = CASE WHEN state = 'QUEUED' THEN 'CANCELLED' ELSE 'CANCEL_REQUESTED' END, updated_at = ?
      WHERE id = ? AND state IN ('QUEUED', 'LEASED', 'RUNNING')
    `).run(now, id);
    if (result.changes !== 1) throw new Error("DURABLE_JOB_NOT_CANCELLABLE");
    return this.getDurableJob(id);
  }

  public settleDurableJob(id: string, workerId: string, state: "SUCCEEDED" | "FAILED" | "CANCELLED", resultValue: unknown): DurableJob {
    const now = new Date().toISOString();
    const result = this.#database.prepare(`
      UPDATE durable_jobs
      SET state = ?, result_json = ?, lease_owner = NULL, lease_expires_at = NULL, updated_at = ?
      WHERE id = ? AND lease_owner = ? AND state IN ('LEASED', 'RUNNING', 'CANCEL_REQUESTED')
    `).run(state, JSON.stringify(resultValue), now, id, workerId);
    if (result.changes !== 1) throw new Error("DURABLE_JOB_LEASE_MISMATCH");
    return this.getDurableJob(id);
  }

  public recoverExpiredDurableJobs(at = new Date()): number {
    const now = at.toISOString();
    const result = this.#database.prepare(`
      UPDATE durable_jobs
      SET state = CASE WHEN state = 'CANCEL_REQUESTED' THEN 'CANCELLED' ELSE 'QUEUED' END,
          lease_owner = NULL, lease_expires_at = NULL, updated_at = ?
      WHERE state IN ('LEASED', 'RUNNING', 'CANCEL_REQUESTED')
        AND lease_expires_at IS NOT NULL AND lease_expires_at <= ?
    `).run(now, now);
    return Number(result.changes);
  }

  public listProjects(): ProjectSummary[] {
    const rows = this.#database.prepare("SELECT * FROM projects ORDER BY updated_at DESC").all() as unknown as ProjectRow[];
    return rows.map(this.#mapProject);
  }

  public getProject(id: string): ProjectSummary | null {
    const row = this.#database.prepare("SELECT * FROM projects WHERE id = ?").get(id) as ProjectRow | undefined;
    return row ? this.#mapProject(row) : null;
  }

  public upsertProject(project: ProjectSummary): ProjectSummary {
    this.#database.prepare(`
      INSERT INTO projects(id, name, root_path, is_git_repository, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(root_path) DO UPDATE SET
        name = excluded.name,
        is_git_repository = excluded.is_git_repository,
        updated_at = excluded.updated_at
    `).run(project.id, project.name, project.rootPath, project.isGitRepository ? 1 : 0, project.createdAt, project.updatedAt);
    const stored = this.#database.prepare("SELECT * FROM projects WHERE root_path = ?").get(project.rootPath) as ProjectRow;
    return this.#mapProject(stored);
  }

  public listThreads(projectId?: string): ThreadSummary[] {
    const rows = (projectId
      ? this.#database.prepare("SELECT * FROM threads WHERE project_id = ? ORDER BY archived ASC, pinned DESC, updated_at DESC").all(projectId)
      : this.#database.prepare("SELECT * FROM threads ORDER BY archived ASC, pinned DESC, updated_at DESC").all()) as unknown as ThreadRow[];
    return rows.map(this.#mapThread);
  }

  public createThread(projectId: string, title: string): ThreadDetail {
    if (!this.getProject(projectId)) throw new Error("PROJECT_NOT_FOUND");
    const id = randomUUID();
    const now = new Date().toISOString();
    this.#database.prepare("INSERT INTO threads(id, project_id, title, state, created_at, updated_at) VALUES (?, ?, ?, 'IDLE', ?, ?)")
      .run(id, projectId, title.trim().slice(0, 160) || "Yeni görev", now, now);
    return this.getThread(id);
  }

  public getThread(threadId: string): ThreadDetail {
    const row = this.#database.prepare("SELECT * FROM threads WHERE id = ?").get(threadId) as ThreadRow | undefined;
    if (!row) throw new Error("THREAD_NOT_FOUND");
    const itemRows = this.#database.prepare(`
      SELECT items.id, items.turn_id, items.sequence, items.payload_json, items.created_at
      FROM items
      INNER JOIN turns ON turns.id = items.turn_id
      WHERE turns.thread_id = ?
      ORDER BY turns.started_at ASC, items.sequence ASC
    `).all(threadId) as unknown as ItemRow[];
    const attachmentRows = this.#database.prepare("SELECT * FROM attachments WHERE thread_id = ? AND item_id IS NOT NULL ORDER BY created_at ASC")
      .all(threadId) as unknown as AttachmentRow[];
    const attachmentsByItem = new Map<string, Attachment[]>();
    for (const row of attachmentRows) {
      if (!row.item_id) continue;
      const attachments = attachmentsByItem.get(row.item_id) ?? [];
      attachments.push(this.#mapAttachment(row));
      attachmentsByItem.set(row.item_id, attachments);
    }
    const items = itemRows.map((item): ThreadItem => {
      const payload = JSON.parse(item.payload_json) as { role?: ThreadItem["role"]; content?: string };
      if (!payload.role || typeof payload.content !== "string") throw new Error("THREAD_ITEM_PAYLOAD_INVALID");
      return {
        id: item.id,
        turnId: item.turn_id,
        sequence: item.sequence,
        role: payload.role,
        content: payload.content,
        attachments: attachmentsByItem.get(item.id) ?? [],
        createdAt: item.created_at
      };
    });
    return { thread: this.#mapThread(row), items };
  }

  public appendMessage(
    threadId: string,
    content: string,
    assistantContent: string,
    attachmentIds: readonly string[] = [],
    activities: readonly { message: string; createdAt: string }[] = []
  ): ThreadDetail {
    const started = this.beginMessage(threadId, content, attachmentIds);
    for (const activity of activities) this.appendTurnActivity(threadId, started.turnId, activity.message, activity.createdAt);
    return this.completeMessage(threadId, started.turnId, assistantContent);
  }

  public beginMessage(
    threadId: string,
    content: string,
    attachmentIds: readonly string[] = []
  ): { detail: ThreadDetail; turnId: string } {
    const existing = this.#database.prepare("SELECT * FROM threads WHERE id = ?").get(threadId) as ThreadRow | undefined;
    if (!existing) throw new Error("THREAD_NOT_FOUND");
    const draftAttachments = this.getStoredAttachments(threadId, attachmentIds, true);
    if (draftAttachments.length !== new Set(attachmentIds).size) throw new Error("ATTACHMENT_NOT_FOUND_OR_ALREADY_ATTACHED");
    const turnId = randomUUID();
    const userItemId = randomUUID();
    const now = new Date().toISOString();
    this.#database.exec("BEGIN IMMEDIATE;");
    try {
      this.#database.prepare("UPDATE threads SET state = 'RUNNING', updated_at = ? WHERE id = ?").run(now, threadId);
      this.#database.prepare("INSERT INTO turns(id, thread_id, status, input, started_at, ended_at) VALUES (?, ?, 'RUNNING', ?, ?, NULL)")
        .run(turnId, threadId, content, now);
      this.#database.prepare("INSERT INTO items(id, turn_id, sequence, type, payload_json, created_at) VALUES (?, ?, 0, 'message', ?, ?)")
        .run(userItemId, turnId, JSON.stringify({ role: "user", content }), now);
      const bindAttachment = this.#database.prepare("UPDATE attachments SET item_id = ? WHERE id = ? AND thread_id = ? AND item_id IS NULL");
      for (const attachment of draftAttachments) {
        const result = bindAttachment.run(userItemId, attachment.id, threadId);
        if (result.changes !== 1) throw new Error("ATTACHMENT_BIND_FAILED");
      }
      const shouldRetitle = GENERIC_THREAD_TITLES.has(existing.title);
      const nextTitle = shouldRetitle ? deriveThreadTitle(content, draftAttachments.length > 0) : existing.title;
      this.#database.prepare("UPDATE threads SET title = ?, state = 'RUNNING', unread = 0, updated_at = ? WHERE id = ?").run(nextTitle, now, threadId);
      this.#database.exec("COMMIT;");
    } catch (error) {
      this.#database.exec("ROLLBACK;");
      throw error;
    }
    return { detail: this.getThread(threadId), turnId };
  }

  public appendTurnActivity(threadId: string, turnId: string, message: string, createdAt = new Date().toISOString()): ThreadDetail {
    const turn = this.#database.prepare("SELECT id FROM turns WHERE id = ? AND thread_id = ? AND status = 'RUNNING'").get(turnId, threadId);
    if (!turn) throw new Error("RUNNING_TURN_NOT_FOUND");
    const row = this.#database.prepare("SELECT COALESCE(MAX(sequence), 0) AS sequence FROM items WHERE turn_id = ?").get(turnId) as { sequence: number };
    this.#database.prepare("INSERT INTO items(id, turn_id, sequence, type, payload_json, created_at) VALUES (?, ?, ?, 'activity', ?, ?)")
      .run(randomUUID(), turnId, row.sequence + 1, JSON.stringify({ role: "activity", content: message.slice(0, 2_000) }), createdAt);
    this.#database.prepare("UPDATE threads SET updated_at = ? WHERE id = ?").run(createdAt, threadId);
    return this.getThread(threadId);
  }

  public completeMessage(threadId: string, turnId: string, assistantContent: string): ThreadDetail {
    const turn = this.#database.prepare("SELECT id FROM turns WHERE id = ? AND thread_id = ? AND status = 'RUNNING'").get(turnId, threadId);
    if (!turn) throw new Error("RUNNING_TURN_NOT_FOUND");
    const row = this.#database.prepare("SELECT COALESCE(MAX(sequence), 0) AS sequence FROM items WHERE turn_id = ?").get(turnId) as { sequence: number };
    const now = new Date().toISOString();
    this.#database.exec("BEGIN IMMEDIATE;");
    try {
      this.#database.prepare("INSERT INTO items(id, turn_id, sequence, type, payload_json, created_at) VALUES (?, ?, ?, 'message', ?, ?)")
        .run(randomUUID(), turnId, row.sequence + 1, JSON.stringify({ role: "assistant", content: assistantContent }), now);
      this.#database.prepare("UPDATE turns SET status = 'COMPLETED', ended_at = ? WHERE id = ?").run(now, turnId);
      this.#database.prepare("UPDATE threads SET state = 'COMPLETED', unread = 0, updated_at = ? WHERE id = ?").run(now, threadId);
      this.#database.exec("COMMIT;");
    } catch (error) {
      this.#database.exec("ROLLBACK;");
      throw error;
    }
    return this.getThread(threadId);
  }

  public insertAttachment(record: NewAttachmentRecord): Attachment {
    if (!this.#database.prepare("SELECT id FROM threads WHERE id = ?").get(record.threadId)) throw new Error("THREAD_NOT_FOUND");
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    this.#database.prepare(`
      INSERT INTO attachments(id, thread_id, item_id, original_name, stored_path, extension, mime_type, kind, size_bytes, sha256, can_preview, created_at)
      VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, record.threadId, record.name, record.storedPath, record.extension, record.mimeType, record.kind, record.size, record.sha256, record.canPreview ? 1 : 0, createdAt);
    return this.#mapAttachment(this.#database.prepare("SELECT * FROM attachments WHERE id = ?").get(id) as AttachmentRow);
  }

  public listDraftAttachments(threadId: string): Attachment[] {
    const rows = this.#database.prepare("SELECT * FROM attachments WHERE thread_id = ? AND item_id IS NULL ORDER BY created_at ASC")
      .all(threadId) as unknown as AttachmentRow[];
    return rows.map((row) => this.#mapAttachment(row));
  }

  public getStoredAttachments(threadId: string, attachmentIds: readonly string[], draftOnly = false): StoredAttachment[] {
    if (attachmentIds.length === 0) return [];
    const uniqueIds = [...new Set(attachmentIds)];
    const placeholders = uniqueIds.map(() => "?").join(",");
    const rows = this.#database.prepare(`SELECT * FROM attachments WHERE thread_id = ? AND id IN (${placeholders})${draftOnly ? " AND item_id IS NULL" : ""}`)
      .all(threadId, ...uniqueIds) as unknown as AttachmentRow[];
    return rows.map((row) => ({ ...this.#mapAttachment(row), storedPath: row.stored_path }));
  }

  public removeDraftAttachment(threadId: string, attachmentId: string): StoredAttachment {
    const row = this.#database.prepare("SELECT * FROM attachments WHERE id = ? AND thread_id = ? AND item_id IS NULL").get(attachmentId, threadId) as AttachmentRow | undefined;
    if (!row) throw new Error("DRAFT_ATTACHMENT_NOT_FOUND");
    this.#database.prepare("DELETE FROM attachments WHERE id = ?").run(attachmentId);
    return { ...this.#mapAttachment(row), storedPath: row.stored_path };
  }

  public updateUserMessage(threadId: string, itemId: string, content: string): ThreadDetail {
    const row = this.#database.prepare(`
      SELECT items.payload_json, items.turn_id FROM items
      INNER JOIN turns ON turns.id = items.turn_id
      WHERE items.id = ? AND turns.thread_id = ?
    `).get(itemId, threadId) as { payload_json: string; turn_id: string } | undefined;
    if (!row) throw new Error("THREAD_ITEM_NOT_FOUND");
    const payload = JSON.parse(row.payload_json) as { role?: string };
    if (payload.role !== "user") throw new Error("ONLY_USER_MESSAGES_CAN_BE_EDITED");
    const now = new Date().toISOString();
    this.#database.exec("BEGIN IMMEDIATE;");
    try {
      this.#database.prepare("UPDATE items SET payload_json = ? WHERE id = ?").run(JSON.stringify({ role: "user", content }), itemId);
      this.#database.prepare("UPDATE turns SET input = ? WHERE id = ?").run(content, row.turn_id);
      this.#database.prepare("UPDATE threads SET updated_at = ? WHERE id = ?").run(now, threadId);
      this.#database.exec("COMMIT;");
    } catch (error) {
      this.#database.exec("ROLLBACK;");
      throw error;
    }
    return this.getThread(threadId);
  }

  public replaceAssistantMessage(threadId: string, itemId: string, content: string): ThreadDetail {
    const row = this.#database.prepare(`
      SELECT items.payload_json FROM items
      INNER JOIN turns ON turns.id = items.turn_id
      WHERE items.id = ? AND turns.thread_id = ?
    `).get(itemId, threadId) as { payload_json: string } | undefined;
    if (!row) throw new Error("THREAD_ITEM_NOT_FOUND");
    const payload = JSON.parse(row.payload_json) as { role?: string };
    if (payload.role !== "assistant") throw new Error("ONLY_ASSISTANT_MESSAGES_CAN_BE_REGENERATED");
    const now = new Date().toISOString();
    this.#database.prepare("UPDATE items SET payload_json = ? WHERE id = ?").run(JSON.stringify({ role: "assistant", content }), itemId);
    this.#database.prepare("UPDATE threads SET state = 'COMPLETED', updated_at = ? WHERE id = ?").run(now, threadId);
    return this.getThread(threadId);
  }

  public renameThread(threadId: string, title: string): ThreadSummary {
    const now = new Date().toISOString();
    const result = this.#database.prepare("UPDATE threads SET title = ?, updated_at = ? WHERE id = ?").run(title.trim().slice(0, 160), now, threadId);
    if (result.changes !== 1) throw new Error("THREAD_NOT_FOUND");
    const row = this.#database.prepare("SELECT * FROM threads WHERE id = ?").get(threadId) as ThreadRow;
    return this.#mapThread(row);
  }

  public setThreadFlag(threadId: string, flag: "pinned" | "archived" | "unread", value: boolean): ThreadSummary {
    // `flag` is a closed union owned by this process; values still use a bound parameter.
    const result = this.#database.prepare(`UPDATE threads SET ${flag} = ? WHERE id = ?`).run(value ? 1 : 0, threadId);
    if (result.changes !== 1) throw new Error("THREAD_NOT_FOUND");
    const row = this.#database.prepare("SELECT * FROM threads WHERE id = ?").get(threadId) as ThreadRow;
    return this.#mapThread(row);
  }

  public deleteThread(threadId: string): void {
    const result = this.#database.prepare("DELETE FROM threads WHERE id = ?").run(threadId);
    if (result.changes !== 1) throw new Error("THREAD_NOT_FOUND");
  }

  public close(): void {
    this.#database.exec("PRAGMA wal_checkpoint(TRUNCATE);");
    this.#database.close();
  }

  #mapProject(row: ProjectRow): ProjectSummary {
    return {
      id: row.id,
      name: row.name,
      rootPath: row.root_path,
      isGitRepository: row.is_git_repository === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  #mapThread(row: ThreadRow): ThreadSummary {
    return {
      id: row.id,
      projectId: row.project_id,
      title: row.title,
      state: row.state,
      pinned: row.pinned === 1,
      archived: row.archived === 1,
      unread: row.unread === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  #mapAttachment(row: AttachmentRow): Attachment {
    return {
      id: row.id,
      threadId: row.thread_id,
      itemId: row.item_id,
      name: row.original_name,
      extension: row.extension,
      mimeType: row.mime_type,
      kind: row.kind,
      size: row.size_bytes,
      sha256: row.sha256,
      canPreview: row.can_preview === 1,
      createdAt: row.created_at
    };
  }

  #mapMemory(row: MemoryRow): MemoryEntryRecord {
    return {
      id: row.id,
      projectId: row.project_id,
      threadId: row.thread_id,
      kind: row.kind,
      content: row.content,
      normalized: row.normalized,
      importance: row.importance,
      useCount: row.use_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastUsedAt: row.last_used_at
    };
  }

  #mapAutomation(row: AutomationRow): Automation {
    return {
      id: row.id,
      projectId: row.project_id,
      name: row.name,
      prompt: row.prompt,
      schedule: { rrule: row.rrule, timezone: row.timezone },
      enabled: row.enabled === 1,
      lastRunAt: row.last_run_at,
      nextRunAt: row.next_run_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  #mapEvent(row: EventRow): StoredEvent {
    return { sequence: row.sequence, type: row.type, aggregateId: row.aggregate_id, payload: JSON.parse(row.payload_json) as unknown, critical: row.critical === 1, createdAt: row.created_at };
  }

  #mapDurableJob(row: DurableJobRow): DurableJob {
    return {
      id: row.id,
      kind: row.kind,
      aggregateId: row.aggregate_id,
      state: row.state,
      attempt: row.attempt,
      payload: JSON.parse(row.payload_json) as unknown,
      result: row.result_json ? JSON.parse(row.result_json) as unknown : null,
      leaseOwner: row.lease_owner,
      leaseExpiresAt: row.lease_expires_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  #mapRemoteWorker(row: RemoteWorkerRow): RemoteWorker {
    const lastSeen = Date.parse(row.last_seen_at);
    return {
      id: row.id,
      name: row.name,
      capabilities: JSON.parse(row.capabilities_json) as string[],
      status: row.revoked_at ? "REVOKED" : Date.now() - lastSeen <= 90_000 ? "ONLINE" : "OFFLINE",
      lastSeenAt: row.last_seen_at,
      pairedAt: row.paired_at,
      revokedAt: row.revoked_at
    };
  }
}
