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
const { stdout: sourceCommitOutput } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: workspace, windowsHide: true, timeout: 30_000 });
const sourceCommit = sourceCommitOutput.trim();
if (!/^[a-f0-9]{40}$/u.test(sourceCommit)) throw new Error("Unable to resolve an exact Git source commit for the release manifest");

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
const sbomText = `${JSON.stringify(sbom, null, 2)}\n`;
await writeFile(path.join(releaseDirectory, "sbom.cdx.json"), sbomText, "utf8");
await writeFile(path.join(stage, "sbom.cdx.json"), sbomText, "utf8");

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
  source: {
    repository: packageJson.repository.url,
    commit: sourceCommit
  },
  sourceLockSha256: sha256(Buffer.from(lockText, "utf8")),
  knownReleaseBlockers: [
    authenticode === "VALID"
      ? "Authenticode is valid, but the remaining product release gates below are not complete."
      : "Authenticode is blocked because no identity-validated public code-signing certificate/private key is available; the signed build path now fails closed.",
    "Signed package verification, atomic installation, repair and rollback are implemented locally; automatic replacement of the running app still requires a signed release channel and Authenticode handoff.",
    "TypeScript/JavaScript LSP diagnostics and the Microsoft JavaScript DAP control surface are real and tested; production-grade discovery and control surfaces for additional language/debug adapters remain incomplete.",
    "Durable job leases, one-time pairing, worker revocation, heartbeat recovery and cancellation passed a real same-machine Core API/worker E2E; physical second-machine and network-partition continuity evidence remains incomplete.",
    "ConPTY has a real node-pty execution path and bounded failure-injection tests exist; this packaging turn intentionally skipped user-interface smoke/soak, while multi-hour soak and clean Windows VM failure matrices remain incomplete.",
    "Third-party MCP processes are isolated child processes but not Windows AppContainer sandboxes; a hosted marketplace portal with publisher MFA/RBAC and server-side scanning is not part of this local preview."
  ]
};
await writeFile(path.join(stage, "release-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

const hashes = [];
for (const name of ["DevBox-Setup.exe", "THIRD-PARTY-NOTICES.txt", "release-manifest.json", "sbom.cdx.json"]) {
  hashes.push(`${sha256(await readFile(path.join(stage, name)))} *${name}`);
}
await writeFile(path.join(stage, "SHA256SUMS.txt"), `${hashes.join("\n")}\n`, "utf8");
process.stdout.write(`${stage}\n`);
