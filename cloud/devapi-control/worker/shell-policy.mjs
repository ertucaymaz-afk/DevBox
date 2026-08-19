import { createHash } from "node:crypto";

const READ_ONLY_GIT = new Set(["status", "diff", "grep", "rev-parse", "log", "show"]);
const SAFE_SCRIPTS = new Set(["test", "typecheck", "cloud:verify", "source:hygiene", "truth:audit", "evolution:verify"]);
const NETWORK_BINARIES = new Set(["curl", "wget", "ssh", "scp", "ftp", "telnet"]);
const DESTRUCTIVE_BINARIES = new Set(["rm", "rmdir", "del", "erase", "format", "mkfs"]);
const SYSTEM_MUTATION = new Set(["apt", "apt-get", "yum", "dnf", "brew", "winget", "choco", "powershell", "pwsh", "cmd"]);

const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

function clean(value) {
  const text = String(value ?? "");
  if (!text || text.length > 2_000 || text.includes("\0") || /[\r\n]/u.test(text)) throw new Error("SHELL_POLICY_ARGUMENT_INVALID");
  return text;
}

function deny(reasonCode, executable, argv) {
  const policy = { policyVersion: 3, decision: "DENY", reasonCode, executable, argv, riskClass: "R2", network: false, writeScope: "workspace-only", requiresApproval: true };
  return Object.freeze({ ...policy, policyDigest: hash(policy) });
}

function allow(matchedRule, executable, argv, { idempotent = true, timeoutMs = 60_000, maxOutputBytes = 512 * 1024 } = {}) {
  const policy = { policyVersion: 3, decision: "ALLOW", reasonCode: "POLICY_MATCH", matchedRule, executable, argv, riskClass: "R2", network: false, writeScope: "workspace-only", timeoutMs, maxOutputBytes, idempotent, requiresApproval: true };
  return Object.freeze({ ...policy, policyDigest: hash(policy) });
}

export function evaluateShellPolicy(command, args = []) {
  const executable = clean(command).toLowerCase();
  const argv = Array.isArray(args) ? args.map(clean) : [];

  if (NETWORK_BINARIES.has(executable)) return deny("NETWORK_UNRESTRICTED", executable, argv);
  if (DESTRUCTIVE_BINARIES.has(executable)) return deny("DESTRUCTIVE_FS", executable, argv);
  if (SYSTEM_MUTATION.has(executable)) return deny("SYSTEM_MUTATION", executable, argv);

  if (executable === "git") {
    const subcommand = argv[0] || "";
    if (!READ_ONLY_GIT.has(subcommand)) return deny(subcommand === "push" || subcommand === "remote" ? "GIT_REMOTE_WRITE" : "UNKNOWN_SUBCOMMAND", executable, argv);
    if (argv.some((arg) => /credential|http\.|url\.|core\.hooksPath/iu.test(arg))) return deny("CREDENTIAL_COMMAND", executable, argv);
    return allow(`git:${subcommand}`, executable, argv);
  }

  if (executable === "node") {
    if (argv[0] !== "--check" || !/\.(?:mjs|cjs|js)$/u.test(argv[1] || "")) return deny("UNKNOWN_SUBCOMMAND", executable, argv);
    return allow("node:check", executable, argv);
  }

  if (executable === "npm" || executable === "pnpm") {
    if (argv[0] === "publish" || argv[0] === "install" || argv[0] === "add") return deny(argv[0] === "publish" ? "PACKAGE_PUBLISH" : "PACKAGE_MUTATION", executable, argv);
    const script = argv[0] === "run" ? argv[1] : argv[0];
    if (!SAFE_SCRIPTS.has(script)) return deny("UNKNOWN_SUBCOMMAND", executable, argv);
    return allow(`${executable}:${script}`, executable, argv);
  }

  return deny("UNKNOWN_EXECUTABLE", executable, argv);
}

export function assertShellPolicy(command, args = []) {
  const result = evaluateShellPolicy(command, args);
  if (result.decision !== "ALLOW") {
    const suffix = result.executable ? `:${result.executable}:${result.argv?.[0] || "missing"}` : "";
    throw new Error(`WORKSPACE_COMMAND_SUBCOMMAND_DENIED${suffix}:${result.reasonCode}`);
  }
  return result;
}
