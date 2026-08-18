import { configurationState } from "../../lib/auth.mjs";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: "METHOD_NOT_ALLOWED" }));
  }
  const configured = configurationState();
  res.statusCode = configured.database && configured.desktopAuth && configured.adminAuth ? 200 : 503;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify({ state: res.statusCode === 200 ? "READY" : "UNCONFIGURED", configured, time: new Date().toISOString() }));
}
