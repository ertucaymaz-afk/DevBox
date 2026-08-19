import { mkdir, writeFile } from "node:fs/promises";

const token = process.env.VERCEL_TOKEN?.trim() || "";
const teamId = process.env.VERCEL_ORG_ID?.trim() || "";
const devapiProjectId = process.env.DEVAPI_PROJECT_ID?.trim() || "";
const devapiDeploymentId = process.env.DEVAPI_DEPLOYMENT_ID?.trim() || "";
const devboxProjectId = process.env.DEVBOX_PROJECT_ID?.trim() || "";
const devboxDeploymentId = process.env.DEVBOX_DEPLOYMENT_ID?.trim() || "";
const githubOutput = process.env.GITHUB_OUTPUT?.trim() || "";

function fail(code, detail = "") { throw new Error(`V020_RUNTIME_SCAN_FAIL:${code}${detail ? `:${String(detail).slice(0, 500)}` : ""}`); }
function requireValue(name, value, minimum = 1) { if (!value || value.length < minimum) fail("MISSING_INPUT", name); }
requireValue("VERCEL_TOKEN", token, 8);
requireValue("VERCEL_ORG_ID", teamId, 8);
requireValue("DEVAPI_PROJECT_ID", devapiProjectId, 8);
requireValue("DEVAPI_DEPLOYMENT_ID", devapiDeploymentId, 8);
requireValue("DEVBOX_PROJECT_ID", devboxProjectId, 8);
requireValue("DEVBOX_DEPLOYMENT_ID", devboxDeploymentId, 8);

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function parseLogPayload(text) {
  const trimmed = text.trim();
  if (!trimmed) return [];
  try {
    const value = JSON.parse(trimmed);
    if (Array.isArray(value)) return value;
    if (Array.isArray(value?.logs)) return value.logs;
    return value && typeof value === "object" ? [value] : [];
  } catch {
    const rows = [];
    for (const line of trimmed.split(/\r?\n/u)) {
      const value = line.trim();
      if (!value) continue;
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) rows.push(...parsed);
        else if (parsed && typeof parsed === "object") rows.push(parsed);
      } catch {
        fail("LOG_STREAM_INVALID_JSON", "unparseable-runtime-log-row");
      }
    }
    return rows;
  }
}
function classify(row) {
  const level = String(row?.level ?? "").toLowerCase();
  const status = Number(row?.responseStatusCode ?? row?.statusCode ?? 0);
  return { error: level === "error" || level === "fatal" || (Number.isFinite(status) && status >= 500), level, status };
}
function safeLog(row) {
  return {
    level: String(row?.level ?? "unknown").slice(0, 20),
    statusCode: Number(row?.responseStatusCode ?? row?.statusCode ?? 0) || null,
    source: String(row?.source ?? "unknown").slice(0, 80),
    requestPath: String(row?.requestPath ?? row?.path ?? "").slice(0, 240),
    timestampInMs: Number(row?.timestampInMs ?? row?.timestamp ?? 0) || null
  };
}

async function fetchDeploymentLogs(label, projectId, deploymentId) {
  const url = new URL(`https://api.vercel.com/v1/projects/${encodeURIComponent(projectId)}/deployments/${encodeURIComponent(deploymentId)}/runtime-logs`);
  url.searchParams.set("teamId", teamId);
  let lastCount = 0;
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    const response = await fetch(url, {
      headers: { authorization: `Bearer ${token}`, accept: "application/json, application/x-ndjson;q=0.9, text/plain;q=0.8" },
      redirect: "error",
      signal: AbortSignal.timeout(20_000)
    });
    const text = await response.text();
    if (!response.ok) fail("VERCEL_LOG_HTTP", `${label}:${response.status}`);
    const rows = parseLogPayload(text);
    lastCount = rows.length;
    if (rows.length > 0) {
      const errors = rows.filter((row) => classify(row).error).map(safeLog);
      console.log(`V020_RUNTIME_SCAN_READ label=${label} deployment=${deploymentId} rows=${rows.length} errors=${errors.length} attempt=${attempt}`);
      if (errors.length > 0) fail("RUNTIME_ERRORS_FOUND", `${label}:${JSON.stringify(errors.slice(0, 5))}`);
      return { label, projectId, deploymentId, rows: rows.length, errors: 0 };
    }
    await sleep(5_000);
  }
  fail("RUNTIME_LOGS_EMPTY", `${label}:${deploymentId}:rows=${lastCount}`);
}

const devapi = await fetchDeploymentLogs("devapi", devapiProjectId, devapiDeploymentId);
const devbox = await fetchDeploymentLogs("devbox", devboxProjectId, devboxDeploymentId);
const report = {
  schemaVersion: 1,
  productVersion: "0.1.20",
  capturedAt: new Date().toISOString(),
  state: "PASS",
  criteria: "deployment-scoped no error/fatal/5xx",
  deployments: { devapi, devbox },
  runtimeErrorClusters: 0
};
await mkdir("outputs", { recursive: true });
await writeFile("outputs/v020-runtime-scan.json", `${JSON.stringify(report, null, 2)}\n`, "utf8");
if (githubOutput) await writeFile(githubOutput, "runtime_error_scan=PASS\nruntime_error_clusters=0\n", { flag: "a" });
console.log(`V020_RUNTIME_SCAN_PASS devapi=${devapiDeploymentId} devbox=${devboxDeploymentId} rows=${devapi.rows + devbox.rows} errors=0 secrets=0-in-artifact`);
