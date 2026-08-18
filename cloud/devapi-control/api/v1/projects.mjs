import { requireAdminAuth } from "../../lib/auth.mjs";
import { listProjects } from "../../lib/db.mjs";

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
    const requested = Math.trunc(Number(queryValue(req.query?.limit) ?? 100));
    const limit = Number.isFinite(requested) ? Math.max(1, Math.min(100, requested)) : 100;
    const items = await listProjects(limit);
    return send(res, 200, { items, generatedAt: new Date().toISOString() });
  } catch (error) {
    const code = error instanceof Error ? error.message : "PROJECTS_FAILED";
    const status = code.includes("UNCONFIGURED") ? 503 : code === "UNAUTHORIZED" ? 401 : 400;
    return send(res, status, { error: code });
  }
}
