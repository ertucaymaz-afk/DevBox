import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

function requireText(source, needle, id) {
  if (!source.includes(needle)) throw new Error(`API_EVOLUTION_V10_VERIFY_FAIL:${id}`);
}
function forbidText(source, needle, id) {
  if (source.includes(needle)) throw new Error(`API_EVOLUTION_V10_VERIFY_FAIL:${id}`);
}
function requirePattern(source, pattern, id) {
  if (!pattern.test(source)) throw new Error(`API_EVOLUTION_V10_VERIFY_FAIL:${id}`);
}

execFileSync(process.execPath, ["scripts/verify-api-evolution-v9.mjs"], { stdio: "inherit" });

const [pkgRaw, findings, findingTests, main, app, remix, remixTests, remixUi] = await Promise.all([
  readFile("package.json", "utf8"),
  readFile("src/main/services/evolution-finding-service.ts", "utf8"),
  readFile("src/main/services/evolution-finding-service.test.ts", "utf8"),
  readFile("src/main/main.ts", "utf8"),
  readFile("src/renderer/App.tsx", "utf8"),
  readFile("src/main/services/remixrota-service.ts", "utf8"),
  readFile("src/main/services/remixrota-service.test.ts", "utf8"),
  readFile("src/renderer/RemixRotaWorkspace.tsx", "utf8")
]);
const pkg = JSON.parse(pkgRaw);
function parseSemver(value) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/u.exec(String(value ?? ""));
  return match ? match.slice(1, 4).map(Number) : null;
}
function semverAtLeast(value, minimum) {
  const parsed = parseSemver(value);
  if (!parsed) return false;
  for (let index = 0; index < 3; index += 1) {
    if (parsed[index] > minimum[index]) return true;
    if (parsed[index] < minimum[index]) return false;
  }
  return true;
}
if (!semverAtLeast(pkg.version, [0, 1, 17])) throw new Error("API_EVOLUTION_V10_VERIFY_FAIL:version-minimum");
const verifierMatch = /verify-api-evolution-v(\d+)\.mjs/u.exec(String(pkg.scripts?.["evolution:verify"] ?? ""));
if (!verifierMatch || Number(verifierMatch[1]) < 10) throw new Error("API_EVOLUTION_V10_VERIFY_FAIL:verifier-forward-compat");

let checks = 0;
const need = (source, needle, id) => { requireText(source, needle, id); checks += 1; };
const forbid = (source, needle, id) => { forbidText(source, needle, id); checks += 1; };
const needPattern = (source, pattern, id) => { requirePattern(source, pattern, id); checks += 1; };

need(findings, "normalizeStoredFinding", "finding-normalizer");
need(findings, "FINDING_OWNER_SET", "finding-owner-allowlist");
needPattern(findings, /FINDING_SEVERITIES\.has\([^)]*item\.severity[^)]*\)[\s\S]{0,180}:\s*"MEDIUM"/u, "finding-safe-severity");
needPattern(findings, /FINDING_OWNER_SET\.has\([^)]*item\.owner[^)]*\)[\s\S]{0,180}:\s*ownerForTrack\(track\)/u, "finding-safe-owner");
need(findings, "flatMap((item): EvolutionFinding[]", "finding-safe-load-map");
need(findingTests, "normalizes legacy or malformed persisted findings", "finding-regression-test");
need(findingTests, "summary.byOwner.evolution", "finding-owner-regression");
need(findingTests, "FindingSummarySchema.parse", "finding-strict-schema-regression");

need(app, 'window.matchMedia("(prefers-color-scheme: dark)")', "renderer-system-theme-media");
need(app, 'const resolvedThemeBase: "light" | "dark"', "renderer-resolved-theme");
need(app, "data-theme-base={resolvedThemeBase}", "renderer-theme-attribute");
forbid(app, 'data-theme-base={appSettings?.theme.base ?? "dark"}', "renderer-raw-system-theme-forbidden");
need(main, 'nativeTheme.on("updated", nativeThemeUpdatedListener)', "native-theme-listener");
need(main, 'nativeTheme.off("updated", nativeThemeUpdatedListener)', "native-theme-cleanup");
need(main, "applyNativeWindowTheme", "native-theme-apply-helper");
need(main, "https://i.ytimg.com", "thumbnail-csp-youtube");
need(main, "https://*.googleusercontent.com", "thumbnail-csp-google");
need(main, "https://*.ggpht.com", "thumbnail-csp-ggpht");

need(remix, "processAlive(discovery.processId)", "remix-stale-process-check");
need(remix, "REMIXROTA_DISCOVERY_EXECUTABLE_MISMATCH", "remix-path-binding");
need(remix, "REMIXROTA_DISCOVERY_EXECUTABLE_NAME_INVALID", "remix-discovery-name-binding");
need(remix, "RemixRotaEventSchema.safeParse", "remix-event-safeparse");
forbid(remix, "const event = RemixRotaEventSchema.parse({ type: message.eventName", "remix-event-throw-forbidden");
needPattern(remix, /this\.#pending\.set\(requestId,[\s\S]{0,500}try\s*\{[\s\S]{0,250}this\.#write\([\s\S]{0,250}this\.#pending\.delete\(requestId\)/u, "remix-write-cleanup");
need(remixTests, "REMIXROTA_INVALID_EVENT", "remix-invalid-event-test");
need(remixTests, "REMIXROTA_DISCOVERY_PROCESS_NOT_RUNNING", "remix-stale-discovery-test");
need(remixUi, "trustedThumbnailUrl", "remix-thumbnail-allowlist");
need(remixUi, 'host === "i.ytimg.com"', "remix-thumbnail-host-check");
need(remixUi, 'url.protocol !== "https:"', "remix-thumbnail-https-only");

console.log(`API_EVOLUTION_V10_VERIFY_PASS checks=${checks} inherited=v9`);
