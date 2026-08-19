import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const token = process.env.VERCEL_TOKEN?.trim() || "";
const teamId = process.env.VERCEL_ORG_ID?.trim() || "team_PNUxk74M7XR8MFlKl676ZHlv";
const projectName = process.env.DEVBOX_PROJECT_NAME?.trim() || "devbox";
const canonicalUrl = process.env.DEVBOX_CANONICAL_URL?.trim() || "https://devbox.vercel.app";
const cliVersion = process.env.VERCEL_CLI_VERSION?.trim() || "58.4.0";
const sourceSha = process.env.GITHUB_SHA?.trim() || "unknown";
const githubOutput = process.env.GITHUB_OUTPUT?.trim() || "";
const apiOrigin = "https://api.vercel.com";
const routes = [
  "/",
  "/devapi-home",
  "/devapi-api",
  "/devapi-docs",
  "/devapi-console",
  "/devapi-status",
  "/devapi-studio",
  "/devapi-evolution",
  "/devapi-workbench",
  "/devapi-memory",
  "/devapi-diagnostics"
];

function fail(code, detail = "") {
  throw new Error(`DEVBOX_WEB_PRODUCTION_FAIL:${code}${detail ? `:${detail}` : ""}`);
}

if (token.length < 8) fail("missing-vercel-token");
if (!/^team_[A-Za-z0-9]+$/u.test(teamId)) fail("invalid-team-id");
if (!/^[a-z0-9-]+$/u.test(projectName)) fail("invalid-project-name");
if (!/^([a-f0-9]{40}|unknown)$/u.test(sourceSha)) fail("invalid-source-sha");

let canonical;
try { canonical = new URL(canonicalUrl); } catch { fail("invalid-canonical-url"); }
if (canonical.protocol !== "https:" || canonical.username || canonical.password || canonical.search || canonical.hash || canonical.pathname !== "/") {
  fail("unsafe-canonical-url");
}
const canonicalOrigin = canonical.origin;
const canonicalHost = canonical.hostname;
const secretValues = [token].filter((value) => value.length >= 8);

function redact(value) {
  let text = String(value ?? "");
  for (const secret of secretValues) text = text.split(secret).join("[REDACTED]");
  return text.replaceAll("\n", " ");
}

async function vercelApi(pathname, { method = "GET", body, allowStatuses = [] } = {}) {
  const url = new URL(pathname, apiOrigin);
  if (!url.searchParams.has("teamId")) url.searchParams.set("teamId", teamId);
  const response = await fetch(url, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/json",
      ...(body === undefined ? {} : { "content-type": "application/json" })
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "error",
    signal: AbortSignal.timeout(20_000)
  });
  const raw = await response.text();
  let data = null;
  if (raw) {
    try { data = JSON.parse(raw); }
    catch { data = { message: "non-json-response" }; }
  }
  if (!response.ok && !allowStatuses.includes(response.status)) {
    const code = data?.error?.code || data?.code || "UNKNOWN";
    const message = data?.error?.message || data?.message || "request-failed";
    fail("vercel-api", `${method}:${url.pathname}:HTTP_${response.status}:${redact(`${code}:${message}`).slice(0, 260)}`);
  }
  return { status: response.status, data };
}

async function ensureProject() {
  const encoded = encodeURIComponent(projectName);
  const existing = await vercelApi(`/v9/projects/${encoded}`, { allowStatuses: [404] });
  if (existing.status === 200) {
    const id = String(existing.data?.id ?? "");
    if (!id.startsWith("prj_")) fail("existing-project-id-invalid");
    console.log(`DEVBOX_WEB_PROJECT_EXISTS name=${projectName} id=${id}`);
    return { id, created: false };
  }

  console.log(`DEVBOX_WEB_PROJECT_CREATE_REQUIRED name=${projectName}`);
  const created = await vercelApi("/v11/projects", { method: "POST", body: { name: projectName }, allowStatuses: [409] });
  if (created.status === 409) {
    const raced = await vercelApi(`/v9/projects/${encoded}`);
    const id = String(raced.data?.id ?? "");
    if (!id.startsWith("prj_")) fail("project-create-race-invalid");
    console.log(`DEVBOX_WEB_PROJECT_CREATE_RACE_RESOLVED name=${projectName} id=${id}`);
    return { id, created: false };
  }

  const id = String(created.data?.id ?? "");
  if (!id.startsWith("prj_")) fail("project-create-response-invalid");
  console.log(`DEVBOX_WEB_PROJECT_CREATED name=${projectName} id=${id}`);
  return { id, created: true };
}

const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
function runVercel(args, projectId, capture = true) {
  const env = {
    ...process.env,
    VERCEL_TOKEN: token,
    VERCEL_ORG_ID: teamId,
    VERCEL_PROJECT_ID: projectId
  };
  const result = spawnSync(pnpm, ["dlx", `vercel@${cliVersion}`, ...args], {
    cwd: process.cwd(),
    env,
    encoding: "utf8",
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
    windowsHide: true
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = redact(`${result.stderr || ""}\n${result.stdout || ""}`).trim().slice(-900);
    fail("vercel-cli", detail || `exit-${result.status}`);
  }
  return result;
}

function extractDeploymentUrl(result) {
  const lines = `${result.stdout || ""}\n${result.stderr || ""}`.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  const urls = lines.flatMap((line) => line.match(/https:\/\/[^\s]+/gu) || []);
  const candidate = [...urls].reverse().find((value) => value.endsWith(".vercel.app") || value.includes(".vercel.app/"));
  if (!candidate) fail("deployment-url-missing");
  try { return new URL(candidate).origin; } catch { fail("deployment-url-invalid"); }
}

async function deploymentDetails(deploymentUrl) {
  const host = new URL(deploymentUrl).hostname;
  const result = await vercelApi(`/v13/deployments/${encodeURIComponent(host)}`);
  const id = String(result.data?.id ?? "");
  if (!id.startsWith("dpl_")) fail("deployment-id-invalid");
  const state = String(result.data?.readyState ?? result.data?.status ?? "");
  if (state && state !== "READY") fail("deployment-not-ready", state);
  return { id, state: state || "UNKNOWN" };
}

async function probeRoute(route, attempts = 24) {
  const target = new URL(route, `${canonicalOrigin}/`).href;
  let last = "no-response";
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(target, {
        headers: { accept: "text/html,application/xhtml+xml", "cache-control": "no-cache" },
        redirect: "follow",
        signal: AbortSignal.timeout(10_000)
      });
      const text = await response.text();
      const expected = route === "/"
        ? text.includes("DevBox") && text.includes("0.1.20")
        : text.includes("DevAPI") && text.includes("ecoPageRoot");
      if (response.status === 200 && expected) {
        return { route, status: response.status, bytes: Buffer.byteLength(text), attempt };
      }
      last = `HTTP_${response.status}:expected=${expected}`;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
  fail("canonical-route-probe", `${route}:${redact(last).slice(0, 240)}`);
}

const project = await ensureProject();
const deploy = runVercel([
  "deploy",
  "--prod",
  "--yes",
  "--force",
  "--cwd",
  "cloud/devbox-site",
  "--meta",
  `sourceSha=${sourceSha}`,
  "--meta",
  "surfaceCount=11"
], project.id);
const deploymentUrl = extractDeploymentUrl(deploy);
const deployment = await deploymentDetails(deploymentUrl);
console.log(`DEVBOX_WEB_STAGE_READY project=${project.id} deployment=${deployment.id} url=${deploymentUrl}`);

// Force the exact requested canonical instead of assuming Vercel selected it.
runVercel(["alias", "set", deploymentUrl, canonicalHost], project.id);
console.log(`DEVBOX_WEB_CANONICAL_ALIAS_REQUESTED host=${canonicalHost} deployment=${deployment.id}`);

const routeResults = [];
for (const route of routes) {
  const result = await probeRoute(route);
  routeResults.push(result);
  console.log(`DEVBOX_WEB_ROUTE_PASS route=${route} status=${result.status} attempt=${result.attempt}`);
}

const report = {
  schemaVersion: 1,
  product: "DevBox web ecosystem",
  productVersion: "0.1.20",
  sourceSha,
  capturedAt: new Date().toISOString(),
  state: "PRODUCTION_VERIFIED",
  vercel: {
    teamId,
    projectName,
    projectId: project.id,
    projectCreatedThisRun: project.created,
    deploymentId: deployment.id,
    deploymentUrl,
    canonicalUrl: canonicalOrigin
  },
  routes: routeResults,
  routeCount: routeResults.length,
  truth: {
    fakeReady: false,
    canonicalProbeRequired: true,
    allRoutesHttp200: routeResults.every((item) => item.status === 200)
  }
};

await mkdir("outputs", { recursive: true });
await writeFile("outputs/devbox-web-production.json", `${JSON.stringify(report, null, 2)}\n`, "utf8");
if (githubOutput) {
  await appendFile(githubOutput, `project_id=${project.id}\n`, "utf8");
  await appendFile(githubOutput, `deployment_id=${deployment.id}\n`, "utf8");
  await appendFile(githubOutput, `deployment_url=${deploymentUrl}\n`, "utf8");
  await appendFile(githubOutput, `canonical_url=${canonicalOrigin}\n`, "utf8");
  await appendFile(githubOutput, `route_count=${routeResults.length}\n`, "utf8");
}
console.log(`DEVBOX_WEB_PRODUCTION_PASS project=${project.id} deployment=${deployment.id} canonical=${canonicalOrigin} routes=${routeResults.length}`);
