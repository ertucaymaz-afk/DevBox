import { configurationState } from "../../lib/auth.mjs";

const VERSION = "0.1.20";

export default async function handler(req, res) {
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  if (req.method !== "GET") {
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: "METHOD_NOT_ALLOWED" }));
  }
  const configuration = configurationState();
  const ready = configuration.database && configuration.desktopAuth && configuration.adminAuth;
  res.statusCode = ready ? 200 : 503;
  return res.end(JSON.stringify({
    schemaVersion: 2,
    service: "DevAPI Cloud Control",
    state: ready ? "READY" : "UNCONFIGURED",
    version: VERSION,
    time: new Date().toISOString()
  }));
}
