import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
let changed = 0;
async function edit(relative, mutate) {
  const file = path.join(root, relative);
  const before = (await readFile(file, "utf8")).replace(/\r\n/gu, "\n");
  const after = mutate(before);
  if (after === before) return;
  await writeFile(file, after, "utf8");
  changed += 1;
  process.stdout.write(`V019_HARDENED ${relative}\n`);
}
function exact(text, from, to, code) {
  if (text.includes(to)) return text;
  if (!text.includes(from)) throw new Error(`${code}:source-pattern-missing`);
  return text.replace(from, to);
}

await edit("src/main/services/agent-service.ts", (text) => exact(
  text,
  `  add(environment.DEVBOX_CODEX_EXECUTABLE);\n\n  const codexHome`,
  `  add(environment.DEVBOX_CODEX_EXECUTABLE);\n  add(environment.CODEX_INSTALL_DIR ? path.join(environment.CODEX_INSTALL_DIR, process.platform === "win32" ? "codex.exe" : "codex") : undefined);\n\n  const codexHome`,
  "CODEX_CUSTOM_INSTALL_DIR_ANCHOR_MISSING"
));

await edit("src/main/services/api-evolution-service.ts", (text) => {
  const from = `          const corepack = process.platform === "win32" ? "corepack.cmd" : "corepack";
          const pinned = pkg.packageManager?.startsWith("pnpm@") ? pkg.packageManager : "pnpm@11.19.0";
          this.#publishByRoot(rootPath, { stage: "VERIFYING", kind: "command", message: \`${'${pinned}'} Corepack cache/activation doğrulanıyor; Program Files shim yazımı kullanılmıyor.\`, provider: null, model: null });
          const prepared = await this.#runner.run({ executable: corepack, args: ["prepare", pinned, "--activate"], cwd: rootPath, cancellation, timeoutMs: 2 * 60_000, maxOutputBytes: 2 * 1024 * 1024 });
          evidence.push(prepared.runId);
          if (prepared.exitCode !== 0 || prepared.timedOut || prepared.truncated) return { ok: false, evidence, detail: \`COREPACK_PREPARE_FAILED:${'${prepared.stderr.slice(0, 500)}'}\` };
          if (!existsSync(path.join(rootPath, "node_modules"))) {`;
  const to = `          const corepack = process.platform === "win32" ? "corepack.cmd" : "corepack";
          const pinned = pkg.packageManager?.startsWith("pnpm@") ? pkg.packageManager : "pnpm@11.19.0";
          const expectedPnpmVersion = pinned.slice("pnpm@".length).trim();
          this.#publishByRoot(rootPath, { stage: "VERIFYING", kind: "command", message: \`${'${pinned}'} doğrudan Corepack meta-command ile doğrulanıyor; global pnpm shim, corepack enable ve Program Files yazımı kullanılmıyor.\`, provider: null, model: null });
          const managerProbe = await this.#runner.run({ executable: corepack, args: ["pnpm", "--version"], cwd: rootPath, cancellation, timeoutMs: 2 * 60_000, maxOutputBytes: 2 * 1024 * 1024 });
          evidence.push(managerProbe.runId);
          if (managerProbe.exitCode !== 0 || managerProbe.timedOut || managerProbe.truncated) return { ok: false, evidence, detail: \`COREPACK_PNPM_PROBE_FAILED:${'${managerProbe.stderr.slice(0, 500)}'}\` };
          const detectedPnpmVersion = managerProbe.stdout.trim().split(/\\r?\\n/u)[0]?.trim() ?? "";
          if (expectedPnpmVersion && detectedPnpmVersion !== expectedPnpmVersion) return { ok: false, evidence, detail: \`PNPM_VERSION_MISMATCH:expected=${'${expectedPnpmVersion}'}:detected=${'${detectedPnpmVersion || "unknown"}'}\` };
          if (!existsSync(path.join(rootPath, "node_modules"))) {`;
  text = exact(text, from, to, "COREPACK_PREPARE_BLOCK_MISSING");
  return exact(
    text,
    `return /EVOLUTION_REQUIRES_GIT_REPOSITORY|EVOLUTION_REQUIRES_NETWORK_PROFILE|CODEX_AUTH_UNAVAILABLE|CODEX_EXECUTABLE_UNAVAILABLE|NVIDIA_CREDENTIAL_UNAVAILABLE|HERMES.*UNAVAILABLE|NODE_24_REQUIRED|COREPACK_PREPARE_FAILED|PNPM_INSTALL_FAILED|PROVIDER_CHAIN_EXHAUSTED:.*(?:AUTH_UNAVAILABLE|EXECUTABLE_UNAVAILABLE|CREDENTIAL_UNAVAILABLE)/iu.test(message);`,
    `return /EVOLUTION_REQUIRES_GIT_REPOSITORY|EVOLUTION_REQUIRES_NETWORK_PROFILE|CODEX_AUTH_UNAVAILABLE|CODEX_EXECUTABLE_UNAVAILABLE|NVIDIA_CREDENTIAL_UNAVAILABLE|HERMES.*UNAVAILABLE|NODE_24_REQUIRED|COREPACK_PREPARE_FAILED|COREPACK_PNPM_PROBE_FAILED|PNPM_VERSION_MISMATCH|PNPM_INSTALL_FAILED|PROVIDER_CHAIN_EXHAUSTED:.*(?:AUTH_UNAVAILABLE|EXECUTABLE_UNAVAILABLE|CREDENTIAL_UNAVAILABLE)/iu.test(message);`,
    "EXTERNAL_BLOCKER_PATTERN_MISSING"
  );
});

await edit("src/renderer/App.tsx", (text) => exact(
  text,
`  return <div className={\`activity-line live \${event.kind}\`} aria-live="polite">{icon}<span>{event.message}</span><time title={exactDateTime(event.createdAt)}>{new Date(event.createdAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}</time></div>;
}`,
`  const meta = [event.stage, event.provider ? \`\${event.provider}\${event.model ? \` · \${event.model}\` : ""}\` : null].filter(Boolean).join(" · ");
  return <div className={\`activity-line live \${event.kind}\`} aria-live="polite">{icon}<div className="activity-copy"><span>{event.message}</span>{meta && <small>{meta}</small>}</div><time title={exactDateTime(event.createdAt)}>{new Date(event.createdAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}</time></div>;
}`,
  "LIVE_ACTIVITY_RENDER_PATTERN_MISSING"
));

await edit("src/renderer/styles.css", (text) => exact(
  text,
`.activity-line { display: flex; align-items: center; gap: 8px; margin: 0 0 11px 38px; color: var(--text-muted); font-size: 12px; }
.activity-line > svg { flex: 0 0 auto; }
.activity-line > span { min-width: 0; overflow-wrap: anywhere; }
.activity-line > time { margin-left: auto; color: var(--text-disabled); font-size: 9.5px; font-variant-numeric: tabular-nums; }
.activity-line.completed > svg, .activity-line.evidence > svg { color: var(--success); }
.activity-line.command > svg { color: #aab3ba; }
.activity-line.failure, .activity-line.failure > svg { color: var(--danger); }
.activity-line.running { color: var(--accent); }
.activity-line.live { animation: activity-arrive 180ms ease-out both; }`,
`.activity-line { display: flex; align-items: flex-start; gap: 8px; margin: 0 0 11px 38px; color: var(--text-muted); font-size: 12px; }
.activity-line > svg { flex: 0 0 auto; margin-top: 1px; }
.activity-copy { min-width: 0; display: flex; flex: 1 1 auto; flex-direction: column; gap: 2px; }
.activity-copy > span { min-width: 0; overflow-wrap: anywhere; }
.activity-copy > small { color: var(--text-disabled); font-size: 10px; overflow-wrap: anywhere; }
.activity-line > time { margin-left: auto; padding-top: 1px; color: var(--text-disabled); font-size: 9.5px; font-variant-numeric: tabular-nums; white-space: nowrap; }
.activity-line.completed > svg, .activity-line.evidence > svg { color: var(--success); }
.activity-line.command > svg { color: #aab3ba; }
.activity-line.waiting, .activity-line.waiting > svg { color: #d2ac63; }
.activity-line.failure, .activity-line.failure > svg { color: var(--danger); }
.activity-line.running { color: var(--accent); }
.activity-line.live { animation: activity-arrive 180ms ease-out both; }`,
  "LIVE_ACTIVITY_STYLE_PATTERN_MISSING"
));

await edit("src/main/services/v019-runtime-regression.test.ts", (text) => {
  if (text.includes("resolves CODEX_INSTALL_DIR")) return text;
  const anchor = `  it("resolves CODEX_HOME standalone current/bin", () => {`;
  if (!text.includes(anchor)) throw new Error("REGRESSION_ANCHOR_MISSING");
  const test = `  it("resolves CODEX_INSTALL_DIR used by the official Windows installer", () => {\n    const installDir = "C:\\\\CustomCodex";\n    const expected = path.join(installDir, process.platform === "win32" ? "codex.exe" : "codex");\n    expect(resolveCodexExecutable({ CODEX_INSTALL_DIR: installDir }, existing(expected))).toBe(path.normalize(expected));\n  });\n\n`;
  return text.replace(anchor, test + anchor);
});

process.stdout.write(`V019_FINAL_HARDENING_COMPLETE changed=${changed}\n`);
