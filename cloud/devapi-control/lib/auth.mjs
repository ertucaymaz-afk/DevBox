import { createHmac, timingSafeEqual } from "node:crypto";

const MAX_BODY_BYTES = 2 * 1024 * 1024;
const MAX_CLOCK_SKEW_MS = 5 * 60_000;

function envSecret(name) {
  const value = process.env[name]?.trim();
  if (!value || value.length < 32) throw new Error(`${name}_UNCONFIGURED`);
  return value;
}

function sameSecret(left, right) {
  const a = Buffer.from(left ?? "", "utf8");
  const b = Buffer.from(right ?? "", "utf8");
  if (a.length !== b.length || a.length === 0) return false;
  return timingSafeEqual(a, b);
}

function bearer(request) {
  const value = request.headers.authorization ?? "";
  return value.startsWith("Bearer ") ? value.slice(7).trim() : "";
}

export async function readRawBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) throw new Error("REQUEST_BODY_TOO_LARGE");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export function requireDesktopAuth(request, rawBody = "") {
  const token = envSecret("DEVBOX_CONTROL_PLANE_TOKEN");
  if (!sameSecret(bearer(request), token)) throw new Error("UNAUTHORIZED");
  const timestamp = String(request.headers["x-devbox-timestamp"] ?? "");
  const supplied = String(request.headers["x-devbox-signature"] ?? "");
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed) || Math.abs(Date.now() - parsed) > MAX_CLOCK_SKEW_MS) throw new Error("SIGNATURE_TIMESTAMP_INVALID");
  const expected = createHmac("sha256", token).update(`${timestamp}.${rawBody}`).digest("hex");
  if (!sameSecret(supplied, expected)) throw new Error("SIGNATURE_INVALID");
  return { instanceId: String(request.headers["x-devbox-instance"] ?? "unknown").slice(0, 200) };
}

export function requireAdminAuth(request) {
  const token = envSecret("DEVBOX_CONTROL_ADMIN_TOKEN");
  if (!sameSecret(bearer(request), token)) throw new Error("UNAUTHORIZED");
}

export function configurationState() {
  return {
    database: Boolean(process.env.DATABASE_URL?.trim()),
    desktopAuth: Boolean(process.env.DEVBOX_CONTROL_PLANE_TOKEN?.trim() && process.env.DEVBOX_CONTROL_PLANE_TOKEN.trim().length >= 32),
    adminAuth: Boolean(process.env.DEVBOX_CONTROL_ADMIN_TOKEN?.trim() && process.env.DEVBOX_CONTROL_ADMIN_TOKEN.trim().length >= 32)
  };
}
