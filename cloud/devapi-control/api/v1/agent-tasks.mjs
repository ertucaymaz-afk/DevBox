import { readRawBody, requireAdminAuth } from "../../lib/auth.mjs";
import { classifyTaskRisk } from "../../agent/task-policy.mjs";
import { createAgentTask, getAgentTask, listAgentTasks, transitionAgentTask } from "../../lib/agent-store.mjs";

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(body));
}
function queryValue(value) { return Array.isArray(value) ? value[0] : value; }
function statusFor(code) {
  if (code === "UNAUTHORIZED") return 401;
  if (code === "TASK_NOT_FOUND") return 404;
  if (code.includes("UNCONFIGURED")) return 503;
  if (code.includes("TRANSITION_DENIED") || code === "TASK_STATE_TERMINAL" || code === "TASK_STATE_NOOP") return 409;
  return 400;
}

export default async function handler(req, res) {
  try {
    requireAdminAuth(req);
    if (req.method === "GET") {
      const taskId = String(queryValue(req.query?.taskId) ?? "").trim();
      if (taskId) return send(res, 200, await getAgentTask(taskId));
      const requested = Math.trunc(Number(queryValue(req.query?.limit) ?? 50));
      return send(res, 200, { items: await listAgentTasks(requested), generatedAt: new Date().toISOString() });
    }
    if (req.method === "POST") {
      const raw = await readRawBody(req);
      const body = JSON.parse(raw || "{}");
      const risk = classifyTaskRisk(body.request);
      const task = await createAgentTask(body, {
        riskClass: risk.riskClass,
        assignedAgents: ["orchestrator", "planner", "repo-intelligence", "reviewer", "security"]
      });
      return send(res, 201, { task, policy: risk });
    }
    if (req.method === "PATCH") {
      const raw = await readRawBody(req);
      const body = JSON.parse(raw || "{}");
      const item = await transitionAgentTask({
        taskId: body.taskId,
        toState: body.toState,
        actor: body.actor || "admin",
        detail: body.detail && typeof body.detail === "object" && !Array.isArray(body.detail) ? body.detail : {},
        blocker: body.blocker || null,
        result: body.result ?? null
      });
      return send(res, 200, { task: item });
    }
    return send(res, 405, { error: "METHOD_NOT_ALLOWED" });
  } catch (error) {
    const code = error instanceof Error ? error.message : "AGENT_TASK_FAILED";
    return send(res, statusFor(code), { error: code, state: code.includes("UNCONFIGURED") ? "BLOCKED_EXTERNAL" : "FAILED" });
  }
}
