const SECRET_KEY_PATTERN = /(?:api[_-]?key|secret|token|password|authorization|cookie|credential)/i;
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi;
const COMMON_TOKEN_PATTERN = /\b(?:nvapi|sk|ghp|github_pat)_[A-Za-z0-9_-]{8,}\b/gi;

export function redactText(value: string): string {
  return value
    .replace(BEARER_PATTERN, "Bearer [REDACTED]")
    .replace(COMMON_TOKEN_PATTERN, "[REDACTED_TOKEN]");
}

export function redactUnknown(value: unknown): unknown {
  if (typeof value === "string") {
    return redactText(value);
  }
  if (Array.isArray(value)) {
    return value.map(redactUnknown);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, SECRET_KEY_PATTERN.test(key) ? "[REDACTED]" : redactUnknown(entry)])
    );
  }
  return value;
}

