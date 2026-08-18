import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";

let source = await readFile("scripts/apply-v014-core9.mjs", "utf8");
const before = 'database = replaceExact(database, dbBefore, dbAfter, "database-schema7");';
const after = `{
  const migrationStart = database.indexOf("  #migrate(): void {");
  const migrationEnd = database.indexOf("\\n  public integrityCheck", migrationStart);
  if (migrationStart < 0 || migrationEnd < 0 || migrationEnd <= migrationStart) throw new Error("V014_CORE10_DATABASE_MIGRATION_SCOPE_INVALID");
  const migration = database.slice(migrationStart, migrationEnd);
  const at = migration.indexOf(dbBefore);
  if (at < 0 || at !== migration.lastIndexOf(dbBefore)) throw new Error("V014_CORE10_DATABASE_MIGRATION_ANCHOR_INVALID");
  database = database.slice(0, migrationStart) + migration.slice(0, at) + dbAfter + migration.slice(at + dbBefore.length) + database.slice(migrationEnd);
}`;
const at = source.indexOf(before);
if (at < 0 || at !== source.lastIndexOf(before)) throw new Error("V014_CORE10_WRAPPER_ANCHOR_INVALID");
source = source.slice(0, at) + after + source.slice(at + before.length);
const temporary = path.resolve("scripts/.apply-v014-core10-runtime.mjs");
await writeFile(temporary, source, "utf8");
await import(`${pathToFileURL(temporary).href}?run=${Date.now()}`);
