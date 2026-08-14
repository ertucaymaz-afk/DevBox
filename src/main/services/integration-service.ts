import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { CommandResult, IntegrationStatus } from "../../shared/contracts.js";
import type { CommandRunner } from "./command-runner.js";
import type { PackageLifecycleService } from "./package-lifecycle-service.js";
import type { SshTrustService } from "./ssh-trust-service.js";
import { BUILTIN_JAVASCRIPT_DEBUG_ADAPTER, builtInJavaScriptAdapterFiles } from "./language-debug-service.js";

function firstLine(value: string): string | null {
  return value.split(/\r?\n/u).map((line) => line.trim()).find(Boolean) ?? null;
}

function versionFrom(value: string): string | null {
  return /\d+(?:\.\d+){1,3}(?:[-+][\w.-]+)?/u.exec(value)?.[0] ?? null;
}

type Invocation = { executable: string; args: string[] };
type VercelLink = { projectId: string; orgId: string };

async function readVercelLink(cwd: string): Promise<VercelLink | null> {
  try {
    const raw = JSON.parse(await readFile(path.join(cwd, ".vercel", "project.json"), "utf8")) as Record<string, unknown>;
    if (typeof raw.projectId !== "string" || !raw.projectId || typeof raw.orgId !== "string" || !raw.orgId) return null;
    return { projectId: raw.projectId, orgId: raw.orgId };
  } catch {
    return null;
  }
}

function vercelInvocation(args: string[]): Invocation {
  if (process.platform !== "win32") return { executable: "vercel", args };

  // npm's Windows shim is a PowerShell script on this machine. Passing a .cmd
  // shim to spawn({ shell: false }) is unreliable and enabling a shell would
  // turn user-provided deployment identifiers into a command-injection surface.
  const appData = process.env.APPDATA;
  const vercelScript = appData ? path.join(appData, "npm", "vercel.ps1") : "";
  if (vercelScript && existsSync(vercelScript)) {
    const pwsh = process.env.ProgramFiles
      ? path.join(process.env.ProgramFiles, "PowerShell", "7", "pwsh.exe")
      : "";
    const powerShell = pwsh && existsSync(pwsh)
      ? pwsh
      : path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
    return {
      executable: powerShell,
      args: ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", vercelScript, ...args]
    };
  }

  return { executable: "vercel", args };
}

export class IntegrationService {
  readonly #runner: CommandRunner;
  readonly #packages: PackageLifecycleService | null;
  readonly #sshTrust: SshTrustService | null;

  public constructor(runner: CommandRunner, packages: PackageLifecycleService | null = null, sshTrust: SshTrustService | null = null) {
    this.#runner = runner;
    this.#packages = packages;
    this.#sshTrust = sshTrust;
  }

  public async inspect(cwd: string): Promise<IntegrationStatus[]> {
    const checkedAt = new Date().toISOString();
    const vercelVersionInvocation = vercelInvocation(["--version"]);
    const vercelAccountInvocation = vercelInvocation(["whoami"]);
    const [ghVersion, ghAuth, ghRepository, vercelVersion, vercelAccount, vercelLink, sshVersion, signTool, signingCertificate, protocols, packageStatus, hostPins] = await Promise.all([
      this.#run("gh", ["--version"], cwd),
      this.#run("gh", ["auth", "status"], cwd),
      this.#run("gh", ["repo", "view", "--json", "nameWithOwner"], cwd),
      this.#run(vercelVersionInvocation.executable, vercelVersionInvocation.args, cwd),
      this.#run(vercelAccountInvocation.executable, vercelAccountInvocation.args, cwd),
      readVercelLink(cwd),
      this.#run("ssh", ["-V"], cwd),
      this.#run("signtool.exe", ["/?"], cwd),
      this.#run("pwsh", ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", "$eku='1.3.6.1.5.5.7.3.3'; $cert=Get-ChildItem Cert:\\CurrentUser\\My,Cert:\\LocalMachine\\My -CodeSigningCert -ErrorAction SilentlyContinue | Where-Object { $_.HasPrivateKey -and $_.NotAfter -gt (Get-Date) -and $_.EnhancedKeyUsageList.ObjectId.Value -contains $eku } | Select-Object -First 1; if ($null -eq $cert) { exit 3 }; Write-Output ($cert.Thumbprint + '|' + $cert.Subject + '|' + $cert.NotAfter.ToString('O'))"], cwd),
      this.discover(cwd),
      this.#packages?.status() ?? Promise.resolve(null),
      this.#sshTrust?.list().catch(() => []) ?? Promise.resolve([])
    ]);
    const ghAccount = /account\s+([^\s]+)/iu.exec(`${ghAuth.stdout}\n${ghAuth.stderr}`)?.[1] ?? null;
    const ghInstalled = ghVersion.exitCode === 0;
    const ghAuthenticated = ghAuth.exitCode === 0;
    const ghRepositoryReady = ghAuthenticated && ghRepository.exitCode === 0;
    const vercelInstalled = vercelVersion.exitCode === 0;
    const vercelAuthenticated = vercelAccount.exitCode === 0;
    const vercelProjectReady = vercelAuthenticated && vercelLink !== null;
    const sshInstalled = sshVersion.exitCode === 0;
    return [
      {
        kind: "github",
        state: ghRepositoryReady ? "READY" : ghAuthenticated ? "CONFIGURED" : ghInstalled ? "DEGRADED" : "UNAVAILABLE",
        version: versionFrom(`${ghVersion.stdout}\n${ghVersion.stderr}`),
        account: ghAuthenticated ? ghAccount : null,
        detail: ghRepositoryReady
          ? "GitHub CLI kimliği ve seçili yerel deponun uzak repository bağlamı canlı komutla doğrulandı; mutasyonlar profil onayına bağlıdır."
          : ghAuthenticated
            ? "GitHub hesabı doğrulandı ancak seçili kökte gh repo view başarılı olmadı; proje bağlantısı READY değildir."
            : firstLine(ghAuth.stderr) ?? "GitHub CLI veya kimliği doğrulanmış oturum kullanılamıyor.",
        commands: ["pr-list/create/merge", "issue-list/create", "checks", "run-list/log/rerun", "release-list/create"],
        checkedAt
      },
      {
        kind: "vercel",
        state: vercelProjectReady ? "READY" : vercelAuthenticated ? "CONFIGURED" : vercelInstalled ? "DEGRADED" : "UNAVAILABLE",
        version: versionFrom(`${vercelVersion.stdout}\n${vercelVersion.stderr}`),
        account: vercelAuthenticated ? firstLine(vercelAccount.stdout) : null,
        detail: vercelProjectReady
          ? "Vercel hesabı ve seçili kökteki doğrulanmış .vercel/project.json proje/organizasyon kimlikleri hazır; dağıtım mutasyonları profil onayına bağlıdır."
          : vercelAuthenticated
            ? "Vercel hesabı doğrulandı ancak seçili proje kökü henüz gerçek bir Vercel proje kimliğine bağlı değil; READY değildir."
            : firstLine(vercelAccount.stderr) ?? "Vercel CLI veya kimliği doğrulanmış oturum kullanılamıyor.",
        commands: ["link", "preview", "production", "inspect", "logs", "rollback"],
        checkedAt
      },
      {
        kind: "ssh",
        state: sshInstalled ? (hostPins.length > 0 ? "CONFIGURED" : "INSTALLED") : "UNAVAILABLE",
        version: versionFrom(`${sshVersion.stdout}\n${sshVersion.stderr}`),
        account: null,
        detail: sshInstalled
          ? `OpenSSH sürüm yanıtı doğrulandı; uygulamaya özel known_hosts deposunda ${hostPins.length} sabitlenmiş sunucu var. Uzak worker bağlantısı canlı doğrulanmadığı için READY değildir.`
          : firstLine(sshVersion.stderr) ?? "OpenSSH kullanılamıyor.",
        commands: ["host-key-pin", "strict-known-hosts-audit"],
        checkedAt
      },
      { kind: "lsp", state: protocols.lsp.length ? "CONFIGURED" : "UNAVAILABLE", version: "3.17", account: null, detail: protocols.lsp.length ? `Dil sunucusu yürütülebilirleri keşfedildi: ${protocols.lsp.join(", ")}. Bu oturumda initialize/diagnostics alışverişi çalıştırılmadığı için READY değildir.` : "PATH veya seçili projenin node_modules/.bin dizininde desteklenen dil sunucusu bulunamadı.", commands: ["discover"], checkedAt },
      { kind: "dap", state: protocols.dap.length ? "CONFIGURED" : "UNAVAILABLE", version: "1.71", account: null, detail: protocols.dap.length ? `Debug adaptörü yürütülebilirleri keşfedildi: ${protocols.dap.join(", ")}. Bu oturumda initialize/launch/attach kanıtı olmadığı için READY değildir.` : "PATH veya seçili projenin node_modules/.bin dizininde desteklenen debug adaptörü bulunamadı.", commands: ["discover"], checkedAt },
      { kind: "marketplace", state: packageStatus?.auditIntegrity === "FAILED" || packageStatus?.revocations.state === "INVALID" || packageStatus?.revocations.state === "EXPIRED" ? "DEGRADED" : packageStatus && packageStatus.managedCatalogPublishers > 0 && packageStatus.managedCatalogPackages > 0 && packageStatus.revocations.state === "CURRENT" ? "READY" : this.#packages ? "CONFIGURED" : "UNAVAILABLE", version: "1", account: null, detail: packageStatus ? `İmzalı paket yaşam döngüsü bağlı: ${packageStatus.localSideloadPackages} yerel sideload, ${packageStatus.managedCatalogPackages} yönetilen katalog paketi; hash-zincirli yerel audit: ${packageStatus.auditIntegrity} (${packageStatus.auditEvents} olay); Ed25519 iptal listesi: ${packageStatus.revocations.state} (sıra ${packageStatus.revocations.sequence}, ${packageStatus.revocations.entries} kayıt). Yerel key/paket varlığı marketplace READY sayılmaz; READY yalnız doğrulanmış yönetilen katalog güven kökü, etkin katalog paketi ve güncel imzalı iptal listesiyle verilir.` : "Paket yaşam döngüsü deposu bağlanmadı.", commands: ["verify", "install", "inventory", "repair", "rollback", "revocation-verify"], checkedAt },
      { kind: "updater", state: "BLOCKED", version: "1", account: null, detail: packageStatus ? `İmzalı update staging/verify/repair/rollback host'u hazır (${packageStatus.activeUpdates} staged); güvenilir yayın kanalı ve Authenticode sertifikası olmadan çalışan EXE otomatik değiştirilmez.` : "İmzalı manifest doğrulayıcısı var; güvenilir yayın kanalı ve Authenticode sertifikası gerekir.", commands: ["stage", "verify", "repair", "rollback", "channel-required", "certificate-required"], checkedAt },
      { kind: "signing", state: signTool.exitCode !== 0 ? "UNAVAILABLE" : signingCertificate.exitCode === 0 ? "READY" : "BLOCKED", version: versionFrom(`${signTool.stdout}\n${signTool.stderr}`), account: null, detail: signTool.exitCode !== 0 ? "Windows SDK SignTool bulunamadı." : signingCertificate.exitCode === 0 ? `Geçerli kod imzalama EKU'suna ve kullanılabilir özel anahtara sahip sertifika bulundu: ${firstLine(signingCertificate.stdout) ?? "kimlik okunamadı"}.` : "SignTool bulundu ancak CurrentUser/LocalMachine My depolarında geçerli code-signing EKU'su ve kullanılabilir özel anahtarı olan gerçek yayın sertifikası yok.", commands: ["preflight", "sign", "verify"], checkedAt }
    ];
  }

  public async discover(cwd: string): Promise<{ lsp: string[]; dap: string[] }> {
    const lspCandidates = ["typescript-language-server", "vscode-json-languageserver", "pyright-langserver", "clangd", "rust-analyzer", "gopls", "jdtls"];
    const dapCandidates = ["js-debug-adapter", "debugpy-adapter", "netcoredbg", "codelldb", "OpenDebugAD7"];
    const locate = async (candidate: string): Promise<string | null> => {
      const localBin = path.join(cwd, "node_modules", ".bin", process.platform === "win32" ? `${candidate}.cmd` : candidate);
      if (existsSync(localBin)) return `${candidate} (project)`;
      const result = await this.#run(process.platform === "win32" ? "where.exe" : "which", [candidate], cwd, 5_000, 32 * 1024);
      return result.exitCode === 0 ? candidate : null;
    };
    const [lsp, dap] = await Promise.all([
      Promise.all(lspCandidates.map(locate)),
      Promise.all(dapCandidates.map(locate))
    ]);
    let builtInJavaScript: string | null = null;
    try {
      const files = builtInJavaScriptAdapterFiles();
      if (existsSync(files.proxy) && existsSync(files.server)) builtInJavaScript = `${BUILTIN_JAVASCRIPT_DEBUG_ADAPTER} (Microsoft vscode-js-debug 1.117.0, paketli)`;
    } catch {
      builtInJavaScript = null;
    }
    return {
      lsp: lsp.filter((item): item is string => item !== null),
      dap: [...(builtInJavaScript ? [builtInJavaScript] : []), ...dap.filter((item): item is string => item !== null)]
    };
  }

  public async github(cwd: string, action: "pr-list" | "pr-create" | "pr-merge" | "issue-list" | "issue-create" | "checks" | "run-list" | "run-log" | "run-rerun" | "release-list" | "release-create", target: string): Promise<CommandResult> {
    if (["pr-create", "pr-merge", "issue-create", "run-rerun", "release-create"].includes(action) && !target) throw new Error("GITHUB_TARGET_REQUIRED");
    if (["pr-create", "issue-create"].includes(action) && /[\r\n]/u.test(target)) throw new Error("GITHUB_TITLE_INVALID");
    if (["pr-merge", "run-log", "run-rerun"].includes(action) && !/^\d+$/u.test(target)) throw new Error("GITHUB_NUMERIC_TARGET_REQUIRED");
    if (action === "release-create" && !/^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$/u.test(target)) throw new Error("GITHUB_TAG_INVALID");
    const args: Record<typeof action, string[]> = {
      "pr-list": ["pr", "list", "--limit", "30", "--json", "number,title,state,author,headRefName,updatedAt"],
      "pr-create": ["pr", "create", "--title", target, "--fill"],
      "pr-merge": ["pr", "merge", target, "--merge", "--delete-branch"],
      "issue-list": ["issue", "list", "--limit", "30", "--json", "number,title,state,author,updatedAt"],
      "issue-create": ["issue", "create", "--title", target, "--body", ""],
      checks: ["pr", "checks", ...(target ? [target] : [])],
      "run-list": ["run", "list", "--limit", "30", "--json", "databaseId,name,status,conclusion,workflowName,createdAt"],
      "run-log": ["run", "view", target, "--log"],
      "run-rerun": ["run", "rerun", target, "--failed"],
      "release-list": ["release", "list", "--limit", "30"],
      "release-create": ["release", "create", target, "--generate-notes"]
    };
    return await this.#run("gh", args[action], cwd, 60_000, 4 * 1_048_576);
  }

  public async vercel(cwd: string, action: "link" | "preview" | "production" | "inspect" | "logs" | "rollback", target: string): Promise<CommandResult> {
    const args: Record<typeof action, string[]> = {
      link: ["link", "--yes", ...(target ? ["--project", target] : [])],
      preview: ["deploy", "--yes"],
      production: ["deploy", "--prod", "--yes"],
      inspect: ["inspect", target],
      logs: ["logs", target, "--since", "1h"],
      rollback: ["rollback", target, "--yes"]
    };
    if (["inspect", "logs", "rollback"].includes(action) && !target) throw new Error("VERCEL_TARGET_REQUIRED");
    const invocation = vercelInvocation(args[action]);
    return await this.#run(invocation.executable, invocation.args, cwd, ["preview", "production"].includes(action) ? 10 * 60_000 : 120_000, 8 * 1_048_576);
  }

  async #run(executable: string, args: string[], cwd: string, timeoutMs = 20_000, maxOutputBytes = 512 * 1024): Promise<CommandResult> {
    return await this.#runner.run({ executable, args, cwd, timeoutMs, maxOutputBytes });
  }
}
