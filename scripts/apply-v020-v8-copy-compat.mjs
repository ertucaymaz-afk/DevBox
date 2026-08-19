import { readFile, writeFile } from "node:fs/promises";
const file = "scripts/verify-api-evolution-v8.mjs";
let source = (await readFile(file, "utf8")).replace(/\r\n/gu, "\n");
const before = 'check("cloud-dashboard-command-lifecycle", hasAll(cloudIndex, ["COMMAND AUDIT", "PENDING → RETRYING → APPLIED / FAILED", "desktop ACK"]));';
const after = 'check("cloud-dashboard-command-lifecycle", hasAll(cloudIndex, ["COMMAND AUDIT", "PENDING → RETRYING → APPLIED / FAILED"]) && cloudIndex.toLocaleLowerCase("en-US").includes("desktop ack"));';
if (source.includes(after)) {
  console.log("V020_V8_COPY_COMPAT_ALREADY_PATCHED");
  process.exit(0);
}
const count = source.split(before).length - 1;
if (count !== 1) throw new Error(`V020_V8_COPY_COMPAT_ANCHOR_MISMATCH:${count}`);
await writeFile(file, source.replace(before, after), "utf8");
console.log("V020_V8_COPY_COMPAT_PATCH_PASS semantic=desktop-ack caseInsensitive=true");
