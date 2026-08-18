import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";

let source = await readFile("scripts/apply-v014-core12.mjs", "utf8");
const replacements = [
  ['let database = await readFile(databasePath, "utf8");', 'let database = (await readFile(databasePath, "utf8")).replace(/\\r\\n?/gu, "\\n");'],
  ['let agent = await readFile(agentPath, "utf8");', 'let agent = (await readFile(agentPath, "utf8")).replace(/\\r\\n?/gu, "\\n");'],
  ['let main = await readFile(mainPath, "utf8");', 'let main = (await readFile(mainPath, "utf8")).replace(/\\r\\n?/gu, "\\n");'],
  ['let ipc = await readFile(ipcPath, "utf8");', 'let ipc = (await readFile(ipcPath, "utf8")).replace(/\\r\\n?/gu, "\\n");'],
  ['let api = await readFile(coreApiPath, "utf8");', 'let api = (await readFile(coreApiPath, "utf8")).replace(/\\r\\n?/gu, "\\n");']
];
for (const [before, after] of replacements) {
  const at = source.indexOf(before);
  if (at < 0 || at !== source.lastIndexOf(before)) throw new Error(`V014_CORE13_NORMALIZE_ANCHOR_INVALID:${before.slice(0, 28)}`);
  source = source.slice(0, at) + after + source.slice(at + before.length);
}
const temporary = path.resolve("scripts/.apply-v014-core13-runtime.mjs");
await writeFile(temporary, source, "utf8");
await import(`${pathToFileURL(temporary).href}?run=${Date.now()}`);
