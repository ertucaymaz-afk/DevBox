import path from "node:path";
import type { Capability } from "../../shared/contracts.js";
import { resolveHermesExecutable } from "./agent-service.js";
import type { CommandRunner } from "./command-runner.js";
import { describeCredential, discoverNvidiaCredential } from "./environment-discovery.js";

type Probe = { id: string; displayName: string; executable: string; args: readonly string[] };

const BASE_PROBES: readonly Probe[] = [
  { id: "git", displayName: "Git", executable: "git", args: ["--version"] },
  { id: "node", displayName: "Node.js", executable: "node", args: ["--version"] },
  { id: "pnpm", displayName: "pnpm", executable: "pnpm", args: ["--version"] },
  { id: "pwsh", displayName: "PowerShell", executable: "pwsh", args: ["--version"] },
  { id: "dotnet", displayName: ".NET SDK", executable: "dotnet", args: ["--version"] }
];
const NVIDIA_MODEL = "nvidia/nemotron-3-super-120b-a12b";

function vercelCommand(args: readonly string[]): { executable: string; args: readonly string[] } {
  if (process.platform === "win32" && process.env.APPDATA) {
    const entrypoint = path.join(process.env.APPDATA, "npm", "node_modules", "vercel", "dist", "index.js");
    return { executable: "node", args: [entrypoint, ...args] };
  }
  return { executable: "vercel", args };
}

export class CapabilityService {
  readonly #runner: CommandRunner;
  #nvidiaProbe: Promise<Capability> | null = null;

  public constructor(runner: CommandRunner) {
    this.#runner = runner;
  }

  async #probeExecutable(probe: Probe, cwd: string): Promise<Capability> {
    const result = await this.#runner.run({ executable: probe.executable, args: probe.args, cwd, timeoutMs: 8_000, maxOutputBytes: 32 * 1024 });
    const installed = result.exitCode === 0;
    const identity = (result.stdout.trim() || result.stderr.trim()).split(/\r?\n/u)[0]?.slice(0, 200) ?? null;
    return {
      id: probe.id,
      displayName: probe.displayName,
      state: installed ? "INSTALLED" : "UNAVAILABLE",
      version: installed ? identity : null,
      checkedAt: result.endedAt,
      detail: installed ? "Çalıştırılabilir dosya kimliği ve sürüm yanıtı doğrulandı." : "Çalıştırılabilir dosya bulunamadı veya sürüm sorgusuna başarıyla yanıt vermedi.",
      remediation: installed ? null : `${probe.displayName} doğrulanmış upstream kaynağından kurulmalı ve tanılama yeniden çalıştırılmalı.`,
      evidence: [result.runId]
    };
  }

  async #probeNvidia(): Promise<Capability> {
    const credential = discoverNvidiaCredential();
    const checkedAt = new Date().toISOString();
    if (!credential) {
      return {
        id: "nvidia-nim",
        displayName: "NVIDIA NIM",
        state: "UNAVAILABLE",
        version: null,
        checkedAt,
        detail: "NVIDIA kimlik bilgisi süreç ortamında bulunamadı; renderer'a herhangi bir ortam değişkeni aktarılmadı.",
        remediation: "Windows ortamına NVIDIA_API_KEY ekleyip DevBox'ı yeniden başlatın.",
        evidence: []
      };
    }
    const started = performance.now();
    try {
      const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
        method: "POST",
        headers: { "authorization": `Bearer ${credential.value}`, "content-type": "application/json" },
        body: JSON.stringify({
          model: NVIDIA_MODEL,
          messages: [{ role: "user", content: "Reply with OK." }],
          max_tokens: 1,
          temperature: 0
        }),
        signal: AbortSignal.timeout(20_000)
      });
      const durationMs = Math.max(0, Math.round(performance.now() - started));
      if (!response.ok) {
        return {
          id: "nvidia-nim",
          displayName: "NVIDIA NIM",
          state: "DEGRADED",
          version: NVIDIA_MODEL,
          checkedAt: new Date().toISOString(),
          detail: `${describeCredential(credential)} Canlı çıkarım HTTP ${response.status} ile reddedildi; gövde güvenlik nedeniyle okunmadı.`,
          remediation: "Anahtarın NVIDIA NIM erişimini, kotayı ve seçili model yetkisini doğrulayın.",
          evidence: [`live-inference:http-${response.status}:${durationMs}ms`]
        };
      }
      await response.arrayBuffer();
      return {
        id: "nvidia-nim",
        displayName: "NVIDIA NIM",
        state: "READY",
        version: NVIDIA_MODEL,
        checkedAt: new Date().toISOString(),
        detail: `${describeCredential(credential)} Bir tokenlık minimum canlı model çıkarımı ${durationMs} ms içinde başarıyla tamamlandı; yanıt içeriği ve anahtar renderer'a aktarılmadı.`,
        remediation: null,
        evidence: [`live-inference:success:${durationMs}ms`]
      };
    } catch (error) {
      const reason = error instanceof Error && error.name === "TimeoutError" ? "zaman aşımı" : "ağ/sağlayıcı hatası";
      return {
        id: "nvidia-nim",
        displayName: "NVIDIA NIM",
        state: "DEGRADED",
        version: NVIDIA_MODEL,
        checkedAt: new Date().toISOString(),
        detail: `${describeCredential(credential)} Minimum canlı çıkarım ${reason} nedeniyle tamamlanamadı.`,
        remediation: "Ağ erişimini ve NVIDIA sağlayıcı durumunu kontrol edip yeniden deneyin.",
        evidence: [`live-inference:${reason.replaceAll("/", "-")}`]
      };
    }
  }

  public async inspect(cwd: string): Promise<Capability[]> {
    const vercelVersion = vercelCommand(["--version"]);
    const executableProbes: Probe[] = [
      ...BASE_PROBES,
      { id: "hermes", displayName: "Hermes Agent", executable: resolveHermesExecutable(), args: ["--version"] },
      { id: "vercel-cli", displayName: "Vercel CLI", ...vercelVersion }
    ];
    const capabilities = await Promise.all(executableProbes.map(async (probe) => await this.#probeExecutable(probe, cwd)));
    this.#nvidiaProbe ??= this.#probeNvidia();
    capabilities.push(await this.#nvidiaProbe);

    const vercel = capabilities.find((item) => item.id === "vercel-cli");
    if (vercel?.state === "INSTALLED") {
      const whoami = vercelCommand(["whoami"]);
      const auth = await this.#runner.run({ ...whoami, cwd, timeoutMs: 10_000, maxOutputBytes: 16 * 1024 });
      const authenticated = auth.exitCode === 0 && Boolean(auth.stdout.trim());
      capabilities.push({
        id: "vercel-account",
        displayName: "Vercel Hesabı",
        state: authenticated ? "CONFIGURED" : "UNAVAILABLE",
        version: null,
        checkedAt: auth.endedAt,
        detail: authenticated ? "Vercel CLI kimlik doğrulaması başarıyla doğrulandı. Hesap adı gizlilik için arayüze aktarılmadı; henüz proje/team/root seçilmedi ve dağıtım yapılmadı." : "Vercel CLI kurulu ancak kimliği doğrulanmış bir oturum bulunamadı.",
        remediation: authenticated ? "Bir dağıtımdan önce hedef proje, takım ve kök dizin açıkça seçilip yeniden doğrulanmalı." : "Terminalde vercel login çalıştırın ve kimlik doğrulamasını tamamlayın.",
        evidence: [auth.runId]
      });
    }

    const hermes = capabilities.find((item) => item.id === "hermes");
    const nvidia = capabilities.find((item) => item.id === "nvidia-nim");
    capabilities.push({
      id: "hermes-nvidia-agent",
      displayName: "Hermes + NVIDIA Ajan Yolu",
      state: hermes?.state === "INSTALLED" && nvidia?.state === "READY" ? "READY" : nvidia?.state === "CONFIGURED" ? "CONFIGURED" : "DEGRADED",
      version: hermes?.version ?? null,
      checkedAt: new Date().toISOString(),
      detail: hermes?.state === "INSTALLED" && nvidia?.state === "READY"
        ? "Hermes çalıştırıcısı ve NVIDIA canlı çıkarımı doğrulandı. DevBox yalnızca son assistant içeriğini kırpılmış geçmişe ekler; ham Hermes çıktısı, sistem istemi ve muhakeme renderer'a geçmez."
        : "Hermes çalıştırıcısı ile NVIDIA canlı sağlayıcı kanıtı birlikte READY değil.",
      remediation: hermes?.state === "INSTALLED" && nvidia?.state === "READY" ? null : "Hermes ve NVIDIA NIM kabiliyetlerindeki düzeltme adımlarını tamamlayın.",
      evidence: [...(hermes?.evidence ?? []), ...(nvidia?.evidence ?? [])]
    });
    return capabilities;
  }
}
