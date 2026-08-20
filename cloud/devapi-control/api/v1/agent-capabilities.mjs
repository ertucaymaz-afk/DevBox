import { requireAdminAuth } from "../../lib/auth.mjs";
import { listToolCapabilities } from "../../agent/tool-registry.mjs";

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  if (req.method !== "GET") return send(res, 405, { error: "METHOD_NOT_ALLOWED" });
  try {
    requireAdminAuth(req);
    const capabilities = listToolCapabilities();
    const runtimeVerified = capabilities.filter((item) => item.state === "RUNTIME_VERIFIED").length;
    const unavailable = capabilities.filter((item) => item.state === "UNAVAILABLE").length;
    const blocked = capabilities.filter((item) => item.state === "BLOCKED").length;
    return send(res, 200, {
      schemaVersion: 1,
      product: "DevAPI",
      capabilityContract: "autonomous-engineering-v1",
      sourceState: "SOURCE_READY",
      runtimeState: runtimeVerified > 0 ? "PARTIAL_RUNTIME_VERIFIED" : "UNAVAILABLE",
      reason: runtimeVerified > 0 ? "SOME_TOOLS_RUNTIME_VERIFIED" : "AGENT_RUNTIME_NOT_CONNECTED",
      counts: { total: capabilities.length, runtimeVerified, unavailable, blocked },
      capabilities,
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "AGENT_CAPABILITIES_FAILED";
    const status = code.includes("UNCONFIGURED") ? 503 : code === "UNAUTHORIZED" ? 401 : 400;
    return send(res, status, { error: code });
  }
}
