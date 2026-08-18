import { readFile, writeFile } from "node:fs/promises";

const file = "src/main/services/language-debug-service.ts";
let source = (await readFile(file, "utf8")).replace(/\r\n?/gu, "\n");
const importBefore = 'import { pathToFileURL } from "node:url";';
const importAfter = 'import { fileURLToPath, pathToFileURL } from "node:url";';
if (!source.includes(importAfter)) {
  const at = source.indexOf(importBefore);
  if (at < 0 || at !== source.lastIndexOf(importBefore)) throw new Error("V015_TS_FIX2_URL_IMPORT_ANCHOR_INVALID");
  source = source.slice(0, at) + importAfter + source.slice(at + importBefore.length);
}
const typeAnchor = `type ManagedLanguageSession = {
  projectId: string;`;
const helper = `function sameDocumentUri(left: string, right: string): boolean {
  if (left === right) return true;
  try {
    const normalizePath = (value: string): string => {
      const resolved = path.resolve(fileURLToPath(value));
      return process.platform === "win32" ? resolved.toLocaleLowerCase("en-US") : resolved;
    };
    return normalizePath(left) === normalizePath(right);
  } catch {
    return false;
  }
}

type ManagedLanguageSession = {
  projectId: string;`;
if (!source.includes("function sameDocumentUri(")) {
  const at = source.indexOf(typeAnchor);
  if (at < 0 || at !== source.lastIndexOf(typeAnchor)) throw new Error("V015_TS_FIX2_HELPER_ANCHOR_INVALID");
  source = source.slice(0, at) + helper + source.slice(at + typeAnchor.length);
}
const compareBefore = `        const publication = normalizeDiagnostics(message);
        if (!publication || publication.uri !== documentUri) return;`;
const compareAfter = `        const publication = normalizeDiagnostics(message);
        if (!publication || !sameDocumentUri(publication.uri, documentUri)) return;`;
if (!source.includes(compareAfter)) {
  const at = source.indexOf(compareBefore);
  if (at < 0 || at !== source.lastIndexOf(compareBefore)) throw new Error("V015_TS_FIX2_URI_COMPARE_ANCHOR_INVALID");
  source = source.slice(0, at) + compareAfter + source.slice(at + compareBefore.length);
}
await writeFile(file, source, "utf8");
console.log("V015_TS_FIX2_PASS");
