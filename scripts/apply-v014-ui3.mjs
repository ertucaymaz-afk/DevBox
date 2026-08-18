import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";

let source = await readFile("scripts/apply-v014-ui2.mjs", "utf8");
const before = 'activePendingTurns > 1 ? \\`DevBox yanıt üretiyor · ${activePendingTurns - 1} ek istek aynı sohbet kuyruğunda\\` : "DevBox yanıt hazırlıyor…"';
const after = 'activePendingTurns > 1 ? "DevBox yanıt üretiyor · " + (activePendingTurns - 1) + " ek istek aynı sohbet kuyruğunda" : "DevBox yanıt hazırlıyor…"';
const at = source.indexOf(before);
if (at < 0 || at !== source.lastIndexOf(before)) throw new Error("V014_UI3_NESTED_TEMPLATE_ANCHOR_INVALID");
source = source.slice(0, at) + after + source.slice(at + before.length);
const temporary = path.resolve("scripts/.apply-v014-ui3-runtime.mjs");
await writeFile(temporary, source, "utf8");
await import(`${pathToFileURL(temporary).href}?run=${Date.now()}`);
