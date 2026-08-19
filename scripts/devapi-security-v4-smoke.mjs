import { createHash, randomUUID } from "node:crypto";
import { mkdir, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { LocalWorkerWorkspace } from "../cloud/devapi-control/worker/workspace.mjs";

function assert(condition, code) { if (!condition) throw new Error(code); }
function digest(value) { return createHash("sha256").update(String(value ?? "")).digest("hex"); }
async function expectDenied(name, expectedPrefixes, fn) {
  try {
    await fn();
    throw new Error(`SECURITY_V5_NOT_DENIED:${name}`);
  } catch (error) {
    const message = String(error?.message || error);
    if (message.startsWith("SECURITY_V5_NOT_DENIED:")) throw error;
    const matched = expectedPrefixes.some((prefix) => message.startsWith(prefix));
    if (!matched) throw new Error(`SECURITY_V5_WRONG_DENIAL:${name}:${message}`);
    return { name, denied: true, code: message.split(":")[0], reason: message.split(":").at(-1) };
  }
}

const approval = { approvalId: randomUUID(), riskClass: "R2", approved: true, actor: "ci-security-v5" };
const workspace = await LocalWorkerWorkspace.create({ approval });
const output = path.resolve("outputs/devapi-security-v4-smoke.json");
let evidence;
try {
  await mkdir(path.join(workspace.root, "repo"), { recursive: true });
  const commandCases = [];
  commandCases.push(await expectDenied("git-push", ["WORKSPACE_COMMAND_SUBCOMMAND_DENIED:git:push:GIT_REMOTE_WRITE"], () => workspace.exec("git", ["push"], { cwd: "repo" })));
  commandCases.push(await expectDenied("git-remote-add", ["WORKSPACE_COMMAND_SUBCOMMAND_DENIED:git:remote:GIT_REMOTE_WRITE"], () => workspace.exec("git", ["remote", "add", "origin", "https://example.invalid/x"], { cwd: "repo" })));
  commandCases.push(await expectDenied("git-credential-helper", ["WORKSPACE_COMMAND_SUBCOMMAND_DENIED:git:config:UNKNOWN_SUBCOMMAND"], () => workspace.exec("git", ["config", "credential.helper", "store"], { cwd: "repo" })));
  commandCases.push(await expectDenied("npm-publish", ["WORKSPACE_COMMAND_SUBCOMMAND_DENIED:npm:publish:PACKAGE_PUBLISH"], () => workspace.exec("npm", ["publish"], { cwd: "repo" })));
  commandCases.push(await expectDenied("curl", ["WORKSPACE_COMMAND_SUBCOMMAND_DENIED:curl:https://example.invalid:NETWORK_UNRESTRICTED"], () => workspace.exec("curl", ["https://example.invalid"], { cwd: "repo" })));
  commandCases.push(await expectDenied("wget", ["WORKSPACE_COMMAND_SUBCOMMAND_DENIED:wget:https://example.invalid:NETWORK_UNRESTRICTED"], () => workspace.exec("wget", ["https://example.invalid"], { cwd: "repo" })));
  commandCases.push(await expectDenied("powershell-network", ["WORKSPACE_COMMAND_SUBCOMMAND_DENIED:powershell:-Command:SYSTEM_MUTATION"], () => workspace.exec("powershell", ["-Command", "Invoke-WebRequest https://example.invalid"], { cwd: "repo" })));
  commandCases.push(await expectDenied("cmd-shell", ["WORKSPACE_COMMAND_SUBCOMMAND_DENIED:cmd:/c:SYSTEM_MUTATION"], () => workspace.exec("cmd", ["/c", "echo", "x"], { cwd: "repo" })));
  commandCases.push(await expectDenied("node-eval", ["WORKSPACE_COMMAND_SUBCOMMAND_DENIED:node:-e:UNKNOWN_SUBCOMMAND"], () => workspace.exec("node", ["-e", "console.log(1)"], { cwd: "repo" })));
  commandCases.push(await expectDenied("newline-subcommand", ["WORKSPACE_ARG_INVALID"], () => workspace.exec("git", ["status\npush"], { cwd: "repo" })));

  const pathCases = [];
  pathCases.push(await expectDenied("parent-traversal", ["WORKSPACE_PATH_ESCAPE"], () => workspace.writeText("../escape.txt", "x")));
  pathCases.push(await expectDenied("absolute-posix", ["WORKSPACE_PATH_ABSOLUTE_DENIED"], () => workspace.writeText("/tmp/escape.txt", "x")));
  pathCases.push(await expectDenied("absolute-windows-drive", ["WORKSPACE_PATH_ABSOLUTE_DENIED"], () => workspace.writeText("C:\\temp\\escape.txt", "x")));
  pathCases.push(await expectDenied("unc-path", ["WORKSPACE_PATH_ABSOLUTE_DENIED"], () => workspace.writeText("\\\\server\\share\\escape.txt", "x")));

  const literalEncoded = "repo/%2e%2e/encoded-literal.txt";
  const encodedWrite = await workspace.writeText(literalEncoded, "encoded traversal remains a literal filename segment");
  const encodedRead = await workspace.readText(literalEncoded);
  assert(encodedRead.content.includes("literal filename segment"), "SECURITY_V5_ENCODED_LITERAL_NOT_CONTAINED");
  assert(encodedWrite.afterSha256 === encodedRead.sha256, "SECURITY_V5_ENCODED_LITERAL_READBACK");

  const outside = os.tmpdir();
  const link = path.join(workspace.root, "repo", "escape-link");
  await symlink(outside, link, "dir");
  pathCases.push(await expectDenied("symlink-escape", ["WORKSPACE_SYMLINK_ESCAPE"], () => workspace.writeText("repo/escape-link/devapi-pwned.txt", "x")));

  const fakeKey = `sk-${"A".repeat(28)}`;
  const redactionFile = path.join(workspace.root, "repo", "redaction-probe.mjs");
  await writeFile(redactionFile, `const leak = "${fakeKey}"; const = ;\n`, "utf8");
  const redaction = await workspace.exec("node", ["--check", "redaction-probe.mjs"], { cwd: "repo" });
  assert(redaction.exitCode !== 0, "SECURITY_V5_REDACTION_FIXTURE_MUST_FAIL_PARSE");
  assert(!redaction.stderr.includes(fakeKey) && !redaction.stdout.includes(fakeKey), "SECURITY_V5_SECRET_OUTPUT_LEAK");
  const redactionMarkerPresent = redaction.stderr.includes("[REDACTED_OPENAI_KEY]") || redaction.stdout.includes("[REDACTED_OPENAI_KEY]");
  assert(redactionMarkerPresent, "SECURITY_V5_SECRET_REDACTION_MARKER_MISSING");
  assert(redaction.policyVersion === 3 && redaction.networkAllowed === false, "SECURITY_V5_POLICY_EVIDENCE_MISSING");

  evidence = {
    schemaVersion: 2,
    type: "WORKER_SECURITY_V5",
    approvalId: approval.approvalId,
    commandCases,
    pathCases,
    shellPolicy: { version: 3, shell: false, networkDefault: false, workspaceWriteScope: true },
    encodedTraversalLiteral: {
      path: literalEncoded,
      containedInsideWorkspace: true,
      decodedByWorker: false,
      note: "The worker treats percent-encoding as literal filesystem text; URL decoding belongs at the HTTP boundary."
    },
    outputRedaction: {
      verified: true,
      markerPresent: redactionMarkerPresent,
      rawSecretPresent: false
    },
    truth: {
      state: "RUNTIME_VERIFIED",
      appliesTo: ["workspace-path-containment", "shell-policy-v3", "git-write-denial", "network-tool-denial", "secret-output-redaction"],
      doesNotApplyTo: ["production-host-kernel-sandbox", "distributed-worker-network-policy"]
    },
    completedAt: new Date().toISOString()
  };
  evidence.digest = digest(JSON.stringify(evidence));
} finally {
  await workspace.destroy();
}
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
console.log(`DEVAPI_SECURITY_V5_SMOKE_PASS commands=${evidence.commandCases.length} paths=${evidence.pathCases.length} shellPolicy=v3 redaction=${evidence.outputRedaction.verified} encodedLiteralContained=${evidence.encodedTraversalLiteral.containedInsideWorkspace}`);
