import { createHash } from "node:crypto";
import { readRawBody, requireAdminAuth } from "../../lib/auth.mjs";
import { agentRuntimeConfiguration, runPlanningAgent } from "../../agent/runtime.mjs";
import { getAgentTask } from "../../lib/agent-store.mjs";

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(body));
}
function statusFor(code) {
  if (code === "UNAUTHORIZED") return 401;
  if (code === "TASK_NOT_FOUND") return 404;
  if (code === "OPENAI_API_KEY_UNCONFIGURED" || code === "AGENTS_SDK_NOT_INSTALLED" || code.includes("UNCONFIGURED")) return 503;
  if (code === "AGENT_RUNTIME_TIMEOUT") return 504;
  return 400;
}

export default async function handler(req, res) {
  try {
    requireAdminAuth(req);
    if (req.method === "GET") {
      const configuration = await agentRuntimeConfiguration();
      return send(res, 200, { schemaVersion: 1, capability: "agent.runtime", ...configuration, generatedAt: new Date().toISOString() });
    }
    if (req.method !== "POST") return send(res, 405, { error: "METHOD_NOT_ALLOWED" });
    const raw = await readRawBody(req);
    const body = JSON.parse(raw || "{}");
    const state = await getAgentTask(body.taskId);
    const task = state.task;
    if (!["PLANNING", "RESEARCHING"].includes(task.state)) throw new Error("TASK_STATE_NOT_PLANNABLE");
    const result = await runPlanningAgent({
      taskId: task.taskId,
      request: task.request,
      riskClass: task.riskClass,
      sourceRef: `${task.sourceRepo}@${task.sourceRef}:${task.sourceSha}`
    });
    const digest = createHash("sha256").update(result.output).digest("hex");
    return send(res, 200, { ...result, evidence: { type: "AGENT_PLAN", digest, persisted: false } });
  } catch (error) {
    const code = error instanceof Error ? error.message : "AGENT_RUNTIME_FAILED";
    return send(res, statusFor(code), {
      error: code,
      state: ["OPENAI_API_KEY_UNCONFIGURED", "AGENTS_SDK_NOT_INSTALLED"].includes(code) ? "BLOCKED_EXTERNAL" : "FAILED"
    });
  }
}
