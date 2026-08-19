import fs from "node:fs";
import path from "node:path";

const root=process.cwd();
const site=path.join(root,"cloud","devbox-site");
const requiredFiles=[
  "index.html","app.js","ecosystem-nav.js","ecosystem-v2.js","ecosystem-v2.css","ecosystem-page.html","ecosystem-page.js","ecosystem.css","ecosystem-orange.css","ecosystem-theme.js","ecosystem-icons.svg","ecosystem-icon-manifest.json","ecosystem-manifest.json","vercel.json","sitemap.xml","robots.txt"
];
const expectedRoutes=["/devapi-home","/devapi-api","/devapi-docs","/devapi-console","/devapi-status","/devapi-studio","/devapi-evolution","/devapi-workbench","/devapi-memory","/devapi-diagnostics"];
const expectedIcons=["monitor","cloud","terminal","bot","git-branch","file-diff","database","shield-check","activity","memory-stick","workflow","search"];
const forbiddenScope=["HotAPI","hotapi-six-gamma.vercel.app","hotapi-v090"];

function fail(code,detail=""){throw new Error(`${code}${detail?`:${detail}`:""}`)}
for(const file of requiredFiles){if(!fs.existsSync(path.join(site,file)))fail("WEB_ECOSYSTEM_FILE_MISSING",file)}
const read=file=>fs.readFileSync(path.join(site,file),"utf8");
const app=read("app.js"),nav=read("ecosystem-nav.js"),v2=read("ecosystem-v2.js"),v2css=read("ecosystem-v2.css"),pageHtml=read("ecosystem-page.html"),pageJs=read("ecosystem-page.js"),css=read("ecosystem.css"),orange=read("ecosystem-orange.css"),theme=read("ecosystem-theme.js"),sprite=read("ecosystem-icons.svg"),sitemap=read("sitemap.xml"),robots=read("robots.txt");
const vercel=JSON.parse(read("vercel.json")),manifest=JSON.parse(read("ecosystem-manifest.json")),iconManifest=JSON.parse(read("ecosystem-icon-manifest.json"));

if(!app.includes('import "./ecosystem-nav.js";'))fail("WEB_ECOSYSTEM_HOME_IMPORT_MISSING");
if(!app.includes('import "./ecosystem-v2.js";'))fail("WEB_ECOSYSTEM_V2_IMPORT_MISSING");
if(!app.includes('import "./ecosystem-theme.js";'))fail("WEB_ECOSYSTEM_THEME_IMPORT_MISSING");
if(!v2.includes("ecoArchitectureExplorer"))fail("WEB_ECOSYSTEM_ARCHITECTURE_EXPLORER_MISSING");
if(!v2.includes("ecoSourceCapabilityMatrix"))fail("WEB_ECOSYSTEM_CAPABILITY_MATRIX_MISSING");
if(!v2.includes("ecoEvolutionTracks"))fail("WEB_ECOSYSTEM_EVOLUTION_TRACKS_MISSING");
if(!v2.includes("SOURCE VERIFIED"))fail("WEB_ECOSYSTEM_V2_SOURCE_TRUTH_MISSING");
if(!v2.includes("production runtime"))fail("WEB_ECOSYSTEM_V2_RUNTIME_BOUNDARY_MISSING");
if(!v2css.includes("eco-architecture"))fail("WEB_ECOSYSTEM_ARCHITECTURE_STYLE_MISSING");
if(!v2css.includes("@media(prefers-reduced-motion:reduce)"))fail("WEB_ECOSYSTEM_V2_REDUCED_MOTION_MISSING");

if(!pageHtml.includes('lang="tr"'))fail("WEB_ECOSYSTEM_TURKISH_LANG_MISSING");
if(!pageHtml.includes('href="/ecosystem-orange.css"'))fail("WEB_ECOSYSTEM_ORANGE_STYLE_MISSING");
if(!pageHtml.includes('src="/ecosystem-theme.js"'))fail("WEB_ECOSYSTEM_THEME_SCRIPT_MISSING");
if(!pageHtml.includes('src="/ecosystem-page.js"'))fail("WEB_ECOSYSTEM_PAGE_SCRIPT_MISSING");
if(!css.includes("@media(prefers-reduced-motion:reduce)"))fail("WEB_ECOSYSTEM_REDUCED_MOTION_MISSING");
if(!css.includes("eco-command"))fail("WEB_ECOSYSTEM_COMMAND_PALETTE_STYLE_MISSING");
if(!orange.toLowerCase().includes("#ff6a00")||!orange.toLowerCase().includes("#fff"))fail("WEB_ECOSYSTEM_ORANGE_WHITE_TOKENS_MISSING");
if(!orange.includes('html[data-eco-theme="dark"]'))fail("WEB_ECOSYSTEM_DARK_THEME_MISSING");
if(!orange.includes("@media(prefers-reduced-motion:reduce)"))fail("WEB_ECOSYSTEM_ORANGE_REDUCED_MOTION_MISSING");
if(!theme.includes("devbox.ecoTheme")||!theme.includes('"system","light","dark"'))fail("WEB_ECOSYSTEM_THEME_CONTROLLER_INVALID");

const rewrites=Array.isArray(vercel.rewrites)?vercel.rewrites:[];
if(rewrites.length!==expectedRoutes.length)fail("WEB_ECOSYSTEM_REWRITE_COUNT",String(rewrites.length));
const rewriteMap=new Map(rewrites.map(entry=>[entry?.source,entry?.destination]));
for(const route of expectedRoutes){if(rewriteMap.get(route)!=="/ecosystem-page.html")fail("WEB_ECOSYSTEM_REWRITE_MISSING",route)}
const csp=vercel?.headers?.flatMap(entry=>entry?.headers??[]).find(header=>header?.key==="Content-Security-Policy")?.value??"";
if(!csp||csp.includes("'unsafe-inline'")||csp.includes("'unsafe-eval'"))fail("WEB_ECOSYSTEM_CSP_WEAKENED");
if(!csp.includes("connect-src 'self'"))fail("WEB_ECOSYSTEM_CSP_CONNECT_BOUNDARY_MISSING");

const surfaces=Array.isArray(manifest.surfaces)?manifest.surfaces:[];
if(surfaces.length!==11)fail("WEB_ECOSYSTEM_SURFACE_COUNT",String(surfaces.length));
if(manifest?.canonicalOrigin!=="https://devbox.vercel.app")fail("WEB_ECOSYSTEM_CANONICAL_ORIGIN_INVALID");
if(JSON.stringify(manifest?.scope)!==JSON.stringify(["devbox","devapi"]))fail("WEB_ECOSYSTEM_SCOPE_INVALID");
if(manifest?.truthPolicy?.fakeReady!==false)fail("WEB_ECOSYSTEM_FAKE_READY_POLICY_INVALID");
if(manifest?.truthPolicy?.productionStateRequiresLiveEvidence!==true)fail("WEB_ECOSYSTEM_LIVE_EVIDENCE_POLICY_MISSING");
if(manifest?.truthPolicy?.publicStateTrustedValue!=="sanitized-proxy")fail("WEB_ECOSYSTEM_PUBLIC_STATE_MARKER_INVALID");
if(manifest?.truthPolicy?.visualPassRequiresBrowserEvidence!==true)fail("WEB_ECOSYSTEM_VISUAL_EVIDENCE_POLICY_MISSING");
const products=Array.isArray(manifest.products)?manifest.products:[];
if(products.length!==2||products.map(item=>item.id).join(",")!=="devbox,devapi")fail("WEB_ECOSYSTEM_PRODUCT_SCOPE_INVALID");
if(manifest?.designSystem?.id!=="orange-white-premium-v1"||manifest?.designSystem?.defaultMode!=="light"||manifest?.designSystem?.bluePurplePrimary!==false)fail("WEB_ECOSYSTEM_DESIGN_SYSTEM_INVALID");
if(manifest?.designSystem?.colors?.primaryOrange!=="#FF6A00"||manifest?.designSystem?.colors?.pureWhite!=="#FFFFFF")fail("WEB_ECOSYSTEM_BRAND_COLOR_INVALID");

for(const route of expectedRoutes){const slug=route.slice(1);if(!nav.includes(`slug: "${slug}"`))fail("WEB_ECOSYSTEM_NAV_ROUTE_MISSING",route);if(!pageJs.includes(`"${slug}": {`))fail("WEB_ECOSYSTEM_PAGE_CONFIG_MISSING",route);if(!sitemap.includes(`https://devbox.vercel.app${route}`))fail("WEB_ECOSYSTEM_SITEMAP_ROUTE_MISSING",route)}
if(!sitemap.includes("https://devbox.vercel.app/"))fail("WEB_ECOSYSTEM_SITEMAP_HOME_MISSING");
if(!robots.includes("Sitemap: https://devbox.vercel.app/sitemap.xml"))fail("WEB_ECOSYSTEM_ROBOTS_SITEMAP_MISSING");
for(const source of [nav,pageJs]){if(!source.includes("sanitized-proxy"))fail("WEB_ECOSYSTEM_SANITIZED_PROXY_GUARD_MISSING");if(!source.includes("UNAVAILABLE")&&!source.includes("BLOCKED/UNAVAILABLE"))fail("WEB_ECOSYSTEM_FAIL_CLOSED_STATE_MISSING");if(!source.includes("AbortSignal.timeout"))fail("WEB_ECOSYSTEM_BOUNDED_FETCH_MISSING")}
for(const marker of forbiddenScope){for(const [name,source] of [["manifest",JSON.stringify(manifest)],["nav",nav],["pageHtml",pageHtml],["pageJs",pageJs]]){if(source.includes(marker))fail("WEB_ECOSYSTEM_FORBIDDEN_SCOPE_REFERENCE",`${name}:${marker}`)}}
if(!nav.includes("devapi-virid.vercel.app"))fail("WEB_ECOSYSTEM_DEVAPI_LINK_MISSING");
if(!nav.includes("SOURCE VERIFIED"))fail("WEB_ECOSYSTEM_SOURCE_TRUTH_LABEL_MISSING");
if(!nav.includes("PRODUCTION · BLOCKED/UNAVAILABLE"))fail("WEB_ECOSYSTEM_PRODUCTION_FAIL_CLOSED_LABEL_MISSING");

if(manifest?.iconSystem?.primary!=="Lucide"||manifest?.iconSystem?.upstreamTag!=="1.27.0"||manifest?.iconSystem?.iconCount!==expectedIcons.length||manifest?.iconSystem?.wholePackageBundling!==false)fail("WEB_ECOSYSTEM_ICON_SYSTEM_INVALID");
if(iconManifest?.library!=="Lucide"||iconManifest?.upstreamTag!=="1.27.0"||iconManifest?.libraryLicense!=="ISC"||iconManifest?.runtimeDependency!==false||iconManifest?.delivery!=="curated-local-svg-sprite")fail("WEB_ECOSYSTEM_ICON_PROVENANCE_INVALID");
const icons=Array.isArray(iconManifest.icons)?iconManifest.icons:[];
if(icons.length!==expectedIcons.length)fail("WEB_ECOSYSTEM_ICON_COUNT",String(icons.length));
for(const id of expectedIcons){if(!sprite.includes(`id="i-${id}"`))fail("WEB_ECOSYSTEM_ICON_SPRITE_MISSING",id);const record=icons.find(item=>item?.id===id);if(!record)fail("WEB_ECOSYSTEM_ICON_MANIFEST_MISSING",id);if(record.license!=="ISC")fail("WEB_ECOSYSTEM_ICON_LICENSE_INVALID",id);if(!/^[a-f0-9]{64}$/i.test(String(record.sha256||"")))fail("WEB_ECOSYSTEM_ICON_DIGEST_INVALID",id)}
if(!nav.includes("/ecosystem-icons.svg#i-")||!pageJs.includes("/ecosystem-icons.svg#i-"))fail("WEB_ECOSYSTEM_ICON_RUNTIME_USAGE_MISSING");

const research=Array.isArray(manifest.researchSources)?manifest.researchSources:[];
const expectedResearch=new Map([["Magic UI","MIT"],["shadcn/ui","MIT"],["Lucide","ISC"],["Tabler Icons","MIT"],["Motion","MIT"],["Kibo UI","MIT"],["Microsoft Playwright","Apache-2.0"],["axe-core","MPL-2.0"],["Lighthouse","Apache-2.0"]]);
for(const [name,license] of expectedResearch){const entry=research.find(item=>item?.name===name);if(!entry||entry.license!==license)fail("WEB_ECOSYSTEM_RESEARCH_SOURCE_MISSING",name)}
const playwright=research.find(item=>item?.name==="Microsoft Playwright");if(playwright?.ciOnly!==true||playwright?.exactPackage!=="@playwright/test@1.62.1")fail("WEB_ECOSYSTEM_PLAYWRIGHT_PROVENANCE_INVALID");
const lucide=research.find(item=>item?.name==="Lucide");if(lucide?.runtimeDependency!==false||lucide?.exactTag!=="1.27.0"||lucide?.integrationState!=="SOURCE_PINNED")fail("WEB_ECOSYSTEM_LUCIDE_PIN_INVALID");
const axe=research.find(item=>item?.name==="axe-core");if(axe?.integrationState!=="DISCOVERED")fail("WEB_ECOSYSTEM_AXE_STATE_INVALID");

console.log(`WEB_ECOSYSTEM_VERIFY_PASS surfaces=${surfaces.length} routes=${expectedRoutes.length} architecture=10 capabilities=12 evolutionTracks=10 brand=orange-white icons=${icons.length} scope=devbox-devapi csp=fail-closed liveState=sanitized-proxy research=${research.length} browserEvidence=required`);
