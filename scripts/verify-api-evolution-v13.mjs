import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

execFileSync(process.execPath, ["scripts/verify-api-evolution-v12.mjs"], { stdio: "inherit" });
const [pkgRaw, contracts, evolution, db, cloudVerify, devboxIndex, devboxApp, devapiIndex, devapiApp, devapiHealth, productLinks, productionEvidence] = await Promise.all([
  readFile("package.json","utf8"), readFile("src/shared/contracts.ts","utf8"), readFile("src/main/services/api-evolution-service.ts","utf8"),
  readFile("cloud/devapi-control/lib/db.mjs","utf8"), readFile("scripts/verify-cloud-ecosystem.mjs","utf8"),
  readFile("cloud/devbox-site/index.html","utf8"), readFile("cloud/devbox-site/app.js","utf8"),
  readFile("cloud/devapi-control/index.html","utf8"), readFile("cloud/devapi-control/app.js","utf8"),
  readFile("cloud/devapi-control/api/v1/health.mjs","utf8"), readFile("cloud/devapi-control/api/v1/product-links.mjs","utf8"),
  readFile("evidence/v020-production.json","utf8")
]);
const pkg=JSON.parse(pkgRaw), evidence=JSON.parse(productionEvidence);
const parse=(v)=>/^(\d+)\.(\d+)\.(\d+)/u.exec(String(v??""))?.slice(1,4).map(Number)??null;
const atLeast=(v,min)=>{const p=parse(v);if(!p)return false;for(let i=0;i<3;i+=1){if(p[i]>min[i])return true;if(p[i]<min[i])return false;}return true;};
const need=(s,n,id)=>{if(!s.includes(n))throw new Error(`API_EVOLUTION_V13_VERIFY_FAIL:${id}`);};
const forbid=(s,n,id)=>{if(s.includes(n))throw new Error(`API_EVOLUTION_V13_VERIFY_FAIL:${id}`);};
const fail=(id)=>{throw new Error(`API_EVOLUTION_V13_VERIFY_FAIL:${id}`);};
function canonicalEvidenceUrl(value,id){
  if(!value)return null;
  let url;
  try{url=new URL(String(value));}catch{fail(`${id}-invalid`);}
  if(url.protocol!=="https:"||url.username||url.password||url.search||url.hash)fail(`${id}-unsafe`);
  return url.origin;
}
if(!atLeast(pkg.version,[0,1,20]))fail("version-minimum");
if(!String(pkg.scripts?.["evolution:verify"]??"").includes("verify-api-evolution-v13.mjs"))fail("active-verifier");
need(pkgRaw,'"production:verify"',"production-gate-script");
for(const track of ["cloud-continuity","deployment-safety","public-api-contract","command-delivery","disaster-recovery","database-performance","site-performance","protocol-compatibility","secret-rotation","dependency-provenance"]){need(contracts,`"${track}"`,`track-contract-${track}`);need(evolution,`track: "${track}"`,`track-focus-${track}`);}
for(const table of ["devbox_project_state","devbox_project_state_history","devbox_control_commands"])need(db,table,`canonical-table-${table}`);
forbid(db,"devbox_projects","legacy-current-table");forbid(db,"devbox_snapshot_history","legacy-history-table");forbid(db,"devbox_commands","legacy-command-table");
need(cloudVerify,"crossLinks=source-ready","cross-link-source-gate");
need(devapiIndex,'id="devboxProductLink"',"devapi-product-link-control");
const productLinkTag=/<a[^>]*id="devboxProductLink"[^>]*>/u.exec(devapiIndex)?.[0]??"";
if(!productLinkTag||/href="https:\/\//u.test(productLinkTag))fail("devapi-product-link-must-be-runtime-configured");
need(devapiApp,"/api/v1/product-links","devapi-product-link-client");
need(productLinks,"DEVBOX_PRODUCT_URL","devbox-product-url-config");
need(productLinks,"DEVAPI_CANONICAL_URL","devapi-canonical-url-config");
const devapiCanonical=canonicalEvidenceUrl(evidence.devapi?.canonicalUrl,"devapi-canonical-url");
if(!devapiCanonical)fail("devapi-canonical-url-missing");
need(devboxIndex,devapiCanonical,"devbox-to-devapi-evidence-url");
need(devboxApp,"UNAVAILABLE","devbox-unavailable");
need(devapiHealth,"UNCONFIGURED","devapi-unconfigured");
if(!["BLOCKED_EXTERNAL","PASS"].includes(evidence.state))fail("evidence-state");
if(!evidence.neon?.schemaVerified)fail("neon-schema-evidence");
if(!evidence.devapi?.projectId)fail("devapi-project-evidence");
const devboxCanonical=canonicalEvidenceUrl(evidence.devbox?.canonicalUrl,"devbox-canonical-url");
if(evidence.state==="PASS"){
  if(!evidence.devbox?.projectId||!devboxCanonical)fail("devbox-production-evidence-missing");
  if(evidence.crossLinks!=="PASS")fail("production-crosslinks-not-pass");
}else{
  if(!evidence.devbox?.projectId&&devboxCanonical)fail("unverified-devbox-canonical-url");
  if(evidence.crossLinks==="PASS")fail("blocked-production-crosslinks-false-pass");
}
console.log(`API_EVOLUTION_V13_VERIFY_PASS inherited=v12 source=0.1.20 productionState=${evidence.state} canonicalSchema=pass adaptiveTracks=pass crossLinks=config-driven`);
