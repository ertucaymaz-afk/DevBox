import { readFile } from "node:fs/promises";

function assert(condition, code) { if (!condition) throw new Error(code); }

const manifest = JSON.parse(await readFile("cloud/devapi-sites/sites.manifest.json", "utf8"));
assert(manifest.product === "DevAPI", "DEVAPI_SITES_PRODUCT");
assert(manifest.state === "SOURCE_READY" && manifest.deploymentState === "NOT_RUN", "DEVAPI_SITES_TRUTH_STATE");
assert(manifest.canonicalDomainsVerified === false, "DEVAPI_SITES_FAKE_CANONICAL");
assert(Array.isArray(manifest.projects) && manifest.projects.length === 5, "DEVAPI_SITES_PROJECT_COUNT");
const expected = ["main", "runtime", "docs", "status", "console"];
assert(JSON.stringify(manifest.projects.map((x) => x.id)) === JSON.stringify(expected), "DEVAPI_SITES_TOPOLOGY");
for (const project of manifest.projects) {
  const html = await readFile(`${project.root}/index.html`, "utf8");
  const vercel = JSON.parse(await readFile(`${project.root}/vercel.json`, "utf8"));
  assert(/<title>DevAPI/iu.test(html), `DEVAPI_SITE_TITLE:${project.id}`);
  assert(html.toLowerCase().includes("#ff6a00"), `DEVAPI_SITE_ORANGE_BRAND:${project.id}`);
  assert(!/HotAPI/iu.test(html), `DEVAPI_SITE_SCOPE_LEAK:${project.id}`);
  assert(!/PRODUCTION_VERIFIED|KNOWN_GOOD/iu.test(html) || /NOT_RUN|not verified|değildir|ilan edilmemiştir/iu.test(html), `DEVAPI_SITE_FAKE_RELEASE:${project.id}`);
  const headers = vercel.headers?.[0]?.headers || [];
  assert(headers.some((x) => x.key === "Content-Security-Policy"), `DEVAPI_SITE_CSP:${project.id}`);
  assert(headers.some((x) => x.key === "X-Content-Type-Options" && x.value === "nosniff"), `DEVAPI_SITE_NOSNIFF:${project.id}`);
}
console.log(`DEVAPI_SITES_V1_PASS projects=${manifest.projects.length} sourceReady=true deployment=not-run canonicalDomains=false brand=orange-white`);
