import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

execFileSync(process.execPath, ["scripts/verify-api-evolution-v12.mjs"], { stdio: "inherit" });
const [pkgRaw, contracts, evolution, db, cloudVerify, devboxIndex, devboxApp, devapiIndex, devapiApp, productionEvidence] = await Promise.all([
  readFile("package.json","utf8"), readFile("src/shared/contracts.ts","utf8"), readFile("src/main/services/api-evolution-service.ts","utf8"),
  readFile("cloud/devapi-control/lib/db.mjs","utf8"), readFile("scripts/verify-cloud-ecosystem.mjs","utf8"),
  readFile("cloud/devbox-site/index.html","utf8"), readFile("cloud/devbox-site/app.js","utf8"),
  readFile("cloud/devapi-control/index.html","utf8"), readFile("cloud/devapi-control/app.js","utf8"),
  readFile("evidence/v020-production.json","utf8")
]);
const pkg=JSON.parse(pkgRaw), evidence=JSON.parse(productionEvidence);
const parse=(v)=>/^(\d+)\.(\d+)\.(\d+)/u.exec(String(v??""))?.slice(1,4).map(Number)??null;
const atLeast=(v,min)=>{const p=parse(v);if(!p)return false;for(let i=0;i<3;i+=1){if(p[i]>min[i])return true;if(p[i]<min[i])return false;}return true;};
const need=(s,n,id)=>{if(!s.includes(n))throw new Error(`API_EVOLUTION_V13_VERIFY_FAIL:${id}`);};
const forbid=(s,n,id)=>{if(s.includes(n))throw new Error(`API_EVOLUTION_V13_VERIFY_FAIL:${id}`);};
if(!atLeast(pkg.version,[0,1,20]))throw new Error("API_EVOLUTION_V13_VERIFY_FAIL:version-minimum");
if(!String(pkg.scripts?.["evolution:verify"]??"").includes("verify-api-evolution-v13.mjs"))throw new Error("API_EVOLUTION_V13_VERIFY_FAIL:active-verifier");
need(pkgRaw,'"production:verify"',"production-gate-script");
for(const track of ["cloud-continuity","deployment-safety","public-api-contract","command-delivery","disaster-recovery","database-performance","site-performance","protocol-compatibility","secret-rotation","dependency-provenance"]){need(contracts,`"${track}"`,`track-contract-${track}`);need(evolution,`track: "${track}"`,`track-focus-${track}`);}
for(const table of ["devbox_project_state","devbox_project_state_history","devbox_control_commands"])need(db,table,`canonical-table-${table}`);
forbid(db,"devbox_projects","legacy-current-table");forbid(db,"devbox_snapshot_history","legacy-history-table");forbid(db,"devbox_commands","legacy-command-table");
need(cloudVerify,"crossLinks=pass","cross-link-gate");need(devboxIndex,"https://devapi-virid.vercel.app","devbox-to-devapi");need(devapiIndex,"https://devbox.vercel.app","devapi-to-devbox");
need(devboxApp,"UNAVAILABLE","devbox-unavailable");need(devapiApp,"UNCONFIGURED","devapi-unconfigured");
if(!["BLOCKED_EXTERNAL","PASS"].includes(evidence.state))throw new Error("API_EVOLUTION_V13_VERIFY_FAIL:evidence-state");
if(!evidence.neon?.schemaVerified)throw new Error("API_EVOLUTION_V13_VERIFY_FAIL:neon-schema-evidence");
if(!evidence.devapi?.projectId)throw new Error("API_EVOLUTION_V13_VERIFY_FAIL:devapi-project-evidence");
console.log(`API_EVOLUTION_V13_VERIFY_PASS inherited=v12 source=0.1.20 productionState=${evidence.state} canonicalSchema=pass adaptiveTracks=pass`);
