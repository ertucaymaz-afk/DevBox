import { readFile, writeFile } from "node:fs/promises";
const file = "scripts/verify-api-evolution-v9.mjs";
let source = (await readFile(file, "utf8")).replace(/\r\n/gu, "\n");
function replaceOnce(before, after, label) {
  if (source.includes(after)) return;
  const at = source.indexOf(before);
  if (at < 0 || source.indexOf(before, at + 1) >= 0) throw new Error(`V016_V9_FIX_ANCHOR_INVALID:${label}`);
  source = source.slice(0, at) + after + source.slice(at + before.length);
}
replaceOnce(
  'check("remix-bridge", remixChannels.filter((name) => name !== "remixRotaEvent").every((name) => bridge.includes(name)) && bridge.includes("onRemixRotaEvent"));',
  'check("remix-bridge", all(bridge, ["inspectRemixRota", "selectRemixRotaExecutable", "connectRemixRota", "disconnectRemixRota", "invokeRemixRota", "onRemixRotaEvent"]));',
  "remix-bridge"
);
replaceOnce(
  'check("icon-flame-glyph", all(iconScript, ["Flame ribbon", "DevBox cube / code glyph", "#"]));',
  'check("icon-flame-glyph", all(iconScript, ["Flame ribbon", "DevBox cube / code glyph", "[230,55,34,235]", "[255,103,40,225]", "terminal chevron and cursor"]));',
  "icon-flame-glyph"
);
await writeFile(file, source, "utf8");
console.log("DEVBOX_V016_V9_FIX_APPLIED");
