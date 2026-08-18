import { readRawBody, requireDesktopAuth } from "../../lib/auth.mjs";
import { saveSnapshot } from "../../lib/db.mjs";

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "METHOD_NOT_ALLOWED" });
  try {
    const raw = await readRawBody(req);
    const { instanceId } = requireDesktopAuth(req, raw);
    const snapshot = JSON.parse(raw);
    if (!snapshot || typeof snapshot !== "object" || snapshot.schemaVersion !== 1) throw new Error("SNAPSHOT_SCHEMA_INVALID");
    const projectId = String(snapshot.project?.id ?? "").trim();
    const projectName = String(snapshot.project?.name ?? "").trim();
    if (projectId.length < 8 || projectId.length > 128 || !projectName || projectName.length > 240) throw new Error("SNAPSHOT_PROJECT_INVALID");
    const capturedAt = String(snapshot.capturedAt ?? "");
    if (!Number.isFinite(Date.parse(capturedAt))) throw new Error("SNAPSHOT_CAPTURE_TIME_INVALID");
    await saveSnapshot({ projectId, projectName, snapshot, instanceId, capturedAt });
    return send(res, 202, { ok: true, projectId, capturedAt });
  } catch (error) {
    const code = error instanceof Error ? error.message : "SNAPSHOT_FAILED";
    const status = code.includes("UNCONFIGURED") ? 503 : code.includes("UNAUTHORIZED") || code.includes("SIGNATURE") ? 401 : 400;
    return send(res, status, { error: code });
  }
}
