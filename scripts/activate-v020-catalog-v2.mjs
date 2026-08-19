import { readFile, writeFile } from "node:fs/promises";

const file = "src/renderer/App.tsx";
let source = (await readFile(file, "utf8")).replace(/\r\n/gu, "\n");

const oldImport = `import {\n  AutomationWorkspace,\n  CatalogWorkspace,\n  IntegrationWorkspace,`;
const newImport = `import {\n  AutomationWorkspace,\n  IntegrationWorkspace,`;
const oldRoute = `{view === "skills" && <CatalogWorkspace />}`;
const newRoute = `{view === "skills" && <CatalogWorkspaceV2 />}`;

if (source.split(oldImport).length - 1 !== 1) throw new Error("CATALOG_V2_IMPORT_ANCHOR_MISMATCH");
if (source.split(oldRoute).length - 1 !== 1) throw new Error("CATALOG_V2_ROUTE_ANCHOR_MISMATCH");
if (source.includes('from "./CatalogWorkspaceV2"')) throw new Error("CATALOG_V2_ALREADY_IMPORTED");

source = source.replace(oldImport, newImport);
source = source.replace('import { RemixRotaWorkspace } from "./RemixRotaWorkspace";\n', 'import { RemixRotaWorkspace } from "./RemixRotaWorkspace";\nimport { CatalogWorkspaceV2 } from "./CatalogWorkspaceV2";\n');
source = source.replace(oldRoute, newRoute);

if (source.includes("<CatalogWorkspace />") || source.includes("  CatalogWorkspace,")) throw new Error("LEGACY_CATALOG_ROUTE_REMAINS");
if (!source.includes("<CatalogWorkspaceV2 />") || !source.includes('from "./CatalogWorkspaceV2"')) throw new Error("CATALOG_V2_ACTIVATION_MISSING");

await writeFile(file, source, "utf8");
console.log("V020_CATALOG_V2_ACTIVATION_PASS");
