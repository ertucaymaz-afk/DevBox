import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

function assert(condition, code) { if (!condition) throw new Error(code); }

const packagePath = "cloud/devapi-control/package.json";
const lockPath = "cloud/devapi-control/package-lock.json";
const auditPath = "outputs/devapi-npm-audit.json";
const outPath = "outputs/devapi-agents-supply-chain.json";
const pkg = JSON.parse(await readFile(packagePath, "utf8"));
const lock = JSON.parse(await readFile(lockPath, "utf8"));
let audit = {};
try { audit = JSON.parse(await readFile(auditPath, "utf8")); } catch {}

assert(pkg.dependencies?.["@openai/agents"] === "0.14.3", "DEVAPI_AGENTS_DIRECT_VERSION_DRIFT");
assert(pkg.dependencies?.zod === "4.4.3", "DEVAPI_ZOD_DIRECT_VERSION_DRIFT");
assert(Number(lock.lockfileVersion) >= 3, "DEVAPI_LOCKFILE_VERSION_UNSUPPORTED");
const root = lock.packages?.[""] || {};
assert(root.dependencies?.["@openai/agents"] === "0.14.3", "DEVAPI_LOCK_ROOT_AGENTS_DRIFT");
assert(root.dependencies?.zod === "4.4.3", "DEVAPI_LOCK_ROOT_ZOD_DRIFT");

const entries = Object.entries(lock.packages || {}).filter(([name]) => name.startsWith("node_modules/"));
assert(entries.length > 0, "DEVAPI_LOCK_TRANSITIVE_EMPTY");
let missingIntegrity = [];
let insecureResolved = [];
let installScripts = [];
let missingLicense = [];
const licenses = new Set();
for (const [name, meta] of entries) {
  if (meta.link) continue;
  if (!meta.integrity || !/^sha(256|384|512)-/u.test(String(meta.integrity))) missingIntegrity.push(name);
  if (meta.resolved && !/^https:\/\//u.test(String(meta.resolved))) insecureResolved.push({ name, resolved: meta.resolved });
  if (meta.hasInstallScript) installScripts.push(name);
  if (!meta.license) missingLicense.push(name); else licenses.add(String(meta.license));
}
assert(missingIntegrity.length === 0, `DEVAPI_LOCK_MISSING_INTEGRITY:${missingIntegrity.slice(0,5).join(",")}`);
assert(insecureResolved.length === 0, `DEVAPI_LOCK_INSECURE_RESOLVED:${insecureResolved.slice(0,3).map(x=>x.name).join(",")}`);
assert(missingLicense.length === 0, `DEVAPI_LOCK_MISSING_LICENSE:${missingLicense.slice(0,5).join(",")}`);

const vulnerabilities = audit.metadata?.vulnerabilities || {};
const high = Number(vulnerabilities.high || 0);
const critical = Number(vulnerabilities.critical || 0);
assert(high === 0 && critical === 0, `DEVAPI_NPM_AUDIT_BLOCKER:high=${high}:critical=${critical}`);

const directAgents = lock.packages?.["node_modules/@openai/agents"];
const directZod = lock.packages?.["node_modules/zod"];
assert(directAgents?.version === "0.14.3", "DEVAPI_LOCK_AGENTS_RESOLVED_VERSION");
assert(directZod?.version === "4.4.3", "DEVAPI_LOCK_ZOD_RESOLVED_VERSION");
assert(/^sha512-/u.test(String(directAgents.integrity || "")), "DEVAPI_LOCK_AGENTS_INTEGRITY");
assert(/^sha512-/u.test(String(directZod.integrity || "")), "DEVAPI_LOCK_ZOD_INTEGRITY");

const report = {
  schemaVersion: 1,
  state: "SUPPLY_CHAIN_VERIFIED",
  packageManager: "npm",
  lockfileVersion: lock.lockfileVersion,
  packageCount: entries.length,
  direct: {
    agents: { version: directAgents.version, integrity: directAgents.integrity, license: directAgents.license || null },
    zod: { version: directZod.version, integrity: directZod.integrity, license: directZod.license || null }
  },
  audit: { high, critical, total: Number(vulnerabilities.total || 0) },
  installScripts,
  licenses: [...licenses].sort(),
  missingIntegrity: 0,
  insecureResolved: 0,
  missingLicense: 0,
  generatedAt: new Date().toISOString()
};
await mkdir(path.dirname(outPath), { recursive: true });
await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`DEVAPI_AGENTS_SUPPLY_CHAIN_PASS packages=${report.packageCount} auditHigh=${high} auditCritical=${critical} installScripts=${installScripts.length} licenses=${report.licenses.length} lockfile=${lock.lockfileVersion}`);
