import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";

let source = await readFile("scripts/apply-v014-core.mjs", "utf8");
function exact(before, after, label) {
  const first = source.indexOf(before);
  if (first < 0 || first !== source.lastIndexOf(before)) throw new Error(`V014_CORE3_ANCHOR_INVALID:${label}`);
  source = source.slice(0, first) + after + source.slice(first + before.length);
}
exact(
  "  public integrityCheck()`, `    if (version < 7) {",
  "  public integrityCheck(): { ok: boolean; detail: string; schemaVersion: number }`, `    if (version < 7) {",
  "schema7-before-signature"
);
exact(
  "  public integrityCheck()`],\n  [\"memory-methods\"",
  "  public integrityCheck(): { ok: boolean; detail: string; schemaVersion: number }`],\n  [\"memory-methods\"",
  "schema7-after-signature"
);
const temporary = path.resolve("scripts/.apply-v014-core3-runtime.mjs");
await writeFile(temporary, source, "utf8");
await import(`${pathToFileURL(temporary).href}?run=${Date.now()}`);
