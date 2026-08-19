import { appendFile, readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const cliVersion = process.env.VERCEL_CLI_VERSION?.trim() || "58.4.0";
const teamId = process.env.VERCEL_ORG_ID?.trim() || "team_PNUxk74M7XR8MFlKl676ZHlv";
const devapiProjectId = process.env.DEVAPI_PROJECT_ID?.trim() || "prj_mJCrN5G6w4R32axSWYSLSuuAdmBz";
const devapiCanonicalUrl = process.env.DEVAPI_CANONICAL_URL?.trim() || "https://devapi-virid.vercel.app";
const devboxProjectName = process.env.DEVBOX_PROJECT_NAME?.trim() || "devbox";
const vercelToken = process.env.VERCEL_TOKEN?.trim() || "";
const databaseUrl = process.env.DATABASE_URL?.trim() || "";
const desktopToken = process.env.DEVBOX_CONTROL_PLANE_TOKEN?.trim() || "";
const adminToken = process.env.DEVBOX_CONTROL_ADMIN_TOKEN?.trim() || "";
const githubOutput = process.env.GITHUB_OUTPUT?.trim() || "";
const sourceSha = process.env.GITHUB_SHA?.trim() || "unknown";

function fail(code, detail = "") {
  throw new Error(`V020_PRODUCTION_PROMOTE_FAIL:${code}${detail ? `:${detail}` : ""}`);
}

function requireSecret(name, value, minimum = 1) {
  if (!value || value.length < minimum) fail("missing-or-invalid-secret", name);
}

function canonicalOrigin(value, label) {
  let url;
  try { url = new URL(String(value)); } catch { fail("canonical-url-invalid", label); }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    fail("canonical-url-unsafe", label);
  }
  return url.origin;
}

requireSecret("VERCEL_TOKEN", vercelToken, 8);
requireSecret("DATABASE_URL", databaseUrl, 16);
requireSecret("DEVBOX_CONTROL_PLANE_TOKEN", desktopToken, 32);
requireSecret("DEVBOX_CONTROL_ADMIN_TOKEN", adminToken, 32);

let parsedDatabaseUrl;
try { parsedDatabaseUrl = new URL(databaseUrl); } catch { fail("database-url-invalid"); }
if (!["postgres:", "postgresql:"].includes(parsedDatabaseUrl.protocol)) fail("database-url-protocol", parsedDatabaseUrl.protocol);
const devapiOrigin = canonicalOrigin(devapiCanonicalUrl, "devapi");

const packageJson = JSON.parse(await readFile("package.json", "utf8"));
const version = String(packageJson.version ?? "");
if (version !== "0.1.20") fail("unexpected-version", version);

const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

function runVercel(args, { projectId = "", capture = false, allowFailure = false } = {}) {
  const env = {
    ...process.env,
    VERCEL_TOKEN: vercelToken,
    VERCEL_ORG_ID: teamId
  };
  if (projectId) env.VERCEL_PROJECT_ID = projectId;
  else delete env.VERCEL_PROJECT_ID;
  const result = spawnSync(pnpm, ["dlx", `vercel@${cliVersion}`, ...args], {
    cwd: process.cwd(),
    env,
    encoding: "utf8",
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
    windowsHide: true
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && !allowFailure) {
    const detail = `${result.stderr || result.stdout || "vercel-command-failed"}`.trim().slice(-500);
    fail("vercel-command", detail.replaceAll("\n", " | "));
  }
  return result;
}

function deploymentUrlFrom(result, label) {
  const lines = String(result.stdout ?? "").split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  const candidate = [...lines].reverse().find((line) => /^https:\/\/[^\s]+$/u.test(line));
  if (!candidate) fail("deployment-url-missing", label);
  return candidate.replace(/\/$/u, "");
}

async function waitFor(label, url, verify, attempts = 30) {
  let last = "no-response";
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { accept: "application/json,text/html;q=0.9,*/*;q=0.8", "cache-control": "no-cache" },
        redirect: "follow",
        signal: AbortSignal.timeout(10_000)
      });
      const text = await response.text();
      const verdict = verify(response, text);
      if (verdict.ok) {
        console.log(`V020_PROBE_PASS label=${label} status=${response.status} attempt=${attempt}`);
        return { status: response.status, text, headers: response.headers };
      }
      last = `HTTP_${response.status}:${verdict.detail || text.slice(0, 160)}`;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
  fail("probe-timeout", `${label}:${last.slice(0, 300)}`);
}

console.log(`V020_PROMOTION_START version=${version} sourceSha=${sourceSha} vercelCli=${cliVersion}`);

const existingDevbox = runVercel(["project", "inspect", devboxProjectName, "--non-interactive"], { capture: true, allowFailure: true });
if (existingDevbox.status !== 0) {
  console.log(`V020_DEVBOX_PROJECT_CREATE_REQUIRED name=${devboxProjectName}`);
  runVercel(["project", "add", devboxProjectName, "--yes"], { capture: false });
} else {
  console.log(`V020_DEVBOX_PROJECT_EXISTS name=${devboxProjectName}`);
}

const devapiDeploy = runVercel([
  "deploy", "--prod", "--yes", "--force", "--cwd", "cloud/devapi-control",
  "--env", `DATABASE_URL=${databaseUrl}`,
  "--env", `DEVBOX_CONTROL_PLANE_TOKEN=${desktopToken}`,
  "--env", `DEVBOX_CONTROL_ADMIN_TOKEN=${adminToken}`,
  "--meta", `devboxVersion=${version}`,
  "--meta", `sourceSha=${sourceSha}`
], { projectId: devapiProjectId, capture: true });
const devapiDeploymentUrl = deploymentUrlFrom(devapiDeploy, "devapi");
console.log(`V020_DEVAPI_DEPLOYED url=${devapiDeploymentUrl}`);

await waitFor("devapi-deployment-health", `${devapiDeploymentUrl}/api/v1/health`, (response, text) => {
  if (response.status !== 200) return { ok: false, detail: `status=${response.status}` };
  try {
    const body = JSON.parse(text);
    return { ok: body.version === version && body.state === "READY", detail: `version=${body.version} state=${body.state}` };
  } catch {
    return { ok: false, detail: "invalid-json" };
  }
});

await waitFor("devapi-canonical-health", `${devapiOrigin}/api/v1/health`, (response, text) => {
  if (response.status !== 200) return { ok: false, detail: `status=${response.status}` };
  try {
    const body = JSON.parse(text);
    return { ok: body.version === version && body.state === "READY", detail: `version=${body.version} state=${body.state}` };
  } catch {
    return { ok: false, detail: "invalid-json" };
  }
});

const publicProbe = await waitFor("devapi-public-state-contract", `${devapiOrigin}/api/v1/public-state`, (response, text) => {
  const marker = response.headers.get("x-devbox-public-state");
  if (marker !== "sanitized") return { ok: false, detail: `sanitize-header=${marker ?? "missing"}` };
  if (![200, 404].includes(response.status)) return { ok: false, detail: `status=${response.status}` };
  if (response.status === 404) {
    try { return { ok: JSON.parse(text).error === "PROJECT_NOT_FOUND", detail: "expected-empty-state" }; }
    catch { return { ok: false, detail: "invalid-404-json" }; }
  }
  try { return { ok: JSON.parse(text)?.product?.version === version, detail: "version-drift" }; }
  catch { return { ok: false, detail: "invalid-200-json" }; }
}, 12);

const devboxDeploy = runVercel([
  "deploy", "--prod", "--yes", "--force", "--cwd", "cloud/devbox-site",
  "--env", `DEVAPI_PUBLIC_URL=${devapiOrigin}`,
  "--meta", `devboxVersion=${version}`,
  "--meta", `sourceSha=${sourceSha}`
], { projectId: devboxProjectName, capture: true });
const devboxDeploymentUrl = deploymentUrlFrom(devboxDeploy, "devbox");
console.log(`V020_DEVBOX_DEPLOYED url=${devboxDeploymentUrl}`);

await waitFor("devbox-deployment-root", devboxDeploymentUrl, (response, text) => ({
  ok: response.status === 200 && text.includes("DevBox") && text.includes("0.1.20"),
  detail: `status=${response.status}`
}));

await waitFor("devbox-product-links", `${devboxDeploymentUrl}/api/product-links`, (response, text) => {
  if (response.status !== 200) return { ok: false, detail: `status=${response.status}` };
  try {
    const body = JSON.parse(text);
    return { ok: body.schemaVersion === 1 && body.devapi === devapiOrigin, detail: `devapi=${body.devapi ?? "missing"}` };
  } catch {
    return { ok: false, detail: "invalid-json" };
  }
});

const devboxProxyProbe = await waitFor("devbox-public-state-proxy", `${devboxDeploymentUrl}/api/public-state`, (response, text) => {
  const marker = response.headers.get("x-devbox-public-state");
  if (marker !== "sanitized-proxy") return { ok: false, detail: `proxy-header=${marker ?? "missing"}` };
  if (response.status !== publicProbe.status) return { ok: false, detail: `status=${response.status} upstream=${publicProbe.status}` };
  try {
    const body = JSON.parse(text);
    if (response.status === 404) return { ok: body.error === "PROJECT_NOT_FOUND", detail: body.error ?? "missing-error" };
    return { ok: body?.product?.version === version, detail: body?.product?.version ?? "missing-version" };
  } catch {
    return { ok: false, detail: "invalid-json" };
  }
}, 12);

if (githubOutput) {
  await appendFile(githubOutput, [
    `devapi_deployment_url=${devapiDeploymentUrl}`,
    `devapi_public_state_status=${publicProbe.status}`,
    `devbox_deployment_url=${devboxDeploymentUrl}`,
    `devbox_public_state_status=${devboxProxyProbe.status}`,
    `product_version=${version}`
  ].join("\n") + "\n", "utf8");
}

console.log(`V020_PRODUCTION_PROMOTE_PARTIAL_PASS version=${version} devapi=ready publicStateHttp=${publicProbe.status} devbox=deployed proxy=verified desktopCanary=pending`);
