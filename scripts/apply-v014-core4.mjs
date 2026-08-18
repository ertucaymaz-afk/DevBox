import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";

let source = await readFile("scripts/apply-v014-core.mjs", "utf8");
const start = source.indexOf('  ["schema7", `');
const end = source.indexOf('  ["memory-methods",', start);
if (start < 0 || end < 0 || end <= start) throw new Error("V014_CORE4_SCHEMA7_BLOCK_MISSING");
let block = source.slice(start, end);
const signature = "  public integrityCheck()";
const occurrences = block.split(signature).length - 1;
if (occurrences !== 2) throw new Error(`V014_CORE4_SCHEMA7_SIGNATURE_COUNT:${occurrences}`);
block = block.replaceAll(signature, "  public integrityCheck(): { ok: boolean; detail: string; schemaVersion: number }");
source = source.slice(0, start) + block + source.slice(end);
const temporary = path.resolve("scripts/.apply-v014-core4-runtime.mjs");
await writeFile(temporary, source, "utf8");
await import(`${pathToFileURL(temporary).href}?run=${Date.now()}`);
