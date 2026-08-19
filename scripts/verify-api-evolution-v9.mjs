import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";

await import("./verify-api-evolution-v8.mjs");

const [pkg, contracts, findingContracts, findings, evolution, remixContracts, remixService, remixTest, bridge, preload, ipc, main, app, advancedViews, rendererMain, musicUi, theme, lightCss, musicCss, designSystem, componentCss, settingsV2, settingsCss, themeStyleV2, iconScript] = await Promise.all([
  readFile("package.json", "utf8"),
  readFile("src/shared/contracts.ts", "utf8"),
  readFile("src/shared/devapi-control-contracts.ts", "utf8"),
  readFile("src/main/services/evolution-finding-service.ts", "utf8"),
  readFile("src/main/services/api-evolution-service.ts", "utf8"),
  readFile("src/shared/remixrota-contracts.ts", "utf8"),
  readFile("src/main/services/remixrota-service.ts", "utf8"),
  readFile("src/main/services/remixrota-service.test.ts", "utf8"),
  readFile("src/shared/bridge.ts", "utf8"),
  readFile("src/preload/preload.cts", "utf8"),
  readFile("src/main/ipc.ts", "utf8"),
  readFile("src/main/main.ts", "utf8"),
  readFile("src/renderer/App.tsx", "utf8"),
  readFile("src/renderer/AdvancedViews.tsx", "utf8"),
  readFile("src/renderer/main.tsx", "utf8"),
  readFile("src/renderer/RemixRotaWorkspace.tsx", "utf8"),
  readFile("src/shared/theme-presets.ts", "utf8"),
  readFile("src/renderer/light-theme-v016.css", "utf8"),
  readFile("src/renderer/remixrota-v016.css", "utf8"),
  readFile("src/renderer/design-system-v2.css", "utf8"),
  readFile("src/renderer/design-system-v2-components.css", "utf8"),
  readFile("src/renderer/SettingsWorkspaceV2.tsx", "utf8"),
  readFile("src/renderer/settings-v2.css", "utf8"),
  readFile("src/renderer/theme-style-v2.ts", "utf8"),
  readFile("scripts/generate-app-icon.mjs", "utf8")
]);

const checks = [];
function check(name, condition, detail = "") {
  if (!condition) throw new Error(`API_EVOLUTION_V9_VERIFY_FAILED:${name}${detail ? `:${detail}` : ""}`);
  checks.push(name);
}
function all(source, needles) { return needles.every((needle) => source.includes(needle)); }

const packageJson = JSON.parse(pkg);
const versionParts = String(packageJson.version ?? "").split(".").map(Number);
const v9Compatible = versionParts.length === 3
  && versionParts.every((value) => Number.isInteger(value) && value >= 0)
  && (versionParts[0] > 0 || versionParts[1] > 1 || (versionParts[1] === 1 && versionParts[2] >= 16));
check("v016-minimum-version", v9Compatible);
const evolutionVerify = String(packageJson.scripts?.["evolution:verify"] ?? "");
const verifierMatch = evolutionVerify.match(/verify-api-evolution-v(\d+)\.mjs/u);
check("v9-or-newer-release-script", Boolean(verifierMatch) && Number(verifierMatch?.[1] ?? 0) >= 9);
check("deterministic-icon-build", pkg.includes('"icon:generate": "node scripts/generate-app-icon.mjs"') && pkg.includes("pnpm icon:generate"));

const owners = ["core", "agent", "api", "release", "typescript", "evolution", "workspace", "cloud", "ui", "security", "project", "integration"];
check("finding-owner-contract-complete", owners.every((owner) => new RegExp(`\\b${owner}: z\\.number\\(\\)`, "u").test(findingContracts)));
check("finding-owner-service-complete", all(findings, ["FINDING_OWNERS", "emptyOwnerCounts", "Record<FindingOwner, number>"]) && owners.every((owner) => findings.includes(`${owner}: 0`)));
check("finding-owner-no-partial-summary", !findings.includes("Partial<Record<FindingOwner, number>>"));

check("adaptive-expanded-missions", all(evolution, ["Gözlemlenebilirlik", "Hata yaşam döngüsü", "Hafıza ve bağlam bütçesi", "FIFO ve IPC yarışları", "Release ve rollback", "Cloud continuity", "Companion ve eklenti yaşam döngüsü", "Tema eşdeğerliği"]));
check("adaptive-startup-recovery", all(evolution, ["interruptedAdaptive", 'state: "RECOVERY_REQUIRED"', "stale RUNNING_COMMAND/PLANNING"]));
check("adaptive-no-stale-running", evolution.includes('adaptive.current?.state === "RUNNING"'));

check("remix-discovery-contract", all(remixContracts, ["com.remixrota.player", "windows-named-pipe", "currentUserOnly", "player.read", "player.control", "library.search", "app.visibility"]));
check("remix-command-allowlist", all(remixContracts, ["player.getSnapshot", "player.playTrack", "player.setVolume", "library.getView", "app.show", "app.hide"]));
check("remix-main-process-net", remixService.includes('from "node:net"') && remixService.includes("\\\\\\\\.\\\\pipe\\\\"));
check("remix-executable-proof", all(remixService, ["REMIXROTA_EXECUTABLE_NAME_INVALID", "REMIXROTA_EXECUTABLE_NOT_PE_MZ", 'spawn(target, ["--companion"]']));
check("remix-bounded-protocol", all(remixService, ["MAX_BUFFER_CHARS", "MAX_PENDING_REQUESTS", "REMIXROTA_OUTBOUND_MESSAGE_TOO_LARGE", "REQUEST_TIMEOUT_MS"]));
check("remix-capability-handshake", all(remixService, ["requestedCapabilities", "grantedCapabilities", "REMIXROTA_PLAYER_READ_CAPABILITY_REQUIRED"]));
check("remix-no-shell-spawn", !remixService.includes("shell: true"));
check("remix-real-pipe-test", all(remixTest, ["net.createServer", "windows-named-pipe", 'command === "player.play"', "RemixRotaService.isSafeAutomaticRetry"]));

const remixChannels = ["remixRotaInspect", "remixRotaSelectExecutable", "remixRotaConnect", "remixRotaDisconnect", "remixRotaInvoke", "remixRotaEvent"];
check("remix-shared-channels", remixChannels.every((name) => contracts.includes(name)));
check("remix-bridge", all(bridge, ["inspectRemixRota", "selectRemixRotaExecutable", "connectRemixRota", "disconnectRemixRota", "invokeRemixRota", "onRemixRotaEvent"]));
check("remix-preload-narrow", remixChannels.every((name) => preload.includes(name)) && !preload.includes("node:net") && !preload.includes("ipcRenderer: ipcRenderer"));
check("remix-ipc", all(ipc, ["RemixRotaStatusSchema", "RemixRotaInvokeInputSchema", "services.remixRota.connect", "services.remixRota.invoke", "unsubscribeRemixRota"]));
check("remix-main-wiring", all(main, ["RemixRotaService", "Integration", "companion.json", "remixRota: remixRotaService", "remixRotaService?.close"]));
check("remix-ui-route", app.includes('view === "music"') && app.includes("RemixRotaWorkspace") && app.includes("<Music2"));
check("remix-ui-real-bridge", all(musicUi, ["window.devbox.inspectRemixRota", "window.devbox.invokeRemixRota", "window.devbox.onRemixRotaEvent", "player.playTrack", "library.search"]));
check("remix-ui-no-mock", !musicUi.includes("hardcodedAssistant") && !musicUi.includes("mockRemixRota"));

check("theme-storage-schema-compatible", contracts.includes("version: z.literal(1)") && (theme.match(/version: 1/g) ?? []).length >= 2);
check("design-v2-theme-presets", all(theme, ['name: "Porcelain Flame"', 'accent: "#E9442C"', 'name: "Obsidian Flame"', 'accent: "#FF4A2D"']));
check("design-v2-semantic-surfaces", all(designSystem, ["--ds-canvas", "--ds-sidebar", "--ds-surface-1", "--ds-surface-2", "--ds-text", "--ds-border", "--ds-accent", '[data-theme-base="dark"]', '[data-theme-base="light"]']));
check("design-v2-flame-day-not-whitewash", all(designSystem, ["#F8F5F1", "#F3EFEB", "#FFFDFC", "#E9442C"]));
check("design-v2-core-surfaces", all(designSystem, [".system-bar", ".sidebar", ".composer", ".devapi-control", ".music-now-playing"]));
check("design-v2-component-surfaces", all(componentCss, [".theme-presets", ".evolution-live", ".music-connection-details", ".catalog-grid", ".skill-grid"]));
check("design-v2-load-order", rendererMain.indexOf('"./design-system-v2.css"') > rendererMain.indexOf('"./light-theme-v016.css"') && rendererMain.indexOf('"./design-system-v2-components.css"') > rendererMain.indexOf('"./design-system-v2.css"'));
check("legacy-day-surface-still-bounded", all(lightCss, [".system-bar", ".sidebar", ".composer"]));
check("native-window-theme", all(main, ["createWindow(themeBase", "titleBarOverlay", 'settings.get().theme.base']) && all(ipc, ["setBackgroundColor", "setTitleBarOverlay"]));
check("music-theme-parity", componentCss.includes(".music-connection-details") && musicCss.includes(".music-track-row.current"));
check("design-v2-user-accent-boundary", designSystem.includes("var(--theme-accent") && themeStyleV2.includes("--theme-accent") && !themeStyleV2.includes("--bg-app") && !themeStyleV2.includes("--bg-sidebar") && !themeStyleV2.includes("--bg-panel"));
check("settings-v2-real-contract", all(settingsV2, ["window.devbox.patchSettings", 'base: "system"', "terminalShell", "permissionProfile", "reduceMotion", "launchIntroMode", "window.devbox.importTheme", "window.devbox.exportTheme"]));
check("settings-v2-layout", all(settingsCss, [".settings-v2-layout", ".settings-v2-nav", ".theme-thumb.dark", ".theme-thumb.light", ".theme-thumb.system"]));
check("app-v2-wiring", all(app, ["SettingsWorkspaceV2", "themeStyleV2(appSettings)"]) && !app.includes("style={themeStyle(appSettings)}"));
check("evolution-human-stage-surface", all(advancedViews, ['MODEL_ATTEMPT: "MODEL HAZIRLANIYOR"', 'RUNNING_COMMAND: "KOMUT YÜRÜTÜLÜYOR"', 'evolutionStageLabel(campaign.runtime.stage)', "KALICI GELİŞİM KONTROL DÜZLEMİ · ADAPTİF"]) && !advancedViews.includes("KALICI GELİŞİM KONTROL DÜZLEMİ · V9 ADAPTIVE"));
check("terminal-system-theme-parity", all(advancedViews, ['matchMedia("(prefers-color-scheme: dark)")', 'settings?.theme.base === "system"', "terminalIsLight", "[reload, terminalIsLight]"]));

check("icon-sizes", all(iconScript, ["16, 24, 32, 48, 64, 128, 256", 'writeFile(path.join(output,"icon.ico")', 'writeFile(path.join(output,"icon-master.png")']));
check("icon-flame-glyph", all(iconScript, ["Flame ribbon", "DevBox cube / code glyph", "[230,55,34,235]", "[255,103,40,225]", "terminal chevron and cursor"]));
const iconSyntax = spawnSync(process.execPath, ["--check", "scripts/generate-app-icon.mjs"], { encoding: "utf8", windowsHide: true });
check("icon-script-syntax", iconSyntax.status === 0, (iconSyntax.stderr || iconSyntax.stdout || "syntax").trim().slice(0, 300));

check("no-warez-runtime", ![main, ipc, remixService, musicUi].some((source) => /(?:crack(?:ed)?|warez|keygen|pirated binary)/iu.test(source)));

console.log(`API_EVOLUTION_V9_VERIFY_PASS checks=${checks.length} inherited=v8`);