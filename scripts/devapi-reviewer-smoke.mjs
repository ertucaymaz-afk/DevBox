import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { reviewerConfiguration, runIndependentReview } from "../cloud/devapi-control/agent/reviewer.mjs";

const output = path.resolve("outputs/devapi-reviewer-smoke.json");
await mkdir(path.dirname(output), { recursive: true });
const config = await reviewerConfiguration();
let evidence;
if (!config.credentialConfigured || !config.sdkInstalled) {
  evidence = {
    schemaVersion: 1,
    role: "independent-reviewer",
    state: "BLOCKED_EXTERNAL",
    blocker: config.blocker,
    runtimeVerified: false,
    sdkInstalled: config.sdkInstalled,
    credentialConfigured: config.credentialConfigured,
    secretValue: null,
    generatedAt: new Date().toISOString()
  };
  console.log(`DEVAPI_REVIEWER_SMOKE_BLOCKED_EXTERNAL blocker=${config.blocker} runtimeVerified=false`);
} else {
  const result = await runIndependentReview({
    taskId: randomUUID(),
    goal: "Review a deterministic documentation-only candidate.",
    diff: "diff --git a/docs/example.md b/docs/example.md\n--- a/docs/example.md\n+++ b/docs/example.md\n@@ -1 +1 @@\n-old\n+clearer documentation\n",
    tests: [{ name: "syntax", state: "PASS" }],
    contractChanges: [],
    securityFindings: [],
    failureMemory: []
  });
  if (!result.responseId) throw new Error("DEVAPI_REVIEWER_RESPONSE_ID_MISSING");
  evidence = {
    schemaVersion: 1,
    role: result.role,
    state: result.state,
    runtimeVerified: true,
    model: result.model,
    responseId: result.responseId,
    decision: result.review.decision,
    riskDelta: result.review.riskDelta,
    evidenceDigest: result.evidenceDigest,
    secretValue: null,
    completedAt: result.completedAt
  };
  console.log(`DEVAPI_REVIEWER_SMOKE_PASS decision=${evidence.decision} riskDelta=${evidence.riskDelta} responseId=present secretLeak=false`);
}
await writeFile(output, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
