import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

execFileSync(process.execPath,["scripts/verify-api-evolution-v12.mjs"],{stdio:"inherit"});
const [pkgRaw, contracts, service, db, cloudVerify, evidenceRaw, linksRaw, readme, devboxIndex, devapiIndex, productLinksApi, productLinksClient, research] = await Promise.all([
  readFile("package.json","utf8"),
  readFile("src/shared/contracts.ts","utf8"),
  readFile("src/main/services/api-evolution-service.ts","utf8"),
  readFile("cloud/devapi-control/lib/db.mjs","utf8"),
  readFile("scripts/verify-cloud-ecosystem.mjs","utf8"),
  readFile("cloud/production-evidence.json","utf8"),
  readFile("cloud/product-links.json","utf8"),
  readFile("README.md","utf8"),
  readFile("cloud/devbox-site/index.html","utf8"),
  readFile("cloud/devapi-control/index.html","utf8"),
  readFile("cloud/devapi-control/api/v1/product-links.mjs","utf8"),
  readFile("cloud/devapi-control/product-links.js","utf8"),
  readFile("docs/research/v0.1.20-web-ui-research.md","utf8")
]);
const pkg=JSON.parse(pkgRaw);const evidence=JSON.parse(evidenceRaw);const links=JSON.parse(linksRaw);
const need=(source,needle,id)=>{if(!source.includes(needle))throw new Error(`API_EVOLUTION_V13_VERIFY_FAIL:${id}`);};
const forbid=(source,needle,id)=>{if(source.includes(needle))throw new Error(`API_EVOLUTION_V13_VERIFY_FAIL:${id}`);};
const fail=(id)=>{throw new Error(`API_EVOLUTION_V13_VERIFY_FAIL:${id}`);};
const canonical=(value,id,required=true)=>{
  if(value==null||value===""){if(required)fail(`${id}-missing`);return null;}
  let url;try{url=new URL(String(value));}catch{fail(`${id}-invalid`);}
  if(url.protocol!=="https:"||url.username||url.password||url.search||url.hash||url.pathname!=="/")fail(`${id}-unsafe`);
  return url.origin;
};
if(pkg.version!=="0.1.20")fail("version");
if(pkg.scripts?.["production:verify"]!=="node scripts/verify-production-evidence-v13.mjs")fail("production-gate-script");
const expectedTracks=["cloud-continuity","deployment-safety","public-api-contract","command-delivery","disaster-recovery","database-performance","site-performance","protocol-compatibility","secret-rotation","dependency-provenance"];
for(const track of expectedTracks){need(contracts,`"${track}"`,`contract-track-${track}`);need(service,`track: "${track}"`,`adaptive-track-${track}`);}
for(const focus of ["observability","accessibility"]){need(service,`track: "${focus}"`,`adaptive-existing-track-${focus}`);}
for(const table of ["devbox_project_state","devbox_project_state_history","devbox_control_commands"])need(db,table,`canonical-table-${table}`);
for(const legacy of ["devbox_projects","devbox_snapshot_history","devbox_commands"])forbid(db,legacy,`legacy-table-${legacy}`);
const evidenceTables=new Set(evidence.neon?.schemaTables??[]);
for(const table of ["devbox_project_state","devbox_project_state_history","devbox_control_commands"])if(!evidenceTables.has(table))fail(`evidence-table-${table}`);
if(evidence.productVersion!==pkg.version)fail("evidence-version");
if(links.productVersion!==pkg.version)fail("links-version");
const devapiLink=canonical(links.devapi?.canonicalUrl,"links-devapi");
const evidenceDevapi=canonical(evidence.vercel?.devapi?.canonicalUrl,"evidence-devapi");
if(devapiLink!==evidenceDevapi)fail("devapi-canonical-drift");
const devboxLink=canonical(links.devbox?.canonicalUrl,"links-devbox",false);
const evidenceDevbox=canonical(evidence.vercel?.devbox?.canonicalUrl,"evidence-devbox",false);
if(devboxLink!==evidenceDevbox)fail("devbox-canonical-drift");
if(!evidence.vercel?.devbox?.projectId&&devboxLink)fail("unverified-devbox-canonical");
if(links.devbox?.state==="PASS"&&(!devboxLink||!evidence.vercel?.devbox?.projectId))fail("devbox-pass-without-proof");
if(evidence.release?.productionEvidence==="PASS")execFileSync(process.execPath,["scripts/verify-production-evidence-v13.mjs"],{stdio:"inherit"});
if(evidence.vercel?.devapi?.state==="PASS"&&evidence.vercel?.devapi?.healthHttpStatus!==200)fail("devapi-pass-without-health");
need(productLinksApi,"DEVBOX_PRODUCT_URL","runtime-link-devbox-config");
need(productLinksApi,"DEVAPI_CANONICAL_URL","runtime-link-devapi-config");
need(productLinksApi,"PUBLIC_URL_INVALID","runtime-link-url-validation");
need(productLinksClient,"/api/v1/product-links","runtime-link-client-endpoint");
need(productLinksClient,"production pending","runtime-link-fail-closed");
for(const secret of ["DATABASE_URL","DEVBOX_CONTROL_PLANE_TOKEN","DEVBOX_CONTROL_ADMIN_TOKEN"])forbid(productLinksClient,secret,`runtime-link-client-secret-${secret}`);
need(readme,"docs/assets/devbox-home.svg","readme-home-visual");
need(readme,"docs/assets/devapi-control.svg","readme-devapi-visual");
need(readme,"docs/assets/devbox-cloud-architecture.svg","readme-architecture-visual");
need(devboxIndex,"deployment-safety","devbox-evolution-visual");
need(devapiIndex,"SEQUENCE + ACK","devapi-command-contract");
need(devapiIndex,"/product-links.js","devapi-runtime-link-loader");
for(const project of ["motiondivision/motion","juliangarnier/anime","shadcn-ui/ui"])need(research,project,`research-${project}`);
forbid(cloudVerify,"devapi-virid.vercel.app","cloud-verifier-hardcoded-devapi-domain");
forbid(cloudVerify,"devbox.vercel.app","cloud-verifier-hardcoded-devbox-domain");
console.log(`API_EVOLUTION_V13_VERIFY_PASS inherited=v12 tracks=expanded canonicalSchema=pass canonicalUrls=evidence-driven crossLinks=runtime-configured productionState=${evidence.release?.productionEvidence??"UNKNOWN"} visuals=3 research=recorded`);
