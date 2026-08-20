import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve("cloud/devapi-control");
const API_ROOT = path.join(ROOT, "api/v1");
const OUTPUT = path.resolve("outputs/devapi-repo-inventory.json");
const IGNORED_DIRS = new Set(["node_modules", ".vercel", "dist", "coverage", ".cache"]);

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.isDirectory() && IGNORED_DIRS.has(entry.name)) continue;
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(absolute));
    else if (entry.isFile()) files.push(absolute);
  }
  return files;
}

function rel(file) { return path.relative(process.cwd(), file).replaceAll(path.sep, "/"); }
function sha256(content) { return createHash("sha256").update(content).digest("hex"); }
function unique(values) { return [...new Set(values)].sort(); }

function methodsFromSource(source) {
  const matches = [...source.matchAll(/req\.method\s*(?:===|!==)\s*["'](GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)["']/gu)];
  return unique(matches.map((match) => match[1]));
}

function importsFromSource(source) {
  const matches = [...source.matchAll(/from\s+["']([^"']+)["']/gu)];
  return unique(matches.map((match) => match[1]));
}

const files = await walk(ROOT);
const fileRecords = [];
for (const file of files) {
  const content = await readFile(file);
  const text = /\.(?:mjs|js|json|md|html|css)$/u.test(file) ? content.toString("utf8") : "";
  fileRecords.push({
    path: rel(file),
    bytes: content.byteLength,
    sha256: sha256(content),
    imports: /\.(?:mjs|js)$/u.test(file) ? importsFromSource(text) : []
  });
}

const routeFiles = (await readdir(API_ROOT, { withFileTypes: true }))
  .filter((entry) => entry.isFile() && entry.name.endsWith(".mjs"))
  .map((entry) => entry.name)
  .sort();
const routes = [];
for (const filename of routeFiles) {
  const file = path.join(API_ROOT, filename);
  const source = await readFile(file, "utf8");
  routes.push({
    route: `/api/v1/${filename.replace(/\.mjs$/u, "")}`,
    sourceFile: rel(file),
    methods: methodsFromSource(source),
    authSignals: {
      admin: source.includes("requireAdminAuth"),
      desktop: source.includes("requireDesktopAuth")
    },
    sha256: sha256(source)
  });
}

const report = {
  schemaVersion: 2,
  product: "DevAPI",
  scope: "cloud/devapi-control",
  ignoredDirectories: [...IGNORED_DIRS].sort(),
  sourceSha: process.env.GITHUB_SHA || "LOCAL",
  generatedAt: new Date().toISOString(),
  counts: { files: fileRecords.length, routes: routes.length },
  routes,
  files: fileRecords
};
await mkdir(path.dirname(OUTPUT), { recursive: true });
await writeFile(OUTPUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`DEVAPI_REPO_INVENTORY_PASS files=${fileRecords.length} routes=${routes.length} ignoredGenerated=true output=${rel(OUTPUT)}`);
