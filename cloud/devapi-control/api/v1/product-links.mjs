function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "public, max-age=60, stale-while-revalidate=300");
  res.setHeader("x-content-type-options", "nosniff");
  res.end(JSON.stringify(body));
}

function publicOrigin(name) {
  const raw = process.env[name]?.trim();
  if (!raw) return null;
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new Error("PUBLIC_URL_INVALID");
  }
  return url.origin;
}

export default async function handler(req, res) {
  if (req.method !== "GET") return send(res, 405, { error: "METHOD_NOT_ALLOWED" });
  try {
    return send(res, 200, {
      schemaVersion: 1,
      devapi: publicOrigin("DEVAPI_CANONICAL_URL"),
      devbox: publicOrigin("DEVBOX_PRODUCT_URL")
    });
  } catch {
    return send(res, 503, { state: "UNCONFIGURED" });
  }
}
