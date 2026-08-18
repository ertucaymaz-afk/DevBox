import { readFile, writeFile } from "node:fs/promises";

async function patch(file, edits) {
  let source = (await readFile(file, "utf8")).replace(/\r\n?/gu, "\n");
  for (const [label, before, after] of edits) {
    const at = source.indexOf(before);
    if (at < 0 || at !== source.lastIndexOf(before)) throw new Error(`V014_REGRESSION_ANCHOR_INVALID:${file}:${label}`);
    source = source.slice(0, at) + after + source.slice(at + before.length);
  }
  await writeFile(file, source, "utf8");
}

await patch("src/main/services/agent-service.ts", [[
  "workspace-readback-contract",
  '    "- Önce ilgili dosyaları ara ve oku; sonra en küçük güvenli gerçek değişikliği uygula. Her yazmadan sonra dosyayı tekrar oku ve diskte doğrula.",',
  '    "- Önce ilgili dosyaları ara ve oku; sonra en küçük güvenli gerçek değişikliği uygula. Her yazma/patch işleminden sonra aynı dosyayı tekrar oku ve içeriğin diskte gerçekten bulunduğunu doğrula.",'
]]);

await patch("src/main/services/agent-service.test.ts", [[
  "missing-session-workspace-path",
  '    await expect(service.respond("Bir görev", "C:\\\\project", [])).rejects.toThrow("HERMES_SESSION_ID_MISSING");',
  '    await expect(service.respond("index.html oluştur", "C:\\\\project", [])).rejects.toThrow("HERMES_SESSION_ID_MISSING");'
]]);

await patch("src/main/services/database.test.ts", [
  ["schema7-exact", '    expect(database.integrityCheck()).toEqual({ ok: true, detail: "ok", schemaVersion: 6 });', '    expect(database.integrityCheck()).toEqual({ ok: true, detail: "ok", schemaVersion: 7 });'],
  ["schema7-match", '    expect(database.integrityCheck()).toMatchObject({ ok: true, schemaVersion: 6 });', '    expect(database.integrityCheck()).toMatchObject({ ok: true, schemaVersion: 7 });']
]);

await patch("src/main/services/core-api.test.ts", [
  ["memory-imports", 'import { LocalCatalogService } from "./local-catalog-service.js";', 'import { LocalCatalogService } from "./local-catalog-service.js";\nimport { MemoryService } from "./memory-service.js";\nimport { ThreadTurnCoordinator } from "./thread-turn-coordinator.js";'],
  ["memory-fixture", '    const settings = new SettingsService(database);\n    const agent = { respond:', '    const settings = new SettingsService(database);\n    const memory = new MemoryService(database);\n    const turnCoordinator = new ThreadTurnCoordinator();\n    const agent = { respond:'],
  ["core-api-options", '      agent,\n      evolution:', '      agent,\n      memory,\n      turnCoordinator,\n      evolution:']
]);

await patch("src/main/services/workspace-agent-mode.test.ts", [[
  "ordinary-one-shot-contract",
  `  it("keeps ordinary conversation in the restricted one-turn safe mode", async () => {
    process.env.NVIDIA_API_KEY = "workspace-test-key";
    const run = vi.fn()
      .mockResolvedValueOnce(result("chat-run", "session_id: session_87654321\\n"))
      .mockResolvedValueOnce(exported("Normal sohbet yanıtı"));
    const service = new AgentService({ run } as unknown as CommandRunner);

    await service.respond("Bu kodun ne yaptığını açıklar mısın?", "C:\\\\project", []);

    const args = run.mock.calls[0]?.[0]?.args as string[];
    expect(args).toContain("--safe-mode");
    expect(args).toContain("1");
    expect(args).not.toContain("--yolo");
    expect(args).not.toContain("file,terminal");
  });`,
  `  it("uses the pure one-shot fast path for ordinary conversation", async () => {
    process.env.NVIDIA_API_KEY = "workspace-test-key";
    const run = vi.fn().mockResolvedValueOnce(result("oneshot-run", "Normal sohbet yanıtı"));
    const service = new AgentService({ run } as unknown as CommandRunner);

    const response = await service.respond("Bu kodun ne yaptığını açıklar mısın?", "C:\\\\project", []);

    expect(response.content).toBe("Normal sohbet yanıtı");
    expect(run).toHaveBeenCalledTimes(1);
    const args = run.mock.calls[0]?.[0]?.args as string[];
    expect(args[0]).toBe("-z");
    expect(args).not.toContain("--safe-mode");
    expect(args).not.toContain("--yolo");
    expect(args).not.toContain("file,terminal");
  });`
]]);

console.log("DEVBOX_V014_REGRESSION_FIX1_APPLIED");
