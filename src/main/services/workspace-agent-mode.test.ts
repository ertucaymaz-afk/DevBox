import type { CommandResult } from "../../shared/contracts.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentService, isWorkspaceMutationRequest } from "./agent-service.js";
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

function exported(content: string): CommandResult {
  return result("export-run", `${JSON.stringify({ messages: [{ role: "assistant", content }] })}\n`);
}

describe("workspace mutation routing", () => {
  const originalKey = process.env.NVIDIA_API_KEY;

  afterEach(() => {
    if (originalKey === undefined) delete process.env.NVIDIA_API_KEY;
    else process.env.NVIDIA_API_KEY = originalKey;
    vi.restoreAllMocks();
  });

  it("recognizes the reproduced index.html coding request as a real workspace mutation", () => {
    expect(isWorkspaceMutationRequest("index.html kodlar mısın" )).toBe(true);
    expect(isWorkspaceMutationRequest("index.html oluştur ve sayfayı düzelt")).toBe(true);
    expect(isWorkspaceMutationRequest("React bileşenini güncelle")).toBe(true);
    expect(isWorkspaceMutationRequest("Bugün nasılsın?")).toBe(false);
    expect(isWorkspaceMutationRequest("index.html nedir?")).toBe(false);
  });

  it("uses a multi-turn file/terminal tool loop for coding instead of the one-turn safe chat mode", async () => {
    process.env.NVIDIA_API_KEY = "workspace-test-key";
    const run = vi.fn()
      .mockResolvedValueOnce(result("chat-run", "session_id: session_12345678\n"))
      .mockResolvedValueOnce(exported("index.html diske yazıldı ve tekrar okundu."));
    const service = new AgentService({ run } as unknown as CommandRunner);

    const response = await service.respond("index.html oluştur ve çalışan bir arayüz kodla", "C:\\project", []);

    expect(response.content).toContain("index.html");
    const args = run.mock.calls[0]?.[0]?.args as string[];
    expect(args).toContain("--toolsets");
    expect(args).toContain("file,terminal");
    expect(args).toContain("--yolo");
    expect(args).toContain("48");
    expect(args).not.toContain("--safe-mode");
    const queryIndex = args.indexOf("--query");
    expect(queryIndex).toBeGreaterThanOrEqual(0);
    expect(args[queryIndex + 1]).toContain("GERÇEK WORKSPACE MODU");
    expect(args[queryIndex + 1]).toContain("aynı dosyayı tekrar oku");
  });

  it("keeps ordinary conversation in the restricted one-turn safe mode", async () => {
    process.env.NVIDIA_API_KEY = "workspace-test-key";
    const run = vi.fn()
      .mockResolvedValueOnce(result("chat-run", "session_id: session_87654321\n"))
      .mockResolvedValueOnce(exported("Normal sohbet yanıtı"));
    const service = new AgentService({ run } as unknown as CommandRunner);

    await service.respond("Bu kodun ne yaptığını açıklar mısın?", "C:\\project", []);

    const args = run.mock.calls[0]?.[0]?.args as string[];
    expect(args).toContain("--safe-mode");
    expect(args).toContain("1");
    expect(args).not.toContain("--yolo");
    expect(args).not.toContain("file,terminal");
  });
});
