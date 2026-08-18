import { configurationState } from "../../lib/auth.mjs";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.statusCode = 405;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.setHeader("cache-control", "no-store");
    return res.end(JSON.stringify({ error: "METHOD_NOT_ALLOWED" }));
  }
  const configuration = configurationState();
  const ready = configuration.database && configuration.desktopAuth && configuration.adminAuth;
  res.statusCode = ready ? 200 : 503;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify({ state: ready ? "READY" : "UNCONFIGURED", version: "0.1.15", time: new Date().toISOString() }));
}
