import { readFile, writeFile } from "node:fs/promises";
const file = "scripts/verify-api-evolution-v9.mjs";
let source = (await readFile(file, "utf8")).replace(/\r\n/gu, "\n");
const before = 'check("remix-bridge", remixChannels.filter((name) => name !== "remixRotaEvent").every((name) => bridge.includes(name)) && bridge.includes("onRemixRotaEvent"));';
const after = 'check("remix-bridge", all(bridge, ["inspectRemixRota", "selectRemixRotaExecutable", "connectRemixRota", "disconnectRemixRota", "invokeRemixRota", "onRemixRotaEvent"]));';
if (!source.includes(after)) {
  const at = source.indexOf(before);
  if (at < 0 || source.indexOf(before, at + 1) >= 0) throw new Error("V016_V9_BRIDGE_ANCHOR_INVALID");
  source = source.slice(0, at) + after + source.slice(at + before.length);
}
await writeFile(file, source, "utf8");
console.log("DEVBOX_V016_V9_FIX_APPLIED");
