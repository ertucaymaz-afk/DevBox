import { readFile, writeFile } from "node:fs/promises";

const file = "scripts/verify-cloud-ecosystem.mjs";
let source = (await readFile(file, "utf8")).replace(/\r\n/gu, "\n");

function replace(label, before, after) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected one anchor, found ${count}`);
  source = source.replace(before, after);
}

replace(
  "devapi-experience-files",
  `  devapiApp: "cloud/devapi-control/app.js",\n  devapiCss: "cloud/devapi-control/styles.css",`,
  `  devapiApp: "cloud/devapi-control/app.js",\n  devapiCss: "cloud/devapi-control/styles.css",\n  devapiExperienceJs: "cloud/devapi-control/experience-v2.js",\n  devapiExperienceCss: "cloud/devapi-control/experience-v2.css",`
);

replace(
  "devapi-experience-syntax",
  `for (const file of [files.devapiHealth, files.devapiPublic, files.devapiLinksApi, files.devapiLinksClient, files.devapiApp, files.devboxApp, files.devboxProxy, files.devboxLinksApi]) {`,
  `for (const file of [files.devapiHealth, files.devapiPublic, files.devapiLinksApi, files.devapiLinksClient, files.devapiApp, files.devapiExperienceJs, files.devboxApp, files.devboxProxy, files.devboxLinksApi]) {`
);

replace(
  "devapi-runtime-contract",
  `requireText("devapiApp", "visibilitychange", "devapi-hidden-polling-stop");\nrequireText("devboxCss", "prefers-reduced-motion", "site-reduced-motion");`,
  `requireText("devapiApp", "visibilitychange", "devapi-hidden-polling-stop");\nrequireText("devapiApp", 'import "./experience-v2.js";', "devapi-experience-loader");\nrequireText("devapiApp", 'sessionStorage.removeItem("devbox.adminToken")', "devapi-admin-token-memory-only-cleanup");\nforbidText("devapiApp", 'sessionStorage.setItem("devbox.adminToken"', "devapi-admin-token-browser-storage");\nrequireText("devapiApp", 'token: ""', "devapi-admin-token-memory-only-state");\nrequireText("devapiApp", "STAGE_LABELS", "devapi-human-stage-labels");\nrequireText("devapiApp", "syncSnapshotFreshness", "devapi-snapshot-freshness-ui");\nrequireText("devapiExperienceJs", 'ensureStylesheet("/experience-v2.css")', "devapi-experience-css-loader");\nrequireText("devapiExperienceJs", "IntersectionObserver", "devapi-experience-bounded-observer");\nrequireText("devapiExperienceJs", "prefers-reduced-motion", "devapi-experience-reduced-motion-js");\nrequireText("devapiExperienceJs", "visibilitychange", "devapi-experience-hidden-state");\nrequireText("devapiExperienceCss", "prefers-reduced-motion", "devapi-experience-reduced-motion-css");\nrequireText("devapiExperienceCss", "runtime-stale", "devapi-experience-stale-state");\nrequireText("devboxCss", "prefers-reduced-motion", "site-reduced-motion");`
);

if (!source.includes("devapi-admin-token-browser-storage") || !source.includes("devapi-experience-stale-state")) {
  throw new Error("DEVAPI_V2_CLOUD_VERIFIER_EXTENSION_MISSING");
}

await writeFile(file, source, "utf8");
console.log("V020_DEVAPI_V2_CLOUD_VERIFIER_EXTENSION_PASS");
