import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

execFileSync(process.execPath, ["scripts/verify-api-evolution-v7.mjs"], { stdio: "inherit" });

const files = {
  package: "package.json",
  contracts: "src/shared/devapi-control-contracts.ts",
  service: "src/main/services/api-evolution-service.ts",
  findings: "src/main/services/evolution-finding-service.ts",
  releaseGate: "src/main/services/release-gate-service.ts",
  database: "src/main/services/database.ts",
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
check("evolution-script-forward-compatible", /verify-api-evolution-v(?:8|9|10|11|12|13|14|15|16|17|18|19|20)\.mjs/u.test(String(pkg.scripts?.["evolution:verify"] ?? "")));
check("finding-schema", hasAll(content.contracts, ["FindingSeveritySchema", "FindingOwnerSchema", "FindingStatusSchema", "EvolutionFindingSchema", "fingerprint", "occurrences", ".strict()"]));
check("finding-owner-count-schema", hasAll(content.contracts, ["FindingOwnerCountsSchema", "core:", "agent:", "api:", "release:", "typescript:", "workspace:", "cloud:", "ui:", "security:", "project:", "integration:"]));
check("finding-lifecycle", hasAll(content.findings, ["OPEN", "RESOLVED", "REJECTED", "transition", "record"]));
check("release-gate-service", hasAll(content.releaseGate, ["PREFLIGHT", "FULL", "blocking", "headBefore", "headAfter"]));
check("release-gate-git-fingerprint", hasAll(content.releaseGate, ["workingTreeFingerprint", "repositoryFingerprint", "GIT_STATE_CHANGED_DURING_GATE"]));
check("release-gate-typescript", content.releaseGate.includes("typecheck"));
check("release-gate-tests", content.releaseGate.includes("test"));
check("release-gate-build", content.releaseGate.includes("build"));
check("release-gate-truth-audit", content.releaseGate.includes("truth:audit"));
check("database-findings", hasAll(content.database, ["evolution_findings", "upsertEvolutionFinding", "listEvolutionFindings"]));
check("database-release-gates", hasAll(content.database, ["release_gate_runs", "saveReleaseGateRun", "getLatestReleaseGateRun"]));
check("service-finding-registry", hasAll(content.service, ["EvolutionFindingService", "releaseGate", "findings"]));
check("service-release-gate", hasAll(content.service, ["ReleaseGateService", "runReleaseGate"]));

const cloud = content.cloud;
const cloudDb = content.cloudDb;
const cloudCommands = content.cloudCommands;
const cloudProjects = content.cloudProjects;
const cloudHealth = content.cloudHealth;
const cloudApp = content.cloudApp;
const cloudIndex = content.cloudIndex;
const cloudVercel = content.cloudVercel;
const cloudPackage = content.cloudPackage;
const cloudReadme = content.cloudReadme;
check("cloud-https-required", cloud.includes("DEVBOX_CONTROL_PLANE_HTTPS_REQUIRED") && cloud.includes('endpoint.protocol !== "https:"'));
check("cloud-token-minimum", cloud.includes("DEVBOX_CONTROL_PLANE_TOKEN_TOO_SHORT") && cloud.includes("token.length < 32"));
check("cloud-hmac", cloud.includes("createHmac") && cloud.includes("x-devbox-signature") && cloud.includes("x-devbox-timestamp"));
check("cloud-command-allowlist", hasAll(cloud, ["evolution.setEnabled", "evolution.run", "evolution.cancel"]) && cloud.includes("cloud-command:${commandId}"));
check("cloud-no-arbitrary-shell", !cloud.includes("child_process") && !cloud.includes("exec(") && !cloud.includes("spawn("));
check("cloud-command-ack-lifecycle", hasAll(cloud, ["CLOUD_COMMAND_MAX_ATTEMPTS = 5", "#ackCommand", '"APPLIED"', '"RETRYING"', '"FAILED"', "cloud.command.retrying", "cloud.command.failed"]));
check("cloud-command-ack-idempotency", cloud.includes("this.#database.setSetting(appliedKey, true)") && cloud.includes('await this.#ackCommand(projectId, command, "APPLIED")'));
check("cloud-command-poison-progress", cloud.includes("terminalFailure") && cloud.includes("pendingCommandCursor: cursor") && cloud.includes("attempts >= CLOUD_COMMAND_MAX_ATTEMPTS"));

check("cloud-db-command-state", hasAll(cloudDb, ["apply_status", "apply_detail", "applied_at", "applied_instance_id", "ackCommand"]));
check("cloud-db-project-discovery", cloudDb.includes("listProjects") && cloudDb.includes('project_id AS "projectId"') && cloudDb.includes("latest_snapshot->'evolution'->>'lifetimeLevel'"));
check("cloud-db-retention", hasAll(cloudDb, ["COMMAND_RETENTION_DAYS = 90", "COMMAND_RETENTION_COUNT = 2_000", "pruneCommands", "OFFSET $2"]));
check("cloud-server-command-ack", cloudCommands.includes('req.method === "PATCH"') && hasAll(cloudCommands, ["requireDesktopAuth", "ACK_STATES", "ackCommand"]));
check("cloud-server-command-allowlist", hasAll(cloudCommands, ["evolution.setEnabled", "evolution.run", "evolution.cancel"]) && !cloudCommands.includes("child_process"));
check("cloud-server-project-discovery", cloudProjects.includes("requireAdminAuth") && cloudProjects.includes("listProjects") && cloudProjects.includes("generatedAt"));
check("cloud-health-coarse-only", cloudHealth.includes("version:") && cloudHealth.includes("state:") && cloudHealth.includes("time:") && !cloudHealth.includes("configured") && !cloudHealth.includes("desktopAuth:") && !cloudHealth.includes("adminAuth:"));
check("cloud-dashboard-project-discovery", hasAll(cloudApp, ["discoverProjects", "/api/v1/projects", "projectPicker", "renderCommands", "apply_status"]));
check("cloud-dashboard-command-lifecycle", hasAll(cloudApp, ["apply_status", "apply_detail", "applied_at", "applied_instance_id", "status.toLowerCase()", "Cloud kuyruğunda masaüstü ACK bekleniyor."]) && hasAll(cloudIndex, ["COMMAND AUDIT", "PENDING → RETRYING → APPLIED / FAILED", "Cloud kuyruğu ↔ Desktop ACK"]));
check("cloud-vercel-csp", cloudVercel.includes("Content-Security-Policy") && cloudVercel.includes("frame-ancestors 'none'") && cloudVercel.includes("connect-src 'self'"));
check("cloud-neon-pinned", cloudPackage.includes('"@neondatabase/serverless": "1.1.0"'));
check("cloud-deployment-contract", hasAll(cloudReadme, ["cloud/devapi-control", "DATABASE_URL", "DEVBOX_CONTROL_PLANE_TOKEN", "DEVBOX_CONTROL_ADMIN_TOKEN", "PENDING", "RETRYING", "APPLIED", "FAILED"]));

for (const file of [
  "cloud/devapi-control/app.js",
  "cloud/devapi-control/lib/auth.mjs",
  "cloud/devapi-control/lib/db.mjs",
  "cloud/devapi-control/api/v1/commands.mjs",
  "cloud/devapi-control/api/v1/projects.mjs",
  "cloud/devapi-control/api/v1/health.mjs"
]) {
  execFileSync(process.execPath, ["--check", file], { stdio: "inherit" });
}

console.log(`API_EVOLUTION_V8_VERIFY_PASS checks=${checks} inherited=v7`);
