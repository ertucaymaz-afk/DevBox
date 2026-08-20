import { createHash } from "node:crypto";
import { neon } from "@neondatabase/serverless";

function connectionString() {
  const value = String(process.env.DATABASE_URL ?? "").trim();
  if (!value) throw new Error("DATABASE_UNCONFIGURED");
  return value;
}
function sql() { return neon(connectionString()); }
function validVersion(value) {
  const version = String(value ?? "").trim();
  if (!/^[0-9]{3}_[a-z0-9_-]{3,80}$/u.test(version)) throw new Error("MIGRATION_VERSION_INVALID");
  return version;
}
export function migrationChecksum(payload) {
  return createHash("sha256").update(String(payload ?? "")).digest("hex");
}

export async function ensureMigrationLedger() {
  const query = sql();
  await query`CREATE TABLE IF NOT EXISTS devapi_schema_migrations (
    version TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    checksum TEXT NOT NULL CHECK (char_length(checksum)=64),
    source_sha TEXT NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
}

export async function recordMigration({ version, name, checksum, sourceSha }) {
  await ensureMigrationLedger();
  const v = validVersion(version);
  const n = String(name ?? "").trim().slice(0, 160);
  const digest = String(checksum ?? "").trim().toLowerCase();
  const sha = String(sourceSha ?? "").trim().toLowerCase();
  if (!n) throw new Error("MIGRATION_NAME_INVALID");
  if (!/^[0-9a-f]{64}$/u.test(digest)) throw new Error("MIGRATION_CHECKSUM_INVALID");
  if (!/^[0-9a-f]{40}$/u.test(sha)) throw new Error("MIGRATION_SOURCE_SHA_INVALID");
  const query = sql();
  const existing = await query`SELECT version, checksum, source_sha AS "sourceSha", applied_at AS "appliedAt" FROM devapi_schema_migrations WHERE version=${v} LIMIT 1`;
  if (existing[0]) {
    if (existing[0].checksum !== digest) throw new Error("MIGRATION_CHECKSUM_DRIFT");
    return { ...existing[0], state: "ALREADY_APPLIED" };
  }
  const rows = await query`INSERT INTO devapi_schema_migrations(version,name,checksum,source_sha)
    VALUES (${v},${n},${digest},${sha})
    RETURNING version,name,checksum,source_sha AS "sourceSha",applied_at AS "appliedAt"`;
  return { ...rows[0], state: "APPLIED" };
}

export async function listMigrations(limit = 100) {
  await ensureMigrationLedger();
  const safe = Math.max(1, Math.min(500, Math.trunc(Number(limit) || 100)));
  return await sql().query("SELECT version,name,checksum,source_sha AS \"sourceSha\",applied_at AS \"appliedAt\" FROM devapi_schema_migrations ORDER BY applied_at ASC LIMIT $1", [safe]);
}
