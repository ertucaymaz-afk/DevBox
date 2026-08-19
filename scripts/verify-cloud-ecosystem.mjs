import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const files = {
  rootPackage: "package.json",
  devapiPackage: "cloud/devapi-control/package.json",
  devapiHealth: "cloud/devapi-control/api/v1/health.mjs",
  devapiPublic: "cloud/devapi-control/api/v1/public-state.mjs",
  devapiLinksApi: "cloud/devapi-control/api/v1/product-links.mjs",
  devapiLinksClient: "cloud/devapi-control/product-links.js",
  devapiIndex: "cloud/devapi-control/index.html",
  devapiApp: "cloud/devapi-control/app.js",
  devapiCss: "cloud/devapi-control/styles.css",
  devapiExperienceJs: "cloud/devapi-control/experience-v2.js",
  devapiExperienceCss: "cloud/devapi-control/experience-v2.css",
  devapiVercel: "cloud/devapi-control/vercel.json",
  devboxPackage: "cloud/devbox-site/package.json",
  devboxIndex: "cloud/devbox-site/index.html",
  devboxApp: "cloud/devbox-site/app.js",
  devboxProxy: "cloud/devbox-site/api/public-state.mjs",
  devboxLinksApi: "cloud/devbox-site/api/product-links.mjs",
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
const canonicalUrl = (value, id, required = true) => {
  if (value == null || value === "") {
    if (required) throw new Error(`CLOUD_VERIFY_FAIL:${id}-missing`);
    return null;
  }
  let url;
  try { url = new URL(String(value)); } catch { throw new Error(`CLOUD_VERIFY_FAIL:${id}-invalid`); }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new Error(`CLOUD_VERIFY_FAIL:${id}-unsafe`);
  }
  return url.origin;
};
if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/u.test(version)) throw new Error("CLOUD_VERIFY_FAIL:root-version");
if (devapiPackage.version !== version) throw new Error("CLOUD_VERIFY_FAIL:devapi-version-drift");
if (devboxPackage.version !== version) throw new Error("CLOUD_VERIFY_FAIL:devbox-version-drift");
if (links.productVersion !== version) throw new Error("CLOUD_VERIFY_FAIL:links-version-drift");
if (evidence.productVersion !== version) throw new Error("CLOUD_VERIFY_FAIL:evidence-version-drift");
for (const file of [files.devapiHealth, files.devapiPublic, files.devapiLinksApi, files.devapiLinksClient, files.devapiApp, files.devapiExperienceJs, files.devboxApp, files.devboxProxy, files.devboxLinksApi]) {
  execFileSync(process.execPath, ["--check", file], { stdio: "inherit" });
}
const requireText = (key, needle, id) => { if (!content[key].includes(needle)) throw new Error(`CLOUD_VERIFY_FAIL:${id}`); };
const forbidText = (key, needle, id) => { if (content[key].includes(needle)) throw new Error(`CLOUD_VERIFY_FAIL:${id}`); };
requireText("devapiHealth", `const VERSION = "${version}"`, "health-version");
requireText("devapiPublic", `const VERSION = "${version}"`, "public-version");
requireText("devapiPublic", "sanitizeSnapshot", "public-sanitizer");
requireText("devapiPublic", "x-devbox-public-state", "public-sanitize-header");
requireText("devapiPublic", "stale", "public-freshness");
requireText("devapiPublic", "etag", "public-etag");
forbidText("devapiPublic", "latest_snapshot,", "public-raw-snapshot");
forbidText("devapiPublic", "row?.project_name", "public-project-name-leak");
requireText("devapiPublic", 'name: "DevBox project"', "public-project-name-sanitized");
forbidText("devapiPublic", "requireAdminAuth", "public-admin-auth-import");
forbidText("devapiPublic", "requireDesktopAuth", "public-desktop-auth-import");
for (const secret of ["DEVBOX_CONTROL_ADMIN_TOKEN", "DEVBOX_CONTROL_PLANE_TOKEN", "DATABASE_URL"]) {
  forbidText("devboxApp", secret, `site-secret-${secret}`);
  forbidText("devapiLinksClient", secret, `link-client-secret-${secret}`);
  forbidText("devboxLinksApi", secret, `devbox-link-api-secret-${secret}`);
  forbidText("devboxProxy", secret, `devbox-proxy-secret-${secret}`);
}
requireText("devapiLinksApi", "DEVAPI_CANONICAL_URL", "link-api-devapi-public-config");
requireText("devapiLinksApi", "DEVBOX_PRODUCT_URL", "link-api-devbox-public-config");
requireText("devapiLinksApi", "PUBLIC_URL_INVALID", "link-api-url-validation");
requireText("devapiLinksClient", "/api/v1/product-links", "link-client-endpoint");
requireText("devapiLinksClient", "AbortSignal.timeout(5_000)", "link-client-timeout");
requireText("devapiLinksClient", "production pending", "link-client-fail-closed");
requireText("devapiIndex", "/product-links.js", "link-client-loaded");
requireText("devboxApp", 'const ENDPOINT = "/api/public-state"', "site-same-origin-endpoint");
requireText("devboxApp", "/api/product-links", "site-runtime-link-endpoint");
requireText("devboxApp", "sanitized-proxy", "site-proxy-trust-marker");
requireText("devboxApp", "AbortSignal.timeout(5000)", "site-timeout");
requireText("devboxApp", "visibilitychange", "site-hidden-polling-stop");
requireText("devboxApp", "IntersectionObserver", "site-progressive-animation");
requireText("devboxProxy", "DEVAPI_PUBLIC_URL", "site-proxy-runtime-origin");
requireText("devboxProxy", "/api/v1/public-state", "site-proxy-upstream-contract");
requireText("devboxProxy", "x-devbox-public-state", "site-proxy-upstream-sanitize-check");
requireText("devboxProxy", "AbortSignal.timeout(5_000)", "site-proxy-timeout");
requireText("devboxLinksApi", "DEVAPI_PUBLIC_URL", "site-link-runtime-origin");
requireText("devapiApp", "visibilitychange", "devapi-hidden-polling-stop");
requireText("devapiApp", 'import "./experience-v2.js";', "devapi-experience-loader");
requireText("devapiApp", 'sessionStorage.removeItem("devbox.adminToken")', "devapi-admin-token-memory-only-cleanup");
forbidText("devapiApp", 'sessionStorage.setItem("devbox.adminToken"', "devapi-admin-token-browser-storage");
requireText("devapiApp", 'token: ""', "devapi-admin-token-memory-only-state");
requireText("devapiApp", "STAGE_LABELS", "devapi-human-stage-labels");
requireText("devapiApp", "syncSnapshotFreshness", "devapi-snapshot-freshness-ui");
requireText("devapiApp", "clearSnapshotView", "devapi-stale-snapshot-clear");
requireText("devapiApp", "refreshGeneration", "devapi-refresh-generation-guard");
requireText("devapiApp", "generation !== refreshGeneration", "devapi-refresh-race-reject");
requireText("devapiApp", "clearSnapshotView({ clearCollections: true })", "devapi-error-collection-clear");
requireText("devapiApp", 'setText("evidence", "Evidence state bekleniyor.")', "devapi-stale-evidence-clear");
requireText("devapiApp", 'heartbeat.removeAttribute("title")', "devapi-stale-heartbeat-title-clear");
requireText("devapiExperienceJs", 'ensureStylesheet("/experience-v2.css")', "devapi-experience-css-loader");
requireText("devapiExperienceJs", "IntersectionObserver", "devapi-experience-bounded-observer");
requireText("devapiExperienceJs", "prefers-reduced-motion", "devapi-experience-reduced-motion-js");
requireText("devapiExperienceJs", "visibilitychange", "devapi-experience-hidden-state");
requireText("devapiExperienceCss", "prefers-reduced-motion", "devapi-experience-reduced-motion-css");
requireText("devapiExperienceCss", "runtime-stale", "devapi-experience-stale-state");
requireText("devboxCss", "prefers-reduced-motion", "site-reduced-motion");
requireText("devapiCss", "prefers-reduced-motion", "devapi-reduced-motion");
requireText("devboxVercel", "Content-Security-Policy", "site-csp");
requireText("devboxVercel", "connect-src 'self'", "site-csp-same-origin-only");
requireText("devapiVercel", "Content-Security-Policy", "devapi-csp");
requireText("devboxIndex", "NO FAKE READY", "site-truth-contract");
requireText("devboxIndex", "DevAPI Cloud Control", "site-cross-link-label");
requireText("devapiIndex", "DevAPI Control Plane", "devapi-title");
const devapiLink = canonicalUrl(links.devapi?.canonicalUrl, "devapi-canonical-config");
const evidenceDevapiLink = canonicalUrl(evidence.vercel?.devapi?.canonicalUrl, "devapi-canonical-evidence");
if (devapiLink !== evidenceDevapiLink) throw new Error("CLOUD_VERIFY_FAIL:devapi-canonical-drift");
const devboxLink = canonicalUrl(links.devbox?.canonicalUrl, "devbox-canonical-config", false);
const evidenceDevboxLink = canonicalUrl(evidence.vercel?.devbox?.canonicalUrl, "devbox-canonical-evidence", false);
if (devboxLink !== evidenceDevboxLink) throw new Error("CLOUD_VERIFY_FAIL:devbox-canonical-drift");
if (links.devbox?.state === "PASS") {
  if (!devboxLink || !evidence.vercel?.devbox?.projectId) throw new Error("CLOUD_VERIFY_FAIL:devbox-pass-without-proof");
} else {
  if (devboxLink && !evidence.vercel?.devbox?.projectId) throw new Error("CLOUD_VERIFY_FAIL:unverified-devbox-canonical");
  requireText("devapiIndex", "production pending", "devbox-blocked-link-state");
}
if (evidence.release?.productionEvidence === "PASS") {
  execFileSync(process.execPath, ["scripts/verify-production-evidence-v13.mjs"], { stdio: "inherit" });
}
console.log(`DEVBOX_CLOUD_ECOSYSTEM_VERIFY_PASS version=${version} publicState=sanitized sites=2 syntax=pass securityHeaders=pass polling=bounded crossLinks=runtime-configured devboxProxy=same-origin canonicalConfig=evidence`);
