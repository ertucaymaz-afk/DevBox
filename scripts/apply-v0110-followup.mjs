import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
let changed = 0;
async function patch(relative, from, to, code) {
  const file = path.join(root, relative);
  const before = (await readFile(file, "utf8")).replace(/\r\n/gu, "\n");
  if (before.includes(to)) return;
  if (!before.includes(from)) throw new Error(`${code}:source-pattern-missing`);
  await writeFile(file, before.replace(from, to), "utf8");
  changed += 1;
  process.stdout.write(`V0110_FOLLOWUP ${relative}\n`);
}

await patch(
  "src/main/services/workspace-turn-service.ts",
  `import { createReadStream, existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";`,
  `import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";`,
  "WORKSPACE_UNUSED_IMPORT"
);

await patch(
  "src/renderer/CanvasInspector.tsx",
  `import type { Capability, FileSnapshot, ProjectSummary, ThreadState, ThreadWorkspaceResult } from "../shared/contracts";`,
  `import type { Capability, FileSnapshot, ProjectSummary, ThreadSummary, ThreadWorkspaceResult } from "../shared/contracts";`,
  "CANVAS_THREAD_STATE_IMPORT"
);

await patch(
  "src/renderer/CanvasInspector.tsx",
  `  threadState: ThreadState | null;`,
  `  threadState: ThreadSummary["state"] | null;`,
  "CANVAS_THREAD_STATE_TYPE"
);

process.stdout.write(`V0110_FOLLOWUP_COMPLETE changed=${changed}\n`);
