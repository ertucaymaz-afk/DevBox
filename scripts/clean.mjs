import { rm } from "node:fs/promises";

for (const path of ["dist", "coverage", "playwright-report", "test-results"]) {
  await rm(path, { recursive: true, force: true });
}

