import { readFile, writeFile } from "node:fs/promises";

async function patch(file, before, after, label) {
  let source = (await readFile(file, "utf8")).replace(/\r\n/gu, "\n");
  if (!source.includes(before)) {
    if (source.includes(after)) return;
    throw new Error(`V020_CROSSLINK_PATCH_ANCHOR_MISSING:${label}`);
  }
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`V020_CROSSLINK_PATCH_ANCHOR_NOT_UNIQUE:${label}:${count}`);
  await writeFile(file, source.replace(before, after), "utf8");
}

const productLinksHandler = `function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "public, max-age=60, stale-while-revalidate=300");
  res.end(JSON.stringify(body));
}

function canonicalPublicUrl(name) {
  const raw = process.env[name]?.trim();
  if (!raw) return null;
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw new Error("PUBLIC_URL_INVALID");
  }
  return url.origin;
}

export default async function handler(req, res) {
  if (req.method !== "GET") return send(res, 405, { error: "METHOD_NOT_ALLOWED" });
  try {
    return send(res, 200, {
      devapi: canonicalPublicUrl("DEVAPI_CANONICAL_URL"),
      devbox: canonicalPublicUrl("DEVBOX_PRODUCT_URL")
    });
  } catch {
    return send(res, 503, { state: "UNCONFIGURED" });
  }
}
`;
await writeFile("cloud/devapi-control/api/v1/product-links.mjs", productLinksHandler, "utf8");

await patch(
  "cloud/devapi-control/index.html",
  '<div class="top-actions"><a class="pill" href="https://github.com/ertucaymaz-afk/DevBox" target="_blank" rel="noreferrer">DevBox kaynak</a><span id="health" class="pill pending">DENETLENİYOR</span>',
  '<div class="top-actions"><a id="devboxProductLink" class="pill hidden" href="#" target="_blank" rel="noreferrer">DevBox ürün sitesi</a><a class="pill" href="https://github.com/ertucaymaz-afk/DevBox" target="_blank" rel="noreferrer">DevBox kaynak</a><span id="health" class="pill pending">DENETLENİYOR</span>',
  "devapi-product-link-anchor"
);

const productLinksClient = `async function productLinks() {
  const link = $("devboxProductLink");
  if (!link) return;
  try {
    const response = await fetch("/api/v1/product-links", { cache: "no-store", signal: AbortSignal.timeout(5_000) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.devbox) throw new Error("PRODUCT_LINK_UNCONFIGURED");
    const url = new URL(String(data.devbox));
    if (url.protocol !== "https:" || url.username || url.password) throw new Error("PRODUCT_LINK_INVALID");
    link.href = url.origin;
    link.classList.remove("hidden");
  } catch {
    link.removeAttribute("href");
    link.classList.add("hidden");
  }
}

`;
await patch(
  "cloud/devapi-control/app.js",
  "function syncCredentials() {",
  `${productLinksClient}function syncCredentials() {`,
  "devapi-product-link-client"
);
await patch(
  "cloud/devapi-control/app.js",
  "void health();\nif (state.token)",
  "void health();\nvoid productLinks();\nif (state.token)",
  "devapi-product-link-startup"
);

const oldCloudCrossLinkGate = `requireText("devapiApp", "https://devbox.vercel.app/", "devapi-cross-link");
requireText("devboxApp", "https://devapi-virid.vercel.app", "devbox-cross-link");
console.log(\`DEVBOX_CLOUD_ECOSYSTEM_VERIFY_PASS version=\${devapiPackage.version} publicState=sanitized sites=2 syntax=pass securityHeaders=pass crossLinks=pass\`);`;
const newCloudCrossLinkGate = `execFileSync(process.execPath, ["--check", "cloud/devapi-control/api/v1/product-links.mjs"], { stdio: "inherit" });
const productLinksSource = await readFile("cloud/devapi-control/api/v1/product-links.mjs", "utf8");
requireText("devapiApp", "/api/v1/product-links", "devapi-cross-link-runtime-config");
if (!productLinksSource.includes("DEVBOX_PRODUCT_URL")) throw new Error("CLOUD_VERIFY_FAIL:devbox-product-url-config");
requireText("devboxApp", "/api/v1/public-state", "devbox-public-state-link");
console.log(\`DEVBOX_CLOUD_ECOSYSTEM_VERIFY_PASS version=\${devapiPackage.version} publicState=sanitized sites=2 syntax=pass securityHeaders=pass crossLinks=source-ready\`);`;
await patch("scripts/verify-cloud-ecosystem.mjs", oldCloudCrossLinkGate, newCloudCrossLinkGate, "cloud-cross-links-runtime-config");

console.log("V020_CROSSLINK_PATCH_PASS");
