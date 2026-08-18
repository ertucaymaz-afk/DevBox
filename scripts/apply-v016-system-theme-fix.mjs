import { readFile, writeFile } from "node:fs/promises";

async function patch(file, before, after, label) {
  let source = (await readFile(file, "utf8")).replace(/\r\n/gu, "\n");
  if (source.includes(after)) return;
  const at = source.indexOf(before);
  if (at < 0 || source.indexOf(before, at + 1) >= 0) throw new Error(`V016_SYSTEM_THEME_ANCHOR_INVALID:${label}`);
  source = source.slice(0, at) + after + source.slice(at + before.length);
  await writeFile(file, source, "utf8");
}

await patch(
  "src/main/main.ts",
  'import { app, BrowserWindow, Menu, net, protocol, session, shell } from "electron";',
  'import { app, BrowserWindow, Menu, nativeTheme, net, protocol, session, shell } from "electron";',
  "main-native-theme-import"
);
await patch(
  "src/main/main.ts",
  'function createWindow(themeBase: "light" | "dark"): BrowserWindow {\n  const light = themeBase === "light";',
  'function createWindow(themeBase: "light" | "dark" | "system"): BrowserWindow {\n  const light = themeBase === "light" || (themeBase === "system" && !nativeTheme.shouldUseDarkColors);',
  "main-system-theme-resolution"
);
await patch(
  "src/main/ipc.ts",
  'import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, type IpcMainInvokeEvent, type MenuItemConstructorOptions } from "electron";',
  'import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, nativeTheme, type IpcMainInvokeEvent, type MenuItemConstructorOptions } from "electron";',
  "ipc-native-theme-import"
);
await patch(
  "src/main/ipc.ts",
  '      const light = next.theme.base === "light";',
  '      const light = next.theme.base === "light" || (next.theme.base === "system" && !nativeTheme.shouldUseDarkColors);',
  "ipc-system-theme-resolution"
);

console.log("DEVBOX_V016_SYSTEM_THEME_FIX_APPLIED");
