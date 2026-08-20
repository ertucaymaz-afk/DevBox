import { randomUUID } from "node:crypto";

export function requestId(req) {
  const incoming = String(req?.headers?.["x-request-id"] ?? "").trim();
  if (/^[A-Za-z0-9._:-]{8,120}$/u.test(incoming)) return incoming;
  return randomUUID();
}

export function sendJson(res, status, body, id) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.setHeader("x-request-id", id);
  res.end(JSON.stringify({ ...body, requestId: id }));
}

export function sendError(res, status, { code, state = "FAILED", message = "İstek tamamlanamadı.", retryable = false }, id) {
  return sendJson(res, status, {
    error: { code, state, message, requestId: id, retryable: Boolean(retryable) }
  }, id);
}
