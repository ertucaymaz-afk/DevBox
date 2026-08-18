import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const read = async (relative) => await readFile(path.join(root, relative), "utf8");
const checks = [];
function check(name, condition, detail = "") {
  checks.push({ name, ok: Boolean(condition), detail });
  if (!condition) throw new Error(`API_EVOLUTION_V3_VERIFY_FAILED:${name}${detail ? `:${detail}` : ""}`);
}

const [contracts, service, agent, runner, renderer, bridge, preload, ipc, builder, graphText] = await Promise.all([
  read("src/shared/contracts.ts"),
  read("src/main/services/api-evolution-service.ts"),
  read("src/main/services/agent-service.ts"),
  read("src/main/services/command-runner.ts"),
  read("src/renderer/AdvancedViews.tsx"),
  read("src/shared/bridge.ts"),
  read("src/preload/preload.cts"),
  read("src/main/ipc.ts"),
  read("config/electron-builder.yml"),
  read("specs/development/geliştirme-spec-task-graph.json")
]);
const graph = JSON.parse(graphText);

check("spec-22-phases", graph?.summary?.phaseCount === 22, String(graph?.summary?.phaseCount));
check("spec-3362-tasks", graph?.summary?.taskCount === 3362 && Array.isArray(graph.tasks) && graph.tasks.length === 3362, String(graph?.tasks?.length));
check("spec-import-is-not-pass", graph?.summary?.passCount === 0 && graph?.summary?.todoCount === 3362);
check("manual-routing-contract", contracts.includes("EvolutionRoutingSchema") && contracts.includes('z.enum(["AUTO", "LOCKED"])'));
check("manual-model-ui", renderer.includes("Manuel model ve rota") && renderer.includes("setEvolutionRouting"));
check("live-runtime-ui", renderer.includes("Canlı çalışma") && renderer.includes("Canlı işlem günlüğü") && renderer.includes("onEvolutionActivity"));
check("backend-runtime-events", contracts.includes("EvolutionActivityEventSchema") && ipc.includes("evolutionActivity") && preload.includes("onEvolutionActivity") && bridge.includes("onEvolutionActivity"));
check("working-run-command", agent.includes('"--sandbox", "workspace-write"') && !service.includes("salt-okunur araştırma ve mühendislik backlog'u üretir"));
check("deterministic-codex-config", agent.includes('"--ignore-user-config"') && agent.includes('"--ignore-rules"') && !agent.includes('"skill_search"'));
check("provider-must-mutate-before-success", agent.includes("validateResult") && service.includes("PROVIDER_COMPLETED_WITHOUT_WORKSPACE_MUTATION"));
check("codex-primary-fallback-chain", agent.includes('model: "gpt-5.6-sol"') && agent.includes('model: "gpt-5.5"') && agent.includes('provider: "hermes-nvidia"'));
check("locked-no-fallback", agent.includes('if (routing.mode === "LOCKED") return'));
check("codex-min-version", agent.includes("CODEX_VERSION_TOO_OLD_FOR_GPT_5_6") && agent.includes("0, 144, 0"));
check("streaming-command-runner", runner.includes("onStdoutLine") && runner.includes("onStderrLine"));
check("durable-heartbeat", service.includes("heartbeatDurableJob") && service.includes("JOB_HEARTBEAT_MS"));
check("real-verification-gate", service.includes('"diff", "--check"') && service.includes('["typecheck", "test"]'));
check("cancel-control", service.includes("public cancel(projectId") && ipc.includes("evolutionCancel") && renderer.includes("cancelEvolutionCycle"));
check("continuous-auto-advance", service.includes("#scheduleContinuation") && service.includes("current.enabled && !current.lastError") && renderer.includes("Bir görev kanıtlı PASS olunca sıradaki otomatik başlar"));
check("packaged-spec-resource", builder.includes("geliştirme-spec-task-graph.json") && builder.includes("development/geliştirme-spec-task-graph.json"));
check("spec-state-recovery", service.includes("recoverRunning") && service.includes("RECOVERY_REQUIRED"));

console.log(`API_EVOLUTION_V3_VERIFY_PASS checks=${checks.length} tasks=${graph.tasks.length} phases=${graph.summary.phaseCount}`);
