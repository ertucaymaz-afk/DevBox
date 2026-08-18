import { createHash } from "node:crypto";
import { getProjectState, listProjects } from "../../lib/db.mjs";

const VERSION = "0.1.19";
function value(input) { return Array.isArray(input) ? input[0] : input; }
function count(input) { const n = Number(input); return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : 0; }
function number(input) { const n = Number(input); return Number.isFinite(n) ? n : 0; }
function text(input, max = 160) { return typeof input === "string" ? input.slice(0, max) : null; }
function object(input) { return input && typeof input === "object" && !Array.isArray(input) ? input : {}; }
function sanitizeSnapshot(row) {
  const snapshot = object(row?.latest_snapshot);
  const evolution = object(snapshot.evolution);
  const spec = object(evolution.spec);
  const findings = object(snapshot.findings);
  const severity = object(findings.bySeverity);
  const gate = object(snapshot.releaseGate);
  const capturedAt = text(row?.captured_at ?? snapshot.capturedAt, 80);
  const ageSeconds = capturedAt ? Math.max(0, Math.round((Date.now() - Date.parse(capturedAt)) / 1000)) : null;
  return {
    schemaVersion: 1,
    product: { name: "DevBox", version: VERSION },
    devapi: { state: "READY", controlPlaneVersion: VERSION },
    project: { name: text(row?.project_name, 180) ?? "DevBox project", ref: createHash("sha256").update(String(row?.project_id ?? "unknown")).digest("hex").slice(0, 12) },
    evolution: {
      enabled: Boolean(evolution.enabled), isRunning: Boolean(evolution.isRunning),
      score: number(evolution.score), level: count(evolution.level), lifetimeLevel: count(evolution.lifetimeLevel),
      lifetimeEvidencePoints: count(evolution.lifetimeEvidencePoints), validatedImprovementCount: count(evolution.validatedImprovementCount), stablePromotionCount: count(evolution.stablePromotionCount),
      stage: text(evolution.stage, 160),
      spec: { phaseCount: count(spec.phaseCount), totalTaskCount: count(spec.totalTaskCount), passCount: count(spec.passCount), failedCount: count(spec.failedCount), blockedCount: count(spec.blockedCount), recoveryCount: count(spec.recoveryCount), remainingCount: count(spec.remainingCount), currentGateState: text(spec.currentGateState, 80) }
    },
    findings: {
      total: count(findings.total), open: count(findings.open), resolved: count(findings.resolved), rejected: count(findings.rejected), blocking: count(findings.blocking),
      bySeverity: { CRITICAL: count(severity.CRITICAL), HIGH: count(severity.HIGH), MEDIUM: count(severity.MEDIUM), LOW: count(severity.LOW), INFO: count(severity.INFO) }
    },
    releaseGate: Object.keys(gate).length ? { state: text(gate.state, 16), mode: text(gate.mode, 16), blockingFailures: count(gate.blockingFailures), completedAt: text(gate.completedAt, 80) } : null,
    freshness: { capturedAt, ageSeconds, stale: ageSeconds === null || ageSeconds > 120 },
    generatedAt: new Date().toISOString()
  };
}
function send(res, status, body, etag = null) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-methods", "GET, OPTIONS");
  res.setHeader("cache-control", status === 200 ? "public, max-age=0, s-maxage=5, stale-while-revalidate=10" : "no-store");
  if (etag) res.setHeader("etag", etag);
  res.end(body === null ? "" : JSON.stringify(body));
}
export default async function handler(req, res) {
  if (req.method === "OPTIONS") return send(res, 204, null);
  if (req.method !== "GET") return send(res, 405, { error: "METHOD_NOT_ALLOWED" });
  try {
    let projectId = String(value(req.query?.projectId) ?? "").trim();
    if (!projectId) {
      const projects = await listProjects(1);
      projectId = String(projects[0]?.projectId ?? "");
    }
    if (projectId.length < 8 || projectId.length > 128) return send(res, 404, { error: "PROJECT_NOT_FOUND" });
    const state = await getProjectState(projectId);
    if (!state.current) return send(res, 404, { error: "PROJECT_NOT_FOUND" });
    const body = sanitizeSnapshot(state.current);
    const serialized = JSON.stringify(body);
    const etag = `\"${createHash("sha256").update(serialized).digest("base64url").slice(0, 27)}\"`;
    if (String(req.headers["if-none-match"] ?? "") === etag) { res.statusCode = 304; res.setHeader("etag", etag); res.setHeader("cache-control", "public, max-age=0, s-maxage=5, stale-while-revalidate=10"); return res.end(); }
    return send(res, 200, body, etag);
  } catch (error) {
    const code = error instanceof Error ? error.message : "PUBLIC_STATE_FAILED";
    return send(res, code.includes("UNCONFIGURED") ? 503 : 500, { error: code.includes("UNCONFIGURED") ? "CONTROL_PLANE_UNCONFIGURED" : "PUBLIC_STATE_FAILED", version: VERSION });
  }
}
