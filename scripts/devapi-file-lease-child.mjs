import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { FileLeaseRegistry } from "../cloud/devapi-control/worker/file-lease.mjs";

const [action, root, file, ttlRaw = "3000", holdRaw = "0"] = process.argv.slice(2);
if (!action || !root || !file) throw new Error("LEASE_CHILD_ARGS_REQUIRED");
const ttlMs = Number(ttlRaw);
const holdMs = Number(holdRaw);
const ownerId = `child-${process.pid}-${randomUUID()}`;
const taskId = randomUUID();
const approvalId = randomUUID();
const registry = await new FileLeaseRegistry(root, { ownerId, ttlMs }).init();

try {
  const lease = await registry.claim({
    file,
    taskId,
    workspaceId: `worker-${process.pid}`,
    ownerId,
    approvalId,
    ttlMs
  });
  process.stdout.write(`${JSON.stringify({ event: "CLAIMED", pid: process.pid, leaseId: lease.leaseId, state: lease.state, recoveredFrom: lease.recoveredFrom || null })}\n`);

  if (action === "claim-exit") process.exit(0);
  if (action === "claim-hold") {
    await sleep(Math.max(0, holdMs));
    const released = await registry.release(lease);
    process.stdout.write(`${JSON.stringify({ event: "RELEASED", pid: process.pid, leaseId: lease.leaseId, state: released.state })}\n`);
    process.exit(0);
  }
  if (action === "claim-release") {
    const released = await registry.release(lease);
    process.stdout.write(`${JSON.stringify({ event: "RELEASED", pid: process.pid, leaseId: lease.leaseId, state: released.state, recoveredFrom: lease.recoveredFrom || null })}\n`);
    process.exit(0);
  }
  throw new Error(`LEASE_CHILD_ACTION_INVALID:${action}`);
} catch (error) {
  const message = String(error?.message || error);
  process.stdout.write(`${JSON.stringify({ event: "ERROR", pid: process.pid, message })}\n`);
  process.exit(message.startsWith("CONFLICT_QUEUE:") ? 3 : 2);
}
