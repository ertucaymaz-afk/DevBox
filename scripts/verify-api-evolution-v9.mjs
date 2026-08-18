import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";

await import("./verify-api-evolution-v8.mjs");

const [pkg, contracts, findingContracts, findings, evolution, remixContracts, remixService, remixTest, bridge, preload, ipc, main, app, musicUi, theme, lightCss, musicCss, iconScript] = await Promise.all([
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
  readFile("src/renderer/RemixRotaWorkspace.tsx", "utf8"),
  readFile("src/shared/theme-presets.ts", "utf8"),
  readFile("src/renderer/light-theme-v016.css", "utf8"),
  readFile("src/renderer/remixrota-v016.css", "utf8"),
  readFile("scripts/generate-app-icon.mjs", "utf8")
]);

const checks = [];
function check(name, condition, detail = "") {
  if (!condition) throw new Error(`API_EVOLUTION_V9_VERIFY_FAILED:${name}${detail ? `:${detail}` : ""}`);
  checks.push(name);
}
function all(source, needles) { return needles.every((needle) => source.includes(needle)); }

check("v016-version", /"version"\s*:\s*"0\.1\.16"/u.test(pkg));
check("v9-release-script", pkg.includes('"evolution:verify": "node scripts/verify-api-evolution-v9.mjs"'));
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
check("remix-bridge", remixChannels.filter((name) => name !== "remixRotaEvent").every((name) => bridge.includes(name)) && bridge.includes("onRemixRotaEvent"));
check("remix-preload-narrow", remixChannels.every((name) => preload.includes(name)) && !preload.includes("node:net") && !preload.includes("ipcRenderer: ipcRenderer"));
check("remix-ipc", all(ipc, ["RemixRotaStatusSchema", "RemixRotaInvokeInputSchema", "services.remixRota.connect", "services.remixRota.invoke", "unsubscribeRemixRota"]));
check("remix-main-wiring", all(main, ["RemixRotaService", "Integration", "companion.json", "remixRota: remixRotaService", "remixRotaService?.close"]));
check("remix-ui-route", app.includes('view === "music"') && app.includes("RemixRotaWorkspace") && app.includes("<Music2"));
check("remix-ui-real-bridge", all(musicUi, ["window.devbox.inspectRemixRota", "window.devbox.invokeRemixRota", "window.devbox.onRemixRotaEvent", "player.playTrack", "library.search"]));
check("remix-ui-no-mock", !musicUi.includes("mock") && !musicUi.includes("hardcodedAssistant"));

check("day-theme-flame-accent", theme.includes('accent: "#D93624"') && theme.includes('name: "DevBox Alev Gündüz"'));
check("day-theme-full-surface", all(lightCss, ["--flame-1", ".system-bar", ".sidebar", ".composer", ".message.user", ".devapi-runtime-pipeline", ".terminal-pane", ".code-editor"]));
check("day-theme-not-whitewash", lightCss.includes("#f6f3ef") && lightCss.includes("#fffdfa") && lightCss.includes("linear-gradient(145deg, var(--flame-1)"));
check("native-window-theme", all(main, ["createWindow(themeBase", "titleBarOverlay", 'settings.get().theme.base']) && all(ipc, ["setBackgroundColor", "setTitleBarOverlay"]));
check("music-light-parity", musicCss.includes('[data-theme-base="light"] .music-now-playing') && musicCss.includes(".music-track-row.current"));

check("icon-sizes", all(iconScript, ["16, 24, 32, 48, 64, 128, 256", 'writeFile(path.join(output,"icon.ico")', 'writeFile(path.join(output,"icon-master.png")']));
check("icon-flame-glyph", all(iconScript, ["Flame ribbon", "DevBox cube / code glyph", "#"]));
const iconSyntax = spawnSync(process.execPath, ["--check", "scripts/generate-app-icon.mjs"], { encoding: "utf8", windowsHide: true });
check("icon-script-syntax", iconSyntax.status === 0, (iconSyntax.stderr || iconSyntax.stdout || "syntax").trim().slice(0, 300));

check("no-warez-runtime", ![main, ipc, remixService, musicUi].some((source) => /(?:crack(?:ed)?|warez|keygen|pirated binary)/iu.test(source)));

console.log(`API_EVOLUTION_V9_VERIFY_PASS checks=${checks.length} inherited=v8`);
