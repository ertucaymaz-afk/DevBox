import { readFile, rm, writeFile } from "node:fs/promises";

const sourcePath = "scripts/apply-v013-runtime.mjs";
let source = (await readFile(sourcePath, "utf8")).replace(/\r\n/gu, "\n");
source = source
  .replaceAll("${snapshot.language}", "\\${snapshot.language}")
  .replaceAll("${snapshot.sha256.slice(0, 10)}", "\\${snapshot.sha256.slice(0, 10)}");
const targetPath = "scripts/.apply-v013-runtime-fixed.mjs";
await writeFile(targetPath, source, "utf8");
try { await import(`./.apply-v013-runtime-fixed.mjs?run=${Date.now()}`); }
finally { await rm(targetPath, { force: true }); }
console.log("DEVBOX_V013_RUNTIME2_APPLIED");
