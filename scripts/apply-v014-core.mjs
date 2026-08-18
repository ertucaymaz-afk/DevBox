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

await patch("package.json", [["version", '"version": "0.1.13"', '"version": "0.1.14"']]);

await patch("src/main/services/database.ts", [
  ["schema-version", "const CURRENT_SCHEMA_VERSION = 6;", "const CURRENT_SCHEMA_VERSION = 7;"],
  ["memory-types", "export type StoredAttachment = Attachment & { storedPath: string };", `export type MemoryEntryRecord = {
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

export type StoredAttachment = Attachment & { storedPath: string };`],
  ["schema7", `    if (version !== CURRENT_SCHEMA_VERSION) {
      throw new Error(\`Unsupported state schema version: \${version}\`);
    }
  }

  public integrityCheck()`, `    if (version < 7) {
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
      // FTS5 is an acceleration layer. Deterministic LIKE/recent-memory fallback remains available.
    }
  }

  public integrityCheck()`],
  ["memory-methods", `  public listAutomations(projectId?: string): Automation[] {`, `  public upsertMemoryEntry(input: {
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
    const scopeKey = input.threadId ? \`thread:\${input.threadId}\` : \`project:\${input.projectId}\`;
    this.#database.prepare(\`
      INSERT INTO memory_entries(id, project_id, thread_id, scope_key, kind, content, normalized, importance, use_count, created_at, updated_at, last_used_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
      ON CONFLICT(scope_key, normalized) DO UPDATE SET
        content = excluded.content,
        kind = excluded.kind,
        importance = MAX(memory_entries.importance, excluded.importance),
        updated_at = excluded.updated_at,
        last_used_at = excluded.last_used_at
    \`).run(id, input.projectId, input.threadId, scopeKey, input.kind, input.content.slice(0, 1_500), input.normalized.slice(0, 1_500), Math.max(0, Math.min(1, input.importance)), now, now, now);
    const row = this.#database.prepare("SELECT * FROM memory_entries WHERE scope_key = ? AND normalized = ?").get(scopeKey, input.normalized.slice(0, 1_500)) as MemoryRow;
    return this.#mapMemory(row);
  }

  public searchMemoryEntries(input: { projectId: string; threadId: string; query: string; limit?: number }): MemoryEntryRecord[] {
    const limit = Math.max(1, Math.min(20, Math.trunc(input.limit ?? 8)));
    let rows: MemoryRow[] = [];
    const ftsEnabled = Boolean(this.#database.prepare("SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = 'memory_fts'").get());
    if (ftsEnabled && input.query.trim()) {
      try {
        rows = this.#database.prepare(\`
          SELECT m.* FROM memory_fts
          INNER JOIN memory_entries m ON m.rowid = memory_fts.rowid
          WHERE memory_fts MATCH ? AND m.project_id = ? AND (m.thread_id IS NULL OR m.thread_id = ?)
          ORDER BY bm25(memory_fts) ASC, m.importance DESC, m.last_used_at DESC
          LIMIT ?
        \`).all(input.query, input.projectId, input.threadId, limit) as unknown as MemoryRow[];
      } catch {
        rows = [];
      }
    }
    if (rows.length === 0) {
      rows = this.#database.prepare(\`
        SELECT * FROM memory_entries
        WHERE project_id = ? AND (thread_id IS NULL OR thread_id = ?)
        ORDER BY importance DESC, last_used_at DESC
        LIMIT ?
      \`).all(input.projectId, input.threadId, limit) as unknown as MemoryRow[];
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
    const result = this.#database.prepare(\`
      DELETE FROM memory_entries WHERE id IN (
        SELECT id FROM memory_entries WHERE project_id = ?
        ORDER BY importance ASC, use_count ASC, last_used_at ASC LIMIT ?
      )
    \`).run(projectId, excess);
    return Number(result.changes);
  }

  public clearProjectMemory(projectId: string): number {
    return Number(this.#database.prepare("DELETE FROM memory_entries WHERE project_id = ?").run(projectId).changes);
  }

  public memoryStats(projectId: string): { total: number; projectScoped: number; threadScoped: number; ftsEnabled: boolean } {
    const row = this.#database.prepare(\`
      SELECT COUNT(*) AS total,
        SUM(CASE WHEN thread_id IS NULL THEN 1 ELSE 0 END) AS project_scoped,
        SUM(CASE WHEN thread_id IS NOT NULL THEN 1 ELSE 0 END) AS thread_scoped
      FROM memory_entries WHERE project_id = ?
    \`).get(projectId) as { total: number; project_scoped: number | null; thread_scoped: number | null };
    const ftsEnabled = Boolean(this.#database.prepare("SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = 'memory_fts'").get());
    return { total: Number(row.total), projectScoped: Number(row.project_scoped ?? 0), threadScoped: Number(row.thread_scoped ?? 0), ftsEnabled };
  }

  public listAutomations(projectId?: string): Automation[] {`],
  ["map-memory", `  #mapAutomation(row: AutomationRow): Automation {`, `  #mapMemory(row: MemoryRow): MemoryEntryRecord {
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

  #mapAutomation(row: AutomationRow): Automation {`]
]);

await patch("src/main/services/agent-service.ts", [
  ["history-budget", "const MAX_HISTORY_CHARACTERS = 32_000;", "const MAX_HISTORY_CHARACTERS = 24_000;"],
  ["workspace-followup", `export function isWorkspaceMutationRequest(prompt: string): boolean {
  const normalized = prompt.toLocaleLowerCase("tr-TR");
  const target = /(?:\\bindex\\.html\\b|\\b[a-z0-9._-]+\\.(?:html?|css|jsx?|tsx?|json|md|py|go|rs|java|php|vue|svelte)\\b|dosya|sayfa|site|proje|kod|component|bileşen)/iu.test(normalized);
  const action = /(?:oluştur|kodla|yaz|ekle|değiştir|düzelt|güncelle|uygula|entegre|sil|yeniden adlandır|refactor|tasarla|build|create|write|edit|modify|update|fix|implement|add|remove)/iu.test(normalized);
  return target && action;
}`, `export function isWorkspaceMutationRequest(prompt: string, history: readonly ThreadItem[] = []): boolean {
  const normalized = prompt.toLocaleLowerCase("tr-TR");
  const targetPattern = /(?:\\bindex\\.html\\b|\\b[a-z0-9._-]+\\.(?:html?|css|jsx?|tsx?|json|md|py|go|rs|java|php|vue|svelte)\\b|dosya|sayfa|site|proje|kod|component|bileşen)/iu;
  const actionPattern = /(?:oluştur|kodla|yaz|ekle|değiştir|düzelt|güncelle|uygula|entegre|sil|yeniden adlandır|refactor|tasarla|build|create|write|edit|modify|update|fix|implement|add|remove|iyileştir|geliştir|beğenmedim|devam et)/iu;
  if (!actionPattern.test(normalized)) return false;
  if (targetPattern.test(normalized)) return true;
  const referential = /(?:bunu|şunu|onu|aynı|önceki|burayı|burada|beğenmedim|devam et|kaldığımız|tasarımı|görünümü|rengi|animasyonu|mobilde)/iu.test(normalized);
  if (!referential) return false;
  const recent = history.filter((item) => item.role === "user" || item.role === "assistant").slice(-10).map((item) => item.content).join("\\n").toLocaleLowerCase("tr-TR");
  return targetPattern.test(recent);
}`],
  ["bounded-memory", `function boundedConversation(history: readonly ThreadItem[], prompt: string, workspaceMutation = false): string {`, `function boundedConversation(history: readonly ThreadItem[], prompt: string, workspaceMutation = false, memoryContext = ""): string {`],
  ["bounded-return", `  return \`${'${base}'}${'${workspace ? `\\n\\n${workspace}` : ""}'}\\n\\n${'${body.slice(-MAX_HISTORY_CHARACTERS)}'}\`;
}`, `  const memory = memoryContext.trim() ? \`\\n\\n${'${memoryContext.trim().slice(0, 4_800)}'}\` : "";
  return \`${'${base}'}${'${workspace ? `\\n\\n${workspace}` : ""}'}${'${memory}'}\\n\\n${'${body.slice(-MAX_HISTORY_CHARACTERS)}'}\`;
}`],
  ["respond-signature", `    cancellation?: AbortSignal,
    modelOverride = MODEL
  ): Promise<AgentResponse> {`, `    cancellation?: AbortSignal,
    modelOverride = MODEL,
    memoryContext = ""
  ): Promise<AgentResponse> {`],
  ["fast-chat", `    const workspaceMutation = isWorkspaceMutationRequest(prompt);
    const started = performance.now();
    report(onProgress, "provider", "PROVIDER_CHECK", "Hermes aracılığıyla NVIDIA NIM oturumu başlatıldı.", "Hermes / NVIDIA NIM", modelOverride);
    report(onProgress, "command", "RUNNING_COMMAND", workspaceMutation ? "hermes chat gerçek workspace file/terminal araç döngüsüyle çalıştırılıyor." : "hermes chat güvenli sohbet modunda çalıştırılıyor.", "Hermes / NVIDIA NIM", modelOverride);
    const chat = await this.#runner.run({`, `    const workspaceMutation = isWorkspaceMutationRequest(prompt, history);
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
          sessionId: \`oneshot-${'${randomUUID()}'}\`,
          durationMs: Math.max(0, Math.round(performance.now() - started)),
          evidence: [oneShot.runId, "hermes-one-shot:direct-final-output"],
          outcome: parsedOutcome.outcome,
          blockReason: parsedOutcome.blockReason,
          acceptance: parsedOutcome.acceptance
        };
      }
      report(onProgress, "waiting", "BACKOFF", "Hermes one-shot yolu sonuç üretmedi; uyumluluk için güvenli chat+redakte export yoluna düşülüyor.", "Hermes / NVIDIA NIM", modelOverride);
    }
    report(onProgress, "provider", "PROVIDER_CHECK", "Hermes aracılığıyla NVIDIA NIM oturumu başlatıldı.", "Hermes / NVIDIA NIM", modelOverride);
    report(onProgress, "command", "RUNNING_COMMAND", workspaceMutation ? "hermes chat gerçek workspace file/terminal araç döngüsüyle çalıştırılıyor." : "hermes chat güvenli sohbet modunda çalıştırılıyor.", "Hermes / NVIDIA NIM", modelOverride);
    const chat = await this.#runner.run({`],
  ["chat-memory", `        "--query", boundedConversation(history, prompt, workspaceMutation),`, `        "--query", boundedConversation(history, prompt, workspaceMutation, memoryContext),`]
]);

await patch("src/main/main.ts", [
  ["memory-import", `import { LocalCatalogService } from "./services/local-catalog-service.js";`, `import { LocalCatalogService } from "./services/local-catalog-service.js";
import { MemoryService } from "./services/memory-service.js";`],
  ["turn-import", `import { TerminalService } from "./services/terminal-service.js";`, `import { TerminalService } from "./services/terminal-service.js";
import { ThreadTurnCoordinator } from "./services/thread-turn-coordinator.js";`],
  ["construct-services", `  const agent = new AgentService(runner, app.getVersion());
  const attachments = new AttachmentService(database, path.join(app.getPath("userData"), "attachments"));`, `  const agent = new AgentService(runner, app.getVersion());
  const memory = new MemoryService(database);
  const turnCoordinator = new ThreadTurnCoordinator();
  const attachments = new AttachmentService(database, path.join(app.getPath("userData"), "attachments"));`],
  ["core-options", `    agent,
    attachments,`, `    agent,
    memory,
    turnCoordinator,
    attachments,`],
  ["ipc-options", `    agent,
    evolution,
    attachments,`, `    agent,
    memory,
    turnCoordinator,
    evolution,
    attachments,`]
]);

await patch("src/main/ipc.ts", [
  ["memory-import", `import type { LocalCatalogService } from "./services/local-catalog-service.js";`, `import type { LocalCatalogService } from "./services/local-catalog-service.js";
import type { MemoryService } from "./services/memory-service.js";`],
  ["turn-import", `import type { TerminalService } from "./services/terminal-service.js";`, `import type { TerminalService } from "./services/terminal-service.js";
import type { ThreadTurnCoordinator } from "./services/thread-turn-coordinator.js";`],
  ["service-fields", `  agent: AgentService;
  evolution: ApiEvolutionService;`, `  agent: AgentService;
  memory: MemoryService;
  turnCoordinator: ThreadTurnCoordinator;
  evolution: ApiEvolutionService;`],
  ["queue-open", `  registerHandler(IPC_CHANNELS.threadMessage, services.rendererWebContentsId, async (unknownInput, event) => {
    const input = ThreadMessageInputSchema.parse(unknownInput);
    const current = services.database.getThread(input.threadId);`, `  registerHandler(IPC_CHANNELS.threadMessage, services.rendererWebContentsId, async (unknownInput, event) => {
    const input = ThreadMessageInputSchema.parse(unknownInput);
    return await services.turnCoordinator.run(input.threadId, async () => {
    const current = services.database.getThread(input.threadId);`],
  ["history-intent-memory", `    const workspaceIntent = isWorkspaceMutationRequest(input.content);
    await enforcePermissionPolicy(event, services, {`, `    const workspaceIntent = isWorkspaceMutationRequest(input.content, current.items);
    services.memory.captureUserSignal(project.id, input.threadId, input.content);
    const memoryContext = services.memory.buildContext(project.id, input.threadId, input.content);
    await enforcePermissionPolicy(event, services, {`],
  ["agent-memory", `      assistantContent = await services.agent.respond(agentPrompt, project.rootPath, current.items, publishActivity)
        .then((response) => response.content);`, `      assistantContent = await services.agent.respond(agentPrompt, project.rootPath, current.items, publishActivity, undefined, undefined, memoryContext)
        .then((response) => response.content);`],
  ["queue-close", `    return ThreadDetailSchema.parse(services.database.completeMessage(input.threadId, started.turnId, assistantContent));
  });

  registerHandler(IPC_CHANNELS.threadMessageUpdate`, `    return ThreadDetailSchema.parse(services.database.completeMessage(input.threadId, started.turnId, assistantContent));
    });
  });

  registerHandler(IPC_CHANNELS.threadMessageUpdate`]
]);

await patch("src/main/services/core-api.ts", [
  ["memory-import", `import type { LocalCatalogService } from "./local-catalog-service.js";`, `import type { LocalCatalogService } from "./local-catalog-service.js";
import type { MemoryService } from "./memory-service.js";
import type { ThreadTurnCoordinator } from "./thread-turn-coordinator.js";`],
  ["options", `  agent: AgentService;
  evolution: ApiEvolutionService;`, `  agent: AgentService;
  memory: MemoryService;
  turnCoordinator: ThreadTurnCoordinator;
  evolution: ApiEvolutionService;`],
  ["verified-intent", `  const workspaceIntent = isWorkspaceMutationRequest(input.prompt);`, `  const workspaceIntent = isWorkspaceMutationRequest(input.prompt, input.history);
  const memoryContext = options.memory.buildContext(input.projectId, input.threadId, input.prompt);`],
  ["verified-agent-memory", `    response = await options.agent.respond(input.prompt, project.rootPath, input.history);`, `    response = await options.agent.respond(input.prompt, project.rootPath, input.history, undefined, undefined, undefined, memoryContext);`],
  ["api-resource-memory", `      resources: ["runtime", "capabilities", "providers", "models", "projects", "threads", "evolution", "approvals", "git", "toolkits", "skills", "plugins", "mcp", "vercel", "github", "diagnostics"]`, `      resources: ["runtime", "capabilities", "providers", "models", "projects", "threads", "memory", "evolution", "approvals", "git", "toolkits", "skills", "plugins", "mcp", "vercel", "github", "diagnostics"]`],
  ["api-message-queue", `    this.#server.post("/v1/threads/:id/messages", async (request, reply) => {
      const params = IdParamsSchema.parse(request.params);
      const body = ThreadMessageBodySchema.parse(request.body);
      const current = this.#options.database.getThread(params.id);
      const policy = this.#options.settings.get();`, `    this.#server.post("/v1/threads/:id/messages", async (request, reply) => {
      const params = IdParamsSchema.parse(request.params);
      const body = ThreadMessageBodySchema.parse(request.body);
      return await this.#options.turnCoordinator.run(params.id, async () => {
      const current = this.#options.database.getThread(params.id);
      this.#options.memory.captureUserSignal(current.thread.projectId, params.id, body.content);
      const policy = this.#options.settings.get();`],
  ["api-message-close", `      return await reply.code(201).send(execution.workspaceResult ? { ...detail, workspaceResult: execution.workspaceResult } : detail);
    });
    this.#server.patch("/v1/threads/:id/items/:itemId"`, `      return await reply.code(201).send(execution.workspaceResult ? { ...detail, workspaceResult: execution.workspaceResult } : detail);
      });
    });
    this.#server.patch("/v1/threads/:id/items/:itemId"`],
  ["memory-routes", `    this.#server.get("/v1/projects/:id/evolution", async (request) => {`, `    this.#server.get("/v1/projects/:id/memory", async (request) => {
      const params = IdParamsSchema.parse(request.params);
      this.#options.projects.get(params.id);
      return { stats: this.#options.memory.stats(params.id), items: this.#options.memory.recent(params.id, 50) };
    });
    this.#server.delete("/v1/projects/:id/memory", async (request) => {
      const params = IdParamsSchema.parse(request.params);
      this.#options.projects.get(params.id);
      return { deleted: this.#options.memory.clear(params.id) };
    });
    this.#server.get("/v1/projects/:id/evolution", async (request) => {`]
]);

await patch("src/main/services/agent-service.test.ts", [
  ["export-path-test", `    const response = await service.respond("Bir görev", "C:\\\\project", []);`, `    const response = await service.respond("index.html dosyasını düzelt", "C:\\\\project", []);`],
  ["add-fast-test", `  it("fails closed when Hermes does not return a session id", async () => {`, `  it("uses Hermes pure one-shot for ordinary chat without the export subprocess", async () => {
    process.env.NVIDIA_API_KEY = "test-secret";
    const run = vi.fn().mockResolvedValue(result("oneshot-run", "Merhaba, hazırım.\\n"));
    const service = new AgentService({ run } as unknown as CommandRunner);

    const response = await service.respond("Merhaba", "C:\\\\project", []);

    expect(response.content).toBe("Merhaba, hazırım.");
    expect(response.evidence).toContain("hermes-one-shot:direct-final-output");
    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0]?.[0]?.args?.[0]).toBe("-z");
  });

  it("recognizes referential workspace follow-ups from recent thread history", () => {
    const history = [{ role: "user", content: "index.html kodla" }, { role: "assistant", content: "index.html oluşturuldu" }] as never;
    expect(isWorkspaceMutationRequest("Beğenmedim, bunu mobilde düzelt ve animasyonu geliştir", history)).toBe(true);
    expect(isWorkspaceMutationRequest("Merhaba", history)).toBe(false);
  });

  it("fails closed when Hermes does not return a session id", async () => {`],
  ["import-workspace-detector", `import { AgentService, evolutionRoutePlan, parseCodexModelCatalog, parseEvolutionProviderOutcome, parseNvidiaModelCatalog, resolveCodexExecutable } from "./agent-service.js";`, `import { AgentService, evolutionRoutePlan, isWorkspaceMutationRequest, parseCodexModelCatalog, parseEvolutionProviderOutcome, parseNvidiaModelCatalog, resolveCodexExecutable } from "./agent-service.js";`]
]);

console.log("DEVBOX_V014_CORE_PATCH_APPLIED");
