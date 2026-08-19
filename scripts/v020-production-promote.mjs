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
const VERCEL_API = "https://api.vercel.com";

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

function safeApiError(data) {
  const code = typeof data?.error?.code === "string" ? data.error.code : typeof data?.code === "string" ? data.code : "UNKNOWN";
  const message = typeof data?.error?.message === "string" ? data.error.message : typeof data?.message === "string" ? data.message : "request-failed";
  return `${code}:${message}`.replaceAll("\n", " ").slice(0, 300);
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

async function vercelApi(pathname, { method = "GET", body, allowStatuses = [] } = {}) {
  const url = new URL(pathname, VERCEL_API);
  if (!url.searchParams.has("teamId")) url.searchParams.set("teamId", teamId);
  const response = await fetch(url, {
    method,
    headers: {
      authorization: `Bearer ${vercelToken}`,
      accept: "application/json",
      ...(body === undefined ? {} : { "content-type": "application/json" })
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "error",
    signal: AbortSignal.timeout(20_000)
  });
  const text = await response.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); }
    catch { data = { message: "non-json-response" }; }
  }
  if (!response.ok && !allowStatuses.includes(response.status)) {
    fail("vercel-api", `${method}:${url.pathname}:HTTP_${response.status}:${safeApiError(data)}`);
  }
  return { status: response.status, data, headers: response.headers };
}

async function ensureProject(name) {
  const encoded = encodeURIComponent(name);
  const existing = await vercelApi(`/v9/projects/${encoded}`, { allowStatuses: [404] });
  if (existing.status === 200) {
    const id = String(existing.data?.id ?? "");
    if (!id.startsWith("prj_")) fail("project-id-invalid", name);
    console.log(`V020_PROJECT_EXISTS name=${name} id=${id}`);
    return id;
  }

  console.log(`V020_PROJECT_CREATE_REQUIRED name=${name}`);
  const created = await vercelApi("/v11/projects", {
    method: "POST",
    body: { name },
    allowStatuses: [409]
  });
  if (created.status === 409) {
    const raced = await vercelApi(`/v9/projects/${encoded}`);
    const racedId = String(raced.data?.id ?? "");
    if (!racedId.startsWith("prj_")) fail("project-create-race-invalid", name);
    console.log(`V020_PROJECT_CREATE_RACE_RESOLVED name=${name} id=${racedId}`);
    return racedId;
  }
  const id = String(created.data?.id ?? "");
  if (!id.startsWith("prj_")) fail("project-create-response-invalid", name);
  console.log(`V020_PROJECT_CREATED name=${name} id=${id}`);
  return id;
}

async function upsertProjectEnv(projectId, variables) {
  const result = await vercelApi(`/v10/projects/${encodeURIComponent(projectId)}/env?upsert=true`, {
    method: "POST",
    body: variables
  });
  const failed = Array.isArray(result.data?.failed) ? result.data.failed : [];
  if (failed.length > 0) {
    const failedKeys = failed.map((entry) => String(entry?.key ?? entry?.error?.key ?? "unknown")).slice(0, 20).join(",");
    fail("project-env-upsert-partial", `${projectId}:${failedKeys}`);
  }
  console.log(`V020_PROJECT_ENV_UPSERT_PASS project=${projectId} keys=${variables.map((entry) => entry.key).join(",")} values=masked`);
}

function runVercel(args, { projectId, capture = false } = {}) {
  if (!projectId?.startsWith("prj_")) fail("vercel-project-id-required");
  const env = {
    ...process.env,
    VERCEL_TOKEN: vercelToken,
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
    const detail = `${result.stderr || result.stdout || "vercel-command-failed"}`.trim().slice(-500);
    fail("vercel-command", detail.replaceAll("\n", " | "));
  }
  return result;
}

function deploymentUrlFrom(result, label) {
  const lines = String(result.stdout ?? "").split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  const candidate = [...lines].reverse().find((line) => /^https:\/\/[^\s]+$/u.test(line));
  if (!candidate) fail("deployment-url-missing", label);
  return canonicalOrigin(candidate.endsWith("/") ? candidate : `${candidate}/`, `${label}-deployment`);
}

async function deploymentDetails(deploymentUrl) {
  const host = new URL(deploymentUrl).hostname;
  const result = await vercelApi(`/v13/deployments/${encodeURIComponent(host)}`);
  const id = String(result.data?.id ?? "");
  if (!id.startsWith("dpl_")) fail("deployment-id-invalid", host);
  return { id, data: result.data };
}

function verifiedAliasCandidates(details, fallbackOrigin) {
  const aliases = Array.isArray(details?.alias) ? details.alias : [];
  const result = [];
  for (const alias of aliases) {
    try {
      const origin = canonicalOrigin(`https://${String(alias).replace(/^https:\/\//u, "")}/`, "deployment-alias");
      if (!result.includes(origin)) result.push(origin);
    } catch {
      // An invalid alias is ignored; immutable deployment origin remains the fail-closed fallback.
    }
  }
  if (!result.includes(fallbackOrigin)) result.push(fallbackOrigin);
  return result;
}

async function fetchProbe(url) {
  try {
    const response = await fetch(url, {
      headers: { accept: "application/json,text/html;q=0.9,*/*;q=0.8", "cache-control": "no-cache" },
      redirect: "follow",
      signal: AbortSignal.timeout(10_000)
    });
    const text = await response.text();
    return { response, text, error: null };
  } catch (error) {
    return { response: null, text: "", error: error instanceof Error ? error.message : String(error) };
  }
}

async function waitFor(label, url, verify, attempts = 30) {
  let last = "no-response";
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const probe = await fetchProbe(url);
    if (probe.response) {
      const verdict = verify(probe.response, probe.text);
      if (verdict.ok) {
        console.log(`V020_PROBE_PASS label=${label} status=${probe.response.status} attempt=${attempt}`);
        return { status: probe.response.status, text: probe.text, headers: probe.response.headers };
      }
      last = `HTTP_${probe.response.status}:${verdict.detail || probe.text.slice(0, 160)}`;
    } else {
      last = probe.error || "request-failed";
    }
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
  fail("probe-timeout", `${label}:${last.slice(0, 300)}`);
}

async function selectVerifiedProductOrigin(label, candidates, verify, attempts = 8) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    for (const candidate of candidates) {
      const probe = await fetchProbe(candidate);
      if (!probe.response) continue;
      const verdict = verify(probe.response, probe.text);
      if (verdict.ok) {
        console.log(`V020_PUBLIC_ORIGIN_PASS label=${label} origin=${candidate} status=${probe.response.status} attempt=${attempt}`);
        return candidate;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 4_000));
  }
  fail("public-origin-unverified", label);
}

console.log(`V020_PROMOTION_START version=${version} sourceSha=${sourceSha} vercelCli=${cliVersion}`);

const devboxProjectId = await ensureProject(devboxProjectName);
await upsertProjectEnv(devboxProjectId, [
  { key: "DEVAPI_PUBLIC_URL", value: devapiOrigin, type: "plain", target: ["production"], comment: "Verified DevAPI production origin for same-origin public proxy" }
]);

const devboxDeploy = runVercel([
  "deploy", "--prod", "--yes", "--force", "--cwd", "cloud/devbox-site",
  "--meta", `devboxVersion=${version}`,
  "--meta", `sourceSha=${sourceSha}`
], { projectId: devboxProjectId, capture: true });
const devboxDeploymentUrl = deploymentUrlFrom(devboxDeploy, "devbox");
const devboxDeployment = await deploymentDetails(devboxDeploymentUrl);
console.log(`V020_DEVBOX_DEPLOYED id=${devboxDeployment.id} url=${devboxDeploymentUrl}`);

await waitFor("devbox-deployment-root", devboxDeploymentUrl, (response, text) => ({
  ok: response.status === 200 && text.includes("DevBox") && text.includes("0.1.20"),
  detail: `status=${response.status}`
}));

const devboxProductOrigin = await selectVerifiedProductOrigin(
  "devbox-product",
  verifiedAliasCandidates(devboxDeployment.data, devboxDeploymentUrl),
  (response, text) => ({
    ok: response.status === 200 && text.includes("DevBox") && text.includes("0.1.20"),
    detail: `status=${response.status}`
  })
);

await waitFor("devbox-product-links", `${devboxProductOrigin}/api/product-links`, (response, text) => {
  if (response.status !== 200) return { ok: false, detail: `status=${response.status}` };
  try {
    const body = JSON.parse(text);
    return { ok: body.schemaVersion === 1 && body.devapi === devapiOrigin, detail: `devapi=${body.devapi ?? "missing"}` };
  } catch {
    return { ok: false, detail: "invalid-json" };
  }
});

await upsertProjectEnv(devapiProjectId, [
  { key: "DATABASE_URL", value: databaseUrl, type: "sensitive", target: ["production"], comment: "DevAPI canonical Neon production connection" },
  { key: "DEVBOX_CONTROL_PLANE_TOKEN", value: desktopToken, type: "sensitive", target: ["production"], comment: "Desktop HMAC/auth control-plane secret" },
  { key: "DEVBOX_CONTROL_ADMIN_TOKEN", value: adminToken, type: "sensitive", target: ["production"], comment: "DevAPI admin control secret" },
  { key: "DEVAPI_CANONICAL_URL", value: devapiOrigin, type: "plain", target: ["production"], comment: "Verified DevAPI public origin" },
  { key: "DEVBOX_PRODUCT_URL", value: devboxProductOrigin, type: "plain", target: ["production"], comment: "Verified DevBox product origin" }
]);

const devapiDeploy = runVercel([
  "deploy", "--prod", "--yes", "--force", "--cwd", "cloud/devapi-control",
  "--meta", `devboxVersion=${version}`,
  "--meta", `sourceSha=${sourceSha}`
], { projectId: devapiProjectId, capture: true });
const devapiDeploymentUrl = deploymentUrlFrom(devapiDeploy, "devapi");
const devapiDeployment = await deploymentDetails(devapiDeploymentUrl);
console.log(`V020_DEVAPI_DEPLOYED id=${devapiDeployment.id} url=${devapiDeploymentUrl}`);

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

await waitFor("devapi-product-links", `${devapiOrigin}/api/v1/product-links`, (response, text) => {
  if (response.status !== 200) return { ok: false, detail: `status=${response.status}` };
  try {
    const body = JSON.parse(text);
    return {
      ok: body.schemaVersion === 1 && body.devapi === devapiOrigin && body.devbox === devboxProductOrigin,
      detail: `devapi=${body.devapi ?? "missing"} devbox=${body.devbox ?? "missing"}`
    };
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

const devboxProxyProbe = await waitFor("devbox-public-state-proxy", `${devboxProductOrigin}/api/public-state`, (response, text) => {
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
    `devapi_project_id=${devapiProjectId}`,
    `devapi_deployment_id=${devapiDeployment.id}`,
    `devapi_deployment_url=${devapiDeploymentUrl}`,
    `devapi_public_state_status=${publicProbe.status}`,
    `devbox_project_id=${devboxProjectId}`,
    `devbox_deployment_id=${devboxDeployment.id}`,
    `devbox_deployment_url=${devboxDeploymentUrl}`,
    `devbox_product_url=${devboxProductOrigin}`,
    `devbox_public_state_status=${devboxProxyProbe.status}`,
    `cross_site_links=PASS`,
    `product_version=${version}`
  ].join("\n") + "\n", "utf8");
}

console.log(`V020_PRODUCTION_PROMOTE_PARTIAL_PASS version=${version} devapi=${devapiDeployment.id} devbox=${devboxDeployment.id} crossLinks=pass proxy=verified desktopCanary=pending`);
