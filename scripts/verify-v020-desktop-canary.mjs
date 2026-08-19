import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const [pkgRaw, canary, runtimeScan, service, db, idempotencyTest, snapshotApi] = await Promise.all([
  readFile("package.json", "utf8"),
  readFile("scripts/v020-production-desktop-canary.mjs", "utf8"),
  readFile("scripts/v020-vercel-runtime-scan.mjs", "utf8"),
  readFile("src/main/services/cloud-control-service.ts", "utf8"),
  readFile("cloud/devapi-control/lib/db.mjs", "utf8"),
  readFile("src/main/services/cloud-control-idempotency.test.ts", "utf8"),
  readFile("cloud/devapi-control/api/v1/snapshot.mjs", "utf8")
]);
const pkg = JSON.parse(pkgRaw);
const version = String(pkg.version ?? "");
const need = (source, needle, id) => { if (!source.includes(needle)) throw new Error(`V020_DESKTOP_CANARY_VERIFY_FAIL:${id}`); };
const forbid = (source, needle, id) => { if (source.includes(needle)) throw new Error(`V020_DESKTOP_CANARY_VERIFY_FAIL:${id}`); };

execFileSync(process.execPath, ["--check", "scripts/v020-production-desktop-canary.mjs"], { stdio: "inherit" });
execFileSync(process.execPath, ["--check", "scripts/v020-vercel-runtime-scan.mjs"], { stdio: "inherit" });

need(service, `const PRODUCT_VERSION = "${version}"`, "desktop-product-version-drift");
need(service, 'product: { name: "DevBox", version: PRODUCT_VERSION, cloudProtocol: CLOUD_PROTOCOL_VERSION }', "desktop-product-stamp");
need(snapshotApi, "SNAPSHOT_PRODUCT_INVALID", "snapshot-product-validation");
need(db, 'AS "productVersion"', "project-index-product-version");
need(db, 'AS "cloudProtocol"', "project-index-cloud-protocol");
need(db, 'AS "evolutionEnabled"', "project-index-evolution-enabled");
need(canary, 'product.version !== VERSION', "canary-exact-version-selection");
need(canary, 'DESKTOP_SELECTION_AMBIGUOUS', "canary-ambiguous-fail-closed");
need(canary, 'COMMAND_WRONG_DESKTOP_ACK', "canary-instance-bound-ack");
need(canary, 'COMMAND_SEQUENCE_NOT_MONOTONIC', "canary-sequence-gate");
need(canary, 'waitSnapshot(projectId, enableAppliedAt', "canary-enable-applied-time-boundary");
need(canary, 'waitSnapshot(projectId, cancelAppliedAt', "canary-cancel-applied-time-boundary");
need(canary, 'waitSnapshot(projectId, restoreAppliedAt', "canary-restore-applied-time-boundary");
need(canary, 'V020_DESKTOP_CANARY_CLEANUP_START', "canary-cleanup");
need(idempotencyTest, "does not re-apply a locally successful command when the first cloud ACK fails", "idempotency-fault-injection-test");
need(idempotencyTest, "expect(setEnabled).toHaveBeenCalledTimes(1)", "idempotency-single-apply-proof");

forbid(canary, "DEVBOX_CONTROL_PLANE_TOKEN", "canary-desktop-secret-forbidden");
forbid(canary, 'method: "PATCH"', "canary-self-ack-forbidden");
forbid(canary, "x-devbox-signature", "canary-desktop-signature-forbidden");
forbid(canary, "x-devbox-instance", "canary-desktop-identity-forbidden");

need(runtimeScan, "/runtime-logs", "runtime-scan-official-deployment-endpoint");
need(runtimeScan, 'level === "error" || level === "fatal"', "runtime-scan-error-levels");
need(runtimeScan, "status >= 500", "runtime-scan-5xx");
need(runtimeScan, "RUNTIME_LOGS_EMPTY", "runtime-scan-empty-fail-closed");
need(runtimeScan, "DEVAPI_DEPLOYMENT_ID", "runtime-scan-devapi-deployment-bound");
need(runtimeScan, "DEVBOX_DEPLOYMENT_ID", "runtime-scan-devbox-deployment-bound");
forbid(runtimeScan, "row?.message", "runtime-evidence-message-content-forbidden");
forbid(runtimeScan, "DEVBOX_CONTROL_ADMIN_TOKEN", "runtime-admin-secret-unneeded");
forbid(runtimeScan, "DEVBOX_CONTROL_PLANE_TOKEN", "runtime-desktop-secret-unneeded");

console.log(`V020_DESKTOP_CANARY_VERIFY_PASS version=${version} desktopIdentity=explicit adminOnly=true selfAck=false appliedTimeBound=true idempotencyFaultInjection=true runtimeScan=deployment-scoped-secret-minimal`);
