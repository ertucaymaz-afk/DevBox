import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { chromium } from "@playwright/test";

const root = process.cwd();
const site = path.join(root, "cloud", "devbox-site");
const outputRoot = path.join(root, "outputs", "web-visual");
const routes = [
  "/",
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
const viewports = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "laptop", width: 1280, height: 800 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "mobile", width: 390, height: 844 }
];
const routeRewrite = new Set(routes.filter((route) => route !== "/"));
const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".xml", "application/xml; charset=utf-8"],
  [".txt", "text/plain; charset=utf-8"],
  [".png", "image/png"],
  [".webp", "image/webp"]
]);

function sendJson(res, status, body, headers = {}) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers });
  res.end(`${JSON.stringify(body)}\n`);
}

function safeFileFromUrl(urlPath) {
  const pathname = decodeURIComponent(urlPath.split("?")[0] || "/");
  if (pathname === "/") return path.join(site, "index.html");
  if (routeRewrite.has(pathname)) return path.join(site, "ecosystem-page.html");
  const relative = pathname.replace(/^\/+/, "");
  const candidate = path.resolve(site, relative);
  const siteRoot = path.resolve(site) + path.sep;
  if (!candidate.startsWith(siteRoot)) return null;
  return candidate;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  if (url.pathname === "/api/public-state") {
    return sendJson(res, 200, {
      evolution: { lifetimeLevel: null, score: null, stage: "NOT_RUN", isRunning: false },
      findings: { open: null, blocking: null },
      releaseGate: { state: "NOT_RUN" },
      freshness: { stale: true, ageSeconds: 86400 }
    }, { "x-devbox-public-state": "sanitized-proxy", "x-devbox-qa-fixture": "stale-no-ready" });
  }
  if (url.pathname === "/api/product-links") {
    return sendJson(res, 200, { devapi: "https://devapi-virid.vercel.app" }, { "x-devbox-qa-fixture": "links-only" });
  }
  const file = safeFileFromUrl(url.pathname);
  if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    return res.end("Not found\n");
  }
  const ext = path.extname(file).toLowerCase();
  res.writeHead(200, {
    "content-type": contentTypes.get(ext) || "application/octet-stream",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff"
  });
  fs.createReadStream(file).pipe(res);
});

await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});
const address = server.address();
if (!address || typeof address === "string") throw new Error("WEB_VISUAL_SERVER_ADDRESS_INVALID");
const origin = `http://127.0.0.1:${address.port}`;

fs.rmSync(outputRoot, { recursive: true, force: true });
fs.mkdirSync(outputRoot, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];
let failure = null;

try {
  for (const route of routes) {
    for (const viewport of viewports) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        reducedMotion: "reduce",
        colorScheme: "dark"
      });
      const page = await context.newPage();
      const consoleErrors = [];
      const pageErrors = [];
      page.on("console", (message) => {
        if (message.type() === "error") consoleErrors.push(message.text());
      });
      page.on("pageerror", (error) => pageErrors.push(error.message));

      const response = await page.goto(`${origin}${route}`, { waitUntil: "domcontentloaded", timeout: 20_000 });
      if (!response || response.status() !== 200) throw new Error(`WEB_VISUAL_HTTP_FAIL:${route}:${viewport.name}:${response?.status() ?? "NO_RESPONSE"}`);
      await page.waitForTimeout(350);

      const title = await page.title();
      if (!title.trim()) throw new Error(`WEB_VISUAL_TITLE_MISSING:${route}:${viewport.name}`);
      const h1 = page.locator("h1").first();
      if (await h1.count() !== 1 || !(await h1.isVisible())) throw new Error(`WEB_VISUAL_H1_MISSING:${route}:${viewport.name}`);
      if (await page.locator("header").count() < 1) throw new Error(`WEB_VISUAL_HEADER_MISSING:${route}:${viewport.name}`);

      const reduced = await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
      if (!reduced) throw new Error(`WEB_VISUAL_REDUCED_MOTION_NOT_ACTIVE:${route}:${viewport.name}`);

      const overflow = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth);
      if (overflow > 1) throw new Error(`WEB_VISUAL_HORIZONTAL_OVERFLOW:${route}:${viewport.name}:${overflow}`);

      await page.keyboard.press("Control+K");
      await page.waitForTimeout(80);
      const paletteOpen = await page.locator("#ecoCommand.open").count();
      if (paletteOpen !== 1) throw new Error(`WEB_VISUAL_COMMAND_PALETTE_FAIL:${route}:${viewport.name}`);
      await page.keyboard.press("Escape");

      if (route === "/") {
        await page.waitForFunction(() => document.querySelector("#livePill")?.textContent === "STALE", null, { timeout: 5_000 });
        for (const selector of ["#ecoArchitectureExplorer", "#ecoSourceCapabilityMatrix", "#ecoEvolutionTracks"]) {
          const node = page.locator(selector);
          if (await node.count() !== 1 || !(await node.isVisible())) throw new Error(`WEB_VISUAL_V2_COMPONENT_MISSING:${selector}:${viewport.name}`);
        }
        const capabilityCount = await page.locator("#ecoSourceCapabilityMatrix .eco-capability-tile").count();
        const architectureCount = await page.locator("#ecoArchitectureExplorer .eco-arch-node").count();
        const evolutionTrackCount = await page.locator("#ecoEvolutionTracks article").count();
        if (capabilityCount !== 12) throw new Error(`WEB_VISUAL_CAPABILITY_COUNT:${viewport.name}:${capabilityCount}`);
        if (architectureCount !== 10) throw new Error(`WEB_VISUAL_ARCHITECTURE_COUNT:${viewport.name}:${architectureCount}`);
        if (evolutionTrackCount !== 10) throw new Error(`WEB_VISUAL_EVOLUTION_TRACK_COUNT:${viewport.name}:${evolutionTrackCount}`);
      } else {
        await page.waitForFunction(() => document.querySelector("#ecoLiveState")?.textContent === "STALE", null, { timeout: 5_000 });
      }

      if (pageErrors.length) throw new Error(`WEB_VISUAL_PAGE_ERROR:${route}:${viewport.name}:${pageErrors.join(" | ")}`);
      if (consoleErrors.length) throw new Error(`WEB_VISUAL_CONSOLE_ERROR:${route}:${viewport.name}:${consoleErrors.join(" | ")}`);

      const slug = route === "/" ? "home" : route.slice(1);
      const outDir = path.join(outputRoot, slug);
      fs.mkdirSync(outDir, { recursive: true });
      const screenshot = path.join(outDir, `${viewport.name}.png`);
      await page.screenshot({ path: screenshot, fullPage: true, animations: "disabled" });
      const screenshotBytes = fs.statSync(screenshot).size;
      if (screenshotBytes < 2_000) throw new Error(`WEB_VISUAL_SCREENSHOT_TOO_SMALL:${route}:${viewport.name}:${screenshotBytes}`);

      results.push({
        route,
        viewport: viewport.name,
        width: viewport.width,
        height: viewport.height,
        httpStatus: response.status(),
        title,
        reducedMotion: true,
        horizontalOverflowPx: overflow,
        commandPalette: "PASS",
        truthFixture: "STALE",
        architectureExplorer: route === "/" ? "PASS" : "N/A",
        sourceCapabilityMatrix: route === "/" ? "12/12" : "N/A",
        evolutionTracks: route === "/" ? "10/10" : "N/A",
        consoleErrors: 0,
        pageErrors: 0,
        screenshot: path.relative(root, screenshot).replaceAll("\\", "/"),
        screenshotBytes
      });
      await context.close();
    }
  }
} catch (error) {
  failure = error;
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

const summary = {
  schemaVersion: 2,
  product: "DevBox web ecosystem",
  sourceSha: process.env.GITHUB_SHA || null,
  generatedAt: new Date().toISOString(),
  fixturePolicy: "QA_ONLY_STALE_PUBLIC_STATE_NO_PRODUCTION_CLAIM",
  routes: routes.length,
  viewports: viewports.length,
  expectedScreenshots: routes.length * viewports.length,
  capturedScreenshots: results.length,
  architectureExplorer: "BROWSER_VERIFIED_ON_HOME",
  sourceCapabilities: 12,
  evolutionTracks: 10,
  reducedMotion: "VERIFIED_PER_CASE",
  status: failure ? "FAIL" : "PASS",
  error: failure instanceof Error ? failure.message : failure ? String(failure) : null,
  results
};
fs.writeFileSync(path.join(outputRoot, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");

if (failure) throw failure;
if (results.length !== routes.length * viewports.length) throw new Error(`WEB_VISUAL_MATRIX_INCOMPLETE:${results.length}`);
console.log(`DEVBOX_WEB_VISUAL_VERIFY_PASS routes=${routes.length} viewports=${viewports.length} screenshots=${results.length} architecture=10 capabilities=12 evolutionTracks=10 reducedMotion=verified truthFixture=STALE`);
