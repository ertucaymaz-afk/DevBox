import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
let changed = 0;

async function edit(relative, mutate) {
  const file = path.join(root, relative);
  const before = await readFile(file, "utf8");
  const after = mutate(before);
  if (after === before) return;
  await writeFile(file, after, "utf8");
  changed += 1;
  process.stdout.write(`V019_PATCHED ${relative}\n`);
}

function replaceOnce(text, oldValue, newValue, code) {
  if (text.includes(newValue)) return text;
  if (!text.includes(oldValue)) throw new Error(`${code}: expected source pattern not found`);
  return text.replace(oldValue, newValue);
}

await edit("package.json", (text) => replaceOnce(text, '"version": "0.1.8"', '"version": "0.1.9"', "PACKAGE_VERSION_PATTERN_MISSING"));

await edit("src/shared/contracts.ts", (text) => replaceOnce(text,
`export const ThreadActivityEventSchema = z.object({
  threadId: z.string().min(8).max(128),
  kind: z.enum(["provider", "command", "evidence", "failure"]),
  message: z.string().trim().min(1).max(2_000),
  createdAt: z.string().datetime()
}).strict();`,
`export const ThreadActivityEventSchema = z.object({
  threadId: z.string().min(8).max(128),
  kind: z.enum(["provider", "command", "evidence", "waiting", "failure"]),
  stage: z.string().trim().min(1).max(64).nullable().optional(),
  provider: z.string().trim().min(1).max(160).nullable().optional(),
  model: z.string().trim().min(1).max(200).nullable().optional(),
  message: z.string().trim().min(1).max(2_000),
  createdAt: z.string().datetime()
}).strict();`, "THREAD_ACTIVITY_SCHEMA_PATTERN_MISSING"));

await edit("src/main/ipc.ts", (text) => replaceOnce(text,
`    const publishActivity = (activity: { kind: "provider" | "command" | "evidence" | "failure" | "waiting"; message: string; createdAt: string }): void => {
      const payload = ThreadActivityEventSchema.parse({ threadId: input.threadId, ...activity });`,
`    const publishActivity = (activity: { kind: "provider" | "command" | "evidence" | "waiting" | "failure"; stage?: string | null; provider?: string | null; model?: string | null; message: string; createdAt: string }): void => {
      const payload = ThreadActivityEventSchema.parse({ threadId: input.threadId, ...activity });`, "THREAD_ACTIVITY_IPC_PATTERN_MISSING"));

await edit("src/renderer/App.tsx", (text) => replaceOnce(text,
`function LiveActivity({ event }: { event: ThreadActivityEvent }): ReactNode {
  const icon = event.kind === "command"
    ? <SquareTerminal size={13} />
    : event.kind === "evidence"
      ? <CheckCircle2 size={13} />
      : event.kind === "failure"
        ? <XCircle size={13} />
        : <LoaderCircle className="spin" size={13} />;
  return <div className={\`activity-line live \${event.kind}\`} aria-live="polite">{icon}<span>{event.message}</span><time title={exactDateTime(event.createdAt)}>{new Date(event.createdAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}</time></div>;
}`,
`function LiveActivity({ event }: { event: ThreadActivityEvent }): ReactNode {
  const icon = event.kind === "command"
    ? <SquareTerminal size={13} />
    : event.kind === "evidence"
      ? <CheckCircle2 size={13} />
      : event.kind === "failure"
        ? <XCircle size={13} />
        : <LoaderCircle className="spin" size={13} />;
  const meta = [event.stage, event.provider ? \`\${event.provider}\${event.model ? \` · \${event.model}\` : ""}\` : null].filter(Boolean).join(" · ");
  return <div className={\`activity-line live \${event.kind}\`} aria-live="polite">{icon}<div className="activity-copy"><span>{event.message}</span>{meta && <small>{meta}</small>}</div><time title={exactDateTime(event.createdAt)}>{new Date(event.createdAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}</time></div>;
}`,
"THREAD_ACTIVITY_RENDERER_PATTERN_MISSING"));

await edit("src/renderer/styles.css", (text) => replaceOnce(text,
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
.activity-line.live { animation: activity-arrive 180ms ease-out both; }`, "THREAD_ACTIVITY_STYLE_PATTERN_MISSING"));

await edit("src/main/services/agent-service.ts", (text) => {
  if (text.includes("function codexExecutableCandidates(")) return text;
  const start = text.indexOf("export function resolveCodexExecutable(");
  const end = text.indexOf("export function resolveHermesExecutable", start);
  if (start < 0 || end < 0) throw new Error("CODEX_EXECUTABLE_RESOLVER_PATTERN_MISSING");
  const replacement = `function codexExecutableCandidates(environment: NodeJS.ProcessEnv): string[] {
  const candidates: string[] = [];
  const add = (candidate: string | undefined): void => {
    const value = candidate?.trim();
    if (!value) return;
    const normalized = path.normalize(value);
    if (!candidates.some((item) => item.toLocaleLowerCase("en-US") === normalized.toLocaleLowerCase("en-US"))) candidates.push(normalized);
  };

  add(environment.DEVBOX_CODEX_EXECUTABLE);

  const codexHome = environment.CODEX_HOME?.trim()
    || (environment.USERPROFILE ? path.join(environment.USERPROFILE, ".codex") : undefined)
    || (environment.HOME ? path.join(environment.HOME, ".codex") : undefined);
  if (codexHome) {
    add(path.join(codexHome, "packages", "standalone", "current", "bin", process.platform === "win32" ? "codex.exe" : "codex"));
    add(path.join(codexHome, "packages", "standalone", "current", process.platform === "win32" ? "codex.exe" : "codex"));
  }

  if (environment.LOCALAPPDATA) {
    add(path.join(environment.LOCALAPPDATA, "Programs", "OpenAI", "Codex", "bin", process.platform === "win32" ? "codex.exe" : "codex"));
  }

  const appData = environment.APPDATA;
  if (appData) {
    const architecture = process.arch === "arm64" ? "aarch64" : "x86_64";
    const target = \`\${architecture}-pc-windows-msvc\`;
    add(path.join(
      appData,
      "npm",
      "node_modules",
      "@openai",
      "codex",
      "node_modules",
      "@openai",
      \`codex-win32-\${process.arch === "arm64" ? "arm64" : "x64"}\`,
      "vendor",
      target,
      "bin",
      "codex.exe"
    ));
  }

  for (const segment of (environment.PATH ?? environment.Path ?? "").split(path.delimiter).map((item) => item.trim()).filter(Boolean)) {
    add(path.join(segment, process.platform === "win32" ? "codex.exe" : "codex"));
  }
  return candidates;
}

export function resolveCodexExecutable(
  environment: NodeJS.ProcessEnv = process.env,
  fileExists: (candidate: string) => boolean = existsSync
): string | null {
  for (const candidate of codexExecutableCandidates(environment)) {
    if (fileExists(candidate)) return candidate;
  }
  return null;
}

`;
  return text.slice(0, start) + replacement + text.slice(end);
});

const regressionTest = `import path from "node:path";
import { describe, expect, it } from "vitest";
import { ThreadActivityEventSchema } from "../../shared/contracts.js";
import { resolveCodexExecutable } from "./agent-service.js";

function existing(...paths: string[]): (candidate: string) => boolean {
  const known = new Set(paths.map((item) => path.normalize(item).toLocaleLowerCase("en-US")));
  return (candidate) => known.has(path.normalize(candidate).toLocaleLowerCase("en-US"));
}

describe("v0.1.9 chat and API runtime regressions", () => {
  it("accepts real typed agent progress metadata without unrecognized_keys", () => {
    const parsed = ThreadActivityEventSchema.parse({
      threadId: "thread-12345678",
      kind: "waiting",
      stage: "MODEL_ATTEMPT",
      provider: "OpenAI Codex CLI",
      model: "gpt-5.6-sol",
      message: "Model hazırlanıyor.",
      createdAt: "2026-08-18T05:00:00.000Z"
    });
    expect(parsed.kind).toBe("waiting");
    expect(parsed.provider).toBe("OpenAI Codex CLI");
    expect(parsed.model).toBe("gpt-5.6-sol");
  });

  it("resolves the official Windows standalone visible Codex binary", () => {
    const local = path.join("C:\\Users\\tester\\AppData\\Local", "Programs", "OpenAI", "Codex", "bin", process.platform === "win32" ? "codex.exe" : "codex");
    expect(resolveCodexExecutable({ LOCALAPPDATA: "C:\\Users\\tester\\AppData\\Local" }, existing(local))).toBe(path.normalize(local));
  });

  it("resolves CODEX_HOME standalone current package layouts", () => {
    const home = "C:\\Users\\tester\\.codex";
    const currentBin = path.join(home, "packages", "standalone", "current", "bin", process.platform === "win32" ? "codex.exe" : "codex");
    expect(resolveCodexExecutable({ CODEX_HOME: home }, existing(currentBin))).toBe(path.normalize(currentBin));
  });

  it("resolves codex from PATH when an executable is directly available", () => {
    const bin = path.join("C:\\Tools", process.platform === "win32" ? "codex.exe" : "codex");
    expect(resolveCodexExecutable({ PATH: "C:\\Tools" }, existing(bin))).toBe(path.normalize(bin));
  });
});
`;
const regressionPath = path.join(root, "src/main/services/v019-runtime-regression.test.ts");
let existingRegression = "";
try { existingRegression = await readFile(regressionPath, "utf8"); } catch { /* create */ }
if (existingRegression !== regressionTest) {
  await writeFile(regressionPath, regressionTest, "utf8");
  changed += 1;
  process.stdout.write("V019_PATCHED src/main/services/v019-runtime-regression.test.ts\n");
}

process.stdout.write(`V019_RUNTIME_FIXES_COMPLETE changed=${changed}\n`);
