import { randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { ensureAgentSchema } from "./agent-store.mjs";

function connectionString() {
  const value = String(process.env.DATABASE_URL ?? "").trim();
  if (!value) throw new Error("DATABASE_UNCONFIGURED");
  return value;
}
function sql() { return neon(connectionString()); }
function uuid(value, code) {
  const id = String(value ?? "").trim();
  if (!/^[0-9a-f-]{36}$/iu.test(id)) throw new Error(code);
  return id;
}
function risk(value) {
  const v = String(value ?? "").trim().toUpperCase();
  if (!/^R[0-4]$/u.test(v)) throw new Error("APPROVAL_RISK_INVALID");
  return v;
}
function scopeJson(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("APPROVAL_SCOPE_INVALID");
  const text = JSON.stringify(value);
  if (Buffer.byteLength(text) > 16_384) throw new Error("APPROVAL_SCOPE_TOO_LARGE");
  return text;
}

export async function ensureApprovalSchema() {
  await ensureAgentSchema();
  const query = sql();
  await query`ALTER TABLE agent_approvals ADD COLUMN IF NOT EXISTS risk_class TEXT`;
  await query`ALTER TABLE agent_approvals ADD COLUMN IF NOT EXISTS action TEXT`;
  await query`ALTER TABLE agent_approvals ADD COLUMN IF NOT EXISTS scope JSONB`;
  await query`ALTER TABLE agent_approvals ADD COLUMN IF NOT EXISTS requested_by TEXT`;
  await query`ALTER TABLE agent_approvals ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ`;
  await query`CREATE INDEX IF NOT EXISTS agent_approvals_task_state_idx ON agent_approvals(task_id,state,created_at DESC)`;
}

export async function createApproval(input = {}) {
  await ensureApprovalSchema();
  const taskId = uuid(input.taskId, "TASK_ID_INVALID");
  const toolCallId = input.toolCallId ? uuid(input.toolCallId, "TOOL_CALL_ID_INVALID") : null;
  const riskClass = risk(input.riskClass);
  const action = String(input.action ?? "").trim().slice(0, 160);
  const requestedBy = String(input.requestedBy ?? "orchestrator").trim().slice(0, 120);
  const reason = String(input.reason ?? "").trim().slice(0, 1200) || null;
  if (!action) throw new Error("APPROVAL_ACTION_INVALID");
  const scope = scopeJson(input.scope);
  const ttlMs = Math.max(60_000, Math.min(86_400_000, Number(input.ttlMs) || 900_000));
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();
  const approvalId = randomUUID();
  const rows = await sql()`INSERT INTO agent_approvals(
      approval_id,task_id,tool_call_id,approval_type,state,risk_class,action,scope,requested_by,reason,expires_at
    ) VALUES (
      ${approvalId},${taskId},${toolCallId},'MUTATION','REQUESTED',${riskClass},${action},${scope}::jsonb,${requestedBy},${reason},${expiresAt}
    ) RETURNING approval_id AS "approvalId",task_id AS "taskId",tool_call_id AS "toolCallId",approval_type AS "approvalType",state,risk_class AS "riskClass",action,scope,requested_by AS "requestedBy",reason,created_at AS "requestedAt",expires_at AS "expiresAt"`;
  return rows[0];
}

export async function listApprovals({ taskId = null, limit = 50 } = {}) {
  await ensureApprovalSchema();
  const safe = Math.max(1, Math.min(100, Math.trunc(Number(limit) || 50)));
  if (taskId) {
    const id = uuid(taskId, "TASK_ID_INVALID");
    return await sql().query(`SELECT approval_id AS "approvalId",task_id AS "taskId",tool_call_id AS "toolCallId",approval_type AS "approvalType",state,risk_class AS "riskClass",action,scope,requested_by AS "requestedBy",approved_by AS "decidedBy",reason,created_at AS "requestedAt",decided_at AS "decidedAt",expires_at AS "expiresAt" FROM agent_approvals WHERE task_id=$1 ORDER BY created_at DESC LIMIT $2`, [id, safe]);
  }
  return await sql().query(`SELECT approval_id AS "approvalId",task_id AS "taskId",tool_call_id AS "toolCallId",approval_type AS "approvalType",state,risk_class AS "riskClass",action,scope,requested_by AS "requestedBy",approved_by AS "decidedBy",reason,created_at AS "requestedAt",decided_at AS "decidedAt",expires_at AS "expiresAt" FROM agent_approvals ORDER BY created_at DESC LIMIT $1`, [safe]);
}

export async function decideApproval({ approvalId, taskId, decision, decidedBy, reason = null }) {
  await ensureApprovalSchema();
  const id = uuid(approvalId, "APPROVAL_ID_INVALID");
  const task = uuid(taskId, "TASK_ID_INVALID");
  const state = String(decision ?? "").trim().toUpperCase();
  if (!/^(APPROVED|REJECTED|CANCELLED)$/u.test(state)) throw new Error("APPROVAL_DECISION_INVALID");
  const actor = String(decidedBy ?? "").trim().slice(0, 120);
  if (!actor) throw new Error("APPROVAL_DECIDER_REQUIRED");
  const query = sql();
  const rows = await query`SELECT approval_id AS "approvalId",task_id AS "taskId",state,expires_at AS "expiresAt" FROM agent_approvals WHERE approval_id=${id} LIMIT 1`;
  const current = rows[0];
  if (!current) throw new Error("APPROVAL_NOT_FOUND");
  if (current.taskId !== task) throw new Error("APPROVAL_TASK_MISMATCH");
  if (current.state !== "REQUESTED") throw new Error("APPROVAL_REPLAY_DENIED");
  if (current.expiresAt && new Date(current.expiresAt).getTime() <= Date.now()) {
    await query`UPDATE agent_approvals SET state='EXPIRED',decided_at=NOW() WHERE approval_id=${id} AND state='REQUESTED'`;
    throw new Error("APPROVAL_EXPIRED");
  }
  const updated = await query`UPDATE agent_approvals SET state=${state},approved_by=${actor},reason=COALESCE(${reason ? String(reason).slice(0,1200) : null},reason),decided_at=NOW() WHERE approval_id=${id} AND task_id=${task} AND state='REQUESTED' RETURNING approval_id AS "approvalId",task_id AS "taskId",state,risk_class AS "riskClass",action,scope,requested_by AS "requestedBy",approved_by AS "decidedBy",reason,created_at AS "requestedAt",decided_at AS "decidedAt",expires_at AS "expiresAt"`;
  if (!updated[0]) throw new Error("APPROVAL_REPLAY_DENIED");
  return updated[0];
}
