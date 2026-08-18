import { randomUUID } from "node:crypto";
import { readRawBody, requireAdminAuth, requireDesktopAuth } from "../../lib/auth.mjs";
import { insertCommand, listCommands } from "../../lib/db.mjs";

const ALLOWED = new Set(["evolution.setEnabled", "evolution.run", "evolution.cancel"]);
function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(body));
}
function queryValue(value) { return Array.isArray(value) ? value[0] : value; }
function validateProjectId(value) {
  const projectId = String(value ?? "").trim();
  if (projectId.length < 8 || projectId.length > 128) throw new Error("PROJECT_ID_INVALID");
  return projectId;
}

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      requireDesktopAuth(req, "");
      const projectId = validateProjectId(queryValue(req.query?.projectId));
      const after = queryValue(req.query?.after) ?? "0";
      const items = await listCommands(projectId, after, 100);
      return send(res, 200, { items });
    }
    if (req.method === "POST") {
      requireAdminAuth(req);
      const raw = await readRawBody(req);
      const body = JSON.parse(raw || "{}");
      const projectId = validateProjectId(body.projectId);
      const kind = String(body.kind ?? "");
      if (!ALLOWED.has(kind)) throw new Error("COMMAND_KIND_NOT_ALLOWED");
      let payload = body.payload && typeof body.payload === "object" && !Array.isArray(body.payload) ? body.payload : {};
      if (kind === "evolution.setEnabled") {
        if (typeof payload.enabled !== "boolean") throw new Error("COMMAND_ENABLED_REQUIRED");
        payload = { enabled: payload.enabled };
      } else payload = {};
      const item = await insertCommand({ id: randomUUID(), projectId, kind, payload });
      return send(res, 201, { item });
    }
    return send(res, 405, { error: "METHOD_NOT_ALLOWED" });
  } catch (error) {
    const code = error instanceof Error ? error.message : "COMMAND_FAILED";
    const status = code.includes("UNCONFIGURED") ? 503 : code === "UNAUTHORIZED" ? 401 : 400;
    return send(res, status, { error: code });
  }
}
