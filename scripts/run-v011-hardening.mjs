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
