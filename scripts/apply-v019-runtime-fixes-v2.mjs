import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
let changed = 0;

async function edit(relative, mutate) {
  const file = path.join(root, relative);
  const raw = await readFile(file, "utf8");
  const before = raw.replace(/\r\n/gu, "\n");
  const after = mutate(before);
  if (after === before) return;
  await writeFile(file, after, "utf8");
  changed += 1;
  process.stdout.write(`V019_PATCHED ${relative}\n`);
}

function replaceRegex(text, pattern, replacement, code) {
  if (!pattern.test(text)) throw new Error(`${code}: expected source pattern not found`);
  return text.replace(pattern, replacement);
}

await edit("package.json", (text) => text.replace(/"version":\s*"0\.1\.8"/u, '"version": "0.1.9"'));

await edit("src/shared/contracts.ts", (text) => {
  if (text.includes('kind: z.enum(["provider", "command", "evidence", "waiting", "failure"])') && text.includes('stage: z.string().trim().min(1).max(64).nullable().optional()')) return text;
  return replaceRegex(text,
    /export const ThreadActivityEventSchema = z\.object\(\{[\s\S]*?\n\}\)\.strict\(\);\n\nexport type ThreadActivityEvent = z\.infer<typeof ThreadActivityEventSchema>;/u,
`export const ThreadActivityEventSchema = z.object({
  threadId: z.string().min(8).max(128),
  kind: z.enum(["provider", "command", "evidence", "waiting", "failure"]),
  stage: z.string().trim().min(1).max(64).nullable().optional(),
  provider: z.string().trim().min(1).max(160).nullable().optional(),
  model: z.string().trim().min(1).max(200).nullable().optional(),
  message: z.string().trim().min(1).max(2_000),
  createdAt: z.string().datetime()
}).strict();

export type ThreadActivityEvent = z.infer<typeof ThreadActivityEventSchema>;`,
    "THREAD_ACTIVITY_SCHEMA_PATTERN_MISSING");
});

await edit("src/main/ipc.ts", (text) => {
  if (text.includes('stage?: string | null; provider?: string | null; model?: string | null; message: string; createdAt: string')) return text;
  return replaceRegex(text,
    /const publishActivity = \(activity: \{ kind: "provider" \| "command" \| "evidence" \| "failure" \| "waiting"; message: string; createdAt: string \}\): void => \{/u,
    'const publishActivity = (activity: { kind: "provider" | "command" | "evidence" | "waiting" | "failure"; stage?: string | null; provider?: string | null; model?: string | null; message: string; createdAt: string }): void => {',
    "THREAD_ACTIVITY_IPC_PATTERN_MISSING");
});

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
    const normalized = path.normalize(value.replace(/^"|"$/gu, ""));
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
  if (appData && process.platform === "win32") {
    const architecture = process.arch === "arm64" ? "aarch64" : "x86_64";
    const target = \`\${architecture}-pc-windows-msvc\`;
    add(path.join(appData, "npm", "node_modules", "@openai", "codex", "node_modules", "@openai", \`codex-win32-\${process.arch === "arm64" ? "arm64" : "x64"}\`, "vendor", target, "bin", "codex.exe"));
  }

  const rawPath = environment.PATH ?? environment.Path ?? "";
  for (const rawEntry of rawPath.split(path.delimiter)) {
    const entry = rawEntry.replace(/^"|"$/gu, "").trim();
    if (!entry) continue;
    add(path.join(entry, process.platform === "win32" ? "codex.exe" : "codex"));
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

const regression = `import path from "node:path";
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
    const base = "C:\\Users\\tester\\AppData\\Local";
    const expected = path.join(base, "Programs", "OpenAI", "Codex", "bin", process.platform === "win32" ? "codex.exe" : "codex");
    expect(resolveCodexExecutable({ LOCALAPPDATA: base }, existing(expected))).toBe(path.normalize(expected));
  });

  it("resolves CODEX_HOME standalone current/bin", () => {
    const home = "C:\\Users\\tester\\.codex";
    const expected = path.join(home, "packages", "standalone", "current", "bin", process.platform === "win32" ? "codex.exe" : "codex");
    expect(resolveCodexExecutable({ CODEX_HOME: home }, existing(expected))).toBe(path.normalize(expected));
  });

  it("resolves a direct PATH Codex executable", () => {
    const entry = "C:\\Tools";
    const expected = path.join(entry, process.platform === "win32" ? "codex.exe" : "codex");
    expect(resolveCodexExecutable({ PATH: entry }, existing(expected))).toBe(path.normalize(expected));
  });
});
`;
const regressionPath = path.join(root, "src/main/services/v019-runtime-regression.test.ts");
let oldRegression = "";
try { oldRegression = (await readFile(regressionPath, "utf8")).replace(/\r\n/gu, "\n"); } catch { /* create */ }
if (oldRegression !== regression) {
  await writeFile(regressionPath, regression, "utf8");
  changed += 1;
  process.stdout.write("V019_PATCHED src/main/services/v019-runtime-regression.test.ts\n");
}

process.stdout.write(`V019_RUNTIME_FIXES_V2_COMPLETE changed=${changed}\n`);
