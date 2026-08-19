import { readFile } from "node:fs/promises";

function assert(condition, code) { if (!condition) throw new Error(code); }

const root = "cloud/devapi-sites/main";
const [html, css, js, icons, vercelRaw, provenanceRaw, sitesRaw] = await Promise.all([
  readFile(`${root}/index.html`, "utf8"),
  readFile(`${root}/styles.css`, "utf8"),
  readFile(`${root}/app.js`, "utf8"),
  readFile(`${root}/icons.svg`, "utf8"),
  readFile(`${root}/vercel.json`, "utf8"),
  readFile(`${root}/ui-provenance.json`, "utf8"),
  readFile("cloud/devapi-sites/sites.manifest.json", "utf8")
]);

const vercel = JSON.parse(vercelRaw);
const provenance = JSON.parse(provenanceRaw);
const sites = JSON.parse(sitesRaw);

assert(/<html lang="tr">/u.test(html), "DEVAPI_MAIN_LOCALE_TR");
assert(html.includes("#ff6a00"), "DEVAPI_MAIN_BRAND_ORANGE");
assert(html.includes("SOURCE_READY · PRODUCTION NOT_RUN"), "DEVAPI_MAIN_TRUTH_HEADER");
assert(html.includes("Bounded Coding Executor"), "DEVAPI_MAIN_CODER_EXPLANATION");
assert(html.includes("AŞAMA 2"), "DEVAPI_MAIN_MATURITY_STAGE");
assert(html.includes("Bugünkü gerçek: DevAPI henüz “her işlemde kendi modelini eğiten” bir sistem değil."), "DEVAPI_MAIN_LEARNING_TRUTH");
assert(html.includes("Bugün için kalıcı self-learning iddiası yok."), "DEVAPI_MAIN_LEARNING_FAQ_TRUTH");
assert(html.includes("Failure Memory") && html.includes("Repository Knowledge Graph") && html.includes("Finding + Candidate Engine"), "DEVAPI_MAIN_EVOLUTION_EXPLANATION");
assert(html.includes("05e05e5362d23d45e5dbae36a2223f6a1de74876"), "DEVAPI_MAIN_V5_HEAD_EVIDENCE");
assert(html.includes("32257488498") && html.includes("96082516180") && html.includes("9366878739"), "DEVAPI_MAIN_V5_RUN_EVIDENCE");
assert(html.includes("13 routes / 21 operations"), "DEVAPI_MAIN_CONTRACT_BASELINE");
assert(!/production is live|production aktif|canonicalDomainsVerified=true/iu.test(html), "DEVAPI_MAIN_FAKE_PRODUCTION_COPY");
assert(!/self-learning verified|kalıcı self-learning doğrulandı/iu.test(html), "DEVAPI_MAIN_FAKE_LEARNING_COPY");

const sectionIds = ["nedir", "seviye", "akis", "ogrenme", "evrim", "kanit"];
for (const id of sectionIds) assert(html.includes(`id="${id}"`), `DEVAPI_MAIN_SECTION:${id}`);

const candidates = [
  "yaaertu-devapi.vercel.app",
  "yaaertu-devapi-api.vercel.app",
  "yaaertu-devapi-docs.vercel.app",
  "yaaertu-devapi-status.vercel.app",
  "yaaertu-devapi-console.vercel.app"
];
for (const host of candidates) assert(html.includes(host), `DEVAPI_MAIN_CANDIDATE_HOST:${host}`);
assert(html.includes("CANDIDATE · NOT_RUN"), "DEVAPI_MAIN_CANDIDATE_STATE");
assert(sites.canonicalDomainsVerified === false && sites.deploymentState === "NOT_RUN", "DEVAPI_MAIN_MANIFEST_TRUTH");

for (const token of ["--orange:#ff6a00", "--flame:#ff4d00", "prefers-reduced-motion", "@media(max-width:820px)", ".bento", ".stage-rail", ".evidence-box"]) {
  assert(css.includes(token), `DEVAPI_MAIN_CSS_TOKEN:${token}`);
}
assert(css.length > 12000, "DEVAPI_MAIN_CSS_TOO_SHALLOW");
assert(!css.includes("http://") && !css.includes("https://"), "DEVAPI_MAIN_CSS_REMOTE_ASSET");

assert(js.includes("IntersectionObserver"), "DEVAPI_MAIN_INTERSECTION_RUNTIME");
assert(js.includes("prefers-reduced-motion"), "DEVAPI_MAIN_REDUCED_MOTION_RUNTIME");
assert(js.includes("element.animate") || js.includes("evidenceBox.animate"), "DEVAPI_MAIN_NATIVE_ANIMATION_RUNTIME");
assert(!/fetch\s*\(|XMLHttpRequest|WebSocket|EventSource/iu.test(js), "DEVAPI_MAIN_REMOTE_RUNTIME");
assert(!/eval\s*\(|new Function/iu.test(js), "DEVAPI_MAIN_DYNAMIC_CODE_EXEC");
assert(!/https?:\/\//iu.test(js), "DEVAPI_MAIN_JS_REMOTE_URL");

const requiredIcons = ["activity", "shield-check", "git-branch", "database", "workflow", "brain-circuit", "rocket"];
for (const icon of requiredIcons) assert(icons.includes(`id="${icon}"`), `DEVAPI_MAIN_ICON:${icon}`);
assert(icons.includes("ISC License") && icons.includes("59978cecf84986af59f1f9f503bcebdc89c6d166"), "DEVAPI_MAIN_ICON_PROVENANCE");

assert(provenance.schemaVersion === 1 && provenance.product === "DevAPI Main Product Site", "DEVAPI_MAIN_PROVENANCE_SCHEMA");
assert(provenance.policy?.noFloatingRuntimeDependency === true, "DEVAPI_MAIN_FLOATING_DEP_POLICY");
assert(provenance.policy?.noRemoteRuntimeScript === true, "DEVAPI_MAIN_REMOTE_SCRIPT_POLICY");
assert(provenance.nativeRuntime?.runtimeDependencyCount === 0, "DEVAPI_MAIN_RUNTIME_DEP_COUNT");
assert(Array.isArray(provenance.items) && provenance.items.length === 4, "DEVAPI_MAIN_PROVENANCE_ITEMS");
const lucide = provenance.items.find((item) => item.name === "Lucide");
assert(lucide?.state === "INTEGRATED_LOCAL_CURATED_SVG" && lucide?.sourceCommit === "59978cecf84986af59f1f9f503bcebdc89c6d166", "DEVAPI_MAIN_LUCIDE_INTEGRATION");
for (const name of ["Motion", "Magic UI", "shadcn/ui"]) {
  const item = provenance.items.find((entry) => entry.name === name);
  assert(item?.state === "SOURCE_REVIEWED_REFERENCE_ONLY" && item?.runtimeDependency === false, `DEVAPI_MAIN_REFERENCE_TRUTH:${name}`);
}
assert(!provenanceRaw.includes("@latest"), "DEVAPI_MAIN_FLOATING_REFERENCE");

const headers = vercel.headers?.[0]?.headers || [];
const csp = headers.find((entry) => entry.key === "Content-Security-Policy")?.value || "";
assert(csp.includes("script-src 'self'") && csp.includes("style-src 'self'"), "DEVAPI_MAIN_CSP_LOCAL_RUNTIME");
assert(!csp.includes("'unsafe-inline'") && !csp.includes("https:"), "DEVAPI_MAIN_CSP_REMOTE_OR_INLINE");
assert(headers.some((entry) => entry.key === "X-Frame-Options" && entry.value === "DENY"), "DEVAPI_MAIN_FRAME_DENY");

console.log(`DEVAPI_MAIN_SITE_V6_PASS sections=${sectionIds.length} icons=${requiredIcons.length} sources=${provenance.items.length} locale=tr runtimeDependencies=0 learningTruth=fail-closed productionTruth=not-run brand=orange-white`);
