import { readFile, writeFile } from "node:fs/promises";

const file = "src/renderer/CatalogWorkspaceV2.tsx";
let source = (await readFile(file, "utf8")).replace(/\r\n/gu, "\n");

function replaceOnce(before, after, code) {
  const first = source.indexOf(before);
  const last = source.lastIndexOf(before);
  if (first < 0 || first !== last) throw new Error(`${code}: expected exactly one anchor`);
  source = source.slice(0, first) + after + source.slice(first + before.length);
}

replaceOnce(
  'import type { CatalogItem, CatalogSnapshot } from "../shared/contracts";\n',
  'import type { CatalogItem, CatalogSnapshot } from "../shared/contracts";\nimport { catalogCanRunTools, catalogHasFailure, catalogRuntimeClass, catalogRuntimeLabel, catalogSourceVerified, catalogTrustClass } from "./catalog-view-state";\n',
  "CATALOG_TRUTH_IMPORT"
);

const runtimeLabelBlock = `function runtimeLabel(item: CatalogItem): string {\n  if (item.runtimeState === "RUNNING") return "Çalışıyor";\n  if (item.runtimeState === "INSTALLED") return "Kurulu";\n  if (item.runtimeState === "FAILED") return "Çalışma hatası";\n  if (item.runtimeState === "SOURCE_ONLY") return "Kaynak hazır";\n  return "Kurulu değil";\n}\n\n`;
replaceOnce(runtimeLabelBlock, "", "LEGACY_RUNTIME_LABEL");

const runtimeClassBlock = `function runtimeClass(item: CatalogItem): string {\n  if (item.runtimeState === "RUNNING") return "ready";\n  if (item.runtimeState === "INSTALLED") return "installed";\n  if (item.runtimeState === "FAILED" || item.sourceState === "HASH_FAILED" || item.doctorState === "FAILED") return "failed";\n  return "source";\n}\n\n`;
replaceOnce(runtimeClassBlock, "", "LEGACY_RUNTIME_CLASS");

const trustClassBlock = `function trustClass(item: CatalogItem): string {\n  if (["MANAGED_SIGNED_CATALOG", "LOCAL_HASH_VERIFIED"].includes(item.trustClass) && item.sourceState !== "HASH_FAILED") return "verified";\n  if (item.sourceState === "HASH_FAILED" || item.doctorState === "FAILED" || item.runtimeState === "FAILED") return "blocked";\n  return "source";\n}\n\n`;
replaceOnce(trustClassBlock, "", "LEGACY_TRUST_CLASS");

replaceOnce(
  '  const verifiedPlugins = catalog?.items.some((item) => item.kind === "plugin" && ["HASH_VERIFIED", "BUNDLE_VERIFIED"].includes(item.sourceState)) ?? false;\n  const installedPlugins = catalog?.items.filter((item) => item.kind === "plugin" && ["INSTALLED", "RUNNING"].includes(item.runtimeState)).length ?? 0;\n  const runningPlugins = catalog?.items.filter((item) => item.kind === "plugin" && item.runtimeState === "RUNNING").length ?? 0;\n',
  '  const verifiedPlugins = catalog?.items.some((item) => item.kind === "plugin" && catalogSourceVerified(item) && !catalogHasFailure(item)) ?? false;\n  const installedPlugins = catalog?.items.filter((item) => item.kind === "plugin" && !catalogHasFailure(item) && ["INSTALLED", "RUNNING"].includes(item.runtimeState)).length ?? 0;\n  const runningPlugins = catalog?.items.filter((item) => item.kind === "plugin" && catalogCanRunTools(item)).length ?? 0;\n',
  "CATALOG_COUNTS"
);

replaceOnce(
  '<button onClick={() => void reload()} disabled={Boolean(busy)}><RefreshCw className={busy === "reload" ? "spin" : ""} size={14} /> Yeniden denetle</button>',
  '<button onClick={() => void runCatalogAction("reload", () => window.devbox.inspectCatalog())} disabled={Boolean(busy)}><RefreshCw className={busy === "reload" ? "spin" : ""} size={14} /> Yeniden denetle</button>',
  "CATALOG_RELOAD"
);

source = source.replaceAll("runtimeClass(item)", "catalogRuntimeClass(item)");
source = source.replaceAll("runtimeLabel(item)", "catalogRuntimeLabel(item)");
source = source.replaceAll("trustClass(item)", "catalogTrustClass(item)");

replaceOnce(
  '{item.runtimeState === "RUNNING" && item.tools.length > 0 && <CatalogToolRunnerV2 pluginId={item.id} tools={item.tools} />}',
  '{catalogCanRunTools(item) && item.tools.length > 0 && <CatalogToolRunnerV2 pluginId={item.id} tools={item.tools} />}',
  "CATALOG_TOOL_GATE"
);

for (const forbidden of ["function runtimeLabel(", "function runtimeClass(", "function trustClass(", "runtimeClass(item)", "runtimeLabel(item)", "trustClass(item)"]) {
  if (source.includes(forbidden)) throw new Error(`CATALOG_LEGACY_STATE_REMAINS:${forbidden}`);
}
for (const required of ["catalogHasFailure", "catalogSourceVerified", "catalogCanRunTools", "catalogRuntimeClass", "catalogRuntimeLabel", "catalogTrustClass", 'runCatalogAction("reload"']) {
  if (!source.includes(required)) throw new Error(`CATALOG_TRUTH_WIRING_MISSING:${required}`);
}

await writeFile(file, source, "utf8");
console.log("V020_CATALOG_TRUTH_HARDEN_PASS");
