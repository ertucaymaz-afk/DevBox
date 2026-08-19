import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const site = path.join(root, "cloud", "devbox-site");
const requiredFiles = [
  "index.html",
  "app.js",
  "ecosystem-nav.js",
  "ecosystem-page.html",
  "ecosystem-page.js",
  "ecosystem.css",
  "ecosystem-manifest.json",
  "vercel.json",
  "sitemap.xml",
  "robots.txt"
];

const expectedRoutes = [
  "/devapi-home",
  "/devapi-api",
  "/devapi-docs",
  "/devapi-console",
  "/devapi-status",
  "/devapi-studio",
  "/devapi-evolution",
  "/devapi-workbench",
  "/devapi-memory",
  "/devapi-diagnostics"
];

function fail(code, detail = "") {
  throw new Error(`${code}${detail ? `:${detail}` : ""}`);
}

for (const file of requiredFiles) {
  if (!fs.existsSync(path.join(site, file))) fail("WEB_ECOSYSTEM_FILE_MISSING", file);
}

const read = (file) => fs.readFileSync(path.join(site, file), "utf8");
const app = read("app.js");
const nav = read("ecosystem-nav.js");
const pageHtml = read("ecosystem-page.html");
const pageJs = read("ecosystem-page.js");
const css = read("ecosystem.css");
const sitemap = read("sitemap.xml");
const robots = read("robots.txt");
const vercel = JSON.parse(read("vercel.json"));
const manifest = JSON.parse(read("ecosystem-manifest.json"));

if (!app.includes('import "./ecosystem-nav.js";')) fail("WEB_ECOSYSTEM_HOME_IMPORT_MISSING");
if (!pageHtml.includes('lang="tr"')) fail("WEB_ECOSYSTEM_TURKISH_LANG_MISSING");
if (!pageHtml.includes('src="/ecosystem-page.js"')) fail("WEB_ECOSYSTEM_PAGE_SCRIPT_MISSING");
if (!pageHtml.includes('href="/ecosystem.css"')) fail("WEB_ECOSYSTEM_PAGE_STYLE_MISSING");
if (!css.includes("@media(prefers-reduced-motion:reduce)")) fail("WEB_ECOSYSTEM_REDUCED_MOTION_MISSING");
if (!css.includes("eco-command")) fail("WEB_ECOSYSTEM_COMMAND_PALETTE_STYLE_MISSING");

const rewrites = Array.isArray(vercel.rewrites) ? vercel.rewrites : [];
if (rewrites.length !== expectedRoutes.length) fail("WEB_ECOSYSTEM_REWRITE_COUNT", String(rewrites.length));
const rewriteMap = new Map(rewrites.map((entry) => [entry?.source, entry?.destination]));
for (const route of expectedRoutes) {
  if (rewriteMap.get(route) !== "/ecosystem-page.html") fail("WEB_ECOSYSTEM_REWRITE_MISSING", route);
}

const csp = vercel?.headers?.flatMap((entry) => entry?.headers ?? []).find((header) => header?.key === "Content-Security-Policy")?.value ?? "";
if (!csp || csp.includes("'unsafe-inline'") || csp.includes("'unsafe-eval'")) fail("WEB_ECOSYSTEM_CSP_WEAKENED");
if (!csp.includes("connect-src 'self'")) fail("WEB_ECOSYSTEM_CSP_CONNECT_BOUNDARY_MISSING");

const surfaces = Array.isArray(manifest.surfaces) ? manifest.surfaces : [];
if (surfaces.length !== 11) fail("WEB_ECOSYSTEM_SURFACE_COUNT", String(surfaces.length));
if (manifest?.canonicalOrigin !== "https://devbox.vercel.app") fail("WEB_ECOSYSTEM_CANONICAL_ORIGIN_INVALID");
if (manifest?.truthPolicy?.fakeReady !== false) fail("WEB_ECOSYSTEM_FAKE_READY_POLICY_INVALID");
if (manifest?.truthPolicy?.productionStateRequiresLiveEvidence !== true) fail("WEB_ECOSYSTEM_LIVE_EVIDENCE_POLICY_MISSING");
if (manifest?.truthPolicy?.publicStateTrustedValue !== "sanitized-proxy") fail("WEB_ECOSYSTEM_PUBLIC_STATE_MARKER_INVALID");

for (const route of expectedRoutes) {
  const slug = route.slice(1);
  if (!nav.includes(`slug: "${slug}"`)) fail("WEB_ECOSYSTEM_NAV_ROUTE_MISSING", route);
  if (!pageJs.includes(`"${slug}": {`)) fail("WEB_ECOSYSTEM_PAGE_CONFIG_MISSING", route);
  if (!sitemap.includes(`https://devbox.vercel.app${route}`)) fail("WEB_ECOSYSTEM_SITEMAP_ROUTE_MISSING", route);
}

if (!sitemap.includes("https://devbox.vercel.app/")) fail("WEB_ECOSYSTEM_SITEMAP_HOME_MISSING");
if (!robots.includes("Sitemap: https://devbox.vercel.app/sitemap.xml")) fail("WEB_ECOSYSTEM_ROBOTS_SITEMAP_MISSING");

for (const source of [nav, pageJs]) {
  if (!source.includes("sanitized-proxy")) fail("WEB_ECOSYSTEM_SANITIZED_PROXY_GUARD_MISSING");
  if (!source.includes("UNAVAILABLE") && !source.includes("BLOCKED/UNAVAILABLE")) fail("WEB_ECOSYSTEM_FAIL_CLOSED_STATE_MISSING");
  if (!source.includes("AbortSignal.timeout")) fail("WEB_ECOSYSTEM_BOUNDED_FETCH_MISSING");
}

if (!nav.includes("hotapi-six-gamma.vercel.app")) fail("WEB_ECOSYSTEM_HOTAPI_LINK_MISSING");
if (!nav.includes("devapi-virid.vercel.app")) fail("WEB_ECOSYSTEM_DEVAPI_LINK_MISSING");
if (!nav.includes("SOURCE VERIFIED")) fail("WEB_ECOSYSTEM_SOURCE_TRUTH_LABEL_MISSING");
if (!nav.includes("PRODUCTION · BLOCKED/UNAVAILABLE")) fail("WEB_ECOSYSTEM_PRODUCTION_FAIL_CLOSED_LABEL_MISSING");

const research = Array.isArray(manifest.researchSources) ? manifest.researchSources : [];
const expectedResearch = new Map([
  ["Magic UI", "MIT"],
  ["shadcn/ui", "MIT"],
  ["Lucide", "ISC"],
  ["Motion", "MIT"],
  ["Kibo UI", "MIT"]
]);
for (const [name, license] of expectedResearch) {
  const entry = research.find((item) => item?.name === name);
  if (!entry || entry.license !== license) fail("WEB_ECOSYSTEM_RESEARCH_SOURCE_MISSING", name);
}

console.log(`WEB_ECOSYSTEM_VERIFY_PASS surfaces=${surfaces.length} routes=${expectedRoutes.length} csp=fail-closed liveState=sanitized-proxy research=${research.length}`);
