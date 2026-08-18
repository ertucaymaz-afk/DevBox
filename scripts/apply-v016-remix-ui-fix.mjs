import { readFile, writeFile } from "node:fs/promises";

const file = "src/renderer/RemixRotaWorkspace.tsx";
let source = (await readFile(file, "utf8")).replace(/\r\n/gu, "\n");
const before = 'disabled={!ready || query.trim().length < 2 || busy === "library.search">';
const after = 'disabled={!ready || query.trim().length < 2 || busy === "library.search"}>';

if (!source.includes(after)) {
  const at = source.indexOf(before);
  if (at < 0 || source.indexOf(before, at + 1) >= 0) throw new Error("V016_REMIX_UI_DISABLED_ANCHOR_INVALID");
  source = source.slice(0, at) + after + source.slice(at + before.length);
}
if (source.includes(before)) throw new Error("V016_REMIX_UI_BROKEN_DISABLED_REMAINS");
await writeFile(file, source, "utf8");
console.log("DEVBOX_V016_REMIX_UI_FIX_APPLIED");
