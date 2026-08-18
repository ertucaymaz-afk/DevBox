import path from "node:path";
import { describe, expect, it } from "vitest";
import { ThreadActivityEventSchema } from "../../shared/contracts.js";
import { resolveCodexExecutable } from "./agent-service.js";

function existing(...paths: string[]): (candidate: string) => boolean {
  const known = new Set(paths.map((item) => path.normalize(item).toLocaleLowerCase("en-US")));
  return (candidate) => known.has(path.normalize(candidate).toLocaleLowerCase("en-US"));
}

describe("v0.1.9 chat and API runtime regressions", () => {
  it("accepts the real rich agent progress payload without unrecognized_keys", () => {
    const parsed = ThreadActivityEventSchema.parse({
      threadId: "thread-12345678",
      kind: "waiting",
      stage: "MODEL_ATTEMPT",
      provider: "OpenAI Codex CLI",
      model: "gpt-5.6-sol",
      message: "Model hazırlanıyor.",
      createdAt: "2026-08-18T05:00:00.000Z"
    });
    expect(parsed).toMatchObject({ kind: "waiting", stage: "MODEL_ATTEMPT", provider: "OpenAI Codex CLI", model: "gpt-5.6-sol" });
  });

  it("resolves the official Windows standalone visible Codex location", () => {
    const base = "C:\Users\tester\AppData\Local";
    const expected = path.join(base, "Programs", "OpenAI", "Codex", "bin", process.platform === "win32" ? "codex.exe" : "codex");
    expect(resolveCodexExecutable({ LOCALAPPDATA: base }, existing(expected))).toBe(path.normalize(expected));
  });

  it("resolves CODEX_HOME standalone current/bin", () => {
    const home = "C:\Users\tester\.codex";
    const expected = path.join(home, "packages", "standalone", "current", "bin", process.platform === "win32" ? "codex.exe" : "codex");
    expect(resolveCodexExecutable({ CODEX_HOME: home }, existing(expected))).toBe(path.normalize(expected));
  });

  it("resolves a direct PATH Codex executable", () => {
    const entry = "C:\Tools";
    const expected = path.join(entry, process.platform === "win32" ? "codex.exe" : "codex");
    expect(resolveCodexExecutable({ PATH: entry }, existing(expected))).toBe(path.normalize(expected));
  });
});
