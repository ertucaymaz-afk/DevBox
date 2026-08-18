import { requireAdminAuth } from "../../lib/auth.mjs";
import { getProjectState } from "../../lib/db.mjs";

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(body));
}
function queryValue(value) { return Array.isArray(value) ? value[0] : value; }

export default async function handler(req, res) {
  if (req.method !== "GET") return send(res, 405, { error: "METHOD_NOT_ALLOWED" });
  try {
    requireAdminAuth(req);
    const projectId = String(queryValue(req.query?.projectId) ?? "").trim();
    if (projectId.length < 8 || projectId.length > 128) throw new Error("PROJECT_ID_INVALID");
    const state = await getProjectState(projectId);
    return send(res, 200, { ...state, generatedAt: new Date().toISOString() });
  } catch (error) {
    const code = error instanceof Error ? error.message : "STATE_FAILED";
    const status = code.includes("UNCONFIGURED") ? 503 : code === "UNAUTHORIZED" ? 401 : 400;
    return send(res, status, { error: code });
  }
}
