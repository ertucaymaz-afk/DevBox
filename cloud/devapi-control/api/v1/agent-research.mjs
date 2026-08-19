import { readRawBody, requireAdminAuth } from "../../lib/auth.mjs";
import { runOpenAIWebResearch, webResearchConfiguration } from "../../lib/openai-web-research.mjs";

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    try {
      requireAdminAuth(req);
      const configuration = webResearchConfiguration();
      return send(res, 200, {
        schemaVersion: 1,
        capability: "web.search",
        sourceState: "SOURCE_READY",
        runtimeState: configuration.configured ? "NOT_RUN" : "BLOCKED_EXTERNAL",
        provider: configuration.provider,
        model: configuration.model,
        configured: configuration.configured,
        generatedAt: new Date().toISOString()
      });
    } catch (error) {
      const code = error instanceof Error ? error.message : "AGENT_RESEARCH_STATE_FAILED";
      const status = code.includes("UNCONFIGURED") ? 503 : code === "UNAUTHORIZED" ? 401 : 400;
      return send(res, status, { error: code });
    }
  }

  if (req.method !== "POST") return send(res, 405, { error: "METHOD_NOT_ALLOWED" });
  try {
    requireAdminAuth(req);
    const raw = await readRawBody(req);
    const body = JSON.parse(raw || "{}");
    const query = String(body.query ?? "").trim();
    if (query.length < 3 || query.length > 4_000) throw new Error("RESEARCH_QUERY_INVALID");
    const result = await runOpenAIWebResearch(query);
    return send(res, 200, result);
  } catch (error) {
    const code = error instanceof Error ? error.message : "AGENT_RESEARCH_FAILED";
    const status = code === "UNAUTHORIZED" ? 401
      : code === "OPENAI_API_KEY_UNCONFIGURED" ? 503
      : code.startsWith("OPENAI_PROVIDER_FAILED") || code === "OPENAI_RESPONSE_INVALID_JSON" || code === "OPENAI_RESEARCH_EMPTY_OUTPUT" ? 502
      : code.includes("UNCONFIGURED") ? 503
      : 400;
    return send(res, status, {
      error: code,
      state: code === "OPENAI_API_KEY_UNCONFIGURED" ? "BLOCKED_EXTERNAL" : "FAILED"
    });
  }
}
