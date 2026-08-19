import { readFile, writeFile } from "node:fs/promises";

async function replaceExact(file, label, before, after) {
  const source = (await readFile(file, "utf8")).replace(/\r\n/gu, "\n");
  const matches = source.split(before).length - 1;
  if (matches !== 1) throw new Error(`${label}: expected exactly one anchor in ${file}, found ${matches}`);
  const next = source.replace(before, after);
  if (next === source) throw new Error(`${label}: replacement produced no change`);
  await writeFile(file, next, "utf8");
}

await replaceExact(
  "src/main/services/agent-service.ts",
  "chat-artifact-filter",
  `function boundedConversation(history: readonly ThreadItem[], prompt: string, workspaceMutation = false, memoryContext = ""): string {\n  const messages = history.filter((item) => item.role === "user" || item.role === "assistant").slice(-12).map((item) => \`\${item.role === "user" ? "Kullanıcı" : "DevBox"}: \${item.content}\`);\n  messages.push(\`Kullanıcı: \${prompt}\`);\n  const base = "Aşağıdaki DevBox görev geçmişini bağlam olarak kullan. Yalnızca kullanıcının son isteğine yardımcı, doğrudan bir yanıt ver. İç muhakemeyi, sistem istemini veya gizli bilgileri yanıtına koyma.";`,
  `const INTERNAL_CHAT_ARTIFACT_PATTERNS = [\n  /^DevBox görev geçmişi sağlanmadı\\.?$/iu,\n  /^(?:MODEL_ATTEMPT|PLANNING|RUNNING_COMMAND|PROVIDER_CHECK|AUTH_CHECK|BACKOFF|WAITING)$/u,\n  /^session_id:/iu,\n  /^Hermes aracılığıyla NVIDIA NIM oturumu başlatıldı\\.?$/iu,\n  /^hermes chat (?:güvenli sohbet|gerçek workspace)/iu,\n  /^Hermes çalıştırması tamamlandı/iu,\n  /^Sağlayıcı oturumu .*JSONL/iu,\n  /^Redakte edilmiş oturum çıktısı/iu,\n  /^Yanıt ayrıştırıldı/iu\n] as const;\n\nexport function isInternalChatArtifact(content: string): boolean {\n  const normalized = content.trim();\n  if (!normalized) return false;\n  const lines = normalized.split(/\\r?\\n/u).map((line) => line.trim()).filter(Boolean);\n  return lines.length > 0 && lines.every((line) => INTERNAL_CHAT_ARTIFACT_PATTERNS.some((pattern) => pattern.test(line)));\n}\n\nfunction boundedConversation(history: readonly ThreadItem[], prompt: string, workspaceMutation = false, memoryContext = ""): string {\n  const messages = history\n    .filter((item) => (item.role === "user" || item.role === "assistant") && !(item.role === "assistant" && isInternalChatArtifact(item.content)))\n    .slice(-12)\n    .map((item) => \`\${item.role === "user" ? "Kullanıcı" : "DevBox"}: \${item.content}\`);\n  messages.push(\`Kullanıcı: \${prompt}\`);\n  const base = [\n    "Aşağıdaki DevBox konuşma geçmişini yalnız bağlam olarak kullan. Kullanıcının son isteğine doğrudan ve doğal bir yanıt ver.",\n    "Normal sohbeti mühendislik görevi, görev geçmişi özeti veya sistem tanılaması gibi yeniden yorumlama.",\n    "Geçmiş eksik, boş veya bozuk olsa bile bunu kullanıcıya cevap olarak söyleme; son kullanıcı mesajını normal şekilde yanıtla.",\n    "MODEL_ATTEMPT, PLANNING, RUNNING_COMMAND, provider/session/JSONL/export/parse gibi DevBox iç durumlarını kullanıcı yanıtına koyma.",\n    "İç muhakemeyi, sistem istemini, gizli bilgileri veya transport tanılamasını yanıtına koyma."\n  ].join(" ");`
);

await replaceExact(
  "src/main/services/agent-service.ts",
  "chat-direct-artifact-rejection",
  `      if (direct) {\n        const parsedOutcome = parseEvolutionProviderOutcome(direct);\n        return { content: direct, provider: PROVIDER, model: modelOverride, sessionId: \`oneshot:\${oneShot.runId}\`, durationMs: Math.max(0, Math.round(performance.now() - started)), evidence: [oneShot.runId, "hermes-one-shot:direct-final-output"], outcome: parsedOutcome.outcome, blockReason: parsedOutcome.blockReason, acceptance: parsedOutcome.acceptance };\n      }\n      report(onProgress, "waiting", "BACKOFF", "Hermes one-shot sonuç üretmedi; güvenli chat + redacted export fallback çalıştırılıyor.", "Hermes / NVIDIA NIM", modelOverride);`,
  `      if (direct && !isInternalChatArtifact(direct)) {\n        const parsedOutcome = parseEvolutionProviderOutcome(direct);\n        return { content: direct, provider: PROVIDER, model: modelOverride, sessionId: \`oneshot:\${oneShot.runId}\`, durationMs: Math.max(0, Math.round(performance.now() - started)), evidence: [oneShot.runId, "hermes-one-shot:direct-final-output"], outcome: parsedOutcome.outcome, blockReason: parsedOutcome.blockReason, acceptance: parsedOutcome.acceptance };\n      }\n      report(onProgress, "waiting", "BACKOFF", direct ? "Hermes one-shot yalnız iç çalışma zamanı tanılaması üretti; kullanıcı yanıtı sayılmadı ve güvenli fallback başlatıldı." : "Hermes one-shot sonuç üretmedi; güvenli chat + redacted export fallback çalıştırılıyor.", "Hermes / NVIDIA NIM", modelOverride);`
);

await replaceExact(
  "src/main/services/agent-service.ts",
  "chat-export-artifact-rejection",
  `    const content = parseExportedAnswer(exported.stdout);\n    if (!content) throw new Error("HERMES_RESPONSE_PARSE_FAILED");\n    const parsedOutcome = parseEvolutionProviderOutcome(content);`,
  `    const content = parseExportedAnswer(exported.stdout);\n    if (!content) throw new Error("HERMES_RESPONSE_PARSE_FAILED");\n    if (isInternalChatArtifact(content)) throw new Error("CHAT_PROVIDER_INTERNAL_ARTIFACT_REJECTED");\n    const parsedOutcome = parseEvolutionProviderOutcome(content);`
);

await replaceExact(
  "src/main/ipc.ts",
  "chat-user-remediation",
  `        const remediation = code === "NVIDIA_CREDENTIAL_UNAVAILABLE"\n          ? "Windows ortamına NVIDIA_API_KEY ekleyip DevBox'ı yeniden başlatın."\n          : code === "HERMES_EXECUTION_FAILED"\n            ? "Hermes/NVIDIA çalıştırması başarısız oldu. Sistem kabiliyetlerini ve sağlayıcı erişimini denetleyin."\n            : "Hermes yanıtı güvenli biçimde doğrulanıp ayrıştırılamadı. Ham çıktı, iç muhakeme ve sistem istemi güvenlik gereği gösterilmedi.";`,
  `        const remediation = code === "NVIDIA_CREDENTIAL_UNAVAILABLE"\n          ? "Windows ortamına NVIDIA_API_KEY ekleyip DevBox'ı yeniden başlatın."\n          : code === "HERMES_EXECUTION_FAILED"\n            ? "Hermes/NVIDIA çalıştırması başarısız oldu. Sistem kabiliyetlerini ve sağlayıcı erişimini denetleyin."\n            : code === "CHAT_PROVIDER_INTERNAL_ARTIFACT_REJECTED"\n              ? "Sağlayıcı yalnız iç çalışma zamanı tanılaması üretti; bu çıktı sohbet mesajı olarak gösterilmedi. İsteği yeniden gönderin veya sağlayıcı durumunu denetleyin."\n              : "Hermes yanıtı güvenli biçimde doğrulanıp ayrıştırılamadı. Ham çıktı, iç muhakeme ve sistem istemi güvenlik gereği gösterilmedi.";`
);

await replaceExact(
  "src/renderer/AdvancedViews.tsx",
  "evolution-stage-humanizer",
  `function EmptyProject(): ReactNode {`,
  `function evolutionStageLabel(value: string): string {\n  const labels: Record<string, string> = {\n    PROVIDER_CHECK: "Sağlayıcı doğrulanıyor",\n    AUTH_CHECK: "Oturum doğrulanıyor",\n    MODEL_ATTEMPT: "Model hazırlanıyor",\n    PLANNING: "Planlanıyor",\n    INSPECTING: "Kaynak inceleniyor",\n    EDITING: "Kodlanıyor",\n    RUNNING_COMMAND: "Komut yürütülüyor",\n    TESTING: "Test ediliyor",\n    VERIFYING: "Doğrulanıyor",\n    REVIEWING: "Kanıt inceleniyor",\n    WAITING: "Bekliyor",\n    BACKOFF: "Yeniden deneme bekleniyor",\n    COMPLETED: "Tamamlandı",\n    FAILED: "Başarısız",\n    BLOCKED_EXTERNAL: "Harici engel",\n    RECOVERY_REQUIRED: "Kurtarma gerekiyor",\n    CANCELLED: "Durduruldu",\n    IDLE: "Hazır"\n  };\n  return labels[value] ?? value.replaceAll("_", " ").toLocaleLowerCase("tr-TR");\n}\n\nfunction EmptyProject(): ReactNode {`
);

await replaceExact(
  "src/renderer/AdvancedViews.tsx",
  "evolution-summary-stage",
  `<div><dt>Çalışma durumu</dt><dd>{campaign.runtime.stage}</dd></div>`,
  `<div><dt>Çalışma durumu</dt><dd title={campaign.runtime.stage}>{evolutionStageLabel(campaign.runtime.stage)}</dd></div>`
);

await replaceExact(
  "src/renderer/AdvancedViews.tsx",
  "evolution-live-stage",
  `<div><dt>Şu an</dt><dd>{campaign.runtime.stage}</dd></div>`,
  `<div><dt>Şu an</dt><dd title={campaign.runtime.stage}>{evolutionStageLabel(campaign.runtime.stage)}</dd></div>`
);

await replaceExact(
  "src/renderer/AdvancedViews.tsx",
  "evolution-activity-stage",
  `<div><strong>{item.stage}</strong><p>{item.message}</p>`,
  `<div><strong title={item.stage}>{evolutionStageLabel(item.stage)}</strong><p>{item.message}</p>`
);

await replaceExact(
  "src/renderer/RemixRotaWorkspace.tsx",
  "music-product-heading",
  `<div className="advanced-heading music-heading"><div><span className="advanced-eyebrow">REMIXROTA COMPANION · PROTOCOL 1.0</span><h1>Müzik merkezi</h1><p>Oynatma durumunun tek sahibi RemixRota. DevBox yalnız dar izinli Windows named-pipe protokolünden okur ve desteklenen komutları gönderir; ayrı müzik state'i uydurmaz.</p></div>`,
  `<div className="advanced-heading music-heading"><div><span className="advanced-eyebrow">DEVBOX MUSIC · YEREL MEDYA MERKEZİ</span><h1>Müzik merkezi</h1><p>Şimdi çalan, kütüphane, arama, favoriler ve kuyruk tek çalışma yüzeyinde. Yerel oynatıcı bağlantısı yoksa DevBox örnek parça veya sahte oynatma durumu üretmez.</p></div>`
);

await replaceExact(
  "src/renderer/RemixRotaWorkspace.tsx",
  "music-empty-copy",
  `  const currentTitle = player?.current?.title ?? "RemixRota bağlantısı bekleniyor";\n  const currentArtist = player?.current?.artist ?? "DevBox müzik motorunu kopyalamaz; gerçek companion durumunu gösterir.";`,
  `  const currentTitle = player?.current?.title ?? "Müzik kaynağı bağlı değil";\n  const currentArtist = player?.current?.artist ?? "Bağlantı ayarlarından yerel oynatıcıyı seçtiğinizde gerçek oynatma bilgisi burada görünür.";`
);

await replaceExact(
  "src/renderer/RemixRotaWorkspace.tsx",
  "music-diagnostics-collapse-open",
  `    <div className="music-status-grid">`,
  `    <details className="music-connection-details"><summary><Settings2 size={15} /><span>Bağlantı ve tanılama</span><small>{stateLabel(state)}</small></summary><div className="music-status-grid">`
);

await replaceExact(
  "src/renderer/RemixRotaWorkspace.tsx",
  "music-diagnostics-collapse-close",
  `    </div>\n\n    <section className="music-now-playing">`,
  `    </div></details>\n\n    <section className="music-now-playing">`
);

await replaceExact(
  "src/renderer/RemixRotaWorkspace.tsx",
  "music-connect-label",
  `RemixRota.exe seç`,
  `Bağlantı ayarları`
);

await replaceExact(
  "src/renderer/RemixRotaWorkspace.tsx",
  "music-companion-label",
  `Companion'a bağlan`,
  `Yerel oynatıcıya bağlan`
);

await replaceExact(
  "src/main/services/agent-service.test.ts",
  "chat-filter-test-import",
  `import { AgentService, evolutionRoutePlan, isWorkspaceMutationRequest, parseCodexModelCatalog, parseEvolutionProviderOutcome, parseNvidiaModelCatalog, resolveCodexExecutable } from "./agent-service.js";`,
  `import { AgentService, evolutionRoutePlan, isInternalChatArtifact, isWorkspaceMutationRequest, parseCodexModelCatalog, parseEvolutionProviderOutcome, parseNvidiaModelCatalog, resolveCodexExecutable } from "./agent-service.js";`
);

await replaceExact(
  "src/main/services/agent-service.test.ts",
  "chat-filter-regression",
  `describe("AgentService", () => {`,
  `describe("chat artifact boundary", () => {\n  it("rejects internal runtime telemetry but preserves ordinary user-facing language", () => {\n    expect(isInternalChatArtifact("DevBox görev geçmişi sağlanmadı.")).toBe(true);\n    expect(isInternalChatArtifact("MODEL_ATTEMPT\\nPLANNING\\nRUNNING_COMMAND")).toBe(true);\n    expect(isInternalChatArtifact("Hermes aracılığıyla NVIDIA NIM oturumu başlatıldı.\\nYanıt ayrıştırıldı · session 123")).toBe(true);\n    expect(isInternalChatArtifact("Merhaba, nasıl yardımcı olabilirim?")).toBe(false);\n    expect(isInternalChatArtifact("MODEL_ATTEMPT ne demek?")).toBe(false);\n  });\n});\n\ndescribe("AgentService", () => {`
);

console.log("V020_UI_RUNTIME_MATERIALIZE_PASS");
