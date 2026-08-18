import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

execFileSync(process.execPath, ["scripts/verify-api-evolution-v11.mjs"], { stdio: "inherit" });
const [pkgRaw, readme, cloudVerify, publicState, devboxIndex, devboxApp, devapiIndex] = await Promise.all([
  readFile("package.json", "utf8"),
  readFile("README.md", "utf8"),
  readFile("scripts/verify-cloud-ecosystem.mjs", "utf8"),
  readFile("cloud/devapi-control/api/v1/public-state.mjs", "utf8"),
  readFile("cloud/devbox-site/index.html", "utf8"),
  readFile("cloud/devbox-site/app.js", "utf8"),
  readFile("cloud/devapi-control/index.html", "utf8")
]);
const pkg = JSON.parse(pkgRaw);
function parseSemver(value) { const m = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/u.exec(String(value ?? "")); return m ? m.slice(1, 4).map(Number) : null; }
function atLeast(value, minimum) { const p = parseSemver(value); if (!p) return false; for (let i=0;i<3;i+=1){ if(p[i]>minimum[i])return true; if(p[i]<minimum[i])return false;} return true; }
function need(source, needle, id) { if (!source.includes(needle)) throw new Error(`API_EVOLUTION_V12_VERIFY_FAIL:${id}`); }
function forbid(source, needle, id) { if (source.includes(needle)) throw new Error(`API_EVOLUTION_V12_VERIFY_FAIL:${id}`); }
if (!atLeast(pkg.version, [0,1,19])) throw new Error("API_EVOLUTION_V12_VERIFY_FAIL:version-minimum");
const verifier = /verify-api-evolution-v(\d+)\.mjs/u.exec(String(pkg.scripts?.["evolution:verify"] ?? ""));
if (!verifier || Number(verifier[1]) < 12) throw new Error("API_EVOLUTION_V12_VERIFY_FAIL:verifier-forward-compat");
need(pkgRaw, '"cloud:verify"', "cloud-script");
need(pkgRaw, "pnpm cloud:verify", "cloud-in-main-verify");
need(readme, "DevBox v0.1.19", "readme-current-version");
forbid(readme, "Güncel işlevsel önizleme **DevBox v0.1.4**", "readme-stale-version");
need(readme, "300 MiB", "readme-attachment");
need(readme, "ConPTY", "readme-terminal");
need(readme, "SQLite + FTS5", "readme-memory");
need(readme, "DevAPI Cloud Control", "readme-cloud");
need(cloudVerify, "CLOUD_ECOSYSTEM_VERIFY_PASS", "cloud-gate");
need(publicState, "sanitizeSnapshot", "public-state-sanitized");
forbid(publicState, "latest_snapshot,", "public-state-raw-snapshot");
need(devboxIndex, "Gerçek özellikler.", "product-site-truth-features");
need(devboxIndex, "Gerçek kanıt.", "product-site-truth-evidence");
need(devboxApp, "/api/v1/public-state", "product-site-link");
need(devapiIndex, "v0.1.19", "devapi-site-version");
console.log("API_EVOLUTION_V12_VERIFY_PASS inherited=v11 cloudEcosystem=pass readme=truthful publicState=sanitized");
