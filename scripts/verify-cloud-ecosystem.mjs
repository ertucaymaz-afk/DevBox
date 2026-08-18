import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const files = {
  devapiPackage: "cloud/devapi-control/package.json",
  devapiHealth: "cloud/devapi-control/api/v1/health.mjs",
  devapiPublic: "cloud/devapi-control/api/v1/public-state.mjs",
  devapiIndex: "cloud/devapi-control/index.html",
  devapiApp: "cloud/devapi-control/app.js",
  devapiVercel: "cloud/devapi-control/vercel.json",
  devboxIndex: "cloud/devbox-site/index.html",
  devboxApp: "cloud/devbox-site/app.js",
  devboxCss: "cloud/devbox-site/styles.css",
  devboxVercel: "cloud/devbox-site/vercel.json"
};
const entries = Object.entries(files);
const content = Object.fromEntries(await Promise.all(entries.map(async ([key, file]) => [key, await readFile(file, "utf8")])));
const devapiPackage = JSON.parse(content.devapiPackage);
if (devapiPackage.version !== "0.1.19") throw new Error("CLOUD_VERIFY_FAIL:devapi-version");
for (const file of [files.devapiHealth, files.devapiPublic, files.devapiApp, files.devboxApp]) {
  execFileSync(process.execPath, ["--check", file], { stdio: "inherit" });
}
const requireText = (key, needle, id) => { if (!content[key].includes(needle)) throw new Error(`CLOUD_VERIFY_FAIL:${id}`); };
const forbidText = (key, needle, id) => { if (content[key].includes(needle)) throw new Error(`CLOUD_VERIFY_FAIL:${id}`); };
requireText("devapiHealth", 'version: "0.1.19"', "health-version");
requireText("devapiPublic", "sanitizeSnapshot", "public-sanitizer");
requireText("devapiPublic", "stale", "public-freshness");
requireText("devapiPublic", "etag", "public-etag");
forbidText("devapiPublic", "requireAdminAuth", "public-admin-auth-import");
forbidText("devapiPublic", "requireDesktopAuth", "public-desktop-auth-import");
forbidText("devboxApp", "DEVBOX_CONTROL_ADMIN_TOKEN", "site-admin-secret-name");
forbidText("devboxApp", "DEVBOX_CONTROL_PLANE_TOKEN", "site-desktop-secret-name");
requireText("devboxApp", "/api/v1/public-state", "site-live-endpoint");
requireText("devboxApp", "AbortSignal.timeout", "site-timeout");
requireText("devboxApp", "visibilitychange", "site-hidden-polling-stop");
requireText("devboxApp", "IntersectionObserver", "site-progressive-animation");
requireText("devboxCss", "prefers-reduced-motion", "site-reduced-motion");
requireText("devboxVercel", "Content-Security-Policy", "site-csp");
requireText("devapiVercel", "Content-Security-Policy", "devapi-csp");
requireText("devapiIndex", "DevAPI Cloud Control", "devapi-title");
console.log("DEVBOX_CLOUD_ECOSYSTEM_VERIFY_PASS version=0.1.19 publicState=sanitized sites=2 syntax=pass securityHeaders=pass");
