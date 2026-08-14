import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const workspace = path.resolve(new URL("..", import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/u, (match) => match.slice(1)));
const productionRoots = ["src/main", "src/preload", "src/renderer", "src/shared"];
const forbiddenRuntimePatterns = [
  { label: "runtime test-mode switch", pattern: /\b(?:DEVBOX_TEST_MODE|DEVBOX_E2E_[A-Z_]+|testMode)\b/u },
  { label: "mock/fake/demo/simulation marker", pattern: /\b(?:demo|fake|mock(?:ed|ing)?|simulat(?:e|ed|ion)|sahte|simülasyon)\b/iu }
];
const forbiddenPackagedName = /(?:^|[._-])(?:test|spec|fixture|mock|demo|e2e)(?:$|[._-])/iu;

async function filesBelow(directory) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await filesBelow(absolute));
    else if (entry.isFile()) output.push(absolute);
  }
  return output;
}

const violations = [];
for (const relativeRoot of productionRoots) {
  const root = path.join(workspace, relativeRoot);
  for (const file of await filesBelow(root)) {
    if (/\.test\.[cm]?[jt]sx?$/iu.test(file)) continue;
    const text = await readFile(file, "utf8");
    for (const rule of forbiddenRuntimePatterns) {
      if (rule.pattern.test(text)) violations.push(`${rule.label}: ${path.relative(workspace, file)}`);
    }
  }
}

const builder = await readFile(path.join(workspace, "electron-builder.yml"), "utf8");
if (!/^asar:\s*true\s*$/mu.test(builder)) violations.push("electron-builder must package the application as ASAR");
if (!/^\s+- dist\/\*\*\/\*\s*$/mu.test(builder) || !/^\s+- package\.json\s*$/mu.test(builder)) {
  violations.push("electron-builder files allowlist must contain only dist/**/* and package.json");
}

const dist = path.join(workspace, "dist");
for (const file of await filesBelow(dist)) {
  const relative = path.relative(dist, file);
  if (forbiddenPackagedName.test(relative)) violations.push(`test/demo artifact in dist: ${relative}`);
}

if (violations.length > 0) {
  throw new Error(`PRODUCT_TRUTH_AUDIT_FAILED\n${violations.map((item) => `- ${item}`).join("\n")}`);
}

process.stdout.write(`${JSON.stringify({
  verdict: "PASS",
  productionRoots,
  packagedFilesChecked: (await filesBelow(dist)).length,
  guarantees: [
    "No runtime test-mode switch in production sources",
    "No mock/fake/demo/simulation marker in production sources",
    "No test/demo artifact name in dist",
    "Electron Builder packages only dist and package metadata"
  ]
}, null, 2)}\n`);
