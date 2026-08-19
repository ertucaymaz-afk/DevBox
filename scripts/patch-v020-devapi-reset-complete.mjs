import { readFile, writeFile } from "node:fs/promises";

const appFile = "cloud/devapi-control/app.js";
const verifyFile = "scripts/verify-cloud-ecosystem.mjs";
let app = (await readFile(appFile, "utf8")).replace(/\r\n/gu, "\n");
let verify = (await readFile(verifyFile, "utf8")).replace(/\r\n/gu, "\n");

function replaceOnce(source, before, after, code) {
  const first = source.indexOf(before);
  const last = source.lastIndexOf(before);
  if (first < 0 || first !== last) throw new Error(`${code}: expected exactly one anchor`);
  return source.slice(0, first) + after + source.slice(first + before.length);
}

app = replaceOnce(
  app,
  `  setText("score", "—");\n  setText("coreProgress", "—");`,
  `  setText("score", "—");\n  setText("evidence", "Evidence state bekleniyor.");\n  setText("coreProgress", "—");`,
  "RESET_EVIDENCE_ANCHOR"
);

app = replaceOnce(
  app,
  `  setText("heartbeat", "—");\n  setText("instance", "instance: —");`,
  `  setText("heartbeat", "—");\n  const heartbeat = $("heartbeat");\n  if (heartbeat) heartbeat.removeAttribute("title");\n  setText("instance", "instance: —");`,
  "RESET_HEARTBEAT_TITLE_ANCHOR"
);

verify = replaceOnce(
  verify,
  `requireText("devapiApp", "clearSnapshotView({ clearCollections: true })", "devapi-error-collection-clear");`,
  `requireText("devapiApp", "clearSnapshotView({ clearCollections: true })", "devapi-error-collection-clear");\nrequireText("devapiApp", 'setText("evidence", "Evidence state bekleniyor.")', "devapi-stale-evidence-clear");\nrequireText("devapiApp", 'heartbeat.removeAttribute("title")', "devapi-stale-heartbeat-title-clear");`,
  "VERIFY_RESET_COMPLETENESS_ANCHOR"
);

for (const required of ['setText("evidence", "Evidence state bekleniyor.")', 'heartbeat.removeAttribute("title")']) {
  if (!app.includes(required)) throw new Error(`DEVAPI_RESET_COMPLETENESS_MISSING:${required}`);
}

await writeFile(appFile, app, "utf8");
await writeFile(verifyFile, verify, "utf8");
console.log("V020_DEVAPI_RESET_COMPLETENESS_PATCH_PASS");
