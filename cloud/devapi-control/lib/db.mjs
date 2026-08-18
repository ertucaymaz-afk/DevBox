import { neon } from "@neondatabase/serverless";

let schemaReady = null;

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
    await query`CREATE TABLE IF NOT EXISTS devbox_projects (
      project_id TEXT PRIMARY KEY,
      project_name TEXT NOT NULL,
      latest_snapshot JSONB NOT NULL,
      instance_id TEXT NOT NULL,
      captured_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
    await query`CREATE TABLE IF NOT EXISTS devbox_snapshot_history (
      id BIGSERIAL PRIMARY KEY,
      project_id TEXT NOT NULL,
      snapshot JSONB NOT NULL,
      instance_id TEXT NOT NULL,
      captured_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
    await query`CREATE INDEX IF NOT EXISTS devbox_snapshot_history_project_time_idx ON devbox_snapshot_history(project_id, captured_at DESC)`;
    await query`CREATE TABLE IF NOT EXISTS devbox_commands (
      sequence BIGSERIAL PRIMARY KEY,
      id UUID NOT NULL UNIQUE,
      project_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
    await query`CREATE INDEX IF NOT EXISTS devbox_commands_project_sequence_idx ON devbox_commands(project_id, sequence ASC)`;
  })();
  try { await schemaReady; }
  catch (error) { schemaReady = null; throw error; }
}

export async function saveSnapshot({ projectId, projectName, snapshot, instanceId, capturedAt }) {
  await ensureSchema();
  const query = sql();
  const json = JSON.stringify(snapshot);
  await query.transaction([
    query`INSERT INTO devbox_projects(project_id, project_name, latest_snapshot, instance_id, captured_at, updated_at)
      VALUES (${projectId}, ${projectName}, ${json}::jsonb, ${instanceId}, ${capturedAt}, NOW())
      ON CONFLICT(project_id) DO UPDATE SET project_name=EXCLUDED.project_name, latest_snapshot=EXCLUDED.latest_snapshot, instance_id=EXCLUDED.instance_id, captured_at=EXCLUDED.captured_at, updated_at=NOW()`,
    query`INSERT INTO devbox_snapshot_history(project_id, snapshot, instance_id, captured_at) VALUES (${projectId}, ${json}::jsonb, ${instanceId}, ${capturedAt})`
  ]);
  await query`DELETE FROM devbox_snapshot_history WHERE id IN (
    SELECT id FROM devbox_snapshot_history WHERE project_id=${projectId} ORDER BY captured_at DESC OFFSET 500
  )`;
}

export async function getProjectState(projectId) {
  await ensureSchema();
  const query = sql();
  const [current, history, recentCommands] = await Promise.all([
    query`SELECT project_id, project_name, latest_snapshot, instance_id, captured_at, updated_at FROM devbox_projects WHERE project_id=${projectId} LIMIT 1`,
    query`SELECT captured_at, snapshot->'evolution'->>'lifetimeLevel' AS level, snapshot->'evolution'->>'score' AS score, snapshot->'findings'->>'open' AS open_findings, snapshot->'findings'->>'blocking' AS blocking_findings FROM devbox_snapshot_history WHERE project_id=${projectId} ORDER BY captured_at DESC LIMIT 80`,
    query`SELECT sequence, id, kind, payload, created_at FROM devbox_commands WHERE project_id=${projectId} ORDER BY sequence DESC LIMIT 80`
  ]);
  return { current: current[0] ?? null, history, commands: recentCommands };
}

export async function listCommands(projectId, after, limit = 100) {
  await ensureSchema();
  const query = sql();
  const safeAfter = Math.max(0, Number.isFinite(Number(after)) ? Math.trunc(Number(after)) : 0);
  const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
  return await query.query("SELECT sequence, id, project_id AS \"projectId\", kind, payload, created_at AS \"createdAt\" FROM devbox_commands WHERE project_id=$1 AND sequence>$2 ORDER BY sequence ASC LIMIT $3", [projectId, safeAfter, safeLimit]);
}

export async function insertCommand({ id, projectId, kind, payload }) {
  await ensureSchema();
  const query = sql();
  const json = JSON.stringify(payload ?? {});
  const rows = await query`INSERT INTO devbox_commands(id, project_id, kind, payload) VALUES (${id}, ${projectId}, ${kind}, ${json}::jsonb) RETURNING sequence, id, project_id AS "projectId", kind, payload, created_at AS "createdAt"`;
  return rows[0];
}
