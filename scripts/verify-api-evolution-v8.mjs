import { readFile } from "node:fs/promises";

await import("./verify-api-evolution-v7.mjs");

const [pkg, finding, gate, cloud, language, turnQueue, coreApi, ipc, preload, bridge, app, controlUi, contracts] = await Promise.all([
  readFile("package.json", "utf8"),
  readFile("src/main/services/evolution-finding-service.ts", "utf8"),
  readFile("src/main/services/release-gate-service.ts", "utf8"),
  readFile("src/main/services/cloud-control-service.ts", "utf8"),
  readFile("src/main/services/language-debug-service.ts", "utf8"),
  readFile("src/main/services/thread-turn-coordinator.ts", "utf8"),
  readFile("src/main/services/core-api.ts", "utf8"),
  readFile("src/main/ipc.ts", "utf8"),
  readFile("src/preload/preload.cts", "utf8"),
  readFile("src/shared/bridge.ts", "utf8"),
  readFile("src/renderer/App.tsx", "utf8"),
  readFile("src/renderer/DevApiControlWorkspace.tsx", "utf8"),
  readFile("src/shared/devapi-control-contracts.ts", "utf8")
]);

const checks = [];
function check(name, condition, detail = "") {
  if (!condition) throw new Error(`API_EVOLUTION_V8_VERIFY_FAILED:${name}${detail ? `:${detail}` : ""}`);
  checks.push(name);
}
function hasAll(source, needles) { return needles.every((needle) => source.includes(needle)); }

check("v015-version", /"version"\s*:\s*"0\.1\.15"/u.test(pkg));
check("v8-is-release-script", pkg.includes('"evolution:verify": "node scripts/verify-api-evolution-v8.mjs"'));

check("finding-lifecycle", hasAll(finding, ["fingerprint", "CRITICAL", "HIGH", "OPEN", "RESOLVED", "REJECTED", "occurrences", "appendEvent", "reconcileCampaign"]));
check("finding-ownership", hasAll(finding, ["typescript", "release", "project", "security", "integration", "ownerForTrack"]));
check("typescript-finding-parser", finding.includes("reportTypeScriptOutput") && finding.includes("TS\\d+") && finding.includes('owner: "typescript"'));
check("finding-contracts", hasAll(contracts, ["FindingSeveritySchema", "FindingStatusSchema", "FindingOwnerSchema", "FindingSummarySchema"]));

check("release-gate-modes", hasAll(gate, ["PREFLIGHT", "FULL", "blockingFailures", "release.gate.completed"]));
check("release-gate-db-integrity", gate.includes("database-integrity") && gate.includes("integrityCheck"));
check("release-gate-project-ownership", gate.includes("project-ownership") && gate.includes("realpath") && gate.includes("repositoryRoot") && gate.includes("path.relative"));
check("release-gate-findings", gate.includes("blocking-findings") && gate.includes('"CRITICAL", "HIGH"'));
check("release-gate-typescript", gate.includes('"typecheck"') && gate.includes("reportTypeScriptOutput"));
check("release-gate-reality", gate.includes('"evolution:verify"') && gate.includes('"truth:audit"'));
check("release-gate-full-test-build", gate.includes('mode === "FULL"') && gate.includes('"test"') && gate.includes('"build"'));
check("release-gate-git", gate.includes("git-diff-check") && gate.includes('"diff", "--check"') && gate.includes("workspace-clean"));

check("cloud-explicit-unconfigured", cloud.includes("UNCONFIGURED") && cloud.includes("CLOUD_CONTROL_UNCONFIGURED"));
check("cloud-https-required", cloud.includes("DEVBOX_CONTROL_PLANE_HTTPS_REQUIRED") && cloud.includes('endpoint.protocol !== "https:"'));
check("cloud-token-minimum", cloud.includes("DEVBOX_CONTROL_PLANE_TOKEN_TOO_SHORT") && cloud.includes("token.length < 32"));
check("cloud-hmac", cloud.includes("createHmac") && cloud.includes("x-devbox-signature") && cloud.includes("x-devbox-timestamp"));
check("cloud-command-allowlist", hasAll(cloud, ["evolution.setEnabled", "evolution.run", "evolution.cancel"]) && cloud.includes("cloud-command:${command.id}"));
check("cloud-no-arbitrary-shell", !cloud.includes("child_process") && !cloud.includes("exec(") && !cloud.includes("spawn("));

check("fifo-same-thread", turnQueue.includes("existing.tail") && turnQueue.includes("#queues") && turnQueue.includes("run<T>"));
check("fifo-observability", turnQueue.includes("snapshots()") || turnQueue.includes("listSnapshots()"));
check("ipc-devapi-control", hasAll(ipc, ["devApiControlGet", "evolutionFindingTransition", "releaseGateRun", "cloudControlSync"]));
check("preload-devapi-control", hasAll(preload, ["devApiControlGet", "evolutionFindingTransition", "releaseGateRun", "cloudControlSync"]));
check("bridge-devapi-control", hasAll(bridge, ["getDevApiControl", "transitionEvolutionFinding", "runReleaseGate", "syncDevApiCloud"]));
check("core-api-devapi-resources", hasAll(coreApi, ["findings", "release-gates", "cloud-control", "runtime/queues"]));
check("core-api-workspace-verifier-preserved", hasAll(coreApi, ["WORKSPACE_MUTATION_NOT_VERIFIED", "WORKSPACE_VERIFICATION_FAILED", "gitHeadChanged"]));

check("persistent-lsp-pool", hasAll(language, ["MAX_LANGUAGE_SESSIONS", "#languageSessions", "didChange", "closeLanguageSession"]));
check("lsp-uri-filter", language.includes("documentUri") && language.includes("publishDiagnostics"));
check("no-sync-compiler-in-main", !language.includes("execSync(") && !language.includes("spawnSync("));

check("devapi-control-ui", hasAll(controlUi, ["DevBox API komuta merkezi", "Severity · ownership", "RELEASE GATE", "DEVAPI CHATBOX", "CLOUD CONTINUITY"]));
check("devapi-chat-real-bridge", controlUi.includes("window.devbox.sendMessage") && controlUi.includes("window.devbox.createThread") && !controlUi.includes("mockSendMessage") && !controlUi.includes("fakeResponse") && !controlUi.includes("hardcodedAssistant"));
check("devapi-app-route", app.includes('view === "devapi"') && app.includes("DevApiControlWorkspace"));
check("day-theme-route", app.includes("DEVBOX_DAY_THEME") && app.includes("DEVBOX_OBSIDIAN_THEME") && app.includes("data-theme-base"));

console.log(`API_EVOLUTION_V8_VERIFY_PASS checks=${checks.length} inherited=v7`);
