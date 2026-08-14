import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const workspace = path.resolve(new URL("..", import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/u, (match) => match.slice(1)));
const releaseDirectory = path.join(workspace, "release");
const stage = path.join(releaseDirectory, "devbox-package");
const installer = path.join(releaseDirectory, "DevBox-Setup.exe");
const packageJson = JSON.parse(await readFile(path.join(workspace, "package.json"), "utf8"));
const lockText = await readFile(path.join(workspace, "pnpm-lock.yaml"), "utf8");
const execFileAsync = promisify(execFile);

await rm(stage, { recursive: true, force: true });
await mkdir(stage, { recursive: true });
await copyFile(installer, path.join(stage, "DevBox-Setup.exe"));

const directPackages = Object.entries({ ...packageJson.dependencies, ...packageJson.devDependencies })
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([name, version]) => ({ type: "library", name, version: String(version).replace(/^[~^]/u, ""), scope: packageJson.dependencies[name] ? "required" : "optional" }));
const sbom = {
  bomFormat: "CycloneDX",
  specVersion: "1.5",
  serialNumber: `urn:uuid:${randomUUID()}`,
  version: 1,
  metadata: { timestamp: new Date().toISOString(), component: { type: "application", name: "DevBox", version: packageJson.version } },
  components: directPackages
};
await writeFile(path.join(releaseDirectory, "sbom.cdx.json"), `${JSON.stringify(sbom, null, 2)}\n`, "utf8");

const notices = [
  "DevBox — Third-Party Notices",
  "",
  "This distribution contains Electron/Chromium/Node.js and the direct packages listed below.",
  "Exact transitive resolution is recorded by the source pnpm-lock.yaml SHA-256 in release-manifest.json.",
  "Review each upstream package's license before public redistribution.",
  "",
  ...directPackages.map((dependency) => `- ${dependency.name}@${dependency.version} (${dependency.scope})`),
  ""
].join("\n");
await writeFile(path.join(stage, "THIRD-PARTY-NOTICES.txt"), notices, "utf8");

const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");
const installerBuffer = await readFile(path.join(stage, "DevBox-Setup.exe"));
const signatureCommand = [
  "$signature = Get-AuthenticodeSignature -LiteralPath $env:DEVBOX_SIGNATURE_TARGET",
  "$signature.Status.ToString()"
].join("; ");
let authenticode = "UNKNOWN";
try {
  const { stdout } = await execFileAsync("pwsh.exe", ["-NoProfile", "-NonInteractive", "-Command", signatureCommand], {
    env: { ...process.env, DEVBOX_SIGNATURE_TARGET: path.join(stage, "DevBox-Setup.exe") },
    windowsHide: true,
    timeout: 30_000
  });
  const status = stdout.trim();
  authenticode = status === "Valid" ? "VALID" : status === "NotSigned" ? "NOT_SIGNED" : status.replace(/([a-z])([A-Z])/gu, "$1_$2").toUpperCase();
} catch {
  authenticode = "VERIFICATION_ERROR";
}
const manifest = {
  schemaVersion: 1,
  product: "DevBox",
  version: packageJson.version,
  generatedAt: new Date().toISOString(),
  releaseReady: false,
  verdict: "FUNCTIONAL_PREVIEW_NOT_FULL_22_PD_RELEASE",
  installer: { file: "DevBox-Setup.exe", sha256: sha256(installerBuffer), bytes: installerBuffer.byteLength, authenticode },
  sourceLockSha256: sha256(Buffer.from(lockText, "utf8")),
  knownReleaseBlockers: [
    authenticode === "VALID"
      ? "Authenticode is valid, but the remaining product release gates below are not complete."
      : "Authenticode is blocked because no identity-validated public code-signing certificate/private key is available; the signed build path now fails closed.",
    "Signed package verification, atomic installation, repair and rollback are implemented locally; automatic replacement of the running app still requires a signed release channel and Authenticode handoff.",
    "Real LSP/DAP executable discovery and protocol sessions exist, but diagnostics/editor and debugger control UI are not release-complete.",
    "Durable job leases, evidence-backed DevBox API evolution tasks and explicit SSH host-key pinning exist, but a restart-resumable multi-machine remote worker scheduler and pairing protocol are not release-complete.",
    "ConPTY has a real node-pty execution path and bounded failure-injection tests exist; this packaging turn intentionally skipped runtime smoke/soak, while multi-hour soak and clean Windows VM failure matrices remain incomplete."
  ]
};
await writeFile(path.join(stage, "release-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

const hashes = [];
for (const name of ["DevBox-Setup.exe", "THIRD-PARTY-NOTICES.txt", "release-manifest.json"]) {
  hashes.push(`${sha256(await readFile(path.join(stage, name)))} *${name}`);
}
await writeFile(path.join(stage, "SHA256SUMS.txt"), `${hashes.join("\n")}\n`, "utf8");
process.stdout.write(`${stage}\n`);
