import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

execFileSync(process.execPath,["scripts/verify-api-evolution-v12.mjs"],{stdio:"inherit"});
const [pkgRaw, contracts, service, evidenceRaw, linksRaw, readme, devboxIndex, devapiIndex, research] = await Promise.all([
  readFile("package.json","utf8"),
  readFile("src/shared/contracts.ts","utf8"),
  readFile("src/main/services/api-evolution-service.ts","utf8"),
  readFile("cloud/production-evidence.json","utf8"),
  readFile("cloud/product-links.json","utf8"),
  readFile("README.md","utf8"),
  readFile("cloud/devbox-site/index.html","utf8"),
  readFile("cloud/devapi-control/index.html","utf8"),
  readFile("docs/research/v0.1.20-web-ui-research.md","utf8")
]);
const pkg=JSON.parse(pkgRaw);const evidence=JSON.parse(evidenceRaw);const links=JSON.parse(linksRaw);
const need=(source,needle,id)=>{if(!source.includes(needle))throw new Error(`API_EVOLUTION_V13_VERIFY_FAIL:${id}`);};
if(pkg.version!=="0.1.20")throw new Error("API_EVOLUTION_V13_VERIFY_FAIL:version");
if(pkg.scripts?.["production:verify"]!=="node scripts/verify-production-evidence-v13.mjs")throw new Error("API_EVOLUTION_V13_VERIFY_FAIL:production-gate-script");
const expectedTracks=["cloud-continuity","deployment-safety","public-api-contract","command-delivery","disaster-recovery","database-performance","site-performance","protocol-compatibility","secret-rotation","dependency-provenance"];
for(const track of expectedTracks){need(contracts,`"${track}"`,`contract-track-${track}`);need(service,`track: "${track}"`,`adaptive-track-${track}`);}
for(const focus of ["observability","accessibility"]){need(service,`track: "${focus}"`,`adaptive-existing-track-${focus}`);}
if(evidence.productVersion!==pkg.version)throw new Error("API_EVOLUTION_V13_VERIFY_FAIL:evidence-version");
if(links.productVersion!==pkg.version)throw new Error("API_EVOLUTION_V13_VERIFY_FAIL:links-version");
if(evidence.release?.productionEvidence==="PASS")throw new Error("API_EVOLUTION_V13_VERIFY_FAIL:unverified-production-pass-in-source");
if(evidence.vercel?.devapi?.state==="PASS"&&evidence.vercel?.devapi?.healthHttpStatus!==200)throw new Error("API_EVOLUTION_V13_VERIFY_FAIL:devapi-pass-without-health");
if(evidence.vercel?.devbox?.state==="PASS"&&!evidence.vercel?.devbox?.canonicalUrl)throw new Error("API_EVOLUTION_V13_VERIFY_FAIL:devbox-pass-without-canonical");
need(readme,"docs/assets/devbox-home.svg","readme-home-visual");
need(readme,"docs/assets/devapi-control.svg","readme-devapi-visual");
need(readme,"docs/assets/devbox-cloud-architecture.svg","readme-architecture-visual");
need(devboxIndex,"deployment-safety","devbox-evolution-visual");
need(devapiIndex,"SEQUENCE + ACK","devapi-command-contract");
for(const project of ["motiondivision/motion","juliangarnier/anime","shadcn-ui/ui"])need(research,project,`research-${project}`);
console.log("API_EVOLUTION_V13_VERIFY_PASS inherited=v12 tracks=expanded productionEvidence=fail-closed visuals=3 research=recorded");
