import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { DurableJob, RemoteWorker, StateDatabase } from "./database.js";

const PAIRING_TTL_MS = 10 * 60_000;
const LEASE_MS = 45_000;

function digest(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

export type WorkerPairing = { code: string; expiresAt: string };
export type WorkerCredential = { worker: RemoteWorker; token: string };

export class RemoteWorkerService {
  readonly #database: StateDatabase;

  public constructor(database: StateDatabase) {
    this.#database = database;
  }

  public createPairing(): WorkerPairing {
    const raw = randomBytes(15).toString("base64url").toUpperCase();
    const code = raw.match(/.{1,5}/gu)?.join("-") ?? raw;
    const expiresAt = new Date(Date.now() + PAIRING_TTL_MS).toISOString();
    this.#database.createWorkerPairing(digest(code), expiresAt);
    return { code, expiresAt };
  }

  public pair(code: string, name: string, capabilities: string[]): WorkerCredential {
    const token = `dvw_${randomBytes(32).toString("base64url")}`;
    const worker = this.#database.consumePairingAndCreateWorker({
      codeHash: digest(code.trim().toUpperCase()),
      workerId: randomUUID(),
      name: name.trim().slice(0, 80),
      tokenHash: digest(token),
      capabilities: [...new Set(capabilities.map((item) => item.trim()).filter(Boolean))].slice(0, 64)
    });
    return { worker, token };
  }

  public authenticate(token: string): RemoteWorker {
    if (!token.startsWith("dvw_") || token.length < 32) throw new Error("REMOTE_WORKER_UNAUTHORIZED");
    const wanted = digest(token);
    const worker = this.#database.getRemoteWorkerByTokenHash(wanted);
    if (!worker || worker.revokedAt) throw new Error("REMOTE_WORKER_UNAUTHORIZED");
    return worker;
  }

  public heartbeat(token: string, capabilities?: string[]): RemoteWorker {
    const worker = this.authenticate(token);
    return this.#database.heartbeatRemoteWorker(worker.id, capabilities);
  }

  public lease(token: string): DurableJob | null {
    const worker = this.heartbeat(token);
    this.#database.recoverExpiredDurableJobs();
    return this.#database.leaseNextRemoteJob(worker.id, LEASE_MS, 5);
  }

  public start(token: string, jobId: string): DurableJob {
    const worker = this.heartbeat(token);
    try {
      return this.#database.startDurableJob(jobId, worker.id, LEASE_MS);
    } catch (error) {
      const current = this.#database.getDurableJob(jobId);
      if (current.leaseOwner === worker.id && current.state === "CANCEL_REQUESTED") return current;
      throw error;
    }
  }

  public heartbeatJob(token: string, jobId: string): DurableJob {
    const worker = this.heartbeat(token);
    return this.#database.heartbeatDurableJob(jobId, worker.id, LEASE_MS);
  }

  public settle(token: string, jobId: string, state: "SUCCEEDED" | "FAILED" | "CANCELLED", result: unknown): DurableJob {
    const worker = this.heartbeat(token);
    return this.#database.settleDurableJob(jobId, worker.id, state, result);
  }

  public list(): RemoteWorker[] {
    return this.#database.listRemoteWorkers();
  }

  public revoke(workerId: string): RemoteWorker {
    return this.#database.revokeRemoteWorker(workerId);
  }

  public enqueue(kind: string, payload: unknown): DurableJob {
    const normalized = kind.trim().replace(/^remote:/u, "").slice(0, 80);
    if (!/^[a-z0-9][a-z0-9._-]*$/u.test(normalized)) throw new Error("REMOTE_JOB_KIND_INVALID");
    return this.#database.enqueueDurableJob(`remote:${normalized}`, payload);
  }

  public listJobs(): DurableJob[] {
    return this.#database.listRemoteDurableJobs(100);
  }

  public cancelJob(jobId: string): DurableJob {
    const job = this.#database.getDurableJob(jobId);
    if (!job.kind.startsWith("remote:")) throw new Error("REMOTE_JOB_NOT_FOUND");
    return this.#database.requestDurableJobCancellation(jobId);
  }
}
