import { readFile, writeFile } from "node:fs/promises";

const file = "scripts/verify-api-evolution-v8.mjs";
let source = (await readFile(file, "utf8")).replace(/\r\n/gu, "\n");
const before = `check("v015-version", /"version"\\s*:\\s*"0\\.1\\.15"/u.test(pkg));
check("v8-is-release-script", pkg.includes('"evolution:verify": "node scripts/verify-api-evolution-v8.mjs"'));`;
const after = `const manifest = JSON.parse(pkg);
const versionParts = String(manifest.version ?? "0.0.0").split(".").map((part) => Number.parseInt(part, 10));
const [versionMajor = 0, versionMinor = 0, versionPatch = 0] = versionParts;
const meetsV8Minimum = versionMajor > 0 || versionMinor > 1 || (versionMajor === 0 && versionMinor === 1 && versionPatch >= 15);
check("v8-min-version", meetsV8Minimum, String(manifest.version ?? "missing"));
const inheritedVerifier = /^node scripts\\/verify-api-evolution-v(\\d+)\\.mjs$/u.exec(String(manifest.scripts?.["evolution:verify"] ?? ""));
check("v8-inherited-release-script", Boolean(inheritedVerifier && Number(inheritedVerifier[1]) >= 8), String(manifest.scripts?.["evolution:verify"] ?? "missing"));`;
if (!source.includes(after)) {
  const at = source.indexOf(before);
  if (at < 0 || source.indexOf(before, at + 1) >= 0) throw new Error("V016_V8_FORWARD_COMPAT_ANCHOR_INVALID");
  source = source.slice(0, at) + after + source.slice(at + before.length);
}
await writeFile(file, source, "utf8");
console.log("DEVBOX_V016_VERIFIER_APPLIED");
