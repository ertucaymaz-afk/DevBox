import { readFile, writeFile } from "node:fs/promises";

const targets = [
  "package.json",
  "src/main/services/agent-service.ts",
  "src/main/services/workspace-turn-service.ts",
  "src/main/services/core-api.ts",
  "src/main/main.ts",
  "src/main/services/workspace-agent-mode.test.ts",
  "src/main/services/workspace-turn-service.test.ts",
  "src/main/services/core-api.test.ts",
  "src/renderer/CanvasInspector.tsx",
  "src/renderer/styles.css"
];

for (const file of targets) {
  const source = await readFile(file, "utf8");
  const normalized = source.replace(/\r\n/gu, "\n");
  if (normalized !== source) await writeFile(file, normalized, "utf8");
}

await import("./apply-v011-hardening.mjs");

const packagePath = "package.json";
let manifest = await readFile(packagePath, "utf8");
const concurrentTest = '"test": "vitest run --config config/vitest.config.ts"';
const serializedTest = '"test": "vitest run --config config/vitest.config.ts --maxWorkers=1 --minWorkers=1"';
if (manifest.includes(concurrentTest)) manifest = manifest.replace(concurrentTest, serializedTest);
else if (!manifest.includes(serializedTest)) throw new Error("PATCH_ANCHOR_MISSING:windows-electron-test-serialization");
await writeFile(packagePath, manifest, "utf8");
console.log("DEVBOX_V011_WINDOWS_TEST_SERIALIZED");
