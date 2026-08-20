import { createHash } from "node:crypto";
import { agentRuntimeConfiguration, runPlanningAgent } from "./runtime.mjs";
import { appendAgentEvidence, getAgentTask, transitionAgentTask } from "../lib/agent-store.mjs";

const DEFAULT_BUDGET = Object.freeze({
  maxTurns: 6,
  maxToolCalls: 16,
  maxResearchCalls: 4,
  maxBrowserPages: 4,
  maxShellCommands: 12,
  maxPatchBytes: 128 * 1024,
  maxChangedFiles: 12,
  maxDurationMs: 15 * 60_000
});

function digest(value) { return createHash("sha256").update(String(value ?? "")).digest("hex"); }
function requiresMutationApproval(riskClass) { return ["R2", "R3", "R4"].includes(String(riskClass)); }

export function taskBudget(overrides = {}) {
  const budget = { ...DEFAULT_BUDGET };
  for (const key of Object.keys(budget)) {
    if (overrides[key] === undefined) continue;
    const value = Math.trunc(Number(overrides[key]));
    if (!Number.isFinite(value) || value <= 0 || value > budget[key] * 4) throw new Error(`TASK_BUDGET_INVALID:${key}`);
    budget[key] = value;
  }
  return Object.freeze(budget);
}

export async function orchestrateTask(taskId, { budget: budgetInput = {} } = {}) {
  const budget = taskBudget(budgetInput);
  let snapshot = await getAgentTask(taskId);
  let task = snapshot.task;
  if (task.state === "CREATED") {
    await transitionAgentTask({ taskId: task.taskId, toState: "TRIAGED", actor: "orchestrator", detail: { budget } });
    snapshot = await getAgentTask(task.taskId);
    task = snapshot.task;
  }
  if (task.state === "TRIAGED") {
    await transitionAgentTask({ taskId: task.taskId, toState: "PLANNING", actor: "orchestrator", detail: { budget } });
    snapshot = await getAgentTask(task.taskId);
    task = snapshot.task;
  }
  if (task.state !== "PLANNING") throw new Error(`TASK_ORCHESTRATOR_STATE_INVALID:${task.state}`);

  const runtime = await agentRuntimeConfiguration();
  if (runtime.runtimeState === "BLOCKED_EXTERNAL") {
    await transitionAgentTask({
      taskId: task.taskId,
      toState: "BLOCKED_EXTERNAL",
      actor: "orchestrator",
      blocker: runtime.blocker || "AGENT_RUNTIME_BLOCKED",
      detail: { provider: runtime.provider, package: runtime.package, expectedVersion: runtime.expectedVersion },
      result: { runtimeState: "BLOCKED_EXTERNAL", plannerExecuted: false }
    });
    return { taskId: task.taskId, state: "BLOCKED_EXTERNAL", plannerExecuted: false, blocker: runtime.blocker, budget };
  }

  const plan = await runPlanningAgent({
    taskId: task.taskId,
    request: task.request,
    riskClass: task.riskClass,
    sourceRef: `${task.sourceRepo}@${task.sourceRef}:${task.sourceSha}`,
    timeoutMs: Math.min(120_000, budget.maxDurationMs)
  });
  const planDigest = digest(plan.output);
  const evidence = await appendAgentEvidence({
    taskId: task.taskId,
    type: "REPO",
    sourceSha: task.sourceSha,
    runtime: "openai-agents-sdk",
    tool: "agent.runtime",
    state: "RUNTIME_VERIFIED",
    digest: planDigest,
    metadata: {
      role: "planner",
      provider: plan.provider,
      model: plan.model,
      sdkVersionExpected: plan.sdkVersionExpected,
      responseId: plan.responseId || null,
      outputBytes: Buffer.byteLength(plan.output)
    },
    startedAt: plan.startedAt || null,
    completedAt: plan.generatedAt
  });
  const nextState = requiresMutationApproval(task.riskClass) ? "WAITING_APPROVAL" : "WORKSPACE_PROVISIONING";
  await transitionAgentTask({
    taskId: task.taskId,
    toState: nextState,
    actor: "orchestrator",
    detail: { budget, plannerEvidenceId: evidence.evidenceId, planDigest, requiresApproval: requiresMutationApproval(task.riskClass) }
  });
  return { taskId: task.taskId, state: nextState, plannerExecuted: true, planDigest, evidenceId: evidence.evidenceId, budget };
}
