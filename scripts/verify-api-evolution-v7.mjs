import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const read = async (relative) => await readFile(path.join(root, relative), "utf8");
const checks = [];
function check(name, condition, detail = "") {
  checks.push({ name, ok: Boolean(condition), detail });
  if (!condition) throw new Error(`API_EVOLUTION_V7_VERIFY_FAILED:${name}${detail ? `:${detail}` : ""}`);
}

const [contracts, service, agent, capability, specService, database, runner, renderer, styles, bridge, preload, ipc, builder, signedBuilder, main, selfDevelopment, mcpHost, localCatalog, sourceSync, graphText, researchText] = await Promise.all([
  read("src/shared/contracts.ts"), read("src/main/services/api-evolution-service.ts"), read("src/main/services/agent-service.ts"),
  read("src/main/services/capability-service.ts"), read("src/main/services/development-spec-service.ts"), read("src/main/services/database.ts"),
  read("src/main/services/command-runner.ts"), read("src/renderer/AdvancedViews.tsx"), read("src/renderer/styles.css"),
  read("src/shared/bridge.ts"), read("src/preload/preload.cts"), read("src/main/ipc.ts"), read("config/electron-builder.yml"),
  read("config/electron-builder.signed.cjs"), read("src/main/main.ts"), read("src/main/services/self-development-service.ts"), read("src/main/services/mcp-host-service.ts"), read("src/main/services/local-catalog-service.ts"), read("scripts/sync-source-archive.ps1"),
  read("specs/development/geliştirme-spec-task-graph.json"), read("docs/research/execution-day-2026-08-14.json")
]);
const graph = JSON.parse(graphText);
const research = JSON.parse(researchText);

check("spec-22-phases", graph?.summary?.phaseCount === 22 && Array.isArray(graph.phases) && graph.phases.length === 22, String(graph?.summary?.phaseCount));
check("spec-3362-tasks", graph?.summary?.taskCount === 3362 && Array.isArray(graph.tasks) && graph.tasks.length === 3362, String(graph?.tasks?.length));
check("spec-import-is-not-pass", graph?.summary?.passCount === 0 && graph?.summary?.todoCount === 3362);
check("manual-routing-contract", contracts.includes("EvolutionRoutingSchema") && contracts.includes('z.enum(["AUTO", "LOCKED"])'));
check("manual-model-ui", renderer.includes("Manuel model ve rota") && renderer.includes("setEvolutionRouting"));
check("phase-summary-contract", contracts.includes("EvolutionPhaseSummarySchema") && contracts.includes("phaseSummaries") && contracts.includes("currentGateState"));
check("22-phase-ui", renderer.includes("evolution-phase-grid") && renderer.includes("campaign.spec.phaseSummaries.map") && styles.includes(".phase-card.active"));
check("live-runtime-ui", renderer.includes("Canlı çalışma") && renderer.includes("Canlı işlem günlüğü") && renderer.includes("onEvolutionActivity"));
check("backend-runtime-events", contracts.includes("EvolutionActivityEventSchema") && ipc.includes("evolutionActivity") && preload.includes("onEvolutionActivity") && bridge.includes("onEvolutionActivity"));
check("persistent-activity-events", database.includes("appendEvent(type:") && database.includes("idx_events_aggregate_sequence") && service.includes('appendEvent("api-evolution.activity"'));
check("working-run-command", agent.includes('"--sandbox", "workspace-write"') && !service.includes("salt-okunur araştırma ve mühendislik backlog'u üretir"));
check("deterministic-codex-config", agent.includes('"--ignore-user-config"') && agent.includes('"--ignore-rules"') && agent.includes('"--disable", "plugins"') && !agent.includes('"skill_search"'));
check("no-invented-codex-min-version", !agent.includes("CODEX_VERSION_TOO_OLD_FOR_GPT_5_6") && !agent.includes("REQUIRED_0.144.0") && !capability.includes("en az 0.144.0"));
check("provider-must-mutate-before-pass", agent.includes("validateResult") && service.includes("PROVIDER_COMPLETED_WITHOUT_WORKSPACE_MUTATION"));
check("provider-result-protocol-required", agent.includes("PROVIDER_RESULT_PROTOCOL_MISSING") && agent.includes("validateEvolutionAcceptance"));
check("acceptance-bundle-required", service.includes('"positiveTests"') && service.includes('"negativeTests"') && service.includes('"securityChecks"') && service.includes('"performanceChecks"') && service.includes('"uxChecks"') && specService.includes("DEVELOPMENT_SPEC_ACCEPTANCE_INCOMPLETE"));
check("deterministic-reviewer-gate", service.includes("DEVBOX_DETERMINISTIC_GATE_V1") && service.includes("DEVBOX_ADAPTIVE_DETERMINISTIC_GATE_V1") && specService.includes("deterministicReviewer"));
check("codex-inner-command-failure-gate", agent.includes("CODEX_INNER_COMMAND_FAILED") && agent.includes('event.type === "turn.completed"') && agent.includes('event.type === "turn.failed"'));
check("structured-external-blocker", agent.includes("parseEvolutionProviderOutcome") && service.includes('response.outcome === "BLOCKED_EXTERNAL"') && service.includes("allowBlockedExternalRetry"));
check("codex-primary-fallback-chain", agent.includes('model: "gpt-5.6-sol"') && agent.includes('model: "gpt-5.5"') && agent.includes('provider: "hermes-nvidia"'));
check("locked-no-fallback", agent.includes('if (routing.mode === "LOCKED") return'));
check("streaming-command-runner", runner.includes("onStdoutLine") && runner.includes("onStderrLine"));
check("durable-heartbeat", service.includes("heartbeatDurableJob") && service.includes("JOB_HEARTBEAT_MS"));
check("real-verification-gate", service.includes('"diff", "--check"') && service.includes('scripts.verify ? ["verify"] : ["typecheck", "test", "build"]'));
check("cancel-control", service.includes("public cancel(projectId") && ipc.includes("evolutionCancel") && renderer.includes("cancelEvolutionCycle"));
check("failure-retry-backoff", service.includes("RETRY_BASE_MS") && service.includes("RETRY_MAX_MS") && service.includes(': "BACKOFF"') && !service.includes("current.enabled && !current.lastError"));
check("recovery-stops-blind-replay", specService.includes("RECOVERY_REQUIRED") && specService.includes("return null") && service.includes("EVOLUTION_PHASE_RECOVERY_REQUIRED"));
check("same-phase-gating", specService.includes("passCount === tasks.length") && specService.includes("BLOCKED_EXTERNAL") && specService.includes("Strict in-phase order") && specService.includes("phaseSummary"));
check("phase-evidence-artifacts", specService.includes('"tasks.json"') && specService.includes('"requirements.json"') && specService.includes('"failures.json"') && specService.includes('"traceability.json"') && specService.includes('"gate.json"'));
check("atomic-evidence-write", specService.includes("renameSync(temp, filePath)") && specService.includes("randomUUID()"));
check("packaged-spec-resource", builder.includes("geliştirme-spec-task-graph.json") && builder.includes("development/geliştirme-spec-task-graph.json") && builder.includes("development/source-template/specs"));
check("signed-packaged-spec-resource", signedBuilder.includes("geliştirme-spec-task-graph.json") && signedBuilder.includes("development/source-template/specs"));
check("runtime-spec-source-integrity", graph?.source?.sha256 === "C6C9F157389E93FFC3F912C9D79583EB40F9BA7D6428ADC6D99405A1B9509750" && specService.includes("DEVELOPMENT_SPEC_METADATA_INVALID"));
check("runtime-client-version-not-stale", agent.includes("#clientVersion") && mcpHost.includes("#clientVersion") && main.includes("new AgentService(runner, app.getVersion())") && localCatalog.includes("new McpHostService(this.#registry, clientVersion)") && !mcpHost.includes('version: "0.1.5"'));
check("source-archive-includes-spec-graph", sourceSync.includes('specs/development'));
check("spec-state-v2", specService.includes("api-evolution.spec-state.v2") && specService.includes("#legacyKey"));
check("manual-blocker-retry", specService.includes("allowBlockedExternalRetry") && service.includes("allowBlockedExternalRetry: manual"));
check("manual-recovery-retry", specService.includes("allowRecoveryRetry") && service.includes("allowRecoveryRetry: manual"));
check("clean-baseline-gate", service.includes("EVOLUTION_WORKSPACE_DIRTY_BASELINE") && service.includes("baselineWasClean"));
check("managed-source-rollback", service.includes("#restoreManagedWorkspace") && service.includes("rollback-head:"));
check("restart-runtime-reconciliation", service.includes("yarım kalmış atomik görev RECOVERY_REQUIRED") && service.includes("isRunning: false"));

check("reasoning-minimal-contract", contracts.includes('"minimal"') && renderer.includes('Minimal'));
check("model-catalog-contract", contracts.includes("EvolutionModelCatalogSchema") && contracts.includes('"nvidia-models-api"'));
check("codex-app-server-model-list", agent.includes('"model/list"') && agent.includes('["app-server", "--stdio"]') && agent.includes("parseCodexModelCatalog"));
check("command-runner-bounded-stdin", runner.includes("stdinText?: string") && runner.includes("slice(0, 1_048_576)") && !runner.includes("commandDisplay: request.stdinText"));
check("nvidia-live-model-list", agent.includes("https://integrate.api.nvidia.com/v1") && agent.includes("parseNvidiaModelCatalog") && agent.includes('NVIDIA /v1/models'));
check("nvidia-custom-nim-base", agent.includes("DEVBOX_NVIDIA_NIM_BASE_URL") && agent.includes("NVIDIA_NIM_BASE_URL_PROTOCOL_UNSUPPORTED"));
check("model-catalog-ipc", ipc.includes("evolutionModelCatalog") && preload.includes("evolutionModelCatalog") && bridge.includes("getEvolutionModelCatalog"));
check("model-catalog-ui", renderer.includes("Model listesi") && renderer.includes("getEvolutionModelCatalog") && renderer.includes("modelCatalog.items.map"));
check("persistent-history-ipc", ipc.includes("evolutionActivityHistory") && preload.includes("evolutionActivityHistory") && bridge.includes("listEvolutionActivity"));
check("persistent-history-ui", renderer.includes("listEvolutionActivity(project.id, 120)") && renderer.includes("SQLite kalıcı event store"));
check("event-desc-read", database.includes('order?: "asc" | "desc"') && database.includes('input.order === "desc" ? "DESC" : "ASC"'));
check("execution-day-research-registry", research?.executionDate === "2026-08-14" && Array.isArray(research?.sources) && research.sources.length >= 5);
check("research-not-runtime-pass", researchText.includes("does not mark") || researchText.includes("NOT mark") || researchText.includes("PASS"));

check("click-is-explicit-approval", !ipc.includes('title: "geliştirme.md gerçek uygulama çevrimi"') && ipc.includes('“Şimdi çalıştır” tıklaması sürekli self-development döngüsünü başlatan açık kullanıcı eylemidir'));
check("new-campaign-does-not-autostart", service.includes("enabled: false, isRunning: false") && service.includes("nextCycleAt: null, lastCycleDurationMs"));
check("continuous-after-click", service.includes("sürekli gerçek API geliştirme etkinleştirildi") && service.includes("#scheduleContinuation(projectId, 500)"));
const commitCall = service.indexOf("const commitEvidence = await this.#commitVerifiedMutation");
const passCall = service.indexOf('this.#markSpecTask(projectId, specTask, "PASS"');
check("verified-change-must-commit", service.includes("#commitVerifiedMutation") && service.includes("EVOLUTION_GIT_COMMIT_FAILED") && service.includes("git-commit:") && commitCall >= 0 && passCall > commitCall, `${commitCall}:${passCall}`);
check("adaptive-task-contract", service.includes("ADAPTIVE_CONTINUOUS_MAINTENANCE") && service.includes("createAdaptiveEvolutionTask") && service.includes("gerçek kaynak koduna en küçük güvenli değişikliği") && service.includes("no-op"));
check("adaptive-continuation-contract", service.includes("shouldContinueEvolution") && service.includes("remainingCount <= 0") && service.includes("#scheduleContinuation(projectId, 500)"));
check("adaptive-blockers-stop", service.includes('["BLOCKED_EXTERNAL", "RECOVERY_REQUIRED", "CANCELLED"].includes') && service.includes("adaptiveState"));
check("packaged-self-development-source", main.includes("new SelfDevelopmentService") && selfDevelopment.includes("persistent-self-development-source") && builder.includes("development/source-template/src") && signedBuilder.includes("development/source-template/src"));
check("corepack-no-global-shim-required", service.includes('args: ["pnpm", "install", "--frozen-lockfile"]') && !service.includes('corepack enable'));
check("reality-contract-hard-rule", service.includes("SİMÜLASYON / DEMO / FAKE / SAHTE başarı") && selfDevelopment.includes("NO_FABRICATED_OR_REPRESENTATIVE_SUCCESS"));

console.log(`API_EVOLUTION_V7_VERIFY_PASS checks=${checks.length} tasks=${graph.tasks.length} phases=${graph.summary.phaseCount}`);
