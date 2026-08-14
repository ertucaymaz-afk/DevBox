import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const target = path.resolve(process.argv[2] ?? "release/devbox-package");
const allowed = new Set(["DevBox-Setup.exe", "SHA256SUMS.txt", "THIRD-PARTY-NOTICES.txt", "release-manifest.json", "sbom.cdx.json"]);
const files = (await readdir(target)).sort();
if (files.length !== allowed.size || files.some((file) => !allowed.has(file))) throw new Error(`Unexpected release inventory: ${files.join(", ")}`);

const manifest = JSON.parse(await readFile(path.join(target, "release-manifest.json"), "utf8"));
const installer = await readFile(path.join(target, "DevBox-Setup.exe"));
const digest = createHash("sha256").update(installer).digest("hex");
if (digest !== manifest.installer.sha256 || installer.byteLength !== manifest.installer.bytes) throw new Error("Installer hash/size does not match release-manifest.json");
if (manifest.source?.repository !== "git+https://github.com/ertucaymaz-afk/DevBox.git" || !/^[a-f0-9]{40}$/u.test(manifest.source?.commit ?? "")) {
  throw new Error("Release manifest does not identify the public DevBox repository and an exact source commit");
}

const sbom = JSON.parse(await readFile(path.join(target, "sbom.cdx.json"), "utf8"));
if (sbom.bomFormat !== "CycloneDX" || sbom.specVersion !== "1.5" || sbom.metadata?.component?.name !== "DevBox" || sbom.metadata?.component?.version !== manifest.version) {
  throw new Error("CycloneDX SBOM identity does not match the release manifest");
}

const sums = await readFile(path.join(target, "SHA256SUMS.txt"), "utf8");
const hashedFiles = new Set();
for (const line of sums.trim().split(/\r?\n/u)) {
  const match = line.match(/^([a-f0-9]{64}) \*(.+)$/u);
  if (!match) throw new Error(`Malformed SHA256SUMS line: ${line}`);
  const actual = createHash("sha256").update(await readFile(path.join(target, match[2]))).digest("hex");
  if (actual !== match[1]) throw new Error(`Hash mismatch: ${match[2]}`);
  hashedFiles.add(match[2]);
}
for (const required of ["DevBox-Setup.exe", "THIRD-PARTY-NOTICES.txt", "release-manifest.json", "sbom.cdx.json"]) {
  if (!hashedFiles.has(required)) throw new Error(`SHA256SUMS does not cover required release file: ${required}`);
}

const forbiddenNames = files.filter((file) => /(?:^|[._-])(\.env|node_modules|src|test-results|playwright-report|logs?)(?:$|[._-])/iu.test(file));
if (forbiddenNames.length) throw new Error(`Forbidden release paths: ${forbiddenNames.join(", ")}`);
const secretCandidates = [process.env.NVIDIA_API_KEY, process.env.NVİDİA_API_KEY].filter((value) => typeof value === "string" && value.length >= 12);
for (const file of files) {
  const data = await readFile(path.join(target, file));
  for (const secret of secretCandidates) {
    if (data.includes(Buffer.from(secret, "utf8"))) throw new Error(`Environment secret embedded in release file: ${file}`);
  }
  if (file.endsWith(".json") || file.endsWith(".md") || file.endsWith(".txt")) {
    const text = data.toString("utf8");
    if (/(?:sk-[A-Za-z0-9_-]{20,}|nvapi-[A-Za-z0-9_-]{20,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/u.test(text)) {
      throw new Error(`Generic secret pattern found in release text file: ${file}`);
    }
  }
}

process.stdout.write(`${JSON.stringify({ target, files, installerSha256: digest, secretScan: "PASS", hashVerification: "PASS" }, null, 2)}\n`);
