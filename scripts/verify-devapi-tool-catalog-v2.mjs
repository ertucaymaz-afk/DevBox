import { readFile } from "node:fs/promises";
function assert(condition, code) { if (!condition) throw new Error(code); }
const catalog = JSON.parse(await readFile("cloud/devapi-control/research/tool-catalog.v2.json", "utf8"));
assert(catalog.schemaVersion === 2 && catalog.product === "DevAPI", "DEVAPI_RESEARCH_CATALOG_SCHEMA");
assert(catalog.policy.discoveredIsIntegrated === false, "DEVAPI_RESEARCH_DISCOVERY_TRUTH");
assert(catalog.policy.sourceReviewedIsSupplyChainVerified === false, "DEVAPI_RESEARCH_SOURCE_VERIFIED_TRUTH");
assert(Array.isArray(catalog.items) && catalog.items.length >= 5, "DEVAPI_RESEARCH_CATALOG_TOO_SMALL");
for (const item of catalog.items) {
  assert(/^https:\/\/github\.com\//u.test(item.source), `DEVAPI_RESEARCH_SOURCE_INVALID:${item.name}`);
  assert(!["INTEGRATED", "RUNTIME_VERIFIED"].includes(item.integrationState), `DEVAPI_RESEARCH_FAKE_INTEGRATION:${item.name}`);
}
const agents = catalog.items.find((item) => item.name === "OpenAI Agents SDK for TypeScript");
assert(agents?.observedRelease === "v0.14.3", "DEVAPI_RESEARCH_AGENTS_RELEASE");
assert(agents?.observedCommit === "94a3edc3e5318fdbc4ceb045df4dad934ca4ab2b", "DEVAPI_RESEARCH_AGENTS_SHA");
assert(agents?.supplyChainState === "TRANSITIVE_LOCK_NOT_RUN" && agents?.runtimeState === "NOT_RUN", "DEVAPI_RESEARCH_AGENTS_TRUTH");
const spectral = catalog.items.find((item) => item.name === "Spectral");
const oasdiff = catalog.items.find((item) => item.name === "oasdiff");
const schemathesis = catalog.items.find((item) => item.name === "Schemathesis");
assert(spectral?.observedRelease === "v6.16.2" && spectral?.commitReconciliation === "NOT_RUN", "DEVAPI_RESEARCH_SPECTRAL_STATE");
assert(oasdiff?.observedRelease === "v1.26.1" && oasdiff?.fullCommitReconciliation === "NOT_RUN", "DEVAPI_RESEARCH_OASDIFF_STATE");
assert(schemathesis?.observedRelease === "v4.24.3" && schemathesis?.fullCommitReconciliation === "NOT_RUN", "DEVAPI_RESEARCH_SCHEMATHESIS_STATE");
const source = await readFile("cloud/devapi-control/research/tool-catalog.v2.json", "utf8");
assert(!/HotAPI/iu.test(source), "DEVAPI_RESEARCH_SCOPE_LEAK");
console.log(`DEVAPI_TOOL_CATALOG_V2_PASS items=${catalog.items.length} agents=v0.14.3 spectral=v6.16.2 oasdiff=v1.26.1 schemathesis=v4.24.3 integrations=0 truth=fail-closed`);
