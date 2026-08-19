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

requireSecret("VERCEL_TOKEN", vercelToken, 8);
requireSecret("DATABASE_URL", databaseUrl, 16);
requireSecret("DEVBOX_CONTROL_PLANE_TOKEN", desktopToken, 32);
requireSecret("DEVBOX_CONTROL_ADMIN_TOKEN", adminToken, 32);

const secretValues = [vercelToken, databaseUrl, desktopToken, adminToken].filter((value) => value.length >= 8);
function redact(value) {
  let text = String(value ?? "");
  for (const secret of secretValues) text = text.split(secret).join("[REDACTED]");
  return text.replaceAll("\n", " ");
}
function safeApiError(data) {
  const code = typeof data?.error?.code === "string" ? data.error.code : typeof data?.code === "string" ? data.code : "UNKNOWN";
  const message = typeof data?.error?.message === "string" ? data.error.message : typeof data?.message === "string" ? data.message : "request-failed";
  return redact(`${code}:${message}`).slice(0, 300);
}

let parsedDatabaseUrl;
try { parsedDatabaseUrl = new URL(databaseUrl); } catch { fail("database-url-invalid"); }
if (!["postgres:", "postgresql:"].includes(parsedDatabaseUrl.protocol)) fail("database-url-protocol", parsedDatabaseUrl.protocol);
const devapiOrigin = canonicalOrigin(devapiCanonicalUrl, "devapi");

const packageJson = JSON.parse(await readFile("package.json", "utf8"));
const version = String(packageJson.version ?? "");
if (version !== "0.1.20") fail("unexpected-version", version);
if (!/^([a-f0-9]{40}|unknown)$/u.test(sourceSha)) fail("source-sha-invalid", sourceSha);

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
  const created = await vercelApi("/v11/projects", { method: "POST", body: { name }, allowStatuses: [409] });
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
  const env = { ...process.env, VERCEL_TOKEN: vercelToken, VERCEL_ORG_ID: teamId, VERCEL_PROJECT_ID: projectId };
  const result = spawnSync(pnpm, ["dlx", `vercel@${cliVersion}`, ...args], {
    cwd: process.cwd(), env, encoding: "utf8", stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit", windowsHide: true
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = redact(`${result.stderr || result.stdout || "vercel-command-failed"}`).trim().slice(-500);
    fail("vercel-command", detail);
  }
  return result;
}

function deploymentUrlFrom(result, label) {
  const lines = String(result.stdout ?? "").split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  const candidate = [...lines].reverse().find((line) => /^https:\/\/[^\s]+$/u.test(line));
  if (!candidate) fail("deployment-url-missing", label);
  return canonicalOrigin(candidate.endsWith("/") ? candidate : `${candidate}/`, `${label}-deployment`);
}

async function deploymentDetails(idOrUrl) {
  const value = String(idOrUrl ?? "");
  const identifier = value.startsWith("https://") ? new URL(value).hostname : value;
  const result = await vercelApi(`/v13/deployments/${encodeURIComponent(identifier)}`);
  const id = String(result.data?.id ?? "");
  if (!id.startsWith("dpl_")) fail("deployment-id-invalid", identifier);
  return { id, data: result.data };
}

function aliasOrigins(details, preferredProjectName = "") {
  const aliases = Array.isArray(details?.alias) ? details.alias : [];
  const result = [];
  for (const alias of aliases) {
    try {
      const origin = canonicalOrigin(`https://${String(alias).replace(/^https:\/\//u, "")}/`, "deployment-alias");
      if (!result.includes(origin)) result.push(origin);
    } catch {
      // Invalid alias entries are ignored; a production alias must be independently probeable below.
    }
  }
  const score = (origin) => {
    const host = new URL(origin).hostname;
    if (preferredProjectName && host === `${preferredProjectName}.vercel.app`) return 0;
    if (preferredProjectName && host.startsWith(`${preferredProjectName}-`) && host.endsWith(".vercel.app")) return 1;
    if (host.endsWith(".vercel.app")) return 2;
    return 3;
  };
  return result.sort((a, b) => score(a) - score(b) || a.length - b.length || a.localeCompare(b));
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
    } else last = probe.error || "request-failed";
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
  fail("probe-timeout", `${label}:${redact(last).slice(0, 300)}`);
}

async function waitForPromotedAlias(label, deploymentId, preferredProjectName, verify, attempts = 30) {
  let last = "alias-not-assigned";
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const details = await deploymentDetails(deploymentId);
    for (const candidate of aliasOrigins(details.data, preferredProjectName)) {
      const probe = await fetchProbe(candidate);
      if (!probe.response) continue;
      const verdict = verify(probe.response, probe.text);
      if (verdict.ok) {
        console.log(`V020_PROMOTED_ALIAS_PASS label=${label} deployment=${deploymentId} origin=${candidate} attempt=${attempt}`);
        return candidate;
      }
      last = `${candidate}:HTTP_${probe.response.status}:${verdict.detail || "verify-failed"}`;
    }
    await new Promise((resolve) => setTimeout(resolve, 4_000));
  }
  fail("promoted-alias-unverified", `${label}:${last}`);
}

async function waitForSpecificAlias(label, deploymentId, expectedOrigin, verify, attempts = 30) {
  const expectedHost = new URL(expectedOrigin).hostname;
  let last = "alias-not-assigned";
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const details = await deploymentDetails(deploymentId);
    const hosts = aliasOrigins(details.data).map((origin) => new URL(origin).hostname);
    if (hosts.includes(expectedHost)) {
      const probe = await fetchProbe(expectedOrigin);
      if (probe.response) {
        const verdict = verify(probe.response, probe.text);
        if (verdict.ok) {
          console.log(`V020_PROMOTED_ALIAS_REBOUND_PASS label=${label} deployment=${deploymentId} origin=${expectedOrigin} attempt=${attempt}`);
          return;
        }
        last = `HTTP_${probe.response.status}:${verdict.detail || "verify-failed"}`;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 4_000));
  }
  fail("promoted-alias-rebind-unverified", `${label}:${last}`);
}

async function promoteDeployment(projectId, deploymentId, label) {
  if (!projectId.startsWith("prj_") || !deploymentId.startsWith("dpl_")) fail("promote-id-invalid", label);
  await vercelApi(`/v10/projects/${encodeURIComponent(projectId)}/promote/${encodeURIComponent(deploymentId)}`, { method: "POST" });
  console.log(`V020_PROMOTE_REQUEST_PASS label=${label} project=${projectId} deployment=${deploymentId}`);
}

async function stageDeployment({ projectId, cwd, label }) {
  const result = runVercel([
    "deploy", "--prod", "--skip-domain", "--yes", "--force", "--cwd", cwd,
    "--meta", `devboxVersion=${version}`,
    "--meta", `sourceSha=${sourceSha}`
  ], { projectId, capture: true });
  const url = deploymentUrlFrom(result, label);
  const details = await deploymentDetails(url);
  const state = String(details.data?.readyState ?? details.data?.status ?? "");
  if (state && state !== "READY") fail("staged-deployment-not-ready", `${label}:${state}`);
  console.log(`V020_STAGE_READY label=${label} id=${details.id} url=${url} domainAssignment=skipped`);
  return { id: details.id, url, data: details.data };
}

function verifyDevboxRoot(response, text) {
  return { ok: response.status === 200 && text.includes("DevBox") && text.includes("0.1.20"), detail: `status=${response.status}` };
}

function verifySanitizedPublicState(response, text) {
  const marker = response.headers.get("x-devbox-public-state");
  if (marker !== "sanitized") return { ok: false, detail: `sanitize-header=${marker ?? "missing"}` };
  if (![200, 404].includes(response.status)) return { ok: false, detail: `status=${response.status}` };
  try {
    const body = JSON.parse(text);
    if (response.status === 404) return { ok: body.error === "PROJECT_NOT_FOUND", detail: body.error ?? "missing-error" };
    return { ok: body?.product?.version === version, detail: body?.product?.version ?? "missing-version" };
  } catch {
    return { ok: false, detail: "invalid-json" };
  }
}

function verifyProxyPublicState(upstreamStatus) {
  return (response, text) => {
    const marker = response.headers.get("x-devbox-public-state");
    if (marker !== "sanitized-proxy") return { ok: false, detail: `proxy-header=${marker ?? "missing"}` };
    if (response.status !== upstreamStatus) return { ok: false, detail: `status=${response.status} upstream=${upstreamStatus}` };
    try {
      const body = JSON.parse(text);
      if (response.status === 404) return { ok: body.error === "PROJECT_NOT_FOUND", detail: body.error ?? "missing-error" };
      return { ok: body?.product?.version === version, detail: body?.product?.version ?? "missing-version" };
    } catch {
      return { ok: false, detail: "invalid-json" };
    }
  };
}

console.log(`V020_PROMOTION_START version=${version} sourceSha=${sourceSha} vercelCli=${cliVersion} mode=staged-smoke-promote`);

const currentDevapiProduction = await deploymentDetails(devapiOrigin);
const devapiRollbackCandidateId = currentDevapiProduction.id;
console.log(`V020_ROLLBACK_CAPTURE label=devapi deployment=${devapiRollbackCandidateId} source=current-production`);

const devboxProjectId = await ensureProject(devboxProjectName);
await upsertProjectEnv(devboxProjectId, [
  { key: "DEVAPI_PUBLIC_URL", value: devapiOrigin, type: "plain", target: ["production"], comment: "Verified DevAPI production origin for same-origin public proxy" }
]);

const devboxBaseline = await stageDeployment({ projectId: devboxProjectId, cwd: "cloud/devbox-site", label: "devbox-baseline" });
await waitFor("devbox-baseline-root", devboxBaseline.url, verifyDevboxRoot);
await waitFor("devbox-baseline-product-links", `${devboxBaseline.url}/api/product-links`, (response, text) => {
  if (response.status !== 200) return { ok: false, detail: `status=${response.status}` };
  try {
    const body = JSON.parse(text);
    return { ok: body.schemaVersion === 1 && body.devapi === devapiOrigin, detail: `devapi=${body.devapi ?? "missing"}` };
  } catch { return { ok: false, detail: "invalid-json" }; }
});
await promoteDeployment(devboxProjectId, devboxBaseline.id, "devbox-baseline");
const devboxProductOrigin = await waitForPromotedAlias("devbox-baseline", devboxBaseline.id, devboxProjectName, verifyDevboxRoot);
const devboxRollbackCandidateId = devboxBaseline.id;
console.log(`V020_ROLLBACK_CAPTURE label=devbox deployment=${devboxRollbackCandidateId} source=verified-baseline`);

await upsertProjectEnv(devapiProjectId, [
  { key: "DATABASE_URL", value: databaseUrl, type: "sensitive", target: ["production"], comment: "DevAPI canonical Neon production connection" },
  { key: "DEVBOX_CONTROL_PLANE_TOKEN", value: desktopToken, type: "sensitive", target: ["production"], comment: "Desktop HMAC/auth control-plane secret" },
  { key: "DEVBOX_CONTROL_ADMIN_TOKEN", value: adminToken, type: "sensitive", target: ["production"], comment: "DevAPI admin control secret" },
  { key: "DEVAPI_CANONICAL_URL", value: devapiOrigin, type: "plain", target: ["production"], comment: "Verified DevAPI public origin" },
  { key: "DEVBOX_PRODUCT_URL", value: devboxProductOrigin, type: "plain", target: ["production"], comment: "Verified DevBox product origin" }
]);

const devapiStage = await stageDeployment({ projectId: devapiProjectId, cwd: "cloud/devapi-control", label: "devapi" });
await waitFor("devapi-stage-health", `${devapiStage.url}/api/v1/health`, (response, text) => {
  if (response.status !== 200) return { ok: false, detail: `status=${response.status}` };
  try {
    const body = JSON.parse(text);
    return { ok: body.version === version && body.state === "READY", detail: `version=${body.version} state=${body.state}` };
  } catch { return { ok: false, detail: "invalid-json" }; }
});
await waitFor("devapi-stage-product-links", `${devapiStage.url}/api/v1/product-links`, (response, text) => {
  if (response.status !== 200) return { ok: false, detail: `status=${response.status}` };
  try {
    const body = JSON.parse(text);
    return { ok: body.schemaVersion === 1 && body.devapi === devapiOrigin && body.devbox === devboxProductOrigin, detail: `devapi=${body.devapi ?? "missing"} devbox=${body.devbox ?? "missing"}` };
  } catch { return { ok: false, detail: "invalid-json" }; }
});
const stagedPublicProbe = await waitFor("devapi-stage-public-state", `${devapiStage.url}/api/v1/public-state`, verifySanitizedPublicState, 12);
await promoteDeployment(devapiProjectId, devapiStage.id, "devapi");
await waitFor("devapi-canonical-health", `${devapiOrigin}/api/v1/health`, (response, text) => {
  if (response.status !== 200) return { ok: false, detail: `status=${response.status}` };
  try {
    const body = JSON.parse(text);
    return { ok: body.version === version && body.state === "READY", detail: `version=${body.version} state=${body.state}` };
  } catch { return { ok: false, detail: "invalid-json" }; }
});
const canonicalDevapi = await deploymentDetails(devapiOrigin);
if (canonicalDevapi.id !== devapiStage.id) fail("devapi-promote-drift", `${canonicalDevapi.id}!=${devapiStage.id}`);
await waitFor("devapi-canonical-product-links", `${devapiOrigin}/api/v1/product-links`, (response, text) => {
  if (response.status !== 200) return { ok: false, detail: `status=${response.status}` };
  try {
    const body = JSON.parse(text);
    return { ok: body.schemaVersion === 1 && body.devapi === devapiOrigin && body.devbox === devboxProductOrigin, detail: `devapi=${body.devapi ?? "missing"} devbox=${body.devbox ?? "missing"}` };
  } catch { return { ok: false, detail: "invalid-json" }; }
});
const publicProbe = await waitFor("devapi-canonical-public-state", `${devapiOrigin}/api/v1/public-state`, verifySanitizedPublicState, 12);
if (publicProbe.status !== stagedPublicProbe.status) fail("public-state-stage-production-drift", `${stagedPublicProbe.status}!=${publicProbe.status}`);

const devboxFinal = await stageDeployment({ projectId: devboxProjectId, cwd: "cloud/devbox-site", label: "devbox-final" });
if (devboxFinal.id === devboxRollbackCandidateId) fail("devbox-final-equals-rollback");
await waitFor("devbox-final-root", devboxFinal.url, verifyDevboxRoot);
await waitFor("devbox-final-product-links", `${devboxFinal.url}/api/product-links`, (response, text) => {
  if (response.status !== 200) return { ok: false, detail: `status=${response.status}` };
  try {
    const body = JSON.parse(text);
    return { ok: body.schemaVersion === 1 && body.devapi === devapiOrigin, detail: `devapi=${body.devapi ?? "missing"}` };
  } catch { return { ok: false, detail: "invalid-json" }; }
});
const stagedDevboxProxy = await waitFor("devbox-final-public-state", `${devboxFinal.url}/api/public-state`, verifyProxyPublicState(publicProbe.status), 12);
await promoteDeployment(devboxProjectId, devboxFinal.id, "devbox-final");
await waitForSpecificAlias("devbox-final", devboxFinal.id, devboxProductOrigin, verifyDevboxRoot);
await waitFor("devbox-canonical-product-links", `${devboxProductOrigin}/api/product-links`, (response, text) => {
  if (response.status !== 200) return { ok: false, detail: `status=${response.status}` };
  try {
    const body = JSON.parse(text);
    return { ok: body.schemaVersion === 1 && body.devapi === devapiOrigin, detail: `devapi=${body.devapi ?? "missing"}` };
  } catch { return { ok: false, detail: "invalid-json" }; }
});
const devboxProxyProbe = await waitFor("devbox-canonical-public-state", `${devboxProductOrigin}/api/public-state`, verifyProxyPublicState(publicProbe.status), 12);
if (devboxProxyProbe.status !== stagedDevboxProxy.status) fail("devbox-proxy-stage-production-drift", `${stagedDevboxProxy.status}!=${devboxProxyProbe.status}`);
const publicStateSanitizationState = publicProbe.status === 200 ? "PASS" : "PENDING_DESKTOP_SNAPSHOT";

if (githubOutput) {
  await appendFile(githubOutput, [
    `devapi_project_id=${devapiProjectId}`,
    `devapi_deployment_id=${devapiStage.id}`,
    `devapi_deployment_url=${devapiStage.url}`,
    `devapi_rollback_id=${devapiRollbackCandidateId}`,
    `devapi_public_state_status=${publicProbe.status}`,
    `devbox_project_id=${devboxProjectId}`,
    `devbox_deployment_id=${devboxFinal.id}`,
    `devbox_deployment_url=${devboxFinal.url}`,
    `devbox_product_url=${devboxProductOrigin}`,
    `devbox_rollback_id=${devboxRollbackCandidateId}`,
    `devbox_public_state_status=${devboxProxyProbe.status}`,
    `public_state_contract=PASS`,
    `public_state_sanitization=${publicStateSanitizationState}`,
    `cross_site_links=PASS`,
    `product_version=${version}`
  ].join("\n") + "\n", "utf8");
}

console.log(`V020_PRODUCTION_PROMOTE_PARTIAL_PASS version=${version} devapi=${devapiStage.id} devapiRollback=${devapiRollbackCandidateId} devbox=${devboxFinal.id} devboxRollback=${devboxRollbackCandidateId} stagedSmoke=pass publicStateContract=pass publicStateSanitization=${publicStateSanitizationState} crossLinks=pass proxy=verified desktopCanary=pending`);
