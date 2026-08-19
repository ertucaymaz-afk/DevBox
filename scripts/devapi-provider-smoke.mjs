import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { agentRuntimeConfiguration, runPlanningAgent } from "../cloud/devapi-control/agent/runtime.mjs";

const output = path.resolve("outputs/devapi-provider-smoke.json");
await mkdir(path.dirname(output), { recursive: true });
const configuration = await agentRuntimeConfiguration();
let evidence;
if (!configuration.credentialConfigured) {
  evidence = {
    schemaVersion: 1,
    provider: configuration.provider,
    sdk: configuration.package,
    sdkVersionExpected: configuration.expectedVersion,
    state: "BLOCKED_EXTERNAL",
    blocker: "OPENAI_API_KEY_UNCONFIGURED",
    runtimeVerified: false,
    credentialConfigured: false,
    secretValue: null,
    generatedAt: new Date().toISOString()
  };
  console.log("DEVAPI_PROVIDER_SMOKE_BLOCKED_EXTERNAL credential=OPENAI_API_KEY runtimeVerified=false");
} else if (!configuration.sdkInstalled) {
  evidence = {
    schemaVersion: 1,
    provider: configuration.provider,
    sdk: configuration.package,
    sdkVersionExpected: configuration.expectedVersion,
    state: "BLOCKED_EXTERNAL",
    blocker: "AGENTS_SDK_NOT_INSTALLED",
    runtimeVerified: false,
    credentialConfigured: true,
    secretValue: null,
    generatedAt: new Date().toISOString()
  };
  console.log("DEVAPI_PROVIDER_SMOKE_BLOCKED_EXTERNAL sdk=not-installed runtimeVerified=false");
} else {
  const startedAt = new Date().toISOString();
  const result = await runPlanningAgent({
    taskId: randomUUID(),
    request: "DevAPI için yalnız üç maddelik deterministic bir source verification planı üret. Production veya runtime doğrulanmış gibi davranma.",
    riskClass: "R1",
    sourceRef: `ertucaymaz-afk/DevBox@${process.env.GITHUB_HEAD_REF || "ci"}:${process.env.GITHUB_HEAD_SHA || process.env.GITHUB_SHA || "unknown"}`,
    timeoutMs: 90_000
  });
  const outputDigest = createHash("sha256").update(result.output).digest("hex");
  evidence = {
    schemaVersion: 1,
    provider: result.provider,
    sdk: configuration.package,
    sdkVersionExpected: result.sdkVersionExpected,
    model: result.model,
    responseId: result.responseId || null,
    rawResponseCount: result.rawResponseCount ?? null,
    state: "RUNTIME_VERIFIED",
    runtimeVerified: true,
    credentialConfigured: true,
    secretValue: null,
    startedAt,
    completedAt: result.generatedAt,
    outputDigest,
    outputBytes: Buffer.byteLength(result.output)
  };
  if (!evidence.responseId) throw new Error("DEVAPI_PROVIDER_RESPONSE_ID_MISSING");
  console.log(`DEVAPI_PROVIDER_SMOKE_PASS model=${evidence.model} responseId=present outputBytes=${evidence.outputBytes} secretLeak=false`);
}
await writeFile(output, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
