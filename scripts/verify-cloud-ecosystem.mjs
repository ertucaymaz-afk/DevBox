import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const files = {
  rootPackage: "package.json",
  devapiPackage: "cloud/devapi-control/package.json",
  devapiHealth: "cloud/devapi-control/api/v1/health.mjs",
  devapiPublic: "cloud/devapi-control/api/v1/public-state.mjs",
  devapiIndex: "cloud/devapi-control/index.html",
  devapiApp: "cloud/devapi-control/app.js",
  devapiCss: "cloud/devapi-control/styles.css",
  devapiVercel: "cloud/devapi-control/vercel.json",
  devboxPackage: "cloud/devbox-site/package.json",
  devboxIndex: "cloud/devbox-site/index.html",
  devboxApp: "cloud/devbox-site/app.js",
  devboxCss: "cloud/devbox-site/styles.css",
  devboxVercel: "cloud/devbox-site/vercel.json",
  links: "cloud/product-links.json",
  evidence: "cloud/production-evidence.json"
};
const content = Object.fromEntries(await Promise.all(Object.entries(files).map(async ([key, file]) => [key, await readFile(file, "utf8")])));
const rootPackage = JSON.parse(content.rootPackage);
const devapiPackage = JSON.parse(content.devapiPackage);
const devboxPackage = JSON.parse(content.devboxPackage);
const links = JSON.parse(content.links);
const evidence = JSON.parse(content.evidence);
const version = String(rootPackage.version ?? "");
if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/u.test(version)) throw new Error("CLOUD_VERIFY_FAIL:root-version");
if (devapiPackage.version !== version) throw new Error("CLOUD_VERIFY_FAIL:devapi-version-drift");
if (devboxPackage.version !== version) throw new Error("CLOUD_VERIFY_FAIL:devbox-version-drift");
if (links.productVersion !== version) throw new Error("CLOUD_VERIFY_FAIL:links-version-drift");
if (evidence.productVersion !== version) throw new Error("CLOUD_VERIFY_FAIL:evidence-version-drift");
for (const file of [files.devapiHealth, files.devapiPublic, files.devapiApp, files.devboxApp]) execFileSync(process.execPath, ["--check", file], { stdio: "inherit" });
const requireText = (key, needle, id) => { if (!content[key].includes(needle)) throw new Error(`CLOUD_VERIFY_FAIL:${id}`); };
const forbidText = (key, needle, id) => { if (content[key].includes(needle)) throw new Error(`CLOUD_VERIFY_FAIL:${id}`); };
requireText("devapiHealth", `const VERSION = "${version}"`, "health-version");
requireText("devapiPublic", `const VERSION = "${version}"`, "public-version");
requireText("devapiPublic", "sanitizeSnapshot", "public-sanitizer");
requireText("devapiPublic", "x-devbox-public-state", "public-sanitize-header");
requireText("devapiPublic", "stale", "public-freshness");
requireText("devapiPublic", "etag", "public-etag");
forbidText("devapiPublic", "latest_snapshot,", "public-raw-snapshot");
forbidText("devapiPublic", "requireAdminAuth", "public-admin-auth-import");
forbidText("devapiPublic", "requireDesktopAuth", "public-desktop-auth-import");
for (const secret of ["DEVBOX_CONTROL_ADMIN_TOKEN", "DEVBOX_CONTROL_PLANE_TOKEN", "DATABASE_URL"]) forbidText("devboxApp", secret, `site-secret-${secret}`);
requireText("devboxApp", "/api/v1/public-state", "site-live-endpoint");
requireText("devboxApp", "AbortSignal.timeout(5000)", "site-timeout");
requireText("devboxApp", "visibilitychange", "site-hidden-polling-stop");
requireText("devboxApp", "IntersectionObserver", "site-progressive-animation");
requireText("devapiApp", "visibilitychange", "devapi-hidden-polling-stop");
requireText("devboxCss", "prefers-reduced-motion", "site-reduced-motion");
requireText("devapiCss", "prefers-reduced-motion", "devapi-reduced-motion");
requireText("devboxVercel", "Content-Security-Policy", "site-csp");
requireText("devapiVercel", "Content-Security-Policy", "devapi-csp");
requireText("devboxIndex", "NO FAKE READY", "site-truth-contract");
requireText("devboxIndex", "DevAPI Cloud Control", "site-cross-link");
requireText("devapiIndex", "DevAPI Control Plane", "devapi-title");
requireText("devapiIndex", "production pending", "devbox-blocked-link-state");
if (links.devapi?.canonicalUrl !== "https://devapi-virid.vercel.app") throw new Error("CLOUD_VERIFY_FAIL:devapi-canonical-config");
if (links.devbox?.state === "PASS" && !links.devbox?.canonicalUrl) throw new Error("CLOUD_VERIFY_FAIL:devbox-pass-without-url");
if (evidence.release?.productionEvidence === "PASS") throw new Error("CLOUD_VERIFY_FAIL:source-manifest-must-not-predeclare-production-pass");
console.log(`DEVBOX_CLOUD_ECOSYSTEM_VERIFY_PASS version=${version} publicState=sanitized sites=2 syntax=pass securityHeaders=pass polling=bounded`);
