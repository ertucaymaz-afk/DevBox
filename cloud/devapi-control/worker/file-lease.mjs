import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

function digest(value) { return createHash("sha256").update(String(value ?? "")).digest("hex"); }
function iso(ms) { return new Date(ms).toISOString(); }
function boundedTtl(value, fallback = 30_000) {
  const ttl = Math.trunc(Number(value) || fallback);
  if (!Number.isFinite(ttl) || ttl < 500 || ttl > 5 * 60_000) throw new Error("LEASE_TTL_INVALID");
  return ttl;
}
function safeRelative(value) {
  const input = String(value ?? "").replaceAll("\\", "/");
  if (!input || input.startsWith("/") || /^[A-Za-z]:\//u.test(input)) throw new Error("LEASE_PATH_ABSOLUTE_DENIED");
  const normalized = path.posix.normalize(input);
  if (normalized === ".." || normalized.startsWith("../") || normalized.includes("/../")) throw new Error("LEASE_PATH_ESCAPE");
  return normalized;
}
function safeToken(value, code) {
  const text = String(value ?? "").trim();
  if (!text || text.length > 240 || !/^[A-Za-z0-9._:/-]+$/u.test(text)) throw new Error(code);
  return text;
}
async function readLease(lockPath) {
  let raw;
  try { raw = await readFile(lockPath, "utf8"); }
  catch (error) { if (error?.code === "ENOENT") return null; throw error; }
  let parsed;
  try { parsed = JSON.parse(raw); }
  catch { throw new Error("LEASE_CORRUPT"); }
  if (!parsed || typeof parsed !== "object" || !parsed.leaseId || !parsed.file || !parsed.ownerId || !parsed.expiresAt) throw new Error("LEASE_CORRUPT");
  return parsed;
}

export class FileLeaseRegistry {
  constructor(root, { ownerId = randomUUID(), ttlMs = 30_000 } = {}) {
    this.root = path.resolve(String(root));
    this.ownerId = safeToken(ownerId, "LEASE_OWNER_INVALID");
    this.ttlMs = boundedTtl(ttlMs);
  }

  async init() {
    await mkdir(this.root, { recursive: true });
    return this;
  }

  lockPath(file) {
    const normalized = safeRelative(file);
    return { file: normalized, lockPath: path.join(this.root, `${digest(normalized)}.lease.json`) };
  }

  async inspect(file) {
    await this.init();
    const target = this.lockPath(file);
    const lease = await readLease(target.lockPath);
    return lease ? { ...lease, lockPath: target.lockPath } : null;
  }

  async claim({ file, taskId, workspaceId, ownerId = this.ownerId, approvalId, ttlMs = this.ttlMs } = {}) {
    await this.init();
    const target = this.lockPath(file);
    const owner = safeToken(ownerId, "LEASE_OWNER_INVALID");
    const task = safeToken(taskId, "LEASE_TASK_INVALID");
    const workspace = safeToken(workspaceId, "LEASE_WORKSPACE_INVALID");
    const approval = safeToken(approvalId, "LEASE_APPROVAL_INVALID");
    const ttl = boundedTtl(ttlMs, this.ttlMs);
    let recoveredFrom = null;
    let staleBackup = null;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const now = Date.now();
      const lease = {
        schemaVersion: 1,
        leaseId: randomUUID(),
        file: target.file,
        taskId: task,
        workspaceId: workspace,
        ownerId: owner,
        approvalId: approval,
        state: recoveredFrom ? "RECOVERED" : "CLAIMED",
        createdAt: iso(now),
        heartbeatAt: iso(now),
        expiresAt: iso(now + ttl),
        ttlMs: ttl,
        recoveredFrom
      };
      let handle;
      try {
        handle = await open(target.lockPath, "wx");
        await handle.writeFile(`${JSON.stringify(lease)}\n`, "utf8");
        await handle.close();
        handle = null;
        if (staleBackup) await unlink(staleBackup).catch(() => {});
        return { ...lease, lockPath: target.lockPath };
      } catch (error) {
        if (handle) await handle.close().catch(() => {});
        if (error?.code !== "EEXIST") throw error;
        const current = await readLease(target.lockPath);
        if (!current) continue;
        const expiresAtMs = Date.parse(current.expiresAt);
        if (!Number.isFinite(expiresAtMs)) throw new Error(`LEASE_CORRUPT:${target.file}`);
        if (expiresAtMs > Date.now()) throw new Error(`CONFLICT_QUEUE:${target.file}`);
        const suffix = String(current.leaseId || randomUUID()).replace(/[^A-Za-z0-9-]/gu, "").slice(0, 64);
        staleBackup = `${target.lockPath}.stale.${suffix}`;
        try {
          await rename(target.lockPath, staleBackup);
          recoveredFrom = {
            leaseId: String(current.leaseId),
            ownerId: String(current.ownerId),
            taskId: String(current.taskId || "unknown"),
            expiredAt: String(current.expiresAt),
            recoveredAt: iso(Date.now())
          };
        } catch (renameError) {
          if (renameError?.code === "ENOENT") continue;
          throw renameError;
        }
      }
    }
    throw new Error(`LEASE_CLAIM_RETRY_EXHAUSTED:${target.file}`);
  }

  async heartbeat(lease, { ttlMs = this.ttlMs } = {}) {
    await this.init();
    if (!lease?.file || !lease?.leaseId) throw new Error("LEASE_INPUT_INVALID");
    const target = this.lockPath(lease.file);
    const current = await readLease(target.lockPath);
    if (!current) throw new Error(`LEASE_NOT_FOUND:${target.file}`);
    if (current.leaseId !== lease.leaseId || current.ownerId !== lease.ownerId) throw new Error(`LEASE_OWNERSHIP_MISMATCH:${target.file}`);
    if (Date.parse(current.expiresAt) <= Date.now()) throw new Error(`LEASE_EXPIRED:${target.file}`);
    const ttl = boundedTtl(ttlMs, this.ttlMs);
    const now = Date.now();
    const next = { ...current, state: "HEARTBEAT", heartbeatAt: iso(now), expiresAt: iso(now + ttl), ttlMs: ttl };
    const temp = `${target.lockPath}.tmp.${String(current.leaseId).replace(/[^A-Za-z0-9-]/gu, "")}`;
    await writeFile(temp, `${JSON.stringify(next)}\n`, "utf8");
    const beforeReplace = await readLease(target.lockPath);
    if (!beforeReplace || beforeReplace.leaseId !== current.leaseId || beforeReplace.ownerId !== current.ownerId) {
      await unlink(temp).catch(() => {});
      throw new Error(`LEASE_OWNERSHIP_MISMATCH:${target.file}`);
    }
    await rename(temp, target.lockPath);
    return { ...next, lockPath: target.lockPath };
  }

  async release(lease) {
    await this.init();
    if (!lease?.file || !lease?.leaseId) throw new Error("LEASE_INPUT_INVALID");
    const target = this.lockPath(lease.file);
    const current = await readLease(target.lockPath);
    if (!current) return { file: target.file, leaseId: lease.leaseId, state: "RELEASED", alreadyMissing: true };
    if (current.leaseId !== lease.leaseId || current.ownerId !== lease.ownerId) throw new Error(`LEASE_OWNERSHIP_MISMATCH:${target.file}`);
    await unlink(target.lockPath);
    return { file: target.file, leaseId: lease.leaseId, state: "RELEASED", alreadyMissing: false, releasedAt: iso(Date.now()) };
  }
}
