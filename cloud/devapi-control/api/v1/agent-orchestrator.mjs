import { readRawBody, requireAdminAuth } from "../../lib/auth.mjs";
import { orchestrateTask } from "../../agent/orchestrator.mjs";
import { requestId, sendError, sendJson } from "../../lib/http-response.mjs";

function statusFor(code) {
  if (code === "UNAUTHORIZED") return 401;
  if (code === "TASK_NOT_FOUND") return 404;
  if (code.includes("UNCONFIGURED") || code.includes("NOT_INSTALLED")) return 503;
  if (code.includes("STATE_INVALID") || code.includes("TRANSITION_DENIED")) return 409;
  if (code.includes("TIMEOUT")) return 504;
  return 400;
}

export default async function handler(req, res) {
  const id = requestId(req);
  try {
    requireAdminAuth(req);
    if (req.method !== "POST") return sendError(res, 405, { code: "METHOD_NOT_ALLOWED", message: "Bu method desteklenmiyor." }, id);
    const body = JSON.parse((await readRawBody(req)) || "{}");
    const result = await orchestrateTask(body.taskId, { budget: body.budget || {} });
    return sendJson(res, result.state === "BLOCKED_EXTERNAL" ? 503 : 200, { result }, id);
  } catch (error) {
    const code = error instanceof Error ? error.message : "AGENT_ORCHESTRATOR_FAILED";
    const external = code.includes("UNCONFIGURED") || code.includes("NOT_INSTALLED");
    return sendError(res, statusFor(code), {
      code,
      state: external ? "BLOCKED_EXTERNAL" : "FAILED",
      message: external ? "Orchestrator dış bağımlılık nedeniyle çalıştırılamadı." : "Orchestrator işlemi tamamlanamadı.",
      retryable: false
    }, id);
  }
}
