import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";

await import("./verify-api-evolution-v7.mjs");

const [pkg, finding, gate, cloud, language, turnQueue, coreApi, ipc, preload, bridge, app, controlUi, contracts, cloudDb, cloudCommands, cloudProjects, cloudHealth, cloudApp, cloudIndex, cloudVercel, cloudPackage, cloudReadme] = await Promise.all([
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
  readFile("src/shared/devapi-control-contracts.ts", "utf8"),
  readFile("cloud/devapi-control/lib/db.mjs", "utf8"),
  readFile("cloud/devapi-control/api/v1/commands.mjs", "utf8"),
  readFile("cloud/devapi-control/api/v1/projects.mjs", "utf8"),
  readFile("cloud/devapi-control/api/v1/health.mjs", "utf8"),
  readFile("cloud/devapi-control/app.js", "utf8"),
  readFile("cloud/devapi-control/index.html", "utf8"),
  readFile("cloud/devapi-control/vercel.json", "utf8"),
  readFile("cloud/devapi-control/package.json", "utf8"),
  readFile("cloud/devapi-control/README.md", "utf8")
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
check("release-gate-db-integrity", gate.includes("database-integrity") && gate.includes("database-integrity-final") && gate.includes("integrityCheck"));
check("release-gate-project-ownership", gate.includes("project-ownership") && gate.includes("realpath") && gate.includes("repositoryRoot") && gate.includes("path.relative"));
check("release-gate-findings", gate.includes("blocking-findings") && gate.includes('"CRITICAL", "HIGH"'));
check("release-gate-finding-revalidation", hasAll(gate, ["isSelfReleaseAggregate", "revalidatesTypeScript", 'item.owner === "typescript"', "RESOLVED"]));
check("release-gate-typescript", gate.includes('"typecheck"') && gate.includes("reportTypeScriptOutput") && gate.includes("typecheckExecution.result.stdout") && gate.includes("typecheckExecution.result.stderr"));
check("release-gate-reality", gate.includes('"evolution:verify"') && gate.includes('"truth:audit"'));
check("release-gate-required-devbox-scripts", gate.includes("strictDevBox") && gate.includes("zorunlu ${script} betiği yok") && gate.includes("required ? \"FAIL\" : \"SKIP\""));
check("release-gate-full-test-build", gate.includes('mode === "FULL"') && gate.includes('"test"') && gate.includes('"build"'));
check("release-gate-git", gate.includes("git-diff-check") && gate.includes("git-staged-diff-check") && gate.includes('"diff", "--check"') && gate.includes('"diff", "--cached", "--check"'));
check("release-gate-post-run-git", hasAll(gate, ["release-head-stable", "workspace-stable-after-gate", "workspace-clean-after-gate", "initialChangeFingerprint", "finalGit"]));
check("release-gate-single-flight", gate.includes("#inFlight") && gate.includes("RELEASE_GATE_ALREADY_RUNNING"));

check("cloud-explicit-unconfigured", cloud.includes("UNCONFIGURED") && cloud.includes("CLOUD_CONTROL_UNCONFIGURED"));
check("cloud-https-required", cloud.includes("DEVBOX_CONTROL_PLANE_HTTPS_REQUIRED") && cloud.includes('endpoint.protocol !== "https:"'));
check("cloud-token-minimum", cloud.includes("DEVBOX_CONTROL_PLANE_TOKEN_TOO_SHORT") && cloud.includes("token.length < 32"));
check("cloud-hmac", cloud.includes("createHmac") && cloud.includes("x-devbox-signature") && cloud.includes("x-devbox-timestamp"));
check("cloud-command-allowlist", hasAll(cloud, ["evolution.setEnabled", "evolution.run", "evolution.cancel"]) && cloud.includes("cloud-command:${commandId}"));
check("cloud-no-arbitrary-shell", !cloud.includes("child_process") && !cloud.includes("exec(") && !cloud.includes("spawn("));
check("cloud-command-ack-lifecycle", hasAll(cloud, ["CLOUD_COMMAND_MAX_ATTEMPTS = 5", "#ackCommand", '"APPLIED"', '"RETRYING"', '"FAILED"', "cloud.command.retrying", "cloud.command.failed"]));
check("cloud-command-ack-idempotency", cloud.includes("this.#database.setSetting(appliedKey, true)") && cloud.includes('await this.#ackCommand(projectId, command, "APPLIED")'));
check("cloud-command-poison-progress", cloud.includes("terminalFailure") && cloud.includes("pendingCommandCursor: cursor") && cloud.includes("attempts >= CLOUD_COMMAND_MAX_ATTEMPTS"));

check("cloud-db-command-state", hasAll(cloudDb, ["apply_status", "apply_detail", "applied_at", "applied_instance_id", "ackCommand"]));
check("cloud-db-project-discovery", cloudDb.includes("listProjects") && cloudDb.includes('project_id AS "projectId"') && cloudDb.includes("latest_snapshot->'evolution'->>'lifetimeLevel'"));
check("cloud-db-retention", hasAll(cloudDb, ["COMMAND_RETENTION_DAYS = 90", "COMMAND_RETENTION_COUNT = 2_000", "pruneCommands", "OFFSET $2"]));
check("cloud-server-command-ack", cloudCommands.includes('req.method === "PATCH"') && hasAll(cloudCommands, ["requireDesktopAuth", "ACK_STATES", "ackCommand"]));
check("cloud-server-command-allowlist", hasAll(cloudCommands, ["evolution.setEnabled", "evolution.run", "evolution.cancel"]) && !cloudCommands.includes("child_process"));
check("cloud-server-project-discovery", cloudProjects.includes("requireAdminAuth") && cloudProjects.includes("listProjects") && cloudProjects.includes("generatedAt"));
check("cloud-health-coarse-only", cloudHealth.includes('version: "0.1.15"') && !cloudHealth.includes("configured") && !cloudHealth.includes("desktopAuth:") && !cloudHealth.includes("adminAuth:"));
check("cloud-dashboard-project-discovery", hasAll(cloudApp, ["discoverProjects", "/api/v1/projects", "projectPicker", "renderCommands", "apply_status"]));
check("cloud-dashboard-command-lifecycle", hasAll(cloudIndex, ["COMMAND AUDIT", "PENDING → RETRYING → APPLIED / FAILED", "desktop ACK"]));
check("cloud-vercel-csp", cloudVercel.includes("Content-Security-Policy") && cloudVercel.includes("frame-ancestors 'none'") && cloudVercel.includes("connect-src 'self'"));
check("cloud-neon-pinned", cloudPackage.includes('"@neondatabase/serverless": "1.1.0"'));
check("cloud-deployment-contract", hasAll(cloudReadme, ["cloud/devapi-control", "DATABASE_URL", "DEVBOX_CONTROL_PLANE_TOKEN", "DEVBOX_CONTROL_ADMIN_TOKEN", "PENDING", "RETRYING", "APPLIED", "FAILED"]));

for (const file of [
  "cloud/devapi-control/app.js",
  "cloud/devapi-control/lib/auth.mjs",
  "cloud/devapi-control/lib/db.mjs",
  "cloud/devapi-control/api/v1/health.mjs",
  "cloud/devapi-control/api/v1/projects.mjs",
  "cloud/devapi-control/api/v1/state.mjs",
  "cloud/devapi-control/api/v1/snapshot.mjs",
  "cloud/devapi-control/api/v1/commands.mjs"
]) {
  const syntax = spawnSync(process.execPath, ["--check", file], { encoding: "utf8", windowsHide: true });
  check(`cloud-syntax:${file}`, syntax.status === 0, (syntax.stderr || syntax.stdout || "syntax-check-failed").trim().slice(0, 400));
}

check("fifo-same-thread", turnQueue.includes("existing.tail") && turnQueue.includes("#queues") && turnQueue.includes("run<T>"));
check("fifo-observability", turnQueue.includes("snapshots()") || turnQueue.includes("listSnapshots()"));
check("ipc-devapi-control", hasAll(ipc, ["devApiControlGet", "evolutionFindingTransition", "releaseGateRun", "cloudControlSync"]));
check("preload-devapi-control", hasAll(preload, ["devApiControlGet", "evolutionFindingTransition", "releaseGateRun", "cloudControlSync"]));
check("bridge-devapi-control", hasAll(bridge, ["getDevApiControl", "transitionEvolutionFinding", "runReleaseGate", "syncDevApiCloud"]));
check("core-api-devapi-resources", hasAll(coreApi, ["findings", "release-gates", "cloud-control", "runtime/queues"]));
check("core-api-workspace-verifier-preserved", hasAll(coreApi, ["WORKSPACE_MUTATION_NOT_VERIFIED", "WORKSPACE_VERIFICATION_FAILED", "gitHeadChanged"]));
check("agent-failure-finding-ipc", ipc.includes('source: "agent-service"') && ipc.includes('owner: "agent"') && ipc.includes("workspaceIntent ? \"HIGH\" : \"MEDIUM\""));
check("agent-failure-finding-core-api", coreApi.includes('source: "agent-service"') && coreApi.includes('owner: "agent"') && coreApi.includes("workspaceIntent ? \"HIGH\" : \"MEDIUM\""));

check("persistent-lsp-pool", hasAll(language, ["MAX_LANGUAGE_SESSIONS", "#languageSessions", "didChange", "closeLanguageSession"]));
check("lsp-uri-filter", language.includes("documentUri") && language.includes("publishDiagnostics") && language.includes("sameDocumentUri") && language.includes("fileURLToPath"));
check("no-sync-compiler-in-main", !language.includes("execSync(") && !language.includes("spawnSync("));

check("devapi-control-ui", hasAll(controlUi, ["DevBox API komuta merkezi", "Severity · ownership", "RELEASE GATE", "DEVAPI CHATBOX", "CLOUD CONTINUITY"]));
check("devapi-chat-real-bridge", controlUi.includes("window.devbox.sendMessage") && controlUi.includes("window.devbox.createThread") && !controlUi.includes("mockSendMessage") && !controlUi.includes("fakeResponse") && !controlUi.includes("hardcodedAssistant"));
check("devapi-app-route", app.includes('view === "devapi"') && app.includes("DevApiControlWorkspace"));
check("day-theme-route", app.includes("DEVBOX_DAY_THEME") && app.includes("DEVBOX_OBSIDIAN_THEME") && app.includes("data-theme-base"));

console.log(`API_EVOLUTION_V8_VERIFY_PASS checks=${checks.length} inherited=v7`);
