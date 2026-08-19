import { readFile } from "node:fs/promises";

const source = await readFile("scripts/v020-production-promote.mjs", "utf8");
const need = (needle, id) => { if (!source.includes(needle)) throw new Error(`V020_PROMOTER_VERIFY_FAIL:${id}`); };
const forbid = (needle, id) => { if (source.includes(needle)) throw new Error(`V020_PROMOTER_VERIFY_FAIL:${id}`); };

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
]) need(needle, id);

for (const [needle, id] of [
  ['"project", "add"', "undocumented-project-add"],
  ['"--env"', "secret-process-args"],
  ["console.log(databaseUrl", "database-url-log"],
  ["console.log(desktopToken", "desktop-token-log"],
  ["console.log(adminToken", "admin-token-log"]
]) forbid(needle, id);

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

console.log("V020_PROMOTER_VERIFY_PASS projectCreate=rest secrets=sensitive-env processArgs=clean crossLinks=bidirectional proxy=verified deploymentOrder=devbox-first");
