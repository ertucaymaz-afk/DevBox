import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const tokenConfigured = String(process.env.VERCEL_TOKEN || "").trim().length >= 20;
const scopeConfigured = String(process.env.DEVAPI_VERCEL_SCOPE || "").trim().length > 0;
const state = tokenConfigured ? "SOURCE_READY_FOR_DEPLOY_ATTEMPT" : "BLOCKED_EXTERNAL";
const report = {
  schemaVersion: 1,
  capability: "devapi-sites.production-deploy",
  state,
  tokenConfigured,
  tokenValue: null,
  scopeConfigured,
  scopeValue: scopeConfigured ? "configured-redacted" : null,
  productionVerified: false,
  blocker: tokenConfigured ? null : "VERCEL_TOKEN_UNCONFIGURED",
  generatedAt: new Date().toISOString()
};
const output = path.resolve("outputs/devapi-vercel-credential-state.json");
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(tokenConfigured ? "DEVAPI_VERCEL_CREDENTIAL_READY token=redacted productionVerified=false" : "DEVAPI_VERCEL_CREDENTIAL_BLOCKED_EXTERNAL credential=VERCEL_TOKEN productionVerified=false");
