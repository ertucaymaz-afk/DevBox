import { readFile, writeFile } from "node:fs/promises";

const file = "src/renderer/AdvancedViews.tsx";
let source = (await readFile(file, "utf8")).replace(/\r\n/gu, "\n");

const startAnchor = "\nexport function CatalogWorkspace(): ReactNode {";
const endAnchor = "\nfunction failure(error: unknown): string {";
const startCount = source.split(startAnchor).length - 1;
const endCount = source.split(endAnchor).length - 1;
if (startCount !== 1 || endCount !== 1) throw new Error(`LEGACY_CATALOG_ANCHOR_MISMATCH start=${startCount} end=${endCount}`);

const start = source.indexOf(startAnchor);
const end = source.indexOf(endAnchor, start + startAnchor.length);
if (start < 0 || end <= start) throw new Error("LEGACY_CATALOG_ORDER_INVALID");

const removed = source.slice(start, end);
for (const required of ["CatalogWorkspace", "CatalogToolRunner", "inspectCatalog", "callCatalogTool"]) {
  if (!removed.includes(required)) throw new Error(`LEGACY_CATALOG_BLOCK_INCOMPLETE:${required}`);
}

source = source.slice(0, start) + "\n" + source.slice(end + 1);

for (const [label, needle] of [
  ["plugzap", "  PlugZap,\n"],
  ["catalog-item-type", "  CatalogItem,\n"],
  ["catalog-snapshot-type", "  CatalogSnapshot,\n"]
]) {
  const count = source.split(needle).length - 1;
  if (count !== 1) throw new Error(`LEGACY_CATALOG_IMPORT_MISMATCH:${label}:${count}`);
  source = source.replace(needle, "");
}

for (const forbidden of ["CatalogWorkspace", "CatalogToolRunner", "CatalogItem", "CatalogSnapshot", "<PlugZap"]) {
  if (source.includes(forbidden)) throw new Error(`LEGACY_CATALOG_REFERENCE_REMAINS:${forbidden}`);
}
if (!source.includes("function failure(error: unknown): string")) throw new Error("SHARED_FAILURE_HELPER_REMOVED");
if (!source.includes("export function TerminalWorkspace")) throw new Error("TERMINAL_WORKSPACE_REMOVED");
if (!source.includes("export function AutomationWorkspace")) throw new Error("AUTOMATION_WORKSPACE_REMOVED");
if (!source.includes("export function IntegrationWorkspace")) throw new Error("INTEGRATION_WORKSPACE_REMOVED");

await writeFile(file, source, "utf8");
console.log(`V020_LEGACY_CATALOG_CLEANUP_PASS removedChars=${removed.length}`);
