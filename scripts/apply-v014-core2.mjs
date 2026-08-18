import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";

const sourcePath = path.resolve("scripts/apply-v014-core.mjs");
let source = await readFile(sourcePath, "utf8");
const before = `  public integrityCheck()`;
const after = `  public integrityCheck(): { ok: boolean; detail: string; schemaVersion: number }`;
const first = source.indexOf(before);
if (first < 0 || first !== source.lastIndexOf(before)) throw new Error("V014_CORE_FIX_INTEGRITY_ANCHOR_INVALID");
source = source.slice(0, first) + after + source.slice(first + before.length);
const temporary = path.resolve("scripts/.apply-v014-core2-runtime.mjs");
await writeFile(temporary, source, "utf8");
await import(`${pathToFileURL(temporary).href}?run=${Date.now()}`);
