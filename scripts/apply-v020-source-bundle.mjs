import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { gunzipSync } from "node:zlib";

const bootstrapDir = ".bootstrap";
const parts = readdirSync(bootstrapDir)
  .filter((name) => /^v020\.part\d+$/u.test(name))
  .sort((a, b) => a.localeCompare(b, "en"));

if (parts.length !== 3) {
  throw new Error(`V020_BOOTSTRAP_PART_COUNT_MISMATCH:${parts.length}`);
}

const payload = parts
  .map((name) => readFileSync(`${bootstrapDir}/${name}`, "utf8").trim())
  .join("");

if (payload.length < 20_000 || !/^[A-Za-z0-9+/=]+$/u.test(payload)) {
  throw new Error(`V020_BOOTSTRAP_PAYLOAD_INVALID:length=${payload.length}`);
}

let files;
try {
  files = JSON.parse(gunzipSync(Buffer.from(payload, "base64")).toString("utf8"));
} catch (error) {
  throw new Error(`V020_BOOTSTRAP_DECODE_FAILED:${error instanceof Error ? error.message : String(error)}`);
}

if (!files || typeof files !== "object" || Array.isArray(files)) {
  throw new Error("V020_BOOTSTRAP_MANIFEST_INVALID");
}

const expected = [
  "README.md",
  "package.json",
  "cloud/product-links.json",
  "cloud/production-evidence.json",
  "cloud/devapi-control/api/v1/health.mjs",
  "cloud/devapi-control/api/v1/public-state.mjs",
  "cloud/devapi-control/app.js",
  "cloud/devapi-control/index.html",
  "cloud/devapi-control/package.json",
  "cloud/devapi-control/styles.css",
  "cloud/devapi-control/vercel.json",
  "cloud/devbox-site/app.js",
  "cloud/devbox-site/index.html",
  "cloud/devbox-site/package.json",
  "cloud/devbox-site/styles.css",
  "cloud/devbox-site/vercel.json",
  "docs/assets/devapi-control.svg",
  "docs/assets/devbox-cloud-architecture.svg",
  "docs/assets/devbox-home.svg",
  "docs/research/v0.1.20-web-ui-research.md",
  "scripts/verify-cloud-ecosystem.mjs",
  "scripts/verify-api-evolution-v12.mjs",
  "scripts/verify-api-evolution-v13.mjs",
  "scripts/verify-production-evidence-v13.mjs",
  "src/main/services/api-evolution-v13-tracks.test.ts"
].sort();

const actual = Object.keys(files).sort();
if (actual.length !== expected.length || actual.some((name, index) => name !== expected[index])) {
  throw new Error(`V020_BOOTSTRAP_FILESET_MISMATCH:expected=${expected.length}:actual=${actual.length}`);
}

for (const [file, encoded] of Object.entries(files)) {
  if (typeof encoded !== "string" || encoded.length === 0) {
    throw new Error(`V020_BOOTSTRAP_FILE_INVALID:${file}`);
  }
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, Buffer.from(encoded, "base64"));
}

const databaseTestPath = "src/main/services/database.test.ts";
const databaseTest = readFileSync(databaseTestPath, "utf8");
const databaseAnchor = /(expect\(database\.listThreads\(\)\)\.toEqual\(\[\]\);\r?\n\s*)\}\);(\r?\n\r?\n\s*it\("leases, cancels, settles, and recovers durable jobs without losing payloads")/u;
const matches = databaseTest.match(new RegExp(databaseAnchor.source, "gu"));
if (!matches || matches.length !== 1) {
  throw new Error(`V020_DATABASE_TEST_TIMEOUT_ANCHOR_MISMATCH:${matches?.length ?? 0}`);
}
const hardenedDatabaseTest = databaseTest.replace(databaseAnchor, "$1}, 15_000);$2");
writeFileSync(databaseTestPath, hardenedDatabaseTest, "utf8");

console.log(`V020_SOURCE_BUNDLE_WRITTEN parts=${parts.length} files=${actual.length} payloadBytes=${payload.length} dbTestBudgetMs=15000`);
await import("./apply-v020-evolution-tracks.mjs");
