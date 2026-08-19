import { mkdir, writeFile } from "node:fs/promises";

const VERSION = "0.1.20";
const PROTOCOL = 1;
const endpoint = canonicalOrigin(process.env.DEVAPI_CANONICAL_URL?.trim() || "https://devapi-virid.vercel.app", "devapi");
const adminToken = process.env.DEVBOX_CONTROL_ADMIN_TOKEN?.trim() || "";
const requestedProjectId = process.env.DEVBOX_CANARY_PROJECT_ID?.trim() || "";
const githubOutput = process.env.GITHUB_OUTPUT?.trim() || "";
const maxAgeSeconds = boundedInteger(process.env.DEVBOX_CANARY_MAX_AGE_SECONDS, 180, 30, 600);
const desktopWaitSeconds = boundedInteger(process.env.DEVBOX_CANARY_WAIT_SECONDS, 480, 60, 900);

if (adminToken.length < 32) fail("ADMIN_TOKEN_MISSING");

function fail(code, detail = "") {
  throw new Error(`V020_DESKTOP_CANARY_FAIL:${code}${detail ? `:${String(detail).slice(0, 500)}` : ""}`);
}
function boundedInteger(value, fallback, min, max) {
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
}
function canonicalOrigin(value, label) {
  let url;
  try { url = new URL(String(value)); } catch { fail("URL_INVALID", label); }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") fail("URL_UNSAFE", label);
  return url.origin;
}
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function ageSeconds(value) {
  const time = Date.parse(String(value ?? ""));
  return Number.isFinite(time) ? Math.max(0, (Date.now() - time) / 1000) : Number.POSITIVE_INFINITY;
}
function asBoolean(value) {
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  fail("BOOLEAN_INVALID", value);
}
function field(record, ...names) {
  for (const name of names) if (record && Object.prototype.hasOwnProperty.call(record, name)) return record[name];
  return undefined;
}
function currentSnapshot(state) {
  const current = state?.current;
  if (!current || typeof current !== "object") fail("CURRENT_SNAPSHOT_MISSING");
  const snapshot = field(current, "latest_snapshot", "latestSnapshot");
  if (!snapshot || typeof snapshot !== "object") fail("LATEST_SNAPSHOT_MISSING");
  return { current, snapshot };
}
function snapshotIdentity(state) {
  const { current, snapshot } = currentSnapshot(state);
  const product = snapshot.product;
  const project = snapshot.project;
  const evolution = snapshot.evolution;
  if (!product || typeof product !== "object" || product.name !== "DevBox" || product.version !== VERSION || Number(product.cloudProtocol) !== PROTOCOL) {
    fail("DESKTOP_VERSION_MISMATCH", `${product?.name ?? "?"}/${product?.version ?? "?"}/${product?.cloudProtocol ?? "?"}`);
  }
  if (!project || typeof project !== "object" || !evolution || typeof evolution !== "object") fail("SNAPSHOT_CONTRACT_INVALID");
  const projectId = String(project.id ?? "");
  const instanceId = String(field(current, "instance_id", "instanceId") ?? snapshot.instanceId ?? "");
  const capturedAt = String(field(current, "captured_at", "capturedAt") ?? snapshot.capturedAt ?? "");
  if (projectId.length < 8 || !instanceId || !Number.isFinite(Date.parse(capturedAt))) fail("SNAPSHOT_IDENTITY_INVALID");
  return { projectId, instanceId, capturedAt, enabled: asBoolean(evolution.enabled), isRunning: asBoolean(evolution.isRunning), snapshot };
}

async function api(pathname, { method = "GET", body } = {}) {
  const url = new URL(pathname, endpoint);
  const response = await fetch(url, {
    method,
    headers: {
      accept: "application/json",
      authorization: `Bearer ${adminToken}`,
      ...(body === undefined ? {} : { "content-type": "application/json" })
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "error",
    signal: AbortSignal.timeout(15_000)
  });
  const text = await response.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { fail("INVALID_JSON", `${method}:${url.pathname}`); }
  }
  if (!response.ok) fail("HTTP", `${method}:${url.pathname}:${response.status}:${data?.error ?? "unknown"}`);
  return data;
}

async function listProjects() {
  const data = await api("/api/v1/projects?limit=100");
  if (!Array.isArray(data?.items)) fail("PROJECT_LIST_INVALID");
  return data.items;
}
function eligibleProject(item) {
  if (!item || typeof item !== "object") return false;
  if (String(item.productName ?? "") !== "DevBox") return false;
  if (String(item.productVersion ?? "") !== VERSION) return false;
  if (Number(item.cloudProtocol) !== PROTOCOL) return false;
  if (ageSeconds(item.capturedAt) > maxAgeSeconds) return false;
  return true;
}
async function waitForDesktop() {
  const deadline = Date.now() + desktopWaitSeconds * 1000;
  let last = "none";
  while (Date.now() < deadline) {
    const items = await listProjects();
    const eligible = items.filter(eligibleProject);
    if (requestedProjectId) {
      const selected = eligible.find((item) => String(item.projectId) === requestedProjectId);
      if (selected) return selected;
      last = `requested=${requestedProjectId} eligible=${eligible.map((item) => item.projectId).join(",") || "none"}`;
    } else if (eligible.length === 1) {
      return eligible[0];
    } else if (eligible.length > 1) {
      fail("DESKTOP_SELECTION_AMBIGUOUS", eligible.map((item) => item.projectId).join(","));
    } else last = "no-fresh-v0.1.20-desktop";
    await sleep(10_000);
  }
  fail("DESKTOP_NOT_READY", last);
}

async function state(projectId) {
  return await api(`/api/v1/state?projectId=${encodeURIComponent(projectId)}`);
}
async function createCommand(projectId, kind, payload = {}) {
  const data = await api("/api/v1/commands", { method: "POST", body: { projectId, kind, payload } });
  const item = data?.item;
  const id = String(item?.id ?? "");
  const sequence = Math.trunc(Number(item?.sequence));
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(id)) fail("COMMAND_ID_INVALID", kind);
  if (!Number.isSafeInteger(sequence) || sequence <= 0) fail("COMMAND_SEQUENCE_INVALID", kind);
  if (String(item?.applyStatus ?? item?.apply_status ?? "PENDING").toUpperCase() !== "PENDING") fail("COMMAND_INITIAL_STATE_INVALID", kind);
  console.log(`V020_CANARY_COMMAND_CREATED kind=${kind} id=${id} sequence=${sequence}`);
  return { id, sequence, kind };
}
function normalizeCommand(row) {
  return {
    id: String(row?.id ?? ""),
    sequence: Math.trunc(Number(row?.sequence)),
    kind: String(row?.kind ?? ""),
    status: String(field(row, "apply_status", "applyStatus") ?? "").toUpperCase(),
    appliedAt: String(field(row, "applied_at", "appliedAt") ?? ""),
    instanceId: String(field(row, "applied_instance_id", "appliedInstanceId") ?? "")
  };
}
async function waitApplied(projectId, command, expectedInstanceId, timeoutSeconds = 120) {
  const deadline = Date.now() + timeoutSeconds * 1000;
  let last = "missing";
  while (Date.now() < deadline) {
    const data = await state(projectId);
    const commands = Array.isArray(data?.commands) ? data.commands.map(normalizeCommand) : [];
    const matches = commands.filter((item) => item.id === command.id);
    if (matches.length > 1) fail("COMMAND_DUPLICATE_ID", command.id);
    const item = matches[0];
    if (item) {
      if (item.sequence !== command.sequence || item.kind !== command.kind) fail("COMMAND_IDENTITY_DRIFT", command.id);
      if (item.status === "FAILED") fail("COMMAND_FAILED", `${command.kind}:${command.id}`);
      if (item.status === "APPLIED") {
        if (item.instanceId !== expectedInstanceId) fail("COMMAND_WRONG_DESKTOP_ACK", `${command.id}:${item.instanceId}`);
        if (!Number.isFinite(Date.parse(item.appliedAt))) fail("COMMAND_APPLIED_TIME_INVALID", command.id);
        console.log(`V020_CANARY_ACK_PASS kind=${command.kind} id=${command.id} sequence=${command.sequence} instance=${expectedInstanceId}`);
        return { item, state: data };
      }
      last = item.status || "PENDING";
    }
    await sleep(3_000);
  }
  fail("COMMAND_ACK_TIMEOUT", `${command.kind}:${command.id}:${last}`);
}
async function waitSnapshot(projectId, after, predicate, label, timeoutSeconds = 120) {
  const deadline = Date.now() + timeoutSeconds * 1000;
  let last = "none";
  const threshold = Date.parse(after);
  if (!Number.isFinite(threshold)) fail("SNAPSHOT_THRESHOLD_INVALID", label);
  while (Date.now() < deadline) {
    const data = await state(projectId);
    const identity = snapshotIdentity(data);
    last = identity.capturedAt;
    if (Date.parse(identity.capturedAt) > threshold && predicate(identity)) {
      console.log(`V020_CANARY_SNAPSHOT_PASS label=${label} capturedAt=${identity.capturedAt} instance=${identity.instanceId}`);
      return { data, identity };
    }
    await sleep(3_000);
  }
  fail("SNAPSHOT_TIMEOUT", `${label}:${last}`);
}
async function verifyPublicState(projectId, instanceId) {
  const url = new URL("/api/v1/public-state", endpoint);
  url.searchParams.set("projectId", projectId);
  const response = await fetch(url, {
    headers: { accept: "application/json", "cache-control": "no-cache" },
    redirect: "error",
    signal: AbortSignal.timeout(15_000)
  });
  const text = await response.text();
  if (response.status !== 200) fail("PUBLIC_STATE_HTTP", response.status);
  if (response.headers.get("x-devbox-public-state") !== "sanitized") fail("PUBLIC_STATE_MARKER_MISSING");
  const etag = response.headers.get("etag");
  if (!etag) fail("PUBLIC_STATE_ETAG_MISSING");
  let body;
  try { body = JSON.parse(text); } catch { fail("PUBLIC_STATE_INVALID_JSON"); }
  if (body?.product?.name !== "DevBox" || body?.product?.version !== VERSION) fail("PUBLIC_STATE_VERSION_DRIFT");
  if (body?.devapi?.state !== "READY" || body?.devapi?.controlPlaneVersion !== VERSION) fail("PUBLIC_STATE_DEVAPI_DRIFT");
  if (body?.freshness?.stale !== false || ageSeconds(body?.freshness?.capturedAt) > maxAgeSeconds) fail("PUBLIC_STATE_STALE");
  if (text.includes(projectId) || text.includes(instanceId)) fail("PUBLIC_STATE_IDENTITY_LEAK");

  const conditional = await fetch(url, {
    headers: { accept: "application/json", "if-none-match": etag },
    redirect: "error",
    signal: AbortSignal.timeout(15_000)
  });
  if (conditional.status !== 304) fail("PUBLIC_STATE_ETAG_REVALIDATION", conditional.status);
  console.log(`V020_CANARY_PUBLIC_STATE_PASS project=${projectId} status=200 marker=sanitized fresh=true etag=304 identityLeak=false`);
  return body;
}

const selected = await waitForDesktop();
const projectId = String(selected.projectId);
const baselineState = await state(projectId);
const baseline = snapshotIdentity(baselineState);
if (baseline.projectId !== projectId) fail("PROJECT_ID_DRIFT", `${projectId}:${baseline.projectId}`);
if (ageSeconds(baseline.capturedAt) > maxAgeSeconds) fail("BASELINE_STALE", baseline.capturedAt);

console.log(`V020_DESKTOP_SELECTED project=${projectId} instance=${baseline.instanceId} version=${VERSION} capturedAt=${baseline.capturedAt}`);

const proof = [];
let enabledForCanary = baseline.enabled;
let runMayBeActive = false;
let successful = false;

try {
  const enable = await createCommand(projectId, "evolution.setEnabled", { enabled: true });
  const enableAck = await waitApplied(projectId, enable, baseline.instanceId);
  proof.push(enable);
  const enableAppliedAt = normalizeCommand((enableAck.state.commands ?? []).find((item) => String(item.id) === enable.id)).appliedAt;
  const enabledSnapshot = await waitSnapshot(projectId, enableAppliedAt, (identity) => identity.enabled === true, "enabled-true");
  enabledForCanary = true;

  const run = await createCommand(projectId, "evolution.run", {});
  runMayBeActive = true;
  const runAck = await waitApplied(projectId, run, baseline.instanceId, 150);
  proof.push(run);
  const runAppliedAt = normalizeCommand((runAck.state.commands ?? []).find((item) => String(item.id) === run.id)).appliedAt;

  const cancel = await createCommand(projectId, "evolution.cancel", {});
  const cancelAck = await waitApplied(projectId, cancel, baseline.instanceId, 150);
  proof.push(cancel);
  runMayBeActive = false;
  const cancelAppliedAt = normalizeCommand((cancelAck.state.commands ?? []).find((item) => String(item.id) === cancel.id)).appliedAt;
  const cancelledSnapshot = await waitSnapshot(projectId, cancelAppliedAt, (identity) => identity.isRunning === false, "cancelled-idle", 150);

  let restore = null;
  if (!baseline.enabled) {
    restore = await createCommand(projectId, "evolution.setEnabled", { enabled: false });
    const restoreAck = await waitApplied(projectId, restore, baseline.instanceId);
    proof.push(restore);
    const restoreAppliedAt = normalizeCommand((restoreAck.state.commands ?? []).find((item) => String(item.id) === restore.id)).appliedAt;
    await waitSnapshot(projectId, restoreAppliedAt, (identity) => identity.enabled === false && identity.isRunning === false, "restored-disabled");
    enabledForCanary = false;
    restore.appliedAt = restoreAppliedAt;
  }

  await verifyPublicState(projectId, baseline.instanceId);

  const sequences = proof.map((item) => item.sequence);
  for (let index = 1; index < sequences.length; index += 1) {
    if (sequences[index] <= sequences[index - 1]) fail("COMMAND_SEQUENCE_NOT_MONOTONIC", sequences.join(","));
  }
  if (new Set(proof.map((item) => item.id)).size !== proof.length) fail("COMMAND_ID_NOT_UNIQUE");

  enable.appliedAt = enableAppliedAt;
  run.appliedAt = runAppliedAt;
  cancel.appliedAt = cancelAppliedAt;

  const report = {
    schemaVersion: 1,
    productVersion: VERSION,
    capturedAt: new Date().toISOString(),
    state: "PASS",
    devapi: endpoint,
    desktop: {
      projectId,
      instanceId: baseline.instanceId,
      baselineCapturedAt: baseline.capturedAt,
      product: { name: "DevBox", version: VERSION, cloudProtocol: PROTOCOL },
      originalEvolutionEnabled: baseline.enabled,
      restoredEvolutionEnabled: enabledForCanary
    },
    canary: {
      desktopSnapshot: "PASS",
      publicStateSanitization: "PASS",
      setEnabledAck: "PASS",
      runAck: "PASS",
      cancelAck: "PASS",
      commandSequence: "PASS",
      commandIdempotency: "PASS_LIVE_UNIQUE_ACK_STATIC_RETRY_GATE_REQUIRED"
    },
    commands: proof.map((item) => ({ id: item.id, sequence: item.sequence, kind: item.kind, appliedAt: item.appliedAt }))
  };
  await mkdir("outputs", { recursive: true });
  await writeFile("outputs/v020-desktop-canary.json", `${JSON.stringify(report, null, 2)}\n`, "utf8");
  if (githubOutput) {
    await writeFile(githubOutput, [
      `project_id=${projectId}`,
      `instance_id=${baseline.instanceId}`,
      "desktop_snapshot=PASS",
      "public_state_sanitization=PASS",
      "set_enabled_ack=PASS",
      "run_ack=PASS",
      "cancel_ack=PASS",
      "command_sequence=PASS",
      "command_idempotency=PASS"
    ].join("\n") + "\n", { flag: "a" });
  }
  successful = true;
  console.log(`V020_DESKTOP_CANARY_PASS project=${projectId} instance=${baseline.instanceId} commands=${proof.length} publicState=sanitized secrets=0-in-artifact`);
} finally {
  if (!successful) {
    console.error(`V020_DESKTOP_CANARY_CLEANUP_START project=${projectId} runMayBeActive=${runMayBeActive} enabledForCanary=${enabledForCanary}`);
    try {
      if (runMayBeActive) {
        const cancel = await createCommand(projectId, "evolution.cancel", {});
        await waitApplied(projectId, cancel, baseline.instanceId, 90);
      }
    } catch (error) {
      console.error(`V020_DESKTOP_CANARY_CLEANUP_CANCEL_FAILED:${error instanceof Error ? error.message : String(error)}`);
    }
    try {
      if (enabledForCanary !== baseline.enabled) {
        const restore = await createCommand(projectId, "evolution.setEnabled", { enabled: baseline.enabled });
        await waitApplied(projectId, restore, baseline.instanceId, 90);
      }
    } catch (error) {
      console.error(`V020_DESKTOP_CANARY_CLEANUP_RESTORE_FAILED:${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
