import { readFile, writeFile } from "node:fs/promises";

async function text(file) { return await readFile(file, "utf8"); }
async function save(file, value) { await writeFile(file, value, "utf8"); }

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`PATCH_ANCHOR_MISSING:${label}`);
  if (source.indexOf(before, first + before.length) >= 0) throw new Error(`PATCH_ANCHOR_AMBIGUOUS:${label}`);
  return source.slice(0, first) + after + source.slice(first + before.length);
}

async function patchPackage() {
  const file = "package.json";
  let source = await text(file);
  source = replaceOnce(source, '"version": "0.1.10"', '"version": "0.1.11"', "package-version");
  await save(file, source);
}

async function patchAgent() {
  const file = "src/main/services/agent-service.ts";
  let source = await text(file);
  source = replaceOnce(source,
    '"--max-turns", workspaceMutation ? "48" : "1",',
    '"--max-turns", workspaceMutation ? "96" : "1",',
    "agent-max-turns");
  source = replaceOnce(source,
    'timeoutMs: 180_000,\n      maxOutputBytes: 2 * 1024 * 1024,',
    'timeoutMs: workspaceMutation ? 10 * 60_000 : 180_000,\n      maxOutputBytes: workspaceMutation ? 8 * 1024 * 1024 : 2 * 1024 * 1024,',
    "agent-workspace-budget");
  await save(file, source);
}

async function patchWorkspaceTurn() {
  const file = "src/main/services/workspace-turn-service.ts";
  let source = await text(file);
  source = replaceOnce(source,
`  if (!before && after) {
    if (!after.exists || /D/u.test(after.state)) return "deleted";
    return "added";
  }`,
`  if (!before && after) {
    if (!after.exists || /D/u.test(after.state)) return "deleted";
    // A clean tracked file is absent from the baseline dirty snapshot. If it becomes M/T/etc.
    // during this turn it is a modification, not a newly-created file. Only Git add/untracked
    // states (A/?) or generic non-Git discovery are classified as added.
    if (after.state === "GENERIC" || /[A?]/u.test(after.state)) return "added";
    return "modified";
  }`,
    "workspace-change-kind");
  await save(file, source);
}

async function patchCoreApi() {
  const file = "src/main/services/core-api.ts";
  let source = await text(file);
  source = replaceOnce(source,
    'import type { AgentService } from "./agent-service.js";',
    'import { isWorkspaceMutationRequest, type AgentService } from "./agent-service.js";',
    "core-agent-import");
  source = replaceOnce(source,
    'import type { ProjectService } from "./project-service.js";',
    'import type { ProjectService } from "./project-service.js";\nimport type { WorkspaceTurnService } from "./workspace-turn-service.js";',
    "core-workspace-import");
  source = replaceOnce(source,
    'import { CatalogToolCallInputSchema, EvolutionRoutingSchema } from "../../shared/contracts.js";',
    'import { CatalogToolCallInputSchema, EvolutionRoutingSchema, type ThreadItem, type ThreadWorkspaceResult } from "../../shared/contracts.js";',
    "core-contract-import");
  source = replaceOnce(source,
    '  git: GitService;\n  settings: SettingsService;',
    '  git: GitService;\n  workspaceTurns?: WorkspaceTurnService;\n  settings: SettingsService;',
    "core-options-workspace");

  const helper = `const McpToolParamsSchema = z.object({ pluginId: z.string().min(2).max(160), toolName: z.string().min(1).max(160) }).strict();

type VerifiedAgentTurn = { content: string; workspaceResult: ThreadWorkspaceResult | null };

async function executeVerifiedAgentTurn(options: CoreApiOptions, input: {
  threadId: string;
  projectId: string;
  prompt: string;
  history: readonly ThreadItem[];
}): Promise<VerifiedAgentTurn> {
  const workspaceIntent = isWorkspaceMutationRequest(input.prompt);
  if (workspaceIntent && !options.workspaceTurns) throw new Error("WORKSPACE_VERIFIER_UNAVAILABLE");
  const project = options.projects.get(input.projectId);
  const before = workspaceIntent ? await options.workspaceTurns!.capture(input.projectId) : null;
  const verificationTurnId = randomUUID();
  let response: Awaited<ReturnType<AgentService["respond"]>>;

  try {
    response = await options.agent.respond(input.prompt, project.rootPath, input.history);
  } catch (error) {
    if (before && options.workspaceTurns) {
      try {
        const workspaceResult = await options.workspaceTurns.finalize({
          projectId: input.projectId,
          threadId: input.threadId,
          turnId: verificationTurnId,
          intent: "WORKSPACE_MUTATION",
          before
        });
        try { options.database.appendEvent("thread.workspace-result", input.threadId, workspaceResult, true); } catch { /* observability must not mask the provider failure */ }
        if (workspaceResult.mutated) throw new Error("AGENT_FAILED_AFTER_WORKSPACE_MUTATION");
      } catch (verificationError) {
        if (verificationError instanceof Error && verificationError.message === "AGENT_FAILED_AFTER_WORKSPACE_MUTATION") throw verificationError;
        throw new Error("WORKSPACE_VERIFICATION_FAILED");
      }
    }
    const code = error instanceof Error && /^[A-Z][A-Z0-9_]+$/u.test(error.message) ? error.message : "AGENT_EXECUTION_FAILED";
    throw new Error(code);
  }

  if (!before || !options.workspaceTurns) return { content: response.content, workspaceResult: null };

  let workspaceResult: ThreadWorkspaceResult;
  try {
    workspaceResult = await options.workspaceTurns.finalize({
      projectId: input.projectId,
      threadId: input.threadId,
      turnId: verificationTurnId,
      intent: "WORKSPACE_MUTATION",
      before
    });
  } catch {
    throw new Error("WORKSPACE_VERIFICATION_FAILED");
  }
  try { options.database.appendEvent("thread.workspace-result", input.threadId, workspaceResult, !workspaceResult.verified); } catch { /* response correctness does not depend on event persistence */ }
  if (workspaceResult.gitHeadChanged) throw new Error("WORKSPACE_GIT_HEAD_CHANGED");
  if (!workspaceResult.mutated || !workspaceResult.verified) throw new Error("WORKSPACE_MUTATION_NOT_VERIFIED");
  return { content: response.content, workspaceResult };
}
`;
  source = replaceOnce(source,
    'const McpToolParamsSchema = z.object({ pluginId: z.string().min(2).max(160), toolName: z.string().min(1).max(160) }).strict();\n',
    helper,
    "core-verified-helper");

  const oldMessage = `      const attachmentContext = await this.#options.attachments.buildAgentContext(params.id, body.attachmentIds);
      const prompt = \`${'${body.content || "Ekli dosyaları incele."}${attachmentContext}'}\`;
      const assistantContent = await this.#options.agent.respond(prompt, this.#options.projects.get(current.thread.projectId).rootPath, current.items)
        .then((response) => response.content)
        .catch((error: unknown) => {
          const code = error instanceof Error && /^[A-Z][A-Z0-9_]+$/u.test(error.message) ? error.message : "AGENT_EXECUTION_FAILED";
          return \`Ajan yanıtı üretilemedi (**${'${code}'}**). Sağlayıcı ve Hermes durumunu /v1/capabilities üzerinden denetleyin.\`;
        });
      return await reply.code(201).send(this.#options.database.appendMessage(params.id, body.content, assistantContent, body.attachmentIds));`;
  const newMessage = `      const attachmentContext = await this.#options.attachments.buildAgentContext(params.id, body.attachmentIds);
      const prompt = \`${'${body.content || "Ekli dosyaları incele."}${attachmentContext}'}\`;
      const execution = await executeVerifiedAgentTurn(this.#options, {
        threadId: params.id,
        projectId: current.thread.projectId,
        prompt,
        history: current.items
      });
      const detail = this.#options.database.appendMessage(params.id, body.content, execution.content, body.attachmentIds);
      return await reply.code(201).send(execution.workspaceResult ? { ...detail, workspaceResult: execution.workspaceResult } : detail);`;
  source = replaceOnce(source, oldMessage, newMessage, "core-thread-message-route");

  const oldRegenerate = `      const prompt = \`${'${userItem.content || "Ekli dosyaları incele."}${attachmentContext}'}\`;
      const replacement = await this.#options.agent.respond(prompt, this.#options.projects.get(current.thread.projectId).rootPath, current.items.slice(0, targetIndex)).then((response) => response.content);
      return this.#options.database.replaceAssistantMessage(params.id, params.itemId, replacement);`;
  const newRegenerate = `      const prompt = \`${'${userItem.content || "Ekli dosyaları incele."}${attachmentContext}'}\`;
      const execution = await executeVerifiedAgentTurn(this.#options, {
        threadId: params.id,
        projectId: current.thread.projectId,
        prompt,
        history: current.items.slice(0, targetIndex)
      });
      const detail = this.#options.database.replaceAssistantMessage(params.id, params.itemId, execution.content);
      return execution.workspaceResult ? { ...detail, workspaceResult: execution.workspaceResult } : detail;`;
  source = replaceOnce(source, oldRegenerate, newRegenerate, "core-regenerate-route");
  await save(file, source);
}

async function patchMain() {
  const file = "src/main/main.ts";
  let source = await text(file);
  source = replaceOnce(source,
    '    attachments,\n    git,\n    evolution,',
    '    attachments,\n    git,\n    workspaceTurns,\n    evolution,',
    "main-core-api-workspace");
  await save(file, source);
}

async function patchAgentTests() {
  const file = "src/main/services/workspace-agent-mode.test.ts";
  let source = await text(file);
  source = replaceOnce(source, 'expect(args).toContain("48");', 'expect(args).toContain("96");', "workspace-agent-test-turns");
  await save(file, source);
}

async function patchWorkspaceTests() {
  const file = "src/main/services/workspace-turn-service.test.ts";
  let source = await text(file);
  const marker = `  it("fails verification if the provider changes Git HEAD during the task", async () => {`;
  const test = `  it("classifies a clean tracked file changed during the turn as modified instead of added", async () => {
    const rootPath = await root();
    await writeFile(path.join(rootPath, "index.html"), "<html>before</html>\\n", "utf8");
    const clean = gitStatus(rootPath, []);
    const modifiedChanges: GitStatus["changes"] = [{ indexStatus: ".", worktreeStatus: "M", path: "index.html", originalPath: null }];
    const modified = gitStatus(rootPath, modifiedChanges, [{ path: "index.html", additions: 1, deletions: 1, binary: false }]);
    const service = new WorkspaceTurnService(projectService(rootPath), gitService([clean, modified, modified]));

    const before = await service.capture("project-12345678");
    await writeFile(path.join(rootPath, "index.html"), "<html>after</html>\\n", "utf8");
    const result = await service.finalize({ projectId: "project-12345678", threadId: "thread-12345678", turnId: "turn-12345678", intent: "WORKSPACE_MUTATION", before });

    expect(result.verified).toBe(true);
    expect(result.changedFiles).toHaveLength(1);
    expect(result.changedFiles[0]).toMatchObject({ path: "index.html", kind: "modified", verified: true });
  });

`;
  if (!source.includes(test.trim())) source = replaceOnce(source, marker, test + marker, "workspace-modified-test");
  await save(file, source);
}

async function patchCoreApiTests() {
  const file = "src/main/services/core-api.test.ts";
  let source = await text(file);
  source = replaceOnce(source,
    'import { SettingsService } from "./settings-service.js";',
    'import { SettingsService } from "./settings-service.js";\nimport type { WorkspaceTurnService } from "./workspace-turn-service.js";',
    "core-test-workspace-import");
  const agentLine = '    const agent = { respond: vi.fn().mockResolvedValue({ content: "Gerçek servis sözleşmesi için izole test yanıtı." }) } as unknown as AgentService;';
  const agentPlus = `${agentLine}\n    const workspaceTurns = {\n      capture: vi.fn(async (projectId: string) => ({ projectId, rootPath: root, gitAvailable: true, gitHead: "1111111111111111111111111111111111111111", dirtyCount: 0, entries: new Map() })),\n      finalize: vi.fn(async (input: { projectId: string; threadId: string; turnId: string; intent: "WORKSPACE_MUTATION" }) => ({\n        threadId: input.threadId, turnId: input.turnId, projectId: input.projectId, intent: input.intent, mutated: true, verified: true, gitHeadChanged: false,\n        baselineDirtyCount: 0, finalDirtyCount: 1, changedFiles: [{ path: "index.html", kind: "added", beforeSha256: null, afterSha256: "a".repeat(64), additions: 1, deletions: 0, binary: false, verified: true }],\n        primaryFile: "index.html", previewPath: "index.html", evidence: ["turn-change:added:index.html"], createdAt: new Date().toISOString()\n      }))\n    } as unknown as WorkspaceTurnService;`;
  source = replaceOnce(source, agentLine, agentPlus, "core-test-workspace-mock");
  source = replaceOnce(source,
    '      git: new GitService(runner),\n      settings,',
    '      git: new GitService(runner),\n      workspaceTurns,\n      settings,',
    "core-test-workspace-option");
  const ordinaryMessage = `    const pairingResponse = await fetch(\`${'${origin}'}/v1/workers/pairings\`, {`;
  const mutationRequest = `    const workspaceMessage = await fetch(\`${'${origin}'}/v1/threads/${'${created.thread.id}'}/messages\`, {
      method: "POST",
      headers: { authorization: "Bearer test-only-api-key", "content-type": "application/json" },
      body: JSON.stringify({ content: "index.html oluştur" })
    });
    const workspacePayload = await workspaceMessage.json() as { workspaceResult?: { verified: boolean; previewPath: string | null; changedFiles: Array<{ path: string; kind: string }> } };
`;
  if (!source.includes("const workspaceMessage = await fetch")) source = replaceOnce(source, ordinaryMessage, mutationRequest + ordinaryMessage, "core-test-workspace-request");
  const assertions = `    expect(pairingResponse.status).toBe(201);`;
  const workspaceAssertions = `    expect(workspaceMessage.status).toBe(201);
    expect(workspacePayload.workspaceResult).toMatchObject({ verified: true, previewPath: "index.html", changedFiles: [{ path: "index.html", kind: "added" }] });
    expect(workspaceTurns.capture).toHaveBeenCalledTimes(1);
    expect(workspaceTurns.finalize).toHaveBeenCalledTimes(1);
`;
  if (!source.includes("expect(workspaceMessage.status).toBe(201)")) source = replaceOnce(source, assertions, workspaceAssertions + assertions, "core-test-workspace-assertions");
  await save(file, source);
}

async function patchCanvas() {
  const file = "src/renderer/CanvasInspector.tsx";
  let source = await text(file);
  source = replaceOnce(source,
`  const [consoleEntries, setConsoleEntries] = useState<ConsoleEntry[]>([]);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const targetPath = result?.previewPath ?? result?.primaryFile ?? null;`,
`  const [consoleEntries, setConsoleEntries] = useState<ConsoleEntry[]>([]);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const defaultTargetPath = result?.previewPath ?? result?.primaryFile ?? null;
  const [selectedPath, setSelectedPath] = useState<string | null>(defaultTargetPath);
  const targetPath = selectedPath ?? defaultTargetPath;`,
    "canvas-selected-path");
  source = replaceOnce(source,
    '  useEffect(() => { void loadFile(); }, [loadFile, result?.createdAt]);',
    '  useEffect(() => { setSelectedPath(defaultTargetPath); }, [defaultTargetPath, result?.createdAt]);\n  useEffect(() => { void loadFile(); }, [loadFile, result?.createdAt]);',
    "canvas-selected-path-effect");
  source = replaceOnce(source,
`<div><strong>{item.path}</strong><small>{item.verified ? "diskten doğrulandı" : "doğrulama eksik"}{item.binary ? " · binary" : ""}</small></div><b className="additions">`,
`<div><strong>{item.path}</strong><small>{item.verified ? "diskten doğrulandı" : "doğrulama eksik"}{item.binary ? " · binary" : ""}</small></div><button className="canvas-change-open" onClick={() => { setSelectedPath(item.path); setTab("code"); }} disabled={item.kind === "deleted" || item.binary || !item.afterSha256} title="Dosyayı Canvas kod düzenleyicisinde aç"><Code2 size={12} /> Aç</button><b className="additions">`,
    "canvas-open-changed-file");
  await save(file, source);
}

async function patchStyles() {
  const file = "src/renderer/styles.css";
  let source = await text(file);
  const marker = ".canvas-changes article";
  if (!source.includes(".canvas-change-open")) {
    const index = source.indexOf(marker);
    if (index < 0) throw new Error("PATCH_ANCHOR_MISSING:canvas-style-anchor");
    const lineEnd = source.indexOf("\n", index);
    source = source.slice(0, lineEnd + 1) + `.canvas-change-open { display: inline-flex; align-items: center; gap: 4px; padding: 4px 7px; border: 1px solid var(--border); border-radius: 5px; color: var(--text-secondary); font-size: 10px; }\n.canvas-change-open:hover:not(:disabled) { border-color: var(--accent); color: var(--text-primary); }\n.canvas-change-open:disabled { opacity: .35; cursor: not-allowed; }\n` + source.slice(lineEnd + 1);
  }
  if (!source.includes("@media (max-width: 900px) { .inspector.canvas-inspector")) {
    source += `\n@media (max-width: 900px) { .inspector.canvas-inspector { position: absolute; inset: 0 0 0 auto; z-index: 70; width: 100%; min-width: 0; max-width: 100%; box-shadow: -20px 0 40px rgba(0,0,0,.35); } }\n`;
  }
  await save(file, source);
}

await patchPackage();
await patchAgent();
await patchWorkspaceTurn();
await patchCoreApi();
await patchMain();
await patchAgentTests();
await patchWorkspaceTests();
await patchCoreApiTests();
await patchCanvas();
await patchStyles();
console.log("DEVBOX_V011_HARDENING_APPLIED");
