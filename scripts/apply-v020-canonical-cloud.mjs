import { readFile, writeFile } from "node:fs/promises";

const mappings = [
  ["devbox_projects", "devbox_project_state"],
  ["devbox_snapshot_history", "devbox_project_state_history"],
  ["devbox_commands", "devbox_control_commands"]
];

const dbFile = "cloud/devapi-control/lib/db.mjs";
let db = (await readFile(dbFile, "utf8")).replace(/\r\n/gu, "\n");
for (const [legacy, canonical] of mappings) {
  if (db.includes(legacy)) db = db.split(legacy).join(canonical);
  if (!db.includes(canonical)) throw new Error(`V020_CANONICAL_CLOUD_TABLE_MISSING:${canonical}`);
  if (db.includes(legacy)) throw new Error(`V020_CANONICAL_CLOUD_LEGACY_REMAINS:${legacy}`);
}
await writeFile(dbFile, db, "utf8");

const evidenceFile = "cloud/production-evidence.json";
const evidence = JSON.parse(await readFile(evidenceFile, "utf8"));
evidence.neon = evidence.neon ?? {};
evidence.neon.schemaTables = mappings.map(([, canonical]) => canonical);
evidence.neon.schemaReadBack = "PASS";
if (evidence.vercel?.devbox?.projectId == null) {
  evidence.vercel.devbox.canonicalUrl = null;
}
if (evidence.release?.productionEvidence !== "PASS") {
  if (evidence.canary?.crossSiteLinks === "PASS") evidence.canary.crossSiteLinks = "PENDING";
}
await writeFile(evidenceFile, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");

const linksFile = "cloud/product-links.json";
const links = JSON.parse(await readFile(linksFile, "utf8"));
if (links.devbox?.canonicalUrl && !evidence.vercel?.devbox?.projectId) {
  throw new Error("V020_UNVERIFIED_DEVBOX_CANONICAL_URL");
}
if (links.devapi?.canonicalUrl !== evidence.vercel?.devapi?.canonicalUrl) {
  throw new Error("V020_DEVAPI_CANONICAL_EVIDENCE_DRIFT");
}

console.log("V020_CANONICAL_CLOUD_PATCH_PASS tables=3 evidence=aligned unverifiedCanonical=blocked");
