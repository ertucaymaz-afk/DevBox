import { readFile } from "node:fs/promises";
function assert(condition, code) { if (!condition) throw new Error(code); }
const catalog = JSON.parse(await readFile("cloud/devapi-control/research/tool-catalog.v2.json", "utf8"));
assert(catalog.schemaVersion === 3 && catalog.product === "DevAPI", "DEVAPI_RESEARCH_CATALOG_SCHEMA");
assert(catalog.policy.discoveredIsIntegrated === false, "DEVAPI_RESEARCH_DISCOVERY_TRUTH");
assert(catalog.policy.sourceReviewedIsSupplyChainVerified === false, "DEVAPI_RESEARCH_SOURCE_VERIFIED_TRUTH");
assert(Array.isArray(catalog.items) && catalog.items.length >= 5, "DEVAPI_RESEARCH_CATALOG_TOO_SMALL");
for (const item of catalog.items) {
  assert(/^https:\/\/github\.com\//u.test(item.source), `DEVAPI_RESEARCH_SOURCE_INVALID:${item.name}`);
  if (item.integrationState === "INTEGRATED") assert(item.supplyChainState === "SUPPLY_CHAIN_VERIFIED", `DEVAPI_RESEARCH_INTEGRATED_WITHOUT_SUPPLY_CHAIN:${item.name}`);
  if (item.runtimeState === "RUNTIME_VERIFIED") assert(item.integrationState === "INTEGRATED", `DEVAPI_RESEARCH_RUNTIME_WITHOUT_INTEGRATION:${item.name}`);
}
const agents = catalog.items.find((item) => item.name === "OpenAI Agents SDK for TypeScript");
assert(agents?.observedRelease === "v0.14.3", "DEVAPI_RESEARCH_AGENTS_RELEASE");
assert(agents?.observedCommit === "94a3edc3e5318fdbc4ceb045df4dad934ca4ab2b", "DEVAPI_RESEARCH_AGENTS_SHA");
assert(agents?.integrationState === "INTEGRATED" && agents?.supplyChainState === "SUPPLY_CHAIN_VERIFIED", "DEVAPI_RESEARCH_AGENTS_SUPPLY_CHAIN_TRUTH");
assert(["BLOCKED_EXTERNAL", "RUNTIME_VERIFIED"].includes(agents?.runtimeState), "DEVAPI_RESEARCH_AGENTS_RUNTIME_TRUTH");
assert(agents?.evidence?.auditHigh === 0 && agents?.evidence?.auditCritical === 0 && agents?.evidence?.lockfileVersion === 3, "DEVAPI_RESEARCH_AGENTS_EVIDENCE");
const zod = catalog.items.find((item) => item.name === "Zod");
assert(zod?.integrationState === "INTEGRATED" && zod?.supplyChainState === "SUPPLY_CHAIN_VERIFIED", "DEVAPI_RESEARCH_ZOD_SUPPLY_CHAIN_TRUTH");
const spectral = catalog.items.find((item) => item.name === "Spectral");
const oasdiff = catalog.items.find((item) => item.name === "oasdiff");
const schemathesis = catalog.items.find((item) => item.name === "Schemathesis");
assert(spectral?.observedRelease === "v6.16.2" && spectral?.observedCommitShort === "f08df7b" && spectral?.fullCommitReconciliation === "NOT_RUN", "DEVAPI_RESEARCH_SPECTRAL_STATE");
assert(spectral?.license === "Apache-2.0" && spectral?.integrationState === "SOURCE_REVIEWED" && spectral?.runtimeState === "NOT_RUN", "DEVAPI_RESEARCH_SPECTRAL_TRUTH");
assert(oasdiff?.observedRelease === "v1.26.1" && oasdiff?.observedCommitShort === "47e76df" && oasdiff?.fullCommitReconciliation === "NOT_RUN", "DEVAPI_RESEARCH_OASDIFF_STATE");
assert(oasdiff?.linuxAmd64TarGzSha256 === "ea0007fe536c7915785f754885d2afdb11352d6a14531950edf9d601a2baa674", "DEVAPI_RESEARCH_OASDIFF_ASSET_SHA");
assert(oasdiff?.integrationState === "SOURCE_REVIEWED" && oasdiff?.runtimeState === "NOT_RUN", "DEVAPI_RESEARCH_OASDIFF_TRUTH");
assert(schemathesis?.observedRelease === "v4.24.3" && schemathesis?.observedCommitShort === "613ce31" && schemathesis?.fullCommitReconciliation === "NOT_RUN", "DEVAPI_RESEARCH_SCHEMATHESIS_STATE");
assert(schemathesis?.license === "MIT" && schemathesis?.releaseSignatureObserved === "VERIFIED", "DEVAPI_RESEARCH_SCHEMATHESIS_PROVENANCE");
assert(schemathesis?.integrationState === "SOURCE_REVIEWED" && schemathesis?.runtimeState === "NOT_RUN", "DEVAPI_RESEARCH_SCHEMATHESIS_TRUTH");
const source = await readFile("cloud/devapi-control/research/tool-catalog.v2.json", "utf8");
assert(!/HotAPI/iu.test(source), "DEVAPI_RESEARCH_SCOPE_LEAK");
const integrations = catalog.items.filter((item) => item.integrationState === "INTEGRATED").length;
console.log(`DEVAPI_TOOL_CATALOG_V3_PASS items=${catalog.items.length} integrations=${integrations} agents=v0.14.3 agentsSupplyChain=verified spectral=v6.16.2 spectralIntegration=not-run oasdiff=v1.26.1 schemathesis=v4.24.3 truth=fail-closed`);
