import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

execFileSync(process.execPath, ["scripts/verify-api-evolution-v7.mjs"], { stdio: "inherit" });

const files = {
  package: "package.json",
  contracts: "src/shared/devapi-control-contracts.ts",
  service: "src/main/services/api-evolution-service.ts",
  findings: "src/main/services/evolution-finding-service.ts",
  releaseGate: "src/main/services/release-gate-service.ts",
  cloud: "src/main/services/cloud-control-service.ts",
  cloudDb: "cloud/devapi-control/lib/db.mjs",
  cloudCommands: "cloud/devapi-control/api/v1/commands.mjs",
  cloudProjects: "cloud/devapi-control/api/v1/projects.mjs",
  cloudHealth: "cloud/devapi-control/api/v1/health.mjs",
  cloudApp: "cloud/devapi-control/app.js",
  cloudIndex: "cloud/devapi-control/index.html",
  cloudVercel: "cloud/devapi-control/vercel.json",
  cloudPackage: "cloud/devapi-control/package.json",
  cloudReadme: "cloud/devapi-control/README.md"
};
const content = Object.fromEntries(await Promise.all(Object.entries(files).map(async ([key, file]) => [key, await readFile(file, "utf8")])));
const pkg = JSON.parse(content.package);
const hasAll = (source, needles) => needles.every((needle) => source.includes(needle));
let checks = 0;
function check(name, condition, detail = "") {
  checks += 1;
  if (!condition) throw new Error(`API_EVOLUTION_V8_VERIFY_FAILED:${name}${detail ? `:${detail}` : ""}`);
}

check("version-minimum", /^0\.1\.(?:1[5-9]|[2-9]\d|\d{3,})$/u.test(pkg.version));
const verifier = /verify-api-evolution-v(\d+)\.mjs/u.exec(String(pkg.scripts?.["evolution:verify"] ?? ""));
check("evolution-script-forward-compatible", Boolean(verifier && Number(verifier[1]) >= 8));

check("finding-strict-schema", hasAll(content.contracts, ["FindingSeveritySchema", "FindingOwnerSchema", "FindingStatusSchema", "EvolutionFindingSchema", "fingerprint", "occurrences", ".strict()"]));
check("finding-owner-contract-parity", hasAll(content.contracts, ["FindingOwnerCountsSchema", "core:", "agent:", "api:", "release:", "typescript:", "evolution:", "workspace:", "cloud:", "ui:", "security:", "project:", "integration:"]));
check("finding-lifecycle", hasAll(content.findings, ["report(", "transition(", "reconcileCampaign(", "reportTypeScriptOutput(", 'status: "OPEN"', '"RESOLVED"', '"REJECTED"']));
check("finding-persisted-normalization", hasAll(content.findings, ["normalizeStoredFinding", "FINDING_SEVERITIES", "FINDING_STATUSES", "FINDING_OWNER_SET", "deterministicLegacyId", "SHA256_PATTERN"]));
check("finding-persistent-store", hasAll(content.findings, ["evolution:findings:v1:", "getSetting", "setSetting", "appendEvent"]));
check("finding-owner-evolution", content.findings.includes('"evolution"') && content.contracts.includes('"evolution"'));

check("release-gate-modes-single-flight", hasAll(content.releaseGate, ["PREFLIGHT", "FULL", "#inFlight", "RELEASE_GATE_ALREADY_RUNNING"]));
check("release-gate-db-integrity", hasAll(content.releaseGate, ["database-integrity", "database-integrity-final", "integrityCheck"]));
check("release-gate-project-ownership", hasAll(content.releaseGate, ["project-ownership", "realpath", "repositoryRoot", "path.relative"]));
check("release-gate-findings", hasAll(content.releaseGate, ["blockingFindings", '"CRITICAL", "HIGH"', "isSelfReleaseAggregate", "revalidatesTypeScript"]));
check("release-gate-git-diff", hasAll(content.releaseGate, ["git-diff-check", "git-staged-diff-check", '"diff", "--check"', '"diff", "--cached", "--check"']));
check("release-gate-script-matrix", hasAll(content.releaseGate, ['"typecheck"', '"evolution:verify"', '"truth:audit"', '"test"', '"build"', "strictDevBox"]));
check("release-gate-typescript-finding-revalidation", hasAll(content.releaseGate, ["reportTypeScriptOutput", 'owner: "typescript"', '"RESOLVED"']));
check("release-gate-post-run-git", hasAll(content.releaseGate, ["release-head-stable", "workspace-stable-after-gate", "workspace-clean-after-gate", "initialChangeFingerprint", "finalGit"]));
check("release-gate-persistent-history", hasAll(content.releaseGate, ["release-gate:v1:", "setSetting", "release.gate.completed", "MAX_GATE_HISTORY"]));

const cloud = content.cloud;
check("cloud-explicit-unconfigured", hasAll(cloud, ["UNCONFIGURED", "CLOUD_CONTROL_UNCONFIGURED"]));
check("cloud-https-required", cloud.includes("DEVBOX_CONTROL_PLANE_HTTPS_REQUIRED") && cloud.includes('endpoint.protocol !== "https:"'));
check("cloud-token-minimum", cloud.includes("DEVBOX_CONTROL_PLANE_TOKEN_TOO_SHORT") && cloud.includes("token.length < 32"));
check("cloud-hmac", hasAll(cloud, ["createHmac", "x-devbox-signature", "x-devbox-timestamp"]));
check("cloud-command-allowlist", hasAll(cloud, ["evolution.setEnabled", "evolution.run", "evolution.cancel"]) && !hasAll(cloud, ["child_process", "exec("]));
check("cloud-command-retry-ack", hasAll(cloud, ["CLOUD_COMMAND_MAX_ATTEMPTS = 5", "#ackCommand", '"APPLIED"', '"RETRYING"', '"FAILED"', "terminalFailure", "pendingCommandCursor"]));
check("cloud-command-idempotency", hasAll(cloud, ["cloud-command:${commandId}", "setSetting(appliedKey, true)", 'await this.#ackCommand(projectId, command, "APPLIED")']));

check("cloud-db-command-state", hasAll(content.cloudDb, ["apply_status", "apply_detail", "applied_at", "applied_instance_id", "ackCommand"]));
check("cloud-db-project-discovery", hasAll(content.cloudDb, ["listProjects", 'project_id AS "projectId"', "latest_snapshot->'evolution'->>'lifetimeLevel'"]));
check("cloud-db-retention", hasAll(content.cloudDb, ["COMMAND_RETENTION_DAYS = 90", "COMMAND_RETENTION_COUNT = 2_000", "pruneCommands", "OFFSET $2"]));
check("cloud-server-command-ack", content.cloudCommands.includes('req.method === "PATCH"') && hasAll(content.cloudCommands, ["requireDesktopAuth", "ACK_STATES", "ackCommand"]));
check("cloud-server-command-allowlist", hasAll(content.cloudCommands, ["evolution.setEnabled", "evolution.run", "evolution.cancel"]) && !content.cloudCommands.includes("child_process"));
check("cloud-server-project-discovery", hasAll(content.cloudProjects, ["requireAdminAuth", "listProjects", "generatedAt"]));
check("cloud-health-coarse-only", hasAll(content.cloudHealth, ["version:", "state:", "time:"]) && !hasAll(content.cloudHealth, ["desktopAuth:", "adminAuth:"]));
check("cloud-dashboard-project-discovery", hasAll(content.cloudApp, ["discoverProjects", "/api/v1/projects", "projectPicker", "renderCommands", "apply_status"]));
check("cloud-dashboard-command-lifecycle", hasAll(content.cloudApp, ["apply_status", "apply_detail", "applied_at", "applied_instance_id", "status.toLowerCase()", "Cloud kuyruğunda masaüstü ACK bekleniyor."]) && hasAll(content.cloudIndex, ["COMMAND AUDIT", "PENDING → RETRYING → APPLIED / FAILED", "Desktop ACK"]));
check("cloud-vercel-csp", hasAll(content.cloudVercel, ["Content-Security-Policy", "frame-ancestors 'none'", "connect-src 'self'"]));
check("cloud-neon-pinned", content.cloudPackage.includes('"@neondatabase/serverless": "1.1.0"'));
check("cloud-deployment-contract", hasAll(content.cloudReadme, ["cloud/devapi-control", "DATABASE_URL", "DEVBOX_CONTROL_PLANE_TOKEN", "DEVBOX_CONTROL_ADMIN_TOKEN", "PENDING", "RETRYING", "APPLIED", "FAILED"]));

for (const file of [
  "cloud/devapi-control/app.js",
  "cloud/devapi-control/lib/auth.mjs",
  "cloud/devapi-control/lib/db.mjs",
  "cloud/devapi-control/api/v1/commands.mjs",
  "cloud/devapi-control/api/v1/projects.mjs",
  "cloud/devapi-control/api/v1/health.mjs"
]) execFileSync(process.execPath, ["--check", file], { stdio: "inherit" });

console.log(`API_EVOLUTION_V8_VERIFY_PASS checks=${checks} inherited=v7 architecture=current`);
