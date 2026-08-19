import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { neon } from "@neondatabase/serverless";
import { appendAgentEvidence, createAgentTask, ensureAgentSchema, getAgentTask, transitionAgentTask } from "../cloud/devapi-control/lib/agent-store.mjs";
import { createApproval, decideApproval, ensureApprovalSchema, listApprovals } from "../cloud/devapi-control/lib/approval-store.mjs";
import { ensureMigrationLedger, migrationChecksum, recordMigration } from "../cloud/devapi-control/lib/migration-ledger.mjs";

const output = path.resolve("outputs/devapi-db-runtime-smoke.json");
await mkdir(path.dirname(output), { recursive: true });
const databaseUrl = String(process.env.DATABASE_URL || "").trim();
const sourceSha = String(process.env.DEVAPI_SOURCE_SHA || process.env.GITHUB_SHA || "").trim().toLowerCase();
let evidence;

if (!databaseUrl) {
  evidence = {
    schemaVersion: 1,
    state: "BLOCKED_EXTERNAL",
    blocker: "DATABASE_URL_UNCONFIGURED",
    runtimeVerified: false,
    credentialConfigured: false,
    secretValue: null,
    generatedAt: new Date().toISOString()
  };
  console.log("DEVAPI_DB_RUNTIME_SMOKE_BLOCKED_EXTERNAL credential=DATABASE_URL runtimeVerified=false");
} else {
  if (!/^[0-9a-f]{40}$/u.test(sourceSha)) throw new Error("DEVAPI_DB_SOURCE_SHA_INVALID");
  const query = neon(databaseUrl);
  await ensureAgentSchema();
  await ensureApprovalSchema();
  await ensureMigrationLedger();
  const migrationPayload = "agent foundation + scoped approvals + evidence ledger v3";
  const migration = await recordMigration({
    version: "001_agent_foundation",
    name: "Agent foundation and scoped approval baseline",
    checksum: migrationChecksum(migrationPayload),
    sourceSha
  });

  const task = await createAgentTask({
    title: `DevAPI DB smoke ${randomUUID().slice(0, 8)}`,
    request: "Validate persisted task, approval, event, evidence and rollback behavior without production mutation.",
    sourceRepo: "ertucaymaz-afk/DevBox",
    sourceRef: process.env.GITHUB_HEAD_REF || "ci-runtime-smoke",
    sourceSha
  }, { riskClass: "R2", assignedAgents: ["orchestrator", "planner", "reviewer"] });

  try {
    await transitionAgentTask({ taskId: task.taskId, toState: "TRIAGED", actor: "db-smoke", detail: { fixture: true } });
    await transitionAgentTask({ taskId: task.taskId, toState: "PLANNING", actor: "db-smoke", detail: { fixture: true } });
    await transitionAgentTask({ taskId: task.taskId, toState: "WAITING_APPROVAL", actor: "db-smoke", detail: { fixture: true } });

    const approval = await createApproval({
      taskId: task.taskId,
      riskClass: "R2",
      action: "patch deterministic smoke fixture",
      scope: { paths: ["cloud/devapi-control/README.md"], operations: ["update"] },
      requestedBy: "db-smoke",
      reason: "runtime persistence verification",
      ttlMs: 300_000
    });
    const decided = await decideApproval({
      approvalId: approval.approvalId,
      taskId: task.taskId,
      decision: "APPROVED",
      decidedBy: "db-smoke-reviewer",
      reason: "deterministic fixture only"
    });
    if (decided.state !== "APPROVED") throw new Error("DEVAPI_DB_APPROVAL_NOT_PERSISTED");

    const digest = createHash("sha256").update(`db-smoke:${task.taskId}:${sourceSha}`).digest("hex");
    const persistedEvidence = await appendAgentEvidence({
      taskId: task.taskId,
      type: "TEST",
      sourceSha,
      runtime: "neon-postgres",
      tool: "db-runtime-smoke",
      state: "RUNTIME_VERIFIED",
      digest,
      metadata: { fixture: true, approvalId: approval.approvalId },
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString()
    });

    const state = await getAgentTask(task.taskId);
    const approvals = await listApprovals({ taskId: task.taskId });
    if (state.events.length < 4) throw new Error("DEVAPI_DB_EVENT_LEDGER_INCOMPLETE");
    if (!state.evidence.some((item) => item.evidenceId === persistedEvidence.evidenceId)) throw new Error("DEVAPI_DB_EVIDENCE_READBACK_FAILED");
    if (!approvals.some((item) => item.approvalId === approval.approvalId && item.state === "APPROVED")) throw new Error("DEVAPI_DB_APPROVAL_READBACK_FAILED");

    const rollbackEventId = randomUUID();
    let rollbackTriggered = false;
    try {
      await query.transaction([
        query`INSERT INTO agent_task_events(event_id,task_id,from_state,to_state,actor,detail) VALUES (${rollbackEventId},${task.taskId},'WAITING_APPROVAL','WAITING_APPROVAL','rollback-fixture','{}'::jsonb)`,
        query`SELECT 1/0 AS intentional_failure`
      ]);
    } catch {
      rollbackTriggered = true;
    }
    if (!rollbackTriggered) throw new Error("DEVAPI_DB_ROLLBACK_FIXTURE_DID_NOT_FAIL");
    const rollbackRows = await query`SELECT COUNT(*)::int AS count FROM agent_task_events WHERE event_id=${rollbackEventId}`;
    if (Number(rollbackRows[0]?.count || 0) !== 0) throw new Error("DEVAPI_DB_TRANSACTION_ROLLBACK_FAILED");

    evidence = {
      schemaVersion: 1,
      state: "RUNTIME_VERIFIED",
      runtimeVerified: true,
      credentialConfigured: true,
      secretValue: null,
      sourceSha,
      migration: { version: migration.version, state: migration.state, checksum: migration.checksum },
      task: { taskId: task.taskId, eventCount: state.events.length, evidenceCount: state.evidence.length },
      approval: { approvalId: approval.approvalId, state: decided.state },
      transactionRollbackVerified: true,
      cleanupVerified: false,
      generatedAt: new Date().toISOString()
    };
  } finally {
    await query`DELETE FROM agent_tasks WHERE task_id=${task.taskId}`;
    const remaining = await query`SELECT COUNT(*)::int AS count FROM agent_tasks WHERE task_id=${task.taskId}`;
    if (Number(remaining[0]?.count || 0) !== 0) throw new Error("DEVAPI_DB_FIXTURE_CLEANUP_FAILED");
    if (evidence) evidence.cleanupVerified = true;
  }
  console.log(`DEVAPI_DB_RUNTIME_SMOKE_PASS migration=${evidence.migration.state} events=${evidence.task.eventCount} approval=${evidence.approval.state} rollback=verified cleanup=verified`);
}
await writeFile(output, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
