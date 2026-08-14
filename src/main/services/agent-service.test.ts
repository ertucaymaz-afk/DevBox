import type { CommandResult } from "../../shared/contracts.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentService, resolveCodexExecutable } from "./agent-service.js";
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

describe("AgentService", () => {
  const originalKey = process.env.NVIDIA_API_KEY;
  const originalCodexExecutable = process.env.DEVBOX_CODEX_EXECUTABLE;

  afterEach(() => {
    if (originalKey === undefined) delete process.env.NVIDIA_API_KEY;
    else process.env.NVIDIA_API_KEY = originalKey;
    if (originalCodexExecutable === undefined) delete process.env.DEVBOX_CODEX_EXECUTABLE;
    else process.env.DEVBOX_CODEX_EXECUTABLE = originalCodexExecutable;
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

    const response = await service.respond("Bir görev", "C:\\project", []);

    expect(response.content).toBe("Güvenli son yanıt");
    expect(JSON.stringify(response)).not.toContain("chain of thought");
    expect(JSON.stringify(response)).not.toContain("must-not-leak");
    expect(run).toHaveBeenCalledTimes(2);
    const chatEnvironment = run.mock.calls[0]?.[0]?.environment as Record<string, string>;
    expect(chatEnvironment.NVIDIA_API_KEY).toBe("test-secret-never-returned");
  });

  it("fails closed when Hermes does not return a session id", async () => {
    process.env.NVIDIA_API_KEY = "test-secret";
    const run = vi.fn().mockResolvedValue(result("chat-run", "untrusted raw output"));
    const service = new AgentService({ run } as unknown as CommandRunner);

    await expect(service.respond("Bir görev", "C:\\project", [])).rejects.toThrow("HERMES_SESSION_ID_MISSING");
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("uses authenticated Codex non-interactively for API evolution with a read-only sandbox", async () => {
    delete process.env.NVIDIA_API_KEY;
    process.env.DEVBOX_CODEX_EXECUTABLE = process.execPath;
    expect(resolveCodexExecutable(process.env)).toBe(process.execPath);
    const run = vi.fn()
      .mockResolvedValueOnce(result("codex-health", "Logged in using ChatGPT\n"))
      .mockResolvedValueOnce(result("codex-exec", [
        JSON.stringify({ type: "thread.started", thread_id: "019ffe1f-d847-7e52-ae9b-27d113a6ff23" }),
        JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "Kanıtlı Codex gelişim yanıtı" } })
      ].join("\n")));
    const service = new AgentService({ run } as unknown as CommandRunner);

    const response = await service.respondForEvolution("Salt okunur inceleme", "C:\\project");

    expect(response).toMatchObject({
      content: "Kanıtlı Codex gelişim yanıtı",
      provider: "OpenAI Codex CLI",
      model: "gpt-5.6-sol",
      evidence: ["codex-health", "codex-exec"]
    });
    expect(run).toHaveBeenCalledTimes(2);
    const args = run.mock.calls[1]?.[0]?.args as string[];
    expect(args).toEqual(expect.arrayContaining(["exec", "--ephemeral", "--sandbox", "read-only", "--json", "--ignore-rules"]));
    expect(args).toEqual(expect.arrayContaining(["--model", "gpt-5.6-sol", "--config", 'model_reasoning_effort="high"']));
    expect(args).not.toContain("--dangerously-bypass-approvals-and-sandbox");
  });
});
