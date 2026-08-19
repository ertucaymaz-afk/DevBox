import { readFile, writeFile } from "node:fs/promises";

const publicFile = "cloud/devapi-control/api/v1/public-state.mjs";
const verifyFile = "scripts/verify-cloud-ecosystem.mjs";
let source = (await readFile(publicFile, "utf8")).replace(/\r\n/gu, "\n");
let verify = (await readFile(verifyFile, "utf8")).replace(/\r\n/gu, "\n");

function replaceOnce(input, before, after, code) {
  const first = input.indexOf(before);
  const last = input.lastIndexOf(before);
  if (first < 0 || first !== last) throw new Error(`${code}: expected exactly one anchor`);
  return input.slice(0, first) + after + input.slice(first + before.length);
}

source = replaceOnce(
  source,
  `    if (!projectId) {\n      const projects = await listProjects(1);\n      projectId = String(projects[0]?.projectId ?? "");\n    }\n    if (projectId.length < 8 || projectId.length > 128) return send(res, 404, { error: "PROJECT_NOT_FOUND" });`,
  `    if (!projectId) {\n      const projects = await listProjects(2);\n      if (projects.length === 0) return send(res, 404, { error: "PROJECT_NOT_FOUND" });\n      if (projects.length !== 1) return send(res, 409, { error: "PUBLIC_PROJECT_AMBIGUOUS" });\n      projectId = String(projects[0]?.projectId ?? "");\n    }\n    if (projectId.length < 8 || projectId.length > 128) return send(res, 404, { error: "PROJECT_NOT_FOUND" });`,
  "PUBLIC_PROJECT_SELECTION_ANCHOR"
);

verify = replaceOnce(
  verify,
  `requireText("devapiPublic", "etag", "public-etag");`,
  `requireText("devapiPublic", "etag", "public-etag");\nrequireText("devapiPublic", "listProjects(2)", "public-project-selection-bounded");\nrequireText("devapiPublic", "PUBLIC_PROJECT_AMBIGUOUS", "public-project-selection-fail-closed");`,
  "PUBLIC_SELECTION_VERIFY_ANCHOR"
);

for (const required of ["listProjects(2)", "PUBLIC_PROJECT_AMBIGUOUS", "projects.length !== 1"]) {
  if (!source.includes(required)) throw new Error(`PUBLIC_PROJECT_SELECTION_GUARD_MISSING:${required}`);
}
if (source.includes("listProjects(1)")) throw new Error("PUBLIC_PROJECT_LATEST_WINS_SELECTION_REMAINS");

await writeFile(publicFile, source, "utf8");
await writeFile(verifyFile, verify, "utf8");
console.log("V020_PUBLIC_PROJECT_SELECTION_PATCH_PASS");
