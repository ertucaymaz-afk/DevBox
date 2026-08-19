import { readFile, writeFile } from "node:fs/promises";

async function replaceExact(file, label, before, after) {
  const source = (await readFile(file, "utf8")).replace(/\r\n/gu, "\n");
  const matches = source.split(before).length - 1;
  if (matches !== 1) throw new Error(`${label}: expected exactly one anchor in ${file}, found ${matches}`);
  const next = source.replace(before, after);
  if (next === source) throw new Error(`${label}: replacement produced no change`);
  await writeFile(file, next, "utf8");
}

await replaceExact(
  "src/renderer/App.tsx",
  "app-v2-imports",
  `import {\n  AutomationWorkspace,\n  CatalogWorkspace,\n  IntegrationWorkspace,\n  SettingsWorkspace,\n  TerminalWorkspace,\n  WorktreeWorkspace,\n  themeStyle\n} from "./AdvancedViews";\nimport { WhatsNewWorkspace } from "./WhatsNewWorkspace";`,
  `import {\n  AutomationWorkspace,\n  CatalogWorkspace,\n  IntegrationWorkspace,\n  TerminalWorkspace,\n  WorktreeWorkspace\n} from "./AdvancedViews";\nimport { SettingsWorkspaceV2 } from "./SettingsWorkspaceV2";\nimport { themeStyleV2 } from "./theme-style-v2";\nimport { WhatsNewWorkspace } from "./WhatsNewWorkspace";`
);
await replaceExact("src/renderer/App.tsx", "app-v2-theme-style", `style={themeStyle(appSettings)}`, `style={themeStyleV2(appSettings)}`);
await replaceExact("src/renderer/App.tsx", "app-v2-settings-route", `<SettingsWorkspace settings={appSettings}`, `<SettingsWorkspaceV2 settings={appSettings}`);
await replaceExact("src/renderer/SettingsWorkspaceV2.tsx", "settings-v2-css", `import { Copy, Monitor, Moon, ShieldCheck, SquareTerminal, Sun, Upload, X } from "lucide-react";`, `import "./settings-v2.css";\nimport { Copy, Monitor, Moon, ShieldCheck, SquareTerminal, Sun, Upload, X } from "lucide-react";`);

await replaceExact(
  "src/renderer/design-system-v2.css",
  "dark-accent-override",
  `  --ds-accent: #FF4A2D;\n  --ds-accent-hover: #FF5E43;\n  --ds-accent-active: #E43A21;\n  --ds-accent-soft: rgba(255,74,45,.12);\n  --ds-accent-border: rgba(255,74,45,.42);`,
  `  --ds-accent: var(--theme-accent, #FF4A2D);\n  --ds-accent-hover: color-mix(in srgb, var(--ds-accent) 86%, white 14%);\n  --ds-accent-active: color-mix(in srgb, var(--ds-accent) 84%, black 16%);\n  --ds-accent-soft: color-mix(in srgb, var(--ds-accent) 12%, transparent);\n  --ds-accent-border: color-mix(in srgb, var(--ds-accent) 42%, transparent);`
);
await replaceExact(
  "src/renderer/design-system-v2.css",
  "light-accent-override",
  `  --ds-accent: #E9442C;\n  --ds-accent-hover: #F05238;\n  --ds-accent-active: #C93521;\n  --ds-accent-soft: rgba(233,68,44,.09);\n  --ds-accent-border: rgba(233,68,44,.30);`,
  `  --ds-accent: var(--theme-accent, #E9442C);\n  --ds-accent-hover: color-mix(in srgb, var(--ds-accent) 86%, white 14%);\n  --ds-accent-active: color-mix(in srgb, var(--ds-accent) 84%, black 16%);\n  --ds-accent-soft: color-mix(in srgb, var(--ds-accent) 10%, transparent);\n  --ds-accent-border: color-mix(in srgb, var(--ds-accent) 30%, transparent);`
);

await replaceExact(
  "src/renderer/AdvancedViews.tsx",
  "status-human-evolution-stages",
  `    IDLE: "BEKLİYOR",\n    ONLINE: "ÇEVRİM İÇİ",`,
  `    IDLE: "BEKLİYOR",\n    QUEUEING: "KUYRUĞA ALINIYOR",\n    PREPARING: "HAZIRLANIYOR",\n    PROVIDER_CHECK: "SAĞLAYICI DOĞRULANIYOR",\n    AUTH_CHECK: "OTURUM DOĞRULANIYOR",\n    MODEL_ATTEMPT: "MODEL HAZIRLANIYOR",\n    PLANNING: "PLANLANIYOR",\n    INSPECTING: "KAYNAK İNCELENİYOR",\n    EDITING: "KODLANIYOR",\n    RUNNING_COMMAND: "KOMUT YÜRÜTÜLÜYOR",\n    TESTING: "TEST EDİLİYOR",\n    VERIFYING: "DOĞRULANIYOR",\n    REVIEWING: "KANIT İNCELENİYOR",\n    WAITING: "BEKLİYOR",\n    SETTLING: "SONUÇLANDIRILIYOR",\n    ONLINE: "ÇEVRİM İÇİ",`
);
await replaceExact(
  "src/renderer/AdvancedViews.tsx",
  "phase-progress-human-stage",
  `? \`${campaign.spec.currentPhaseId}/22 · G\${campaign.spec.currentTaskIndex ?? "—"}/\${campaign.spec.currentPhaseTaskCount ?? "—"} · \${campaign.runtime.stage}\``,
  `? \`${campaign.spec.currentPhaseId}/22 · G\${campaign.spec.currentTaskIndex ?? "—"}/\${campaign.spec.currentPhaseTaskCount ?? "—"} · \${evolutionStageLabel(campaign.runtime.stage)}\``
);
await replaceExact("src/renderer/AdvancedViews.tsx", "evolution-version-copy", `KALICI GELİŞİM KONTROL DÜZLEMİ · V9 ADAPTIVE`, `KALICI GELİŞİM KONTROL DÜZLEMİ · ADAPTİF`);

await replaceExact(
  "src/renderer/AdvancedViews.tsx",
  "terminal-system-theme-state",
  `  const [terminalReady, setTerminalReady] = useState(false);\n  const [error, setError] = useState<string | null>(null);\n\n  const reload = useCallback(async () => {`,
  `  const [terminalReady, setTerminalReady] = useState(false);\n  const [error, setError] = useState<string | null>(null);\n  const [systemDark, setSystemDark] = useState(() => window.matchMedia("(prefers-color-scheme: dark)").matches);\n  useEffect(() => {\n    const media = window.matchMedia("(prefers-color-scheme: dark)");\n    const listener = (event: MediaQueryListEvent): void => setSystemDark(event.matches);\n    setSystemDark(media.matches);\n    media.addEventListener("change", listener);\n    return () => media.removeEventListener("change", listener);\n  }, []);\n  const terminalIsLight = settings?.theme.base === "light" || (settings?.theme.base === "system" && !systemDark);\n\n  const reload = useCallback(async () => {`
);
await replaceExact("src/renderer/AdvancedViews.tsx", "terminal-system-theme-palette", `theme: settings?.theme.base === "light"`, `theme: terminalIsLight`);
await replaceExact("src/renderer/AdvancedViews.tsx", "terminal-system-theme-dependency", `  }, [reload, settings?.theme.base]);`, `  }, [reload, terminalIsLight]);`);

await replaceExact(
  "scripts/verify-api-evolution-v9.mjs",
  "v9-v2-read-list",
  `const [pkg, contracts, findingContracts, findings, evolution, remixContracts, remixService, remixTest, bridge, preload, ipc, main, app, rendererMain, musicUi, theme, lightCss, musicCss, designSystem, componentCss, iconScript] = await Promise.all([`,
  `const [pkg, contracts, findingContracts, findings, evolution, remixContracts, remixService, remixTest, bridge, preload, ipc, main, app, advancedViews, rendererMain, musicUi, theme, lightCss, musicCss, designSystem, componentCss, settingsV2, settingsCss, themeStyleV2, iconScript] = await Promise.all([`
);
await replaceExact(
  "scripts/verify-api-evolution-v9.mjs",
  "v9-v2-read-files",
  `  readFile("src/renderer/App.tsx", "utf8"),\n  readFile("src/renderer/main.tsx", "utf8"),\n  readFile("src/renderer/RemixRotaWorkspace.tsx", "utf8"),`,
  `  readFile("src/renderer/App.tsx", "utf8"),\n  readFile("src/renderer/AdvancedViews.tsx", "utf8"),\n  readFile("src/renderer/main.tsx", "utf8"),\n  readFile("src/renderer/RemixRotaWorkspace.tsx", "utf8"),`
);
await replaceExact(
  "scripts/verify-api-evolution-v9.mjs",
  "v9-v2-read-files-tail",
  `  readFile("src/renderer/design-system-v2.css", "utf8"),\n  readFile("src/renderer/design-system-v2-components.css", "utf8"),\n  readFile("scripts/generate-app-icon.mjs", "utf8")`,
  `  readFile("src/renderer/design-system-v2.css", "utf8"),\n  readFile("src/renderer/design-system-v2-components.css", "utf8"),\n  readFile("src/renderer/SettingsWorkspaceV2.tsx", "utf8"),\n  readFile("src/renderer/settings-v2.css", "utf8"),\n  readFile("src/renderer/theme-style-v2.ts", "utf8"),\n  readFile("scripts/generate-app-icon.mjs", "utf8")`
);
await replaceExact(
  "scripts/verify-api-evolution-v9.mjs",
  "v9-v2-new-contract-checks",
  `check("music-theme-parity", componentCss.includes(".music-connection-details") && musicCss.includes(".music-track-row.current"));`,
  `check("music-theme-parity", componentCss.includes(".music-connection-details") && musicCss.includes(".music-track-row.current"));\ncheck("design-v2-user-accent-boundary", designSystem.includes("var(--theme-accent") && themeStyleV2.includes("--theme-accent") && !themeStyleV2.includes("--bg-app") && !themeStyleV2.includes("--bg-sidebar") && !themeStyleV2.includes("--bg-panel"));\ncheck("settings-v2-real-contract", all(settingsV2, ["window.devbox.patchSettings", 'base: "system"', "terminalShell", "permissionProfile", "reduceMotion", "launchIntroMode", "window.devbox.importTheme", "window.devbox.exportTheme"]));\ncheck("settings-v2-layout", all(settingsCss, [".settings-v2-layout", ".settings-v2-nav", ".theme-thumb.dark", ".theme-thumb.light", ".theme-thumb.system"]));\ncheck("app-v2-wiring", all(app, ["SettingsWorkspaceV2", "themeStyleV2(appSettings)"]) && !app.includes("style={themeStyle(appSettings)}"));\ncheck("evolution-human-stage-surface", all(advancedViews, ['MODEL_ATTEMPT: "MODEL HAZIRLANIYOR"', 'RUNNING_COMMAND: "KOMUT YÜRÜTÜLÜYOR"', 'evolutionStageLabel(campaign.runtime.stage)', "KALICI GELİŞİM KONTROL DÜZLEMİ · ADAPTİF"]) && !advancedViews.includes("KALICI GELİŞİM KONTROL DÜZLEMİ · V9 ADAPTIVE"));\ncheck("terminal-system-theme-parity", all(advancedViews, ['matchMedia("(prefers-color-scheme: dark)")', 'settings?.theme.base === "system"', "terminalIsLight", "[reload, terminalIsLight]"]));`
);

console.log("V020_UI_V2_STAGE2_MATERIALIZE_PASS");
