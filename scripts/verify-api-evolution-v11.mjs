import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

function need(source, needle, id) {
  if (!source.includes(needle)) throw new Error(`API_EVOLUTION_V11_VERIFY_FAIL:${id}`);
}
function forbid(source, needle, id) {
  if (source.includes(needle)) throw new Error(`API_EVOLUTION_V11_VERIFY_FAIL:${id}`);
}
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

execFileSync(process.execPath, ["scripts/verify-api-evolution-v10.mjs"], { stdio: "inherit" });

const [pkgRaw, project, projectTests, lifecycle, lifecycleTests, ci, installerRuntime] = await Promise.all([
  readFile("package.json", "utf8"),
  readFile("src/main/services/project-service.ts", "utf8"),
  readFile("src/main/services/project-service.test.ts", "utf8"),
  readFile("src/main/services/package-lifecycle-service.ts", "utf8"),
  readFile("src/main/services/package-lifecycle-service.test.ts", "utf8"),
  readFile(".github/workflows/ci.yml", "utf8"),
  readFile("scripts/verify-installer-runtime.ps1", "utf8")
]);

const pkg = JSON.parse(pkgRaw);
if (!semverAtLeast(pkg.version, [0, 1, 18])) throw new Error("API_EVOLUTION_V11_VERIFY_FAIL:version-minimum");
const verifierMatch = /verify-api-evolution-v(\d+)\.mjs/u.exec(String(pkg.scripts?.["evolution:verify"] ?? ""));
if (!verifierMatch || Number(verifierMatch[1]) < 11) throw new Error("API_EVOLUTION_V11_VERIFY_FAIL:verifier-forward-compat");

let checks = 2;
need(project, 'entryInfo.isSymbolicLink()', "project-final-symlink-check"); checks += 1;
need(project, 'SYMLINK_FILE_EDIT_FORBIDDEN', "project-final-symlink-reject"); checks += 1;
need(projectTests, 'rejects editing a final file symlink', "project-symlink-regression"); checks += 1;
need(projectTests, 'readFile(outsideFile, "utf8")', "project-external-file-unchanged"); checks += 1;

need(lifecycle, "packagePayloadHash", "package-payload-identity"); checks += 1;
need(lifecycle, "PACKAGE_VERSION_CONTENT_CONFLICT", "package-version-conflict"); checks += 1;
need(lifecycle, 'path.join(finalDirectory, "manifest.devbox.json")', "package-audit-active-artifact"); checks += 1;
need(lifecycleTests, "rejects conflicting content for an already installed package version", "package-conflict-regression"); checks += 1;
need(lifecycleTests, "after.auditEvents", "package-conflict-no-false-audit"); checks += 1;

need(ci, "Windows kurulum başlatma ve kaldırma kabul testi", "installer-runtime-ci"); checks += 1;
need(ci, "outputs/installer-runtime-acceptance.json", "installer-runtime-evidence"); checks += 1;
forbid(ci, "INSTALLER_RUNTIME_ACCEPTANCE_FAILED:$LASTEXITCODE", "installer-runtime-last-exitcode-wrapper-forbidden"); checks += 1;
need(installerRuntime, "INSTALLED_EXE_HASH_MISMATCH", "installer-installed-hash"); checks += 1;
need(installerRuntime, "START_MENU_SHORTCUT_MISSING_OR_INVALID", "installer-start-menu"); checks += 1;
need(installerRuntime, "UNINSTALL_DID_NOT_REMOVE_APP", "installer-uninstall"); checks += 1;

console.log(`API_EVOLUTION_V11_VERIFY_PASS checks=${checks} inherited=v10`);
