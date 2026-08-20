import { createServer } from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { runReadOnlyBrowserProbe, validateBrowserTarget } from "../cloud/devapi-control/browser/system-chrome.mjs";

function assert(condition, code) { if (!condition) throw new Error(code); }
const output = path.resolve("outputs/devapi-browser-smoke.json");
let requestCount = 0;
const server = createServer((req, res) => {
  requestCount += 1;
  res.statusCode = 200;
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.setHeader("x-content-type-options", "nosniff");
  res.end("<!doctype html><html lang=\"tr\"><head><meta charset=\"utf-8\"><title>DevAPI Browser Evidence</title></head><body><main><h1>DevAPI Browser Worker</h1><p data-state=\"source\">Gerçek headless browser smoke.</p></main></body></html>");
});
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});
const address = server.address();
if (!address || typeof address === "string") throw new Error("BROWSER_SMOKE_SERVER_ADDRESS");
const url = `http://127.0.0.1:${address.port}/smoke`;
let privateBlocked = false;
try { await validateBrowserTarget("https://127.0.0.1/private", { allowLoopback: false }); }
catch (error) { privateBlocked = error?.message === "BROWSER_URL_LOOPBACK_DENIED" || error?.message === "BROWSER_URL_PRIVATE_NETWORK_DENIED"; }
assert(privateBlocked, "BROWSER_SMOKE_SSRF_GUARD_FAIL");
let evidence;
try {
  const probe = await runReadOnlyBrowserProbe(url, { allowLoopback: true, width: 1280, height: 720 });
  assert(probe.state === "RUNTIME_VERIFIED", "BROWSER_SMOKE_STATE");
  assert(probe.dom.preview.includes("DevAPI Browser Worker"), "BROWSER_SMOKE_DOM_CONTENT");
  assert(probe.screenshot.bytes > 100, "BROWSER_SMOKE_SCREENSHOT");
  assert(requestCount >= 2, "BROWSER_SMOKE_HTTP_REQUESTS");
  evidence = {
    ...probe,
    requestCount,
    security: { privateNetworkDeniedWithoutExplicitLoopback: privateBlocked, browserActions: "READ_ONLY" },
    truth: {
      state: "RUNTIME_VERIFIED",
      appliesTo: ["browser.navigate", "browser.dom", "browser.screenshot", "browser-url-ssrf-guard"],
      doesNotApplyTo: ["browser.click", "browser.type", "browser.console", "browser.network-events", "openai-agent-runtime", "production"]
    }
  };
} finally {
  await new Promise((resolve) => server.close(resolve));
}
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
console.log(`DEVAPI_BROWSER_SMOKE_PASS runtime=${evidence.runtime} requests=${requestCount} domBytes=${evidence.dom.bytes} screenshotBytes=${evidence.screenshot.bytes} ssrfGuard=verified readOnly=true`);
