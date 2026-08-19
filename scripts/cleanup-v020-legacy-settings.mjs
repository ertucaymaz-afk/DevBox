import { readFile, writeFile } from "node:fs/promises";

const file = "src/renderer/AdvancedViews.tsx";
let source = (await readFile(file, "utf8")).replace(/\r\n/gu, "\n");

const settingsAnchor = "\nexport function SettingsWorkspace(";
const themeAnchor = "\nexport function themeStyle(";
const settingsCount = source.split(settingsAnchor).length - 1;
const themeCount = source.split(themeAnchor).length - 1;
if (settingsCount !== 1 || themeCount !== 1) {
  throw new Error(`LEGACY_SETTINGS_ANCHOR_MISMATCH settings=${settingsCount} theme=${themeCount}`);
}

const settingsStart = source.indexOf(settingsAnchor);
const themeStart = source.indexOf(themeAnchor, settingsStart + settingsAnchor.length);
if (settingsStart < 0 || themeStart <= settingsStart) throw new Error("LEGACY_SETTINGS_ORDER_INVALID");

const themeTail = source.slice(themeStart);
const themeMatch = themeTail.match(/^\nexport function themeStyle\([\s\S]*?\n\}\s*$/u);
if (!themeMatch || themeMatch[0].length !== themeTail.length) throw new Error("LEGACY_THEME_NOT_AT_FILE_TAIL");

source = source.slice(0, settingsStart).trimEnd() + "\n";
source = source.replace('import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";', 'import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";');
source = source.replace('import { DEVBOX_DAY_THEME, DEVBOX_OBSIDIAN_THEME } from "../shared/theme-presets";\n', "");

const xImportPattern = /\n  X\n\} from "lucide-react";/u;
if (!xImportPattern.test(source)) throw new Error("LEGACY_X_IMPORT_ANCHOR_MISSING");
source = source.replace(xImportPattern, '\n} from "lucide-react";');

for (const forbidden of ["SettingsWorkspace", "themeStyle(", "DEVBOX_DAY_THEME", "DEVBOX_OBSIDIAN_THEME", "CSSProperties", "<X "]) {
  if (source.includes(forbidden)) throw new Error(`LEGACY_SETTINGS_REFERENCE_REMAINS:${forbidden}`);
}

await writeFile(file, source, "utf8");
console.log("V020_LEGACY_SETTINGS_CLEANUP_PASS");
