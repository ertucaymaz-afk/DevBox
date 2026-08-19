import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { chromium } from "@playwright/test";

const root=process.cwd();
const site=path.join(root,"cloud","devbox-site");
const outputRoot=path.join(root,"outputs","web-visual");
const routes=["/","/devapi-home","/devapi-api","/devapi-docs","/devapi-console","/devapi-status","/devapi-studio","/devapi-evolution","/devapi-workbench","/devapi-memory","/devapi-diagnostics"];
const viewports=[{name:"desktop",width:1440,height:900},{name:"laptop",width:1280,height:800},{name:"tablet",width:768,height:1024},{name:"mobile",width:390,height:844}];
const routeRewrite=new Set(routes.slice(1));
const contentTypes=new Map([[".html","text/html; charset=utf-8"],[".js","text/javascript; charset=utf-8"],[".css","text/css; charset=utf-8"],[".json","application/json; charset=utf-8"],[".svg","image/svg+xml"],[".xml","application/xml; charset=utf-8"],[".txt","text/plain; charset=utf-8"],[".png","image/png"],[".webp","image/webp"]]);
function sendJson(res,status,body,headers={}){res.writeHead(status,{"content-type":"application/json; charset=utf-8","cache-control":"no-store",...headers});res.end(`${JSON.stringify(body)}\n`)}
function safeFile(urlPath){const pathname=decodeURIComponent(urlPath.split("?")[0]||"/");if(pathname==="/")return path.join(site,"index.html");if(routeRewrite.has(pathname))return path.join(site,"ecosystem-page.html");const candidate=path.resolve(site,pathname.replace(/^\/+/,""));return candidate.startsWith(path.resolve(site)+path.sep)?candidate:null}
const server=http.createServer((req,res)=>{const url=new URL(req.url||"/","http://127.0.0.1");if(url.pathname==="/favicon.ico"){res.writeHead(204,{"cache-control":"no-store"});res.end();return}if(url.pathname==="/api/public-state")return sendJson(res,200,{evolution:{lifetimeLevel:null,score:null,stage:"NOT_RUN",isRunning:false},findings:{open:null,blocking:null},releaseGate:{state:"NOT_RUN"},freshness:{stale:true,ageSeconds:86400}},{"x-devbox-public-state":"sanitized-proxy","x-devbox-qa-fixture":"stale-no-ready"});if(url.pathname==="/api/product-links")return sendJson(res,200,{devapi:"https://devapi-virid.vercel.app"},{"x-devbox-qa-fixture":"links-only"});const file=safeFile(url.pathname);if(!file||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404,{"content-type":"text/plain; charset=utf-8"});res.end("Not found\n");return}res.writeHead(200,{"content-type":contentTypes.get(path.extname(file).toLowerCase())||"application/octet-stream","cache-control":"no-store","x-content-type-options":"nosniff"});fs.createReadStream(file).pipe(res)});
await new Promise((resolve,reject)=>{server.once("error",reject);server.listen(0,"127.0.0.1",resolve)});
const address=server.address();if(!address||typeof address==="string")throw Error("WEB_VISUAL_SERVER_ADDRESS_INVALID");const origin=`http://127.0.0.1:${address.port}`;
fs.rmSync(outputRoot,{recursive:true,force:true});fs.mkdirSync(outputRoot,{recursive:true});
const browser=await chromium.launch({headless:true,channel:"chrome"});
const results=[];let failure=null;
try{
 for(const route of routes)for(const viewport of viewports){
  const context=await browser.newContext({viewport:{width:viewport.width,height:viewport.height},reducedMotion:"reduce",colorScheme:"light"});const page=await context.newPage();const consoleErrors=[],pageErrors=[];
  page.on("console",m=>{if(m.type()==="error")consoleErrors.push(m.text())});page.on("pageerror",e=>pageErrors.push(e.message));
  const response=await page.goto(`${origin}${route}`,{waitUntil:"domcontentloaded",timeout:20000});if(!response||response.status()!==200)throw Error(`WEB_VISUAL_HTTP_FAIL:${route}:${viewport.name}:${response?.status()??"NO_RESPONSE"}`);await page.waitForTimeout(350);
  const title=await page.title();if(!title.trim())throw Error(`WEB_VISUAL_TITLE_MISSING:${route}:${viewport.name}`);const h1=page.locator("h1").first();if(await h1.count()!==1||!(await h1.isVisible()))throw Error(`WEB_VISUAL_H1_MISSING:${route}:${viewport.name}`);if(await page.locator("header").count()<1)throw Error(`WEB_VISUAL_HEADER_MISSING:${route}:${viewport.name}`);
  if(!(await page.evaluate(()=>matchMedia("(prefers-reduced-motion: reduce)").matches)))throw Error(`WEB_VISUAL_REDUCED_MOTION_NOT_ACTIVE:${route}:${viewport.name}`);
  const overflow=await page.evaluate(()=>Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)-innerWidth);if(overflow>1)throw Error(`WEB_VISUAL_HORIZONTAL_OVERFLOW:${route}:${viewport.name}:${overflow}`);
  await page.waitForFunction(()=>document.querySelectorAll(".eco-theme-switcher button").length===3,null,{timeout:5000});
  await page.locator('[data-eco-theme-option="light"]').click();
  const theme=await page.evaluate(()=>({resolved:document.documentElement.dataset.ecoTheme,preference:document.documentElement.dataset.ecoThemePreference,orange:getComputedStyle(document.documentElement).getPropertyValue("--brand-orange").trim(),background:getComputedStyle(document.body).backgroundColor,text:document.body.innerText}));
  if(theme.resolved!=="light"||theme.preference!=="light")throw Error(`WEB_VISUAL_LIGHT_THEME_FAIL:${route}:${viewport.name}:${JSON.stringify(theme)}`);
  if(theme.orange.toLowerCase()!=="#ff6a00")throw Error(`WEB_VISUAL_ORANGE_TOKEN_FAIL:${route}:${viewport.name}:${theme.orange}`);
  if(/HotAPI|hotapi-six-gamma/i.test(theme.text))throw Error(`WEB_VISUAL_FORBIDDEN_SCOPE_TEXT:${route}:${viewport.name}`);
  if(viewport.name==="desktop"){
    await page.locator('[data-eco-theme-option="dark"]').click();if(await page.evaluate(()=>document.documentElement.dataset.ecoTheme)!=="dark")throw Error(`WEB_VISUAL_DARK_THEME_FAIL:${route}`);
    await page.locator('[data-eco-theme-option="light"]').click();
  }
  await page.keyboard.press("Control+K");await page.waitForTimeout(80);if(await page.locator("#ecoCommand.open").count()!==1)throw Error(`WEB_VISUAL_COMMAND_PALETTE_FAIL:${route}:${viewport.name}`);await page.keyboard.press("Escape");
  if(await page.locator('svg use[href^="/ecosystem-icons.svg#i-"]').count()<1)throw Error(`WEB_VISUAL_CURATED_ICON_MISSING:${route}:${viewport.name}`);
  if(route==="/"){
   await page.waitForFunction(()=>document.querySelector("#livePill")?.textContent==="STALE",null,{timeout:5000});
   for(const selector of ["#ecoArchitectureExplorer","#ecoSourceCapabilityMatrix","#ecoEvolutionTracks"]){const node=page.locator(selector);if(await node.count()!==1||!(await node.isVisible()))throw Error(`WEB_VISUAL_V2_COMPONENT_MISSING:${selector}:${viewport.name}`)}
   const c=await page.locator("#ecoSourceCapabilityMatrix .eco-capability-tile").count(),a=await page.locator("#ecoArchitectureExplorer .eco-arch-node").count(),e=await page.locator("#ecoEvolutionTracks article").count();if(c!==12)throw Error(`WEB_VISUAL_CAPABILITY_COUNT:${viewport.name}:${c}`);if(a!==10)throw Error(`WEB_VISUAL_ARCHITECTURE_COUNT:${viewport.name}:${a}`);if(e!==10)throw Error(`WEB_VISUAL_EVOLUTION_TRACK_COUNT:${viewport.name}:${e}`);
  }else await page.waitForFunction(()=>document.querySelector("#ecoLiveState")?.textContent==="STALE",null,{timeout:5000});
  if(pageErrors.length)throw Error(`WEB_VISUAL_PAGE_ERROR:${route}:${viewport.name}:${pageErrors.join(" | ")}`);if(consoleErrors.length)throw Error(`WEB_VISUAL_CONSOLE_ERROR:${route}:${viewport.name}:${consoleErrors.join(" | ")}`);
  const slug=route==="/"?"home":route.slice(1),dir=path.join(outputRoot,slug);fs.mkdirSync(dir,{recursive:true});const screenshot=path.join(dir,`${viewport.name}.png`);await page.screenshot({path:screenshot,fullPage:true,animations:"disabled"});const bytes=fs.statSync(screenshot).size;if(bytes<2000)throw Error(`WEB_VISUAL_SCREENSHOT_TOO_SMALL:${route}:${viewport.name}:${bytes}`);const sha256=crypto.createHash("sha256").update(fs.readFileSync(screenshot)).digest("hex");
  results.push({route,viewport:viewport.name,width:viewport.width,height:viewport.height,httpStatus:response.status(),browserChannel:"chrome",reducedMotion:true,theme:"light",brandOrange:"#FF6A00",horizontalOverflowPx:overflow,commandPalette:"PASS",curatedIcon:"PASS",forbiddenScopeText:"ABSENT",truthFixture:"STALE",architectureExplorer:route==="/"?"PASS":"N/A",sourceCapabilityMatrix:route==="/"?"12/12":"N/A",evolutionTracks:route==="/"?"10/10":"N/A",consoleErrors:0,pageErrors:0,screenshot:path.relative(root,screenshot).replaceAll("\\","/"),screenshotBytes:bytes,screenshotSha256:sha256});await context.close();
 }
}catch(error){failure=error}finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
const summary={schemaVersion:4,product:"DevBox + DevAPI web ecosystem",scope:["devbox","devapi"],sourceSha:process.env.GITHUB_SHA||null,generatedAt:new Date().toISOString(),fixturePolicy:"QA_ONLY_STALE_PUBLIC_STATE_NO_PRODUCTION_CLAIM",browser:"RUNNER_PROVIDED_GOOGLE_CHROME",brand:"ORANGE_WHITE_PREMIUM",routes:routes.length,viewports:viewports.length,expectedScreenshots:44,capturedScreenshots:results.length,architectureExplorer:"BROWSER_VERIFIED_ON_HOME",sourceCapabilities:12,evolutionTracks:10,curatedIcons:"BROWSER_VERIFIED",themeSwitch:"LIGHT_DARK_VERIFIED",reducedMotion:"VERIFIED_PER_CASE",status:failure?"FAIL":"PASS",error:failure instanceof Error?failure.message:failure?String(failure):null,results};fs.writeFileSync(path.join(outputRoot,"summary.json"),`${JSON.stringify(summary,null,2)}\n`);
if(failure)throw failure;if(results.length!==44)throw Error(`WEB_VISUAL_MATRIX_INCOMPLETE:${results.length}`);console.log("DEVBOX_WEB_VISUAL_V4_PASS routes=11 viewports=4 screenshots=44 browser=system-chrome brand=orange-white themeSwitch=verified icons=curated scope=devbox-devapi reducedMotion=verified truthFixture=STALE");
