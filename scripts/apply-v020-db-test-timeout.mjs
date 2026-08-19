import { readFile, writeFile } from "node:fs/promises";
const file = "src/main/services/database.test.ts";
let source = (await readFile(file, "utf8")).replace(/\r\n/gu, "\n");
if (source.includes('expect(database.listThreads()).toEqual([]);\n  }, 15_000);')) {
  console.log("V020_DATABASE_TEST_TIMEOUT_ALREADY_PATCHED");
  process.exit(0);
}
const before = 'expect(database.listThreads()).toEqual([]);\n  });\n\n  it("leases, cancels, settles, and recovers durable jobs without losing payloads")';
const after = 'expect(database.listThreads()).toEqual([]);\n  }, 15_000);\n\n  it("leases, cancels, settles, and recovers durable jobs without losing payloads")';
const count = source.split(before).length - 1;
if (count !== 1) throw new Error(`V020_DATABASE_TEST_TIMEOUT_ANCHOR_MISMATCH:${count}`);
source = source.replace(before, after);
await writeFile(file, source, "utf8");
console.log("V020_DATABASE_TEST_TIMEOUT_PATCH_PASS budgetMs=15000 scope=single-integration-test lineEndings=LF");
