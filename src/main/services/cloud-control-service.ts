import { createHmac, randomUUID } from "node:crypto";
import type { ApiEvolutionService } from "./api-evolution-service.js";
import type { StateDatabase } from "./database.js";
import type { EvolutionFindingService } from "./evolution-finding-service.js";
import type { MemoryService } from "./memory-service.js";
import type { ProjectService } from "./project-service.js";
import type { ReleaseGateService } from "./release-gate-service.js";

export type CloudControlState = "UNCONFIGURED" | "READY" | "DEGRADED" | "FAILED";
export type CloudControlStatus = {
  state: CloudControlState;
  endpoint: string | null;
  configured: boolean;
  lastSyncAt: string | null;
  lastCommandAt: string | null;
  lastError: string | null;
  pendingCommandCursor: string | null;
};

type CloudCommand = {
  id: string;
  sequence: number;
  projectId: string;
  kind: "evolution.setEnabled" | "evolution.run" | "evolution.cancel";
  payload: unknown;
  createdAt: string;
};

type CloudCommandAckStatus = "APPLIED" | "RETRYING" | "FAILED";
type CloudConfig = { endpoint: URL; token: string };

const SYNC_INTERVAL_MS = 30_000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const CLOUD_COMMAND_MAX_ATTEMPTS = 5;

function parseConfig(environment: NodeJS.ProcessEnv = process.env): CloudConfig | null {
  const endpointText = environment.DEVBOX_CONTROL_PLANE_URL?.trim();
  const token = environment.DEVBOX_CONTROL_PLANE_TOKEN?.trim();
  if (!endpointText || !token) return null;
  let endpoint: URL;
  try { endpoint = new URL(endpointText); } catch { throw new Error("DEVBOX_CONTROL_PLANE_URL_INVALID"); }
  const loopback = ["127.0.0.1", "localhost", "::1"].includes(endpoint.hostname);
  if (endpoint.protocol !== "https:" && !(loopback && endpoint.protocol === "http:")) throw new Error("DEVBOX_CONTROL_PLANE_HTTPS_REQUIRED");
  if (endpoint.username || endpoint.password) throw new Error("DEVBOX_CONTROL_PLANE_USERINFO_FORBIDDEN");
  if (token.length < 32) throw new Error("DEVBOX_CONTROL_PLANE_TOKEN_TOO_SHORT");
  return { endpoint, token };
}

function boundedError(error: unknown): string { return (error instanceof Error ? error.message : String(error)).slice(0, 1_000); }
function signature(token: string, timestamp: string, body: string): string { return createHmac("sha256", token).update(`${timestamp}.${body}`).digest("hex"); }

export class CloudControlService {
  readonly #database: StateDatabase;
  readonly #projects: ProjectService;
  readonly #evolution: ApiEvolutionService;
  readonly #findings: EvolutionFindingService;
  readonly #releaseGate: ReleaseGateService;
  readonly #memory: MemoryService;
  readonly #instanceId = randomUUID();
  readonly #config: CloudConfig | null;
  #timer: NodeJS.Timeout | null = null;
  #inFlight = false;

  public constructor(database: StateDatabase, projects: ProjectService, evolution: ApiEvolutionService, findings: EvolutionFindingService, releaseGate: ReleaseGateService, memory: MemoryService, environment: NodeJS.ProcessEnv = process.env) {
    this.#database = database; this.#projects = projects; this.#evolution = evolution; this.#findings = findings; this.#releaseGate = releaseGate; this.#memory = memory;
    this.#config = parseConfig(environment);
  }

  #key(projectId: string): string { return `cloud-control:v1:${projectId}`; }
  #attemptKey(commandId: string): string { return `cloud-command-attempts:${commandId}`; }
  #appliedKey(commandId: string): string { return `cloud-command:${commandId}`; }

  public status(projectId: string): CloudControlStatus {
    const stored = this.#database.getSetting<Partial<CloudControlStatus>>(this.#key(projectId)) ?? {};
    if (!this.#config) return { state: "UNCONFIGURED", endpoint: null, configured: false, lastSyncAt: stored.lastSyncAt ?? null, lastCommandAt: stored.lastCommandAt ?? null, lastError: stored.lastError ?? null, pendingCommandCursor: stored.pendingCommandCursor ?? null };
    return {
      state: stored.state === "READY" || stored.state === "DEGRADED" || stored.state === "FAILED" ? stored.state : "DEGRADED",
      endpoint: this.#config.endpoint.origin,
      configured: true,
      lastSyncAt: stored.lastSyncAt ?? null,
      lastCommandAt: stored.lastCommandAt ?? null,
      lastError: stored.lastError ?? null,
      pendingCommandCursor: stored.pendingCommandCursor ?? null
    };
  }

  #save(projectId: string, patch: Partial<CloudControlStatus>): CloudControlStatus {
    const current = this.status(projectId);
    const next: CloudControlStatus = { ...current, ...patch, endpoint: this.#config?.endpoint.origin ?? current.endpoint, configured: Boolean(this.#config) };
    this.#database.setSetting(this.#key(projectId), next);
    return next;
  }

  async #request(projectId: string, pathname: string, init: { method: "GET" | "POST" | "PATCH"; body?: unknown }): Promise<unknown> {
    if (!this.#config) throw new Error("CLOUD_CONTROL_UNCONFIGURED");
    const url = new URL(pathname, this.#config.endpoint);
    if (init.method === "GET") {
      url.searchParams.set("projectId", projectId);
      const cursor = this.status(projectId).pendingCommandCursor;
      if (cursor) url.searchParams.set("after", cursor);
    }
    const body = init.body === undefined ? "" : JSON.stringify(init.body);
    const timestamp = new Date().toISOString();
    const response = await fetch(url, {
      method: init.method,
      headers: {
        accept: "application/json",
        ...(body ? { "content-type": "application/json" } : {}),
        authorization: `Bearer ${this.#config.token}`,
        "x-devbox-instance": this.#instanceId,
        "x-devbox-timestamp": timestamp,
        "x-devbox-signature": signature(this.#config.token, timestamp, body)
      },
      ...(body ? { body } : {}),
      redirect: "error",
      signal: AbortSignal.timeout(15_000)
    });
    const declaredLength = Number(response.headers.get("content-length") ?? 0);
    if (declaredLength > MAX_RESPONSE_BYTES) throw new Error("CLOUD_CONTROL_RESPONSE_TOO_LARGE");
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > MAX_RESPONSE_BYTES) throw new Error("CLOUD_CONTROL_RESPONSE_TOO_LARGE");
    if (!response.ok) throw new Error(`CLOUD_CONTROL_HTTP_${response.status}`);
    if (!text) return null;
    try { return JSON.parse(text) as unknown; } catch { throw new Error("CLOUD_CONTROL_RESPONSE_INVALID_JSON"); }
  }

  async #ackCommand(projectId: string, command: CloudCommand, status: CloudCommandAckStatus, detail = ""): Promise<void> {
    await this.#request(projectId, "/api/v1/commands", {
      method: "PATCH",
      body: { projectId, id: command.id, sequence: command.sequence, status, detail: detail.slice(0, 1_000) }
    });
  }

  public snapshot(projectId: string): Record<string, unknown> {
    const project = this.#projects.get(projectId);
    const campaign = this.#evolution.get(projectId);
    const findings = this.#findings.reconcileCampaign(projectId, campaign);
    const gate = this.#releaseGate.latest(projectId);
    return {
      schemaVersion: 1,
      project: { id: project.id, name: project.name, isGitRepository: project.isGitRepository },
      evolution: {
        enabled: campaign.enabled,
        isRunning: campaign.isRunning,
        score: campaign.score,
        level: campaign.level,
        lifetimeLevel: campaign.lifetimeLevel,
        lifetimeEvidencePoints: campaign.lifetimeEvidencePoints,
        validatedImprovementCount: campaign.validatedImprovementCount,
        stablePromotionCount: campaign.stablePromotionCount,
        domainScores: campaign.domainScores,
        stage: campaign.stage,
        runtime: campaign.runtime,
        spec: { phaseCount: campaign.spec.phaseCount, totalTaskCount: campaign.spec.totalTaskCount, passCount: campaign.spec.passCount, failedCount: campaign.spec.failedCount, blockedCount: campaign.spec.blockedCount, recoveryCount: campaign.spec.recoveryCount, remainingCount: campaign.spec.remainingCount, currentPhaseId: campaign.spec.currentPhaseId, currentGateState: campaign.spec.currentGateState },
        learnings: campaign.learnings.slice(-100),
        tasks: campaign.tasks.slice(-120)
      },
      findings: { total: findings.total, open: findings.open, resolved: findings.resolved, rejected: findings.rejected, blocking: findings.blocking, bySeverity: findings.bySeverity, byOwner: findings.byOwner, items: findings.items.slice(0, 300) },
      releaseGate: gate,
      memory: this.#memory.stats(projectId),
      capturedAt: new Date().toISOString(),
      instanceId: this.#instanceId
    };
  }

  public async sync(projectId: string): Promise<CloudControlStatus> {
    if (!this.#config) return this.status(projectId);
    try {
      await this.#request(projectId, "/api/v1/snapshot", { method: "POST", body: this.snapshot(projectId) });
      return this.#save(projectId, { state: "READY", lastSyncAt: new Date().toISOString(), lastError: null });
    } catch (error) {
      return this.#save(projectId, { state: "DEGRADED", lastError: boundedError(error) });
    }
  }

  async #applyCommand(command: CloudCommand): Promise<void> {
    this.#projects.get(command.projectId);
    if (command.kind === "evolution.setEnabled") {
      const payload = command.payload && typeof command.payload === "object" && !Array.isArray(command.payload) ? command.payload as Record<string, unknown> : {};
      if (typeof payload.enabled !== "boolean") throw new Error("CLOUD_COMMAND_ENABLED_REQUIRED");
      this.#evolution.setEnabled(command.projectId, payload.enabled);
      return;
    }
    if (command.kind === "evolution.run") { await this.#evolution.runNow(command.projectId); return; }
    if (command.kind === "evolution.cancel") { this.#evolution.cancel(command.projectId); return; }
    command.kind satisfies never;
  }

  public async poll(projectId: string): Promise<CloudControlStatus> {
    if (!this.#config) return this.status(projectId);
    try {
      const raw = await this.#request(projectId, "/api/v1/commands", { method: "GET" });
      const record = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
      const commands = Array.isArray(record.items) ? record.items : [];
      let cursor = this.status(projectId).pendingCommandCursor;
      let lastCommandAt = this.status(projectId).lastCommandAt;
      let terminalFailure: string | null = null;

      for (const candidate of commands.slice(0, 100)) {
        if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) throw new Error("CLOUD_COMMAND_SCHEMA_INVALID");
        const value = candidate as Record<string, unknown>;
        if (typeof value.id !== "string" || typeof value.sequence !== "number" || value.projectId !== projectId || !["evolution.setEnabled", "evolution.run", "evolution.cancel"].includes(String(value.kind))) throw new Error("CLOUD_COMMAND_SCHEMA_INVALID");
        const command: CloudCommand = { id: value.id, sequence: Math.trunc(value.sequence), projectId, kind: value.kind as CloudCommand["kind"], payload: value.payload, createdAt: typeof value.createdAt === "string" ? value.createdAt : new Date().toISOString() };
        if (!Number.isSafeInteger(command.sequence) || command.sequence <= 0) throw new Error("CLOUD_COMMAND_SEQUENCE_INVALID");

        const appliedKey = this.#appliedKey(command.id);
        const attemptKey = this.#attemptKey(command.id);
        const alreadyApplied = Boolean(this.#database.getSetting<boolean>(appliedKey));

        if (!alreadyApplied) {
          try {
            await this.#applyCommand(command);
            this.#database.setSetting(appliedKey, true);
            this.#database.setSetting(attemptKey, 0);
            this.#database.appendEvent("cloud.command.applied", projectId, { id: command.id, sequence: command.sequence, kind: command.kind, appliedAt: new Date().toISOString() }, true);
          } catch (error) {
            const detail = boundedError(error);
            const attempts = Math.min(CLOUD_COMMAND_MAX_ATTEMPTS, Math.max(0, this.#database.getSetting<number>(attemptKey) ?? 0) + 1);
            this.#database.setSetting(attemptKey, attempts);
            const terminal = attempts >= CLOUD_COMMAND_MAX_ATTEMPTS;
            const ackStatus: CloudCommandAckStatus = terminal ? "FAILED" : "RETRYING";
            await this.#ackCommand(projectId, command, ackStatus, `${detail} · attempt ${attempts}/${CLOUD_COMMAND_MAX_ATTEMPTS}`);
            lastCommandAt = new Date().toISOString();
            this.#database.appendEvent(terminal ? "cloud.command.failed" : "cloud.command.retrying", projectId, { id: command.id, sequence: command.sequence, kind: command.kind, attempts, detail, at: lastCommandAt }, true);
            if (!terminal) {
              return this.#save(projectId, { state: "DEGRADED", lastCommandAt, lastError: `CLOUD_COMMAND_RETRYING:${command.id}:${detail}` });
            }
            terminalFailure = `CLOUD_COMMAND_FAILED:${command.id}:${detail}`;
            cursor = String(Math.max(Number(cursor ?? 0), command.sequence));
            continue;
          }
        }

        // Local application and cloud acknowledgement are deliberately separate.
        // If this PATCH fails, the local idempotency marker prevents re-applying the
        // command on the next poll while the acknowledgement is retried.
        await this.#ackCommand(projectId, command, "APPLIED");
        cursor = String(Math.max(Number(cursor ?? 0), command.sequence));
        lastCommandAt = new Date().toISOString();
      }

      return this.#save(projectId, {
        state: terminalFailure ? "DEGRADED" : "READY",
        pendingCommandCursor: cursor,
        lastCommandAt,
        lastError: terminalFailure
      });
    } catch (error) {
      return this.#save(projectId, { state: "DEGRADED", lastError: boundedError(error) });
    }
  }

  public start(): void {
    if (this.#timer || !this.#config) return;
    const tick = (): void => {
      if (this.#inFlight) return;
      this.#inFlight = true;
      void (async () => {
        for (const project of this.#projects.list()) {
          await this.poll(project.id);
          await this.sync(project.id);
        }
      })().finally(() => { this.#inFlight = false; });
    };
    tick();
    this.#timer = setInterval(tick, SYNC_INTERVAL_MS);
    this.#timer.unref();
  }

  public stop(): void { if (this.#timer) clearInterval(this.#timer); this.#timer = null; }
}
