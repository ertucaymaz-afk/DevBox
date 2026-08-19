import { neon } from "@neondatabase/serverless";
import { randomUUID } from "node:crypto";
import { assertTaskTransition, isTaskState, normalizeTaskInput } from "../agent/task-state.mjs";

let schemaReady = null;

function connectionString() {
  const value = String(process.env.DATABASE_URL ?? "").trim();
  if (!value) throw new Error("DATABASE_UNCONFIGURED");
  return value;
}
function sql() { return neon(connectionString()); }
function json(value) { return JSON.stringify(value ?? {}); }

export async function ensureAgentSchema() {
  if (schemaReady) return await schemaReady;
  schemaReady = (async () => {
    const query = sql();
    await query`CREATE TABLE IF NOT EXISTS agent_tasks (
      task_id UUID PRIMARY KEY,
      title TEXT NOT NULL,
      request TEXT NOT NULL,
      risk_class TEXT NOT NULL CHECK (risk_class IN ('R0','R1','R2','R3','R4')),
      state TEXT NOT NULL,
      source_repo TEXT NOT NULL,
      source_ref TEXT NOT NULL,
      source_sha TEXT NOT NULL,
      workspace_id UUID,
      assigned_agents JSONB NOT NULL DEFAULT '[]'::jsonb,
      blocker TEXT,
      result JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      started_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ
    )`;
    await query`CREATE INDEX IF NOT EXISTS agent_tasks_state_updated_idx ON agent_tasks(state, updated_at DESC)`;
    await query`CREATE TABLE IF NOT EXISTS agent_task_events (
      sequence BIGSERIAL PRIMARY KEY,
      event_id UUID NOT NULL UNIQUE,
      task_id UUID NOT NULL REFERENCES agent_tasks(task_id) ON DELETE CASCADE,
      from_state TEXT,
      to_state TEXT NOT NULL,
      actor TEXT NOT NULL,
      detail JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
    await query`CREATE INDEX IF NOT EXISTS agent_task_events_task_sequence_idx ON agent_task_events(task_id, sequence ASC)`;
    await query`CREATE TABLE IF NOT EXISTS agent_sessions (
      session_id UUID PRIMARY KEY,
      task_id UUID NOT NULL REFERENCES agent_tasks(task_id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      provider_session_ref TEXT,
      state TEXT NOT NULL,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
    await query`CREATE TABLE IF NOT EXISTS agent_tool_calls (
      tool_call_id UUID PRIMARY KEY,
      task_id UUID NOT NULL REFERENCES agent_tasks(task_id) ON DELETE CASCADE,
      session_id UUID REFERENCES agent_sessions(session_id) ON DELETE SET NULL,
      tool_id TEXT NOT NULL,
      risk_class TEXT NOT NULL,
      state TEXT NOT NULL,
      input_digest TEXT,
      output_digest TEXT,
      error_code TEXT,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ
    )`;
    await query`CREATE TABLE IF NOT EXISTS agent_approvals (
      approval_id UUID PRIMARY KEY,
      task_id UUID NOT NULL REFERENCES agent_tasks(task_id) ON DELETE CASCADE,
      tool_call_id UUID REFERENCES agent_tool_calls(tool_call_id) ON DELETE SET NULL,
      approval_type TEXT NOT NULL,
      state TEXT NOT NULL,
      approved_by TEXT,
      reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      decided_at TIMESTAMPTZ
    )`;
    await query`CREATE TABLE IF NOT EXISTS agent_workspaces (
      workspace_id UUID PRIMARY KEY,
      task_id UUID NOT NULL REFERENCES agent_tasks(task_id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      provider_ref TEXT,
      source_sha TEXT NOT NULL,
      branch_name TEXT,
      state TEXT NOT NULL,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      destroyed_at TIMESTAMPTZ
    )`;
    await query`CREATE TABLE IF NOT EXISTS agent_artifacts (
      artifact_id UUID PRIMARY KEY,
      task_id UUID NOT NULL REFERENCES agent_tasks(task_id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      digest TEXT NOT NULL,
      location TEXT,
      bytes BIGINT,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
    await query`CREATE TABLE IF NOT EXISTS agent_evidence (
      evidence_id UUID PRIMARY KEY,
      task_id UUID NOT NULL REFERENCES agent_tasks(task_id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      source_sha TEXT NOT NULL,
      runtime TEXT,
      tool TEXT,
      state TEXT NOT NULL,
      digest TEXT NOT NULL,
      artifact_id UUID REFERENCES agent_artifacts(artifact_id) ON DELETE SET NULL,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      started_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
    await query`CREATE INDEX IF NOT EXISTS agent_evidence_task_created_idx ON agent_evidence(task_id, created_at DESC)`;
  })();
  try { await schemaReady; }
  catch (error) { schemaReady = null; throw error; }
}

export async function createAgentTask(input, { riskClass, assignedAgents = [] } = {}) {
  await ensureAgentSchema();
  const normalized = normalizeTaskInput(input);
  if (!/^R[0-4]$/u.test(String(riskClass ?? ""))) throw new Error("TASK_RISK_INVALID");
  const taskId = randomUUID();
  const query = sql();
  const agentsJson = json(Array.isArray(assignedAgents) ? assignedAgents.slice(0, 16).map((x) => String(x).slice(0, 80)) : []);
  const eventId = randomUUID();
  const rows = await query.transaction([
    query`INSERT INTO agent_tasks(task_id,title,request,risk_class,state,source_repo,source_ref,source_sha,assigned_agents)
      VALUES (${taskId},${normalized.title},${normalized.request},${riskClass},'CREATED',${normalized.sourceRepo},${normalized.sourceRef},${normalized.sourceSha},${agentsJson}::jsonb)
      RETURNING task_id AS "taskId", title, request, risk_class AS "riskClass", state, source_repo AS "sourceRepo", source_ref AS "sourceRef", source_sha AS "sourceSha", workspace_id AS "workspaceId", assigned_agents AS "assignedAgents", blocker, result, created_at AS "createdAt", updated_at AS "updatedAt", started_at AS "startedAt", completed_at AS "completedAt"`,
    query`INSERT INTO agent_task_events(event_id,task_id,from_state,to_state,actor,detail)
      VALUES (${eventId},${taskId},NULL,'CREATED','task-intake','{}'::jsonb)`
  ]);
  return rows[0]?.[0];
}

export async function listAgentTasks(limit = 50) {
  await ensureAgentSchema();
  const safe = Math.max(1, Math.min(100, Math.trunc(Number(limit) || 50)));
  return await sql().query(
    `SELECT task_id AS "taskId", title, risk_class AS "riskClass", state, source_repo AS "sourceRepo", source_ref AS "sourceRef", source_sha AS "sourceSha", workspace_id AS "workspaceId", assigned_agents AS "assignedAgents", blocker, result, created_at AS "createdAt", updated_at AS "updatedAt", started_at AS "startedAt", completed_at AS "completedAt" FROM agent_tasks ORDER BY updated_at DESC LIMIT $1`,
    [safe]
  );
}

export async function getAgentTask(taskId) {
  await ensureAgentSchema();
  const id = String(taskId ?? "").trim();
  if (!/^[0-9a-f-]{36}$/iu.test(id)) throw new Error("TASK_ID_INVALID");
  const query = sql();
  const [tasks, events, evidence] = await Promise.all([
    query`SELECT task_id AS "taskId", title, request, risk_class AS "riskClass", state, source_repo AS "sourceRepo", source_ref AS "sourceRef", source_sha AS "sourceSha", workspace_id AS "workspaceId", assigned_agents AS "assignedAgents", blocker, result, created_at AS "createdAt", updated_at AS "updatedAt", started_at AS "startedAt", completed_at AS "completedAt" FROM agent_tasks WHERE task_id=${id} LIMIT 1`,
    query`SELECT sequence, event_id AS "eventId", from_state AS "fromState", to_state AS "toState", actor, detail, created_at AS "createdAt" FROM agent_task_events WHERE task_id=${id} ORDER BY sequence ASC LIMIT 500`,
    query`SELECT evidence_id AS "evidenceId", type, source_sha AS "sourceSha", runtime, tool, state, digest, artifact_id AS "artifactId", metadata, started_at AS "startedAt", completed_at AS "completedAt", created_at AS "createdAt" FROM agent_evidence WHERE task_id=${id} ORDER BY created_at DESC LIMIT 200`
  ]);
  if (!tasks[0]) throw new Error("TASK_NOT_FOUND");
  return { task: tasks[0], events, evidence };
}

export async function transitionAgentTask({ taskId, toState, actor = "orchestrator", detail = {}, blocker = null, result = null }) {
  await ensureAgentSchema();
  const id = String(taskId ?? "").trim();
  const target = String(toState ?? "").trim();
  if (!isTaskState(target)) throw new Error("TASK_STATE_INVALID_TO");
  const query = sql();
  const currentRows = await query`SELECT state FROM agent_tasks WHERE task_id=${id} LIMIT 1`;
  if (!currentRows[0]) throw new Error("TASK_NOT_FOUND");
  const fromState = String(currentRows[0].state);
  assertTaskTransition(fromState, target);
  const terminal = new Set(["COMPLETED","BLOCKED","BLOCKED_EXTERNAL","FAILED","CANCELLED","TIMED_OUT","ROLLED_BACK","REJECTED"]).has(target);
  const eventId = randomUUID();
  const detailJson = json(detail);
  const resultJson = result === null ? null : json(result);
  const tx = await query.transaction([
    query.query(
      `UPDATE agent_tasks SET state=$2, blocker=$3, result=CASE WHEN $4::text IS NULL THEN result ELSE $4::jsonb END, started_at=CASE WHEN started_at IS NULL AND $2 NOT IN ('CREATED','TRIAGED') THEN NOW() ELSE started_at END, completed_at=CASE WHEN $5 THEN NOW() ELSE completed_at END, updated_at=NOW() WHERE task_id=$1 RETURNING task_id AS "taskId", state, updated_at AS "updatedAt", completed_at AS "completedAt"`,
      [id, target, blocker ? String(blocker).slice(0, 1000) : null, resultJson, terminal]
    ),
    query`INSERT INTO agent_task_events(event_id,task_id,from_state,to_state,actor,detail) VALUES (${eventId},${id},${fromState},${target},${String(actor).slice(0,120)},${detailJson}::jsonb)`
  ]);
  return tx[0]?.[0];
}

export async function appendAgentEvidence(input = {}) {
  await ensureAgentSchema();
  const taskId = String(input.taskId ?? "").trim();
  const type = String(input.type ?? "").trim().toUpperCase();
  const sourceSha = String(input.sourceSha ?? "").trim().toLowerCase();
  const state = String(input.state ?? "").trim().toUpperCase();
  const digest = String(input.digest ?? "").trim().toLowerCase();
  if (!/^[0-9a-f-]{36}$/iu.test(taskId)) throw new Error("TASK_ID_INVALID");
  if (!/^(REPO|RESEARCH|PATCH|SHELL|TEST|CONTRACT|SECURITY|BROWSER|PREVIEW|CANARY|PRODUCTION|ROLLBACK)$/u.test(type)) throw new Error("EVIDENCE_TYPE_INVALID");
  if (!/^[0-9a-f]{40}$/u.test(sourceSha)) throw new Error("EVIDENCE_SOURCE_SHA_INVALID");
  if (!/^[a-z0-9_-]{3,40}$/iu.test(state)) throw new Error("EVIDENCE_STATE_INVALID");
  if (!/^[0-9a-f]{64}$/u.test(digest)) throw new Error("EVIDENCE_DIGEST_INVALID");
  const evidenceId = randomUUID();
  const metadataJson = json(input.metadata);
  const rows = await sql()`INSERT INTO agent_evidence(evidence_id,task_id,type,source_sha,runtime,tool,state,digest,metadata,started_at,completed_at)
    VALUES (${evidenceId},${taskId},${type},${sourceSha},${input.runtime ? String(input.runtime).slice(0,120) : null},${input.tool ? String(input.tool).slice(0,120) : null},${state},${digest},${metadataJson}::jsonb,${input.startedAt || null},${input.completedAt || null})
    RETURNING evidence_id AS "evidenceId", task_id AS "taskId", type, state, digest, created_at AS "createdAt"`;
  return rows[0];
}
