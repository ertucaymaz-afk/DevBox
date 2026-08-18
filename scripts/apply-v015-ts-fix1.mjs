import { readFile, writeFile } from "node:fs/promises";

const file = "src/main/services/cloud-control-service.ts";
let source = (await readFile(file, "utf8")).replace(/\r\n?/gu, "\n");
const before = `      },
      body: body || undefined,
      redirect: "error",
      signal: AbortSignal.timeout(15_000)
    });`;
const after = `      },
      ...(body ? { body } : {}),
      redirect: "error",
      signal: AbortSignal.timeout(15_000)
    });`;
if (source.includes(after)) {
  console.log("V015_TS_FIX1_ALREADY_APPLIED");
  process.exit(0);
}
const at = source.indexOf(before);
if (at < 0 || at !== source.lastIndexOf(before)) throw new Error("V015_TS_FIX1_REQUEST_INIT_ANCHOR_INVALID");
source = source.slice(0, at) + after + source.slice(at + before.length);
await writeFile(file, source, "utf8");
console.log("V015_TS_FIX1_PASS");
