import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";

let source = await readFile("scripts/apply-v015-control-plane.mjs", "utf8");
const before = '  let next = replaceUnique(source, `import type {`, `import { DEVBOX_DAY_THEME, DEVBOX_OBSIDIAN_THEME } from "../shared/theme-presets";\\nimport type {`, "advanced-theme-import");';
const after = '  let next = replaceUnique(source, `import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";\\nimport type {`, `import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";\\nimport { DEVBOX_DAY_THEME, DEVBOX_OBSIDIAN_THEME } from "../shared/theme-presets";\\nimport type {`, "advanced-theme-import");';
const at = source.indexOf(before);
if (at < 0 || at !== source.lastIndexOf(before)) throw new Error("V015_WRAPPER_ADVANCED_IMPORT_ANCHOR_INVALID");
source = source.slice(0, at) + after + source.slice(at + before.length);
const runtime = path.resolve("scripts/.apply-v015-control-plane2-runtime.mjs");
await writeFile(runtime, source, "utf8");
try { await import(`${pathToFileURL(runtime).href}?run=${Date.now()}`); }
finally { await import("node:fs/promises").then(({ rm }) => rm(runtime, { force: true })); }
