import { neon } from "@neondatabase/serverless";

let schemaReady = null;

const TERMINAL_COMMAND_STATES = new Set(["APPLIED", "FAILED"]);
const COMMAND_RETENTION_DAYS = 90;
const COMMAND_RETENTION_COUNT = 2_000;

function connectionString() {
  const value = process.env.DATABASE_URL?.trim();
  if (!value) throw new Error("DATABASE_UNCONFIGURED");
  return value;
}
function sql() { return neon(connectionString()); }

export async function ensureSchema() {
  if (schemaReady) return await schemaReady;
  schemaReady = (async () => {
    const query = sql();
    await query`CREATE TABLE IF NOT EXISTS devbox_project_state (
      project_id TEXT PRIMARY KEY,
      project_name TEXT NOT NULL,
      latest_snapshot JSONB NOT NULL,
      instance_id TEXT NOT NULL,
      captured_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
    await query`CREATE TABLE IF NOT EXISTS devbox_project_state_history (
      id BIGSERIAL PRIMARY KEY,
      project_id TEXT NOT NULL,
      snapshot JSONB NOT NULL,
      instance_id TEXT NOT NULL,
      captured_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
    await query`CREATE INDEX IF NOT EXISTS devbox_project_state_history_project_time_idx ON devbox_project_state_history(project_id, captured_at DESC)`;
    await query`CREATE TABLE IF NOT EXISTS devbox_control_commands (
      sequence BIGSERIAL PRIMARY KEY,
      id UUID NOT NULL UNIQUE,
      project_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      apply_status TEXT NOT NULL DEFAULT 'PENDING',
      apply_detail TEXT,
      applied_at TIMESTAMPTZ,
      applied_instance_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
    await query`ALTER TABLE devbox_control_commands ADD COLUMN IF NOT EXISTS apply_status TEXT NOT NULL DEFAULT 'PENDING'`;
    await query`ALTER TABLE devbox_control_commands ADD COLUMN IF NOT EXISTS apply_detail TEXT`;
    await query`ALTER TABLE devbox_control_commands ADD COLUMN IF NOT EXISTS applied_at TIMESTAMPTZ`;
    await query`ALTER TABLE devbox_control_commands ADD COLUMN IF NOT EXISTS applied_instance_id TEXT`;
    await query`CREATE INDEX IF NOT EXISTS devbox_control_commands_project_sequence_idx ON devbox_control_commands(project_id, sequence ASC)`;
    await query`CREATE INDEX IF NOT EXISTS devbox_control_commands_project_status_idx ON devbox_control_commands(project_id, apply_status, sequence ASC)`;
  })();
  try { await schemaReady; }
  catch (error) { schemaReady = null; throw error; }
}

async function pruneCommands(projectId) {
  const query = sql();
  await query.query(
    `DELETE FROM devbox_control_commands
      WHERE project_id=$1
        AND apply_status IN ('APPLIED','FAILED')
        AND created_at < NOW() - ($2 * INTERVAL '1 day')`,
    [projectId, COMMAND_RETENTION_DAYS]
  );
  await query.query(
    `DELETE FROM devbox_control_commands WHERE sequence IN (
      SELECT sequence FROM devbox_control_commands
      WHERE project_id=$1 AND apply_status IN ('APPLIED','FAILED')
      ORDER BY sequence DESC OFFSET $2
    )`,
    [projectId, COMMAND_RETENTION_COUNT]
  );
}

export async function saveSnapshot({ projectId, projectName, snapshot, instanceId, capturedAt }) {
  await ensureSchema();
  const query = sql();
  const json = JSON.stringify(snapshot);
  await query.transaction([
    query`INSERT INTO devbox_project_state(project_id, project_name, latest_snapshot, instance_id, captured_at, updated_at)
      VALUES (${projectId}, ${projectName}, ${json}::jsonb, ${instanceId}, ${capturedAt}, NOW())
      ON CONFLICT(project_id) DO UPDATE SET project_name=EXCLUDED.project_name, latest_snapshot=EXCLUDED.latest_snapshot, instance_id=EXCLUDED.instance_id, captured_at=EXCLUDED.captured_at, updated_at=NOW()`,
    query`INSERT INTO devbox_project_state_history(project_id, snapshot, instance_id, captured_at) VALUES (${projectId}, ${json}::jsonb, ${instanceId}, ${capturedAt})`
  ]);
  await query`DELETE FROM devbox_project_state_history WHERE id IN (
    SELECT id FROM devbox_project_state_history WHERE project_id=${projectId} ORDER BY captured_at DESC OFFSET 500
  )`;
}

export async function listProjects(limit = 100) {
  await ensureSchema();
  const query = sql();
  const safeLimit = Math.max(1, Math.min(100, Math.trunc(Number(limit) || 100)));
  return await query.query(
    `SELECT
      project_id AS "projectId",
      project_name AS "projectName",
      instance_id AS "instanceId",
      captured_at AS "capturedAt",
      updated_at AS "updatedAt",
      latest_snapshot->'evolution'->>'lifetimeLevel' AS "level",
      latest_snapshot->'evolution'->>'score' AS "score",
      latest_snapshot->'findings'->>'open' AS "openFindings",
      latest_snapshot->'findings'->>'blocking' AS "blockingFindings",
      latest_snapshot->'releaseGate'->>'state' AS "releaseGateState"
    FROM devbox_project_state
    ORDER BY updated_at DESC
    LIMIT $1`,
    [safeLimit]
  );
}

export async function getProjectState(projectId) {
  await ensureSchema();
  const query = sql();
  const [current, history, recentCommands] = await Promise.all([
    query`SELECT project_id, project_name, latest_snapshot, instance_id, captured_at, updated_at FROM devbox_project_state WHERE project_id=${projectId} LIMIT 1`,
    query`SELECT captured_at, snapshot->'evolution'->>'lifetimeLevel' AS level, snapshot->'evolution'->>'score' AS score, snapshot->'findings'->>'open' AS open_findings, snapshot->'findings'->>'blocking' AS blocking_findings FROM devbox_project_state_history WHERE project_id=${projectId} ORDER BY captured_at DESC LIMIT 80`,
    query`SELECT sequence, id, kind, payload, apply_status, apply_detail, applied_at, applied_instance_id, created_at FROM devbox_control_commands WHERE project_id=${projectId} ORDER BY sequence DESC LIMIT 120`
  ]);
  return { current: current[0] ?? null, history, commands: recentCommands };
}

export async function listCommands(projectId, after, limit = 100) {
  await ensureSchema();
  const query = sql();
  const safeAfter = Math.max(0, Number.isFinite(Number(after)) ? Math.trunc(Number(after)) : 0);
  const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
  return await query.query(
    `SELECT sequence, id, project_id AS "projectId", kind, payload, apply_status AS "applyStatus", apply_detail AS "applyDetail", applied_at AS "appliedAt", created_at AS "createdAt"
      FROM devbox_control_commands
      WHERE project_id=$1 AND sequence>$2 AND apply_status IN ('PENDING','RETRYING')
      ORDER BY sequence ASC LIMIT $3`,
    [projectId, safeAfter, safeLimit]
  );
}

export async function insertCommand({ id, projectId, kind, payload }) {
  await ensureSchema();
  const query = sql();
  const json = JSON.stringify(payload ?? {});
  const rows = await query`INSERT INTO devbox_control_commands(id, project_id, kind, payload) VALUES (${id}, ${projectId}, ${kind}, ${json}::jsonb) RETURNING sequence, id, project_id AS "projectId", kind, payload, apply_status AS "applyStatus", created_at AS "createdAt"`;
  return rows[0];
}

export async function ackCommand({ id, projectId, sequence, status, detail, instanceId }) {
  await ensureSchema();
  if (!["APPLIED", "RETRYING", "FAILED"].includes(status)) throw new Error("COMMAND_ACK_STATUS_INVALID");
  const query = sql();
  const terminal = TERMINAL_COMMAND_STATES.has(status);
  const rows = await query.query(
    `UPDATE devbox_control_commands
      SET apply_status=$4,
          apply_detail=$5,
          applied_at=CASE WHEN $6 THEN NOW() ELSE NULL END,
          applied_instance_id=$7
      WHERE id=$1 AND project_id=$2 AND sequence=$3
      RETURNING sequence, id, project_id AS "projectId", kind, payload, apply_status AS "applyStatus", apply_detail AS "applyDetail", applied_at AS "appliedAt", applied_instance_id AS "appliedInstanceId", created_at AS "createdAt"`,
    [id, projectId, sequence, status, detail || null, terminal, instanceId]
  );
  if (!rows[0]) throw new Error("COMMAND_ACK_NOT_FOUND");
  if (terminal) await pruneCommands(projectId);
  return rows[0];
}
