import { randomUUID } from "node:crypto";
import { readRawBody, requireAdminAuth, requireDesktopAuth } from "../../lib/auth.mjs";
import { ackCommand, insertCommand, listCommands } from "../../lib/db.mjs";

const ALLOWED = new Set(["evolution.setEnabled", "evolution.run", "evolution.cancel"]);
const ACK_STATES = new Set(["APPLIED", "RETRYING", "FAILED"]);
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
    if (req.method === "PATCH") {
      const raw = await readRawBody(req);
      const { instanceId } = requireDesktopAuth(req, raw);
      const body = JSON.parse(raw || "{}");
      const projectId = validateProjectId(body.projectId);
      const id = String(body.id ?? "").trim();
      const sequence = Math.trunc(Number(body.sequence));
      const status = String(body.status ?? "").trim().toUpperCase();
      const detail = String(body.detail ?? "").slice(0, 1_000);
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(id)) throw new Error("COMMAND_ACK_ID_INVALID");
      if (!Number.isSafeInteger(sequence) || sequence <= 0) throw new Error("COMMAND_ACK_SEQUENCE_INVALID");
      if (!ACK_STATES.has(status)) throw new Error("COMMAND_ACK_STATUS_INVALID");
      const item = await ackCommand({ id, projectId, sequence, status, detail, instanceId });
      return send(res, 200, { item });
    }
    return send(res, 405, { error: "METHOD_NOT_ALLOWED" });
  } catch (error) {
    const code = error instanceof Error ? error.message : "COMMAND_FAILED";
    const status = code.includes("UNCONFIGURED") ? 503 : code === "UNAUTHORIZED" || code.includes("SIGNATURE") ? 401 : code === "COMMAND_ACK_NOT_FOUND" ? 404 : 400;
    return send(res, status, { error: code });
  }
}
