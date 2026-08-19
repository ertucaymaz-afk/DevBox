import { writeFileSync } from "node:fs";
import path from "node:path";
import type { CommandResult } from "../../shared/contracts.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentService, evolutionRoutePlan, isInternalChatArtifact, isWorkspaceMutationRequest, parseCodexModelCatalog, parseEvolutionProviderOutcome, parseNvidiaModelCatalog, resolveCodexExecutable } from "./agent-service.js";
import type { CommandRunner } from "./command-runner.js";

function result(runId: string, stdout: string): CommandResult {
  const now = new Date().toISOString();
  return {
    runId,
    commandDisplay: "redacted-test-command",
    cwd: "C:\\project",
    exitCode: 0,
    signal: null,
    stdout,
    stderr: "",
    startedAt: now,
    endedAt: now,
    durationMs: 1,
    timedOut: false,
    truncated: false,
    exitReason: "EXITED"
  };
}

function writeCodexProbe(request: { args?: readonly string[]; cwd?: string }): CommandResult {
  const prompt = String(request.args?.at(-1) ?? "");
  const match = prompt.match(/named (probe-[^ ]+\.txt) with exact content (DEVBOX_REAL_WRITE_[A-Za-z0-9-]+)/u);
  if (!match || !request.cwd) throw new Error("TEST_CODEX_PROBE_PROMPT_UNEXPECTED");
  writeFileSync(path.join(request.cwd, match[1]!), match[2]!, "utf8");
  return result("codex-write-probe", "probe written");
}

function evolutionPass(summary = "kanıtlı sonuç"): string {
  return `DEVBOX_RESULT_JSON: ${JSON.stringify({
    status: "PASS",
    summary,
    positiveTests: ["positive test PASS"],
    negativeTests: ["negative/failure test PASS"],
    securityChecks: ["NOT_APPLICABLE_VERIFIED: güvenlik etkisi yok"],
    performanceChecks: ["NOT_APPLICABLE_VERIFIED: performans etkisi yok"],
    uxChecks: ["NOT_APPLICABLE_VERIFIED: UI etkisi yok"],
    evidenceRefs: ["run:test"]
  })}`;
}

describe("evolution model routing", () => {
  it("keeps a manually locked model exact and does not silently fall back", () => {
    expect(evolutionRoutePlan({ mode: "LOCKED", provider: "codex", model: "gpt-5.5", reasoningEffort: "high", allowFallback: true })).toEqual([
      { provider: "codex", model: "gpt-5.5", reasoningEffort: "high" }
    ]);
  });

  it("uses the explicit automatic chain only when fallback is enabled", () => {
    expect(evolutionRoutePlan({ mode: "AUTO", provider: "codex", model: "gpt-5.6-sol", reasoningEffort: "high", allowFallback: true })).toEqual([
      { provider: "codex", model: "gpt-5.6-sol", reasoningEffort: "high" },
      { provider: "codex", model: "gpt-5.5", reasoningEffort: "high" },
      { provider: "hermes-nvidia", model: "nvidia/nemotron-3-super-120b-a12b", reasoningEffort: "none" }
    ]);
  });

  it("parses the live Codex app-server model catalog and preserves advertised reasoning order", () => {
    const checkedAt = "2026-08-14T12:00:00.000Z";
    const catalog = parseCodexModelCatalog([
      JSON.stringify({ id: 1, result: { platformFamily: "windows" } }),
      JSON.stringify({ id: 2, result: { data: [
        { id: "preset-56", model: "gpt-5.6-sol", displayName: "GPT-5.6 Sol", supportedReasoningEfforts: [{ reasoningEffort: "low" }, { reasoningEffort: "high" }, { reasoningEffort: "xhigh" }] },
        { id: "preset-mini", model: "gpt-5.4-mini", displayName: "GPT-5.4 Mini", supportedReasoningEfforts: [{ reasoningEffort: "minimal" }, { reasoningEffort: "medium" }] }
      ] } })
    ].join("\n"), checkedAt);

    expect(catalog).toMatchObject({ provider: "codex", state: "READY", checkedAt });
    expect(catalog?.items.map((item) => item.id)).toEqual(["gpt-5.6-sol", "gpt-5.4-mini"]);
    expect(catalog?.items[0]?.supportedReasoningEfforts).toEqual(["low", "high", "xhigh"]);
    expect(catalog?.items[1]?.supportedReasoningEfforts).toEqual(["minimal", "medium"]);
  });

  it("parses NVIDIA /v1/models without pretending provider reasoning capabilities", () => {
    const checkedAt = "2026-08-14T12:00:00.000Z";
    const catalog = parseNvidiaModelCatalog({ object: "list", data: [
      { id: "nvidia/nemotron-3-super-120b-a12b", object: "model" },
      { id: "meta/llama-3.1-8b-instruct", object: "model" }
    ] }, checkedAt);

    expect(catalog).toMatchObject({ provider: "hermes-nvidia", state: "READY", checkedAt });
    expect(catalog?.items.map((item) => item.id)).toEqual(["nvidia/nemotron-3-super-120b-a12b", "meta/llama-3.1-8b-instruct"]);
    expect(catalog?.items.every((item) => item.source === "nvidia-models-api" && item.supportedReasoningEfforts.join() === "none")).toBe(true);
  });

  it("parses structured provider outcomes without inventing a CLI-version compatibility threshold", () => {
    const pass = parseEvolutionProviderOutcome(`done\n${evolutionPass("ok")}`);
    expect(pass.outcome).toBe("PASS");
    expect(pass.blockReason).toBeNull();
    expect(pass.acceptance.positiveTests).toEqual(["positive test PASS"]);
    expect(parseEvolutionProviderOutcome('DEVBOX_RESULT_JSON: {"status":"BLOCKED_EXTERNAL","blockReason":"login gerekli"}')).toMatchObject({ outcome: "BLOCKED_EXTERNAL", blockReason: "login gerekli" });
    expect(parseEvolutionProviderOutcome("ordinary text")).toMatchObject({ outcome: "UNSPECIFIED", blockReason: null });
  });
});

describe("chat artifact boundary", () => {
  it("rejects internal runtime telemetry but preserves ordinary user-facing language", () => {
    expect(isInternalChatArtifact("DevBox görev geçmişi sağlanmadı.")).toBe(true);
    expect(isInternalChatArtifact("MODEL_ATTEMPT\nPLANNING\nRUNNING_COMMAND")).toBe(true);
    expect(isInternalChatArtifact("Hermes aracılığıyla NVIDIA NIM oturumu başlatıldı.\nYanıt ayrıştırıldı · session 123")).toBe(true);
    expect(isInternalChatArtifact("Merhaba, nasıl yardımcı olabilirim?")).toBe(false);
    expect(isInternalChatArtifact("MODEL_ATTEMPT ne demek?")).toBe(false);
  });
});

describe("AgentService", () => {
  const originalKey = process.env.NVIDIA_API_KEY;
  const originalNvidiaBaseUrl = process.env.DEVBOX_NVIDIA_NIM_BASE_URL;
  const originalCodexExecutable = process.env.DEVBOX_CODEX_EXECUTABLE;

  afterEach(() => {
    if (originalKey === undefined) delete process.env.NVIDIA_API_KEY;
    else process.env.NVIDIA_API_KEY = originalKey;
    if (originalNvidiaBaseUrl === undefined) delete process.env.DEVBOX_NVIDIA_NIM_BASE_URL;
    else process.env.DEVBOX_NVIDIA_NIM_BASE_URL = originalNvidiaBaseUrl;
    if (originalCodexExecutable === undefined) delete process.env.DEVBOX_CODEX_EXECUTABLE;
    else process.env.DEVBOX_CODEX_EXECUTABLE = originalCodexExecutable;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns only the last assistant content from the redacted session export", async () => {
    process.env.NVIDIA_API_KEY = "test-secret-never-returned";
    const run = vi.fn()
      .mockResolvedValueOnce(result("chat-run", "hidden chain of thought\nsession_id: session_12345678\n"))
      .mockResolvedValueOnce(result("export-run", `${JSON.stringify({
        system_prompt: "must-not-leak",
        messages: [
          { role: "assistant", content: "Güvenli son yanıt", reasoning: "must-not-leak" }
        ]
      })}\n`));
    const service = new AgentService({ run } as unknown as CommandRunner);

    const response = await service.respond("index.html dosyasını düzelt", "C:\\project", []);

    expect(response.content).toBe("Güvenli son yanıt");
    expect(JSON.stringify(response)).not.toContain("chain of thought");
    expect(JSON.stringify(response)).not.toContain("must-not-leak");
    expect(run).toHaveBeenCalledTimes(2);
    const chatEnvironment = run.mock.calls[0]?.[0]?.environment as Record<string, string>;
    expect(chatEnvironment.NVIDIA_API_KEY).toBe("test-secret-never-returned");
  });

  it("uses Hermes pure one-shot for ordinary chat without the export subprocess", async () => {
    process.env.NVIDIA_API_KEY = "test-secret";
    const run = vi.fn().mockResolvedValue(result("oneshot-run", "Merhaba, hazırım.\n"));
    const service = new AgentService({ run } as unknown as CommandRunner);

    const response = await service.respond("Merhaba", "C:\\project", []);

    expect(response.content).toBe("Merhaba, hazırım.");
    expect(response.evidence).toContain("hermes-one-shot:direct-final-output");
    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0]?.[0]?.args?.[0]).toBe("-z");
  });

  it("recognizes referential workspace follow-ups from recent thread history", () => {
    const history = [{ role: "user", content: "index.html kodla" }, { role: "assistant", content: "index.html oluşturuldu" }] as never;
    expect(isWorkspaceMutationRequest("Beğenmedim, bunu mobilde düzelt ve animasyonu geliştir", history)).toBe(true);
    expect(isWorkspaceMutationRequest("Merhaba", history)).toBe(false);
  });

  it("fails closed when Hermes does not return a session id", async () => {
    process.env.NVIDIA_API_KEY = "test-secret";
    const run = vi.fn().mockResolvedValue(result("chat-run", "untrusted raw output"));
    const service = new AgentService({ run } as unknown as CommandRunner);

    await expect(service.respond("index.html oluştur", "C:\\project", [])).rejects.toThrow("HERMES_SESSION_ID_MISSING");
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("falls through to the next automatic model when a provider returns text but does not mutate the workspace", async () => {
    delete process.env.NVIDIA_API_KEY;
    process.env.DEVBOX_CODEX_EXECUTABLE = process.execPath;
    const run = vi.fn()
      .mockResolvedValueOnce(result("v56-version", "codex-cli 0.144.0\n"))
      .mockResolvedValueOnce(result("v56-auth", "Logged in using ChatGPT\n"))
      .mockImplementationOnce(async (request) => writeCodexProbe(request))
      .mockResolvedValueOnce(result("v56-exec", [
        JSON.stringify({ type: "thread.started", thread_id: "thread-56" }),
        JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: `İşlem tamamlandı\n${evolutionPass()}` } }),
        JSON.stringify({ type: "turn.completed", usage: {} })
      ].join("\n")))
      .mockResolvedValueOnce(result("v55-version", "codex-cli 0.144.0\n"))
      .mockResolvedValueOnce(result("v55-auth", "Logged in using ChatGPT\n"))
      .mockResolvedValueOnce(result("v55-exec", [
        JSON.stringify({ type: "thread.started", thread_id: "thread-55" }),
        JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: `Dosyaları gerçekten değiştirdim\n${evolutionPass()}` } }),
        JSON.stringify({ type: "turn.completed", usage: {} })
      ].join("\n")));
    const validator = vi.fn()
      .mockRejectedValueOnce(new Error("PROVIDER_COMPLETED_WITHOUT_WORKSPACE_MUTATION"))
      .mockResolvedValueOnce(undefined);
    const service = new AgentService({ run } as unknown as CommandRunner);

    const response = await service.respondForEvolution(
      "Gerçek uygulama",
      "C:\\project",
      { mode: "AUTO", provider: "codex", model: "gpt-5.6-sol", reasoningEffort: "high", allowFallback: true },
      undefined,
      undefined,
      validator
    );

    expect(response.model).toBe("gpt-5.5");
    expect(validator).toHaveBeenCalledTimes(2);
    expect(run).toHaveBeenCalledTimes(7);
  });

  it("discovers NVIDIA hosted models with the provider credential kept out of the returned catalog", async () => {
    process.env.NVIDIA_API_KEY = "test-nvidia-secret";
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [
      { id: "nvidia/nemotron-3-super-120b-a12b" },
      { id: "meta/llama-3.1-8b-instruct" }
    ] }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const service = new AgentService({ run: vi.fn() } as unknown as CommandRunner);

    const catalog = await service.listEvolutionModels("hermes-nvidia", "C:\\project");

    expect(catalog.state).toBe("READY");
    expect(catalog.items).toHaveLength(2);
    expect(JSON.stringify(catalog)).not.toContain("test-nvidia-secret");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://integrate.api.nvidia.com/v1/models");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer test-nvidia-secret");
  });

  it("discovers the manual Codex model list through app-server instead of a hardcoded semver gate", async () => {
    process.env.DEVBOX_CODEX_EXECUTABLE = process.execPath;
    const run = vi.fn().mockResolvedValue(result("catalog-run", JSON.stringify({ id: 2, result: { data: [
      { id: "preset-56", model: "gpt-5.6-sol", displayName: "GPT-5.6 Sol", supportedReasoningEfforts: [{ reasoningEffort: "high" }, { reasoningEffort: "xhigh" }] }
    ] } }) + "\n"));
    const service = new AgentService({ run } as unknown as CommandRunner);

    const catalog = await service.listEvolutionModels("codex", "C:\\project");

    expect(catalog.state).toBe("READY");
    expect(catalog.items[0]).toMatchObject({ id: "gpt-5.6-sol", displayName: "GPT-5.6 Sol", supportedReasoningEfforts: ["high", "xhigh"] });
    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0]?.[0]?.args).toEqual(["app-server", "--stdio"]);
    expect(String(run.mock.calls[0]?.[0]?.stdinText)).toContain('"method":"model/list"');
    expect(String(run.mock.calls[0]?.[0]?.stdinText)).toContain('"method":"initialize"');
  });

  it("uses authenticated Codex non-interactively for API evolution with a writable workspace", async () => {
    delete process.env.NVIDIA_API_KEY;
    process.env.DEVBOX_CODEX_EXECUTABLE = process.execPath;
    expect(resolveCodexExecutable(process.env)).toBe(process.execPath);
    const run = vi.fn()
      .mockResolvedValueOnce(result("codex-version", "codex-cli 0.144.0\n"))
      .mockResolvedValueOnce(result("codex-health", "Logged in using ChatGPT\n"))
      .mockImplementationOnce(async (request) => writeCodexProbe(request))
      .mockResolvedValueOnce(result("codex-exec", [
        JSON.stringify({ type: "thread.started", thread_id: "019ffe1f-d847-7e52-ae9b-27d113a6ff23" }),
        JSON.stringify({ type: "item.completed", item: { type: "command_execution", command: "npm test", exit_code: 0, status: "completed" } }),
        JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: `Kanıtlı Codex gelişim yanıtı\n${evolutionPass()}` } }),
        JSON.stringify({ type: "turn.completed", usage: {} })
      ].join("\n")));
    const service = new AgentService({ run } as unknown as CommandRunner);

    const response = await service.respondForEvolution("Gerçek uygulama", "C:\\project", { mode: "LOCKED", provider: "codex", model: "gpt-5.6-sol", reasoningEffort: "high", allowFallback: false });

    expect(response).toMatchObject({
      content: expect.stringContaining("Kanıtlı Codex gelişim yanıtı"),
      provider: "OpenAI Codex CLI",
      model: "gpt-5.6-sol",
      evidence: ["codex-version", "codex-health", "codex-exec"]
    });
    expect(run).toHaveBeenCalledTimes(4);
    const args = run.mock.calls[3]?.[0]?.args as string[];
    expect(args).toEqual(expect.arrayContaining(["exec", "--ephemeral", "--sandbox", "workspace-write", "--json", "--ignore-rules"]));
    expect(args).toEqual(expect.arrayContaining(["--model", "gpt-5.6-sol", "--config", 'model_reasoning_effort="high"']));
    expect(args).not.toContain("--dangerously-bypass-approvals-and-sandbox");
  });

  it("falls back to read-only Codex plus a checked real git patch when workspace-write does not create the probe file", async () => {
    process.env.DEVBOX_CODEX_EXECUTABLE = process.execPath;
    const patchContent = [
      "DEVBOX_PATCH_START",
      "diff --git a/src/example.ts b/src/example.ts",
      "--- a/src/example.ts",
      "+++ b/src/example.ts",
      "@@ -1 +1 @@",
      "-old",
      "+new",
      "DEVBOX_PATCH_END",
      evolutionPass("safe patch applied")
    ].join("\n");
    const run = vi.fn()
      .mockResolvedValueOnce(result("codex-version", "codex-cli 0.144.0\n"))
      .mockResolvedValueOnce(result("codex-auth", "Logged in using ChatGPT\n"))
      .mockResolvedValueOnce(result("probe-no-write", "provider claimed completion but no host file exists"))
      .mockResolvedValueOnce(result("codex-readonly-exec", [
        JSON.stringify({ type: "thread.started", thread_id: "thread-safe-patch" }),
        JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: patchContent } }),
        JSON.stringify({ type: "turn.completed", usage: {} })
      ].join("\n")))
      .mockResolvedValueOnce(result("patch-check", ""))
      .mockResolvedValueOnce(result("patch-apply", ""));
    const service = new AgentService({ run } as unknown as CommandRunner);

    const response = await service.respondForEvolution("Gerçek uygulama", "C:\\project", { mode: "LOCKED", provider: "codex", model: "gpt-5.6-sol", reasoningEffort: "high", allowFallback: false });

    expect(response.outcome).toBe("PASS");
    expect(response.evidence).toEqual(expect.arrayContaining(["patch-check", "patch-apply"]));
    expect((run.mock.calls[3]?.[0]?.args as string[])).toEqual(expect.arrayContaining(["--sandbox", "read-only"]));
    expect((run.mock.calls[4]?.[0]?.args as string[])).toEqual(["apply", "--check", "--recount", "-"]);
    expect((run.mock.calls[5]?.[0]?.args as string[])).toEqual(["apply", "--recount", "--whitespace=nowarn", "-"]);
  });

  it("rejects PASS when the mandatory acceptance bundle is incomplete", async () => {
    process.env.DEVBOX_CODEX_EXECUTABLE = process.execPath;
    const run = vi.fn()
      .mockResolvedValueOnce(result("codex-version", "codex-cli current\n"))
      .mockResolvedValueOnce(result("codex-auth", "Logged in using ChatGPT\n"))
      .mockImplementationOnce(async (request) => writeCodexProbe(request))
      .mockResolvedValueOnce(result("codex-exec", [
        JSON.stringify({ type: "thread.started", thread_id: "thread-incomplete" }),
        JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: 'DEVBOX_RESULT_JSON: {"status":"PASS","summary":"eksik"}' } }),
        JSON.stringify({ type: "turn.completed", usage: {} })
      ].join("\n")));
    const service = new AgentService({ run } as unknown as CommandRunner);

    await expect(service.respondForEvolution("Gerçek uygulama", "C:\\project", { mode: "LOCKED", provider: "codex", model: "gpt-5.6-sol", reasoningEffort: "high", allowFallback: false })).rejects.toThrow("EVOLUTION_PROVIDER_CHAIN_EXHAUSTED");
  });

  it("rejects Codex outer exit 0 when an inner command_execution failed", async () => {
    process.env.DEVBOX_CODEX_EXECUTABLE = process.execPath;
    const run = vi.fn()
      .mockResolvedValueOnce(result("codex-version", "codex-cli current\n"))
      .mockResolvedValueOnce(result("codex-auth", "Logged in using ChatGPT\n"))
      .mockImplementationOnce(async (request) => writeCodexProbe(request))
      .mockResolvedValueOnce(result("codex-exec", [
        JSON.stringify({ type: "thread.started", thread_id: "thread-inner-fail" }),
        JSON.stringify({ type: "item.completed", item: { type: "command_execution", command: "failing-test", exit_code: 1, status: "failed" } }),
        JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: evolutionPass() } }),
        JSON.stringify({ type: "turn.completed", usage: {} })
      ].join("\n")));
    const service = new AgentService({ run } as unknown as CommandRunner);

    await expect(service.respondForEvolution("Gerçek uygulama", "C:\\project", { mode: "LOCKED", provider: "codex", model: "gpt-5.6-sol", reasoningEffort: "high", allowFallback: false })).rejects.toThrow("EVOLUTION_PROVIDER_CHAIN_EXHAUSTED");
  });

});
