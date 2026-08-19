function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "public, max-age=60, stale-while-revalidate=300");
  res.setHeader("x-content-type-options", "nosniff");
  res.end(JSON.stringify(body));
}

function publicOrigin() {
  const raw = process.env.DEVAPI_PUBLIC_URL?.trim();
  if (!raw) return null;
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new Error("DEVAPI_PUBLIC_URL_INVALID");
  }
  return url.origin;
}

export default async function handler(req, res) {
  if (req.method !== "GET") return send(res, 405, { error: "METHOD_NOT_ALLOWED" });
  try { return send(res, 200, { schemaVersion: 1, devapi: publicOrigin() }); }
  catch { return send(res, 503, { state: "UNCONFIGURED", devapi: null }); }
}
