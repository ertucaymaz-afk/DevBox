import { readFile } from "node:fs/promises";

const [sourceRaw, workflowRaw, packageRaw] = await Promise.all([
  readFile("scripts/v020-production-promote.mjs", "utf8"),
  readFile(".github/workflows/v020-production-promote.yml", "utf8"),
  readFile("package.json", "utf8")
]);
const source = sourceRaw.replace(/\r\n/gu, "\n");
const workflow = workflowRaw.replace(/\r\n/gu, "\n");
const pkg = JSON.parse(packageRaw);
const need = (input, needle, id) => { if (!input.includes(needle)) throw new Error(`V020_PROMOTER_VERIFY_FAIL:${id}`); };
const forbid = (input, needle, id) => { if (input.includes(needle)) throw new Error(`V020_PROMOTER_VERIFY_FAIL:${id}`); };

for (const [needle, id] of [
  ["/v9/projects/", "project-read-rest"],
  ["/v11/projects", "project-create-rest"],
  ["/v10/projects/", "project-env-rest"],
  ["upsert=true", "project-env-upsert"],
  ['type: "sensitive"', "sensitive-env"],
  ["DEVAPI_PUBLIC_URL", "devbox-devapi-runtime-link"],
  ["DEVAPI_CANONICAL_URL", "devapi-self-link"],
  ["DEVBOX_PRODUCT_URL", "devapi-devbox-link"],
  ["/api/v1/product-links", "devapi-product-link-probe"],
  ["/api/product-links", "devbox-product-link-probe"],
  ["sanitized-proxy", "devbox-proxy-trust"],
  ["cross_site_links=PASS", "cross-link-output"],
  ["public_state_contract=PASS", "public-state-contract-output"],
  ["PENDING_DESKTOP_SNAPSHOT", "promoter-public-state-pending-truth"],
  ["public_state_sanitization=${publicStateSanitizationState}", "public-state-dynamic-canary-output"],
  ["devapi_rollback_id=", "devapi-rollback-output"],
  ["devbox_rollback_id=", "devbox-rollback-output"],
  ["values=masked", "secret-log-mask"],
  ["authorization: `Bearer ${vercelToken}`", "rest-bearer-auth"],
  ['"--skip-domain"', "staged-domain-skip"],
  ["/promote/", "rest-promote"],
  ["mode=staged-smoke-promote", "staged-mode-marker"],
  ["V020_ROLLBACK_CAPTURE", "rollback-capture-marker"],
  ["devbox-baseline", "devbox-baseline-stage"],
  ["devbox-final", "devbox-final-stage"]
]) need(source, needle, id);

for (const [needle, id] of [
  ['"project", "add"', "undocumented-project-add"],
  ['"--env"', "secret-process-args"],
  ["console.log(databaseUrl", "database-url-log"],
  ["console.log(desktopToken", "desktop-token-log"],
  ["console.log(adminToken", "admin-token-log"]
]) forbid(source, needle, id);

const devboxBaselineIndex = source.indexOf("const devboxBaseline = await stageDeployment");
const devapiStageIndex = source.indexOf("const devapiStage = await stageDeployment");
const devboxFinalIndex = source.indexOf("const devboxFinal = await stageDeployment");
if (devboxBaselineIndex < 0 || devapiStageIndex < 0 || devboxFinalIndex < 0 || !(devboxBaselineIndex < devapiStageIndex && devapiStageIndex < devboxFinalIndex)) {
  throw new Error("V020_PROMOTER_VERIFY_FAIL:deployment-order-devbox-baseline-devapi-devbox-final");
}
const devboxOriginIndex = source.indexOf("const devboxProductOrigin = await waitForPromotedAlias");
const devapiEnvIndex = source.indexOf("await upsertProjectEnv(devapiProjectId");
if (devboxOriginIndex < 0 || devapiEnvIndex < 0 || devboxOriginIndex >= devapiEnvIndex) {
  throw new Error("V020_PROMOTER_VERIFY_FAIL:devbox-origin-before-devapi-env");
}
const baselinePromoteIndex = source.indexOf('promoteDeployment(devboxProjectId, devboxBaseline.id, "devbox-baseline")');
const devapiPromoteIndex = source.indexOf('promoteDeployment(devapiProjectId, devapiStage.id, "devapi")');
const finalPromoteIndex = source.indexOf('promoteDeployment(devboxProjectId, devboxFinal.id, "devbox-final")');
if (!(devboxBaselineIndex < baselinePromoteIndex && devapiStageIndex < devapiPromoteIndex && devboxFinalIndex < finalPromoteIndex)) {
  throw new Error("V020_PROMOTER_VERIFY_FAIL:smoke-before-promote-structure");
}

const jobEnvStart = workflow.indexOf("    env:\n");
const stepsStart = workflow.indexOf("\n    steps:\n");
if (jobEnvStart < 0 || stepsStart < 0 || jobEnvStart >= stepsStart) throw new Error("V020_PROMOTER_VERIFY_FAIL:workflow-job-env-shape");
const jobEnv = workflow.slice(jobEnvStart, stepsStart);
forbid(jobEnv, "secrets.", "job-wide-secret-exposure");
forbid(workflow, '>> "$GITHUB_ENV"', "secret-persistence-github-env");
forbid(workflow, "PARTIAL_PASS_CANARY_PENDING", "obsolete-partial-pass-state");

for (const [needle, id] of [
  ["Production secret gerçeklik kapısı", "secret-gate-step"],
  ["scope=step-only", "secret-gate-step-only"],
  ["DEVBOX_DATABASE_URL: ${{ secrets.DEVBOX_DATABASE_URL }}", "database-secret-step-env"],
  ["VERCEL_TOKEN_PRIMARY: ${{ secrets.VERCEL_TOKEN }}", "vercel-secret-step-env"],
  ["exec node scripts/v020-production-promote.mjs", "promotion-exec"],
  ["pnpm production:promoter:verify", "promoter-self-gate"],
  ["pnpm production:canary:verify", "canary-static-gate"],
  ["pnpm test:cloud-idempotency", "idempotency-fault-gate"],
  ["Gerçek v0.1.20 desktop snapshot ve ACK canary", "desktop-live-canary-step"],
  ["node scripts/v020-production-desktop-canary.mjs", "desktop-live-canary-exec"],
  ["Yeni deployment runtime error taraması", "runtime-scan-step"],
  ["node scripts/v020-vercel-runtime-scan.mjs", "runtime-scan-exec"],
  ["OUT_PUBLIC_STATE_CONTRACT", "workflow-public-state-contract"],
  ["OUT_PUBLIC_STATE_SANITIZATION", "workflow-live-sanitization-output"],
  ["OUT_IDLE_ISOLATION", "workflow-idle-isolation-output"],
  ["OUT_COMMAND_IDEMPOTENCY", "workflow-idempotency-output"],
  ["OUT_RUNTIME_ERROR_SCAN", "workflow-runtime-output"],
  ["deploymentContract", "evidence-contract-section"],
  ["idleIsolation: process.env.OUT_IDLE_ISOLATION", "evidence-idle-isolation-field"],
  ["desktopIdleIsolation: process.env.OUT_IDLE_ISOLATION", "evidence-idle-isolation-proof"],
  ["PASS_RELEASE_EVIDENCE_CANDIDATE", "release-evidence-pass-state"],
  ["BLOCKED_CANARY_OR_RUNTIME", "release-evidence-blocked-state"],
  ["cloudCommandIdempotencyFaultInjection: 'PASS'", "evidence-static-idempotency-proof"],
  ["outputs/v020-production-promotion.json", "promotion-evidence-json"],
  ["outputs/v020-desktop-canary.json", "desktop-canary-evidence-json"],
  ["outputs/v020-runtime-scan.json", "runtime-scan-evidence-json"],
  ["actions/upload-artifact@v6", "promotion-evidence-upload"],
  ["Release evidence final kapısı", "final-release-gate-step"],
  ["V020_RELEASE_BLOCKED", "final-release-fail-closed"],
  ["V020_RELEASE_EVIDENCE_CANDIDATE_PASS", "final-release-pass-marker"],
  ["secrets=0", "evidence-no-secret-marker"]
]) need(workflow, needle, id);

forbid(workflow, "PROMOTION_EVIDENCE_SANITIZATION_NOT_PASS", "workflow-obsolete-sanitization-branch");

if (pkg.scripts?.["test:cloud-idempotency"] !== "vitest run src/main/services/cloud-control-idempotency.test.ts --config config/vitest.config.ts --maxWorkers=1 --no-file-parallelism") {
  throw new Error("V020_PROMOTER_VERIFY_FAIL:idempotency-script-drift");
}

const secretGateIndex = workflow.indexOf("- name: Production secret gerçeklik kapısı");
const installIndex = workflow.indexOf("- name: Kilitli bağımlılıkları kur");
const sourceVerifyIndex = workflow.indexOf("- name: Source, promoter ve canary kontratını tekrar doğrula");
const promoteIndex = workflow.indexOf("- name: DevAPI ve DevBox production promote");
const canaryIndex = workflow.indexOf("- name: Gerçek v0.1.20 desktop snapshot ve ACK canary");
const runtimeIndex = workflow.indexOf("- name: Yeni deployment runtime error taraması");
const evidenceIndex = workflow.indexOf("- name: Secret-free birleşik production evidence JSON üret");
const uploadIndex = workflow.indexOf("- name: Production evidence artifact yükle");
const finalGateIndex = workflow.indexOf("- name: Release evidence final kapısı");
if ([secretGateIndex, installIndex, sourceVerifyIndex, promoteIndex, canaryIndex, runtimeIndex, evidenceIndex, uploadIndex, finalGateIndex].some((index) => index < 0)) {
  throw new Error("V020_PROMOTER_VERIFY_FAIL:workflow-required-step-missing");
}
if (!(secretGateIndex < installIndex && installIndex < sourceVerifyIndex && sourceVerifyIndex < promoteIndex && promoteIndex < canaryIndex && canaryIndex < runtimeIndex && runtimeIndex < evidenceIndex && evidenceIndex < uploadIndex && uploadIndex < finalGateIndex)) {
  throw new Error("V020_PROMOTER_VERIFY_FAIL:workflow-closed-loop-order");
}

const canaryBlock = workflow.slice(canaryIndex, runtimeIndex);
const runtimeBlock = workflow.slice(runtimeIndex, evidenceIndex);
const finalGateBlock = workflow.slice(finalGateIndex);
need(canaryBlock, "continue-on-error: true", "canary-evidence-preservation");
need(runtimeBlock, "continue-on-error: true", "runtime-evidence-preservation");
need(finalGateBlock, '[[ "$CANARY_OUTCOME" == success ]]', "final-canary-outcome-gate");
need(finalGateBlock, '[[ "$RUNTIME_OUTCOME" == success ]]', "final-runtime-outcome-gate");
need(finalGateBlock, 'IDLE_ISOLATION: ${{ steps.canary.outputs.idle_isolation }}', "final-idle-isolation-env");
need(finalGateBlock, '"$IDLE_ISOLATION"', "final-idle-isolation-pass-loop");

console.log("V020_PROMOTER_VERIFY_PASS projectCreate=rest secrets=sensitive-env jobSecrets=isolated processArgs=clean lineEndings=portable stagedSmokePromote=required rollback=verified-baseline publicStateContract=pass desktopCanary=live-ack idleIsolation=required runtimeScan=deployment-scoped idempotency=fault-injected evidenceArtifact=combined-secret-free finalGate=fail-closed");
