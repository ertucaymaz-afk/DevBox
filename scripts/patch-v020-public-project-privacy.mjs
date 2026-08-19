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
  `    project: {\n      name: text(row?.project_name, 180) ?? "DevBox project",\n      ref: createHash("sha256").update(String(row?.project_id ?? "unknown")).digest("hex").slice(0, 12)\n    },`,
  `    project: {\n      name: "DevBox project",\n      ref: createHash("sha256").update(String(row?.project_id ?? "unknown")).digest("hex").slice(0, 12)\n    },`,
  "PUBLIC_PROJECT_NAME_ANCHOR"
);

verify = replaceOnce(
  verify,
  `forbidText("devapiPublic", "latest_snapshot,", "public-raw-snapshot");`,
  `forbidText("devapiPublic", "latest_snapshot,", "public-raw-snapshot");\nforbidText("devapiPublic", "row?.project_name", "public-project-name-leak");\nrequireText("devapiPublic", 'name: "DevBox project"', "public-project-name-sanitized");`,
  "PUBLIC_PRIVACY_VERIFY_ANCHOR"
);

if (source.includes("row?.project_name")) throw new Error("PUBLIC_PROJECT_NAME_LEAK_REMAINS");
if (!source.includes('name: "DevBox project"')) throw new Error("PUBLIC_PROJECT_SANITIZED_NAME_MISSING");

await writeFile(publicFile, source, "utf8");
await writeFile(verifyFile, verify, "utf8");
console.log("V020_PUBLIC_PROJECT_PRIVACY_PATCH_PASS");
