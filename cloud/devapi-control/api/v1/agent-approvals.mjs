import { readRawBody, requireAdminAuth } from "../../lib/auth.mjs";
import { createApproval, decideApproval, listApprovals } from "../../lib/approval-store.mjs";
import { requestId, sendError, sendJson } from "../../lib/http-response.mjs";

function q(value) { return Array.isArray(value) ? value[0] : value; }
function statusFor(code) {
  if (code === "UNAUTHORIZED") return 401;
  if (code === "APPROVAL_NOT_FOUND") return 404;
  if (code.includes("UNCONFIGURED")) return 503;
  if (["APPROVAL_TASK_MISMATCH","APPROVAL_REPLAY_DENIED","APPROVAL_EXPIRED"].includes(code)) return 409;
  return 400;
}

export default async function handler(req, res) {
  const id = requestId(req);
  try {
    requireAdminAuth(req);
    if (req.method === "GET") {
      const taskId = String(q(req.query?.taskId) ?? "").trim() || null;
      const limit = Math.trunc(Number(q(req.query?.limit) ?? 50));
      return sendJson(res, 200, { items: await listApprovals({ taskId, limit }), generatedAt: new Date().toISOString() }, id);
    }
    if (req.method !== "POST") return sendError(res, 405, { code: "METHOD_NOT_ALLOWED", message: "Bu method desteklenmiyor." }, id);
    const body = JSON.parse((await readRawBody(req)) || "{}");
    if (body.approvalId) {
      const approval = await decideApproval({
        approvalId: body.approvalId,
        taskId: body.taskId,
        decision: body.decision,
        decidedBy: body.decidedBy || "admin",
        reason: body.reason || null
      });
      return sendJson(res, 200, { approval }, id);
    }
    const approval = await createApproval({
      taskId: body.taskId,
      toolCallId: body.toolCallId || null,
      riskClass: body.riskClass,
      action: body.action,
      scope: body.scope,
      requestedBy: body.requestedBy || "orchestrator",
      reason: body.reason || null,
      ttlMs: body.ttlMs
    });
    return sendJson(res, 201, { approval }, id);
  } catch (error) {
    const code = error instanceof Error ? error.message : "AGENT_APPROVAL_FAILED";
    return sendError(res, statusFor(code), {
      code,
      state: code.includes("UNCONFIGURED") ? "BLOCKED_EXTERNAL" : "FAILED",
      message: code.includes("UNCONFIGURED") ? "Approval persistence için veritabanı yapılandırılmamış." : "Approval işlemi tamamlanamadı.",
      retryable: false
    }, id);
  }
}
