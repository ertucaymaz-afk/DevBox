import { readFile } from "node:fs/promises";

const [source, workflow] = await Promise.all([
  readFile("scripts/v020-production-promote.mjs", "utf8"),
  readFile(".github/workflows/v020-production-promote.yml", "utf8")
]);
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
  ["values=masked", "secret-log-mask"],
  ["authorization: `Bearer ${vercelToken}`", "rest-bearer-auth"]
]) need(source, needle, id);

for (const [needle, id] of [
  ['"project", "add"', "undocumented-project-add"],
  ['"--env"', "secret-process-args"],
  ["console.log(databaseUrl", "database-url-log"],
  ["console.log(desktopToken", "desktop-token-log"],
  ["console.log(adminToken", "admin-token-log"]
]) forbid(source, needle, id);

const devboxDeployIndex = source.indexOf("const devboxDeploy = runVercel");
const devapiDeployIndex = source.indexOf("const devapiDeploy = runVercel");
if (devboxDeployIndex < 0 || devapiDeployIndex < 0 || devboxDeployIndex >= devapiDeployIndex) {
  throw new Error("V020_PROMOTER_VERIFY_FAIL:deployment-order-devbox-before-devapi");
}
const devboxOriginIndex = source.indexOf("const devboxProductOrigin = await selectVerifiedProductOrigin");
const devapiEnvIndex = source.indexOf("await upsertProjectEnv(devapiProjectId");
if (devboxOriginIndex < 0 || devapiEnvIndex < 0 || devboxOriginIndex >= devapiEnvIndex) {
  throw new Error("V020_PROMOTER_VERIFY_FAIL:devbox-origin-before-devapi-env");
}

const jobEnvStart = workflow.indexOf("    env:\n");
const stepsStart = workflow.indexOf("\n    steps:\n");
if (jobEnvStart < 0 || stepsStart < 0 || jobEnvStart >= stepsStart) throw new Error("V020_PROMOTER_VERIFY_FAIL:workflow-job-env-shape");
const jobEnv = workflow.slice(jobEnvStart, stepsStart);
forbid(jobEnv, "secrets.", "job-wide-secret-exposure");
forbid(workflow, '>> "$GITHUB_ENV"', "secret-persistence-github-env");

for (const [needle, id] of [
  ["Production secret gerçeklik kapısı", "secret-gate-step"],
  ["scope=step-only", "secret-gate-step-only"],
  ["DEVBOX_DATABASE_URL: ${{ secrets.DEVBOX_DATABASE_URL }}", "database-secret-step-env"],
  ["VERCEL_TOKEN_PRIMARY: ${{ secrets.VERCEL_TOKEN }}", "vercel-secret-step-env"],
  ["exec node scripts/v020-production-promote.mjs", "promotion-exec"],
  ["pnpm production:promoter:verify", "promoter-self-gate"],
  ["outputs/v020-production-promotion.json", "promotion-evidence-json"],
  ["actions/upload-artifact@v6", "promotion-evidence-upload"],
  ["PARTIAL_PASS_CANARY_PENDING", "partial-pass-truth-state"],
  ["secrets=0", "evidence-no-secret-marker"]
]) need(workflow, needle, id);

const secretGateIndex = workflow.indexOf("- name: Production secret gerçeklik kapısı");
const installIndex = workflow.indexOf("- name: Kilitli bağımlılıkları kur");
const sourceVerifyIndex = workflow.indexOf("- name: Source ve production promoter kontratını tekrar doğrula");
const promoteIndex = workflow.indexOf("- name: DevAPI ve DevBox production promote");
if (secretGateIndex < 0 || installIndex < 0 || sourceVerifyIndex < 0 || promoteIndex < 0 || !(secretGateIndex < installIndex && installIndex < sourceVerifyIndex && sourceVerifyIndex < promoteIndex)) {
  throw new Error("V020_PROMOTER_VERIFY_FAIL:workflow-order-secret-check-install-verify-promote");
}

console.log("V020_PROMOTER_VERIFY_PASS projectCreate=rest secrets=sensitive-env jobSecrets=isolated processArgs=clean crossLinks=bidirectional proxy=verified evidenceArtifact=secret-free deploymentOrder=devbox-first");
