const MAX_RESPONSE_BYTES = 256 * 1024;

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", status === 200 ? "public, max-age=0, s-maxage=5, stale-while-revalidate=10" : "no-store");
  res.setHeader("x-content-type-options", "nosniff");
  res.end(JSON.stringify(body));
}

function upstreamOrigin() {
  const raw = process.env.DEVAPI_PUBLIC_URL?.trim();
  if (!raw) throw new Error("DEVAPI_PUBLIC_URL_UNCONFIGURED");
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new Error("DEVAPI_PUBLIC_URL_INVALID");
  }
  return url.origin;
}

export default async function handler(req, res) {
  if (req.method !== "GET") return send(res, 405, { error: "METHOD_NOT_ALLOWED" });
  try {
    const upstream = new URL("/api/v1/public-state", upstreamOrigin());
    const response = await fetch(upstream, {
      headers: { accept: "application/json", "cache-control": "no-cache" },
      redirect: "error",
      signal: AbortSignal.timeout(5_000)
    });
    const declared = Number(response.headers.get("content-length") ?? 0);
    if (declared > MAX_RESPONSE_BYTES) throw new Error("DEVAPI_PUBLIC_STATE_TOO_LARGE");
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > MAX_RESPONSE_BYTES) throw new Error("DEVAPI_PUBLIC_STATE_TOO_LARGE");
    if (response.headers.get("x-devbox-public-state") !== "sanitized") throw new Error("DEVAPI_PUBLIC_STATE_UNTRUSTED");
    let body;
    try { body = JSON.parse(text || "{}"); } catch { throw new Error("DEVAPI_PUBLIC_STATE_INVALID_JSON"); }
    if (![200, 404, 503].includes(response.status)) return send(res, 502, { error: "DEVAPI_UPSTREAM_FAILED" });
    res.setHeader("x-devbox-public-state", "sanitized-proxy");
    return send(res, response.status, body);
  } catch (error) {
    const code = error instanceof Error ? error.message : "DEVAPI_PROXY_FAILED";
    const unconfigured = code.includes("UNCONFIGURED") || code.includes("INVALID");
    return send(res, unconfigured ? 503 : 502, { error: unconfigured ? "DEVAPI_UNAVAILABLE" : "DEVAPI_PROXY_FAILED" });
  }
}
