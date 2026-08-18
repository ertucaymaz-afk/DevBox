import { readFile, writeFile } from "node:fs/promises";

async function read(path) { return (await readFile(path, "utf8")).replace(/\r\n/gu, "\n"); }
async function save(path, content) { await writeFile(path, content, "utf8"); }
function once(source, before, after, label) {
  if (source.includes(after)) return source;
  const at = source.indexOf(before);
  if (at < 0) throw new Error(`PATCH_ANCHOR_MISSING:${label}`);
  if (source.indexOf(before, at + before.length) >= 0) throw new Error(`PATCH_ANCHOR_AMBIGUOUS:${label}`);
  return source.slice(0, at) + after + source.slice(at + before.length);
}

async function patchPackage() {
  const file = "package.json"; let s = await read(file);
  s = once(s, '"version": "0.1.12"', '"version": "0.1.13"', "package-version");
  await save(file, s);
}

async function patchAgent() {
  const file = "src/main/services/agent-service.ts"; let s = await read(file);
  const anchor = '    "- Son yanıtta yalnız gerçekten yapılan işleri ve diskten doğrulanan dosya yollarını söyle. Dosya değişmediyse başarı iddia etme."\n';
  const replacement = '    "- Son yanıtta yalnız gerçekten yapılan işleri ve diskten doğrulanan dosya yollarını söyle. Dosya değişmediyse başarı iddia etme.",\n    "- SİMÜLASYON, DEMO, FAKE, SAHTE, placeholder, canned response, temsili başarı veya yalnız görsel maket üretme. İstenen özellik gerçek dosya ve çalışan davranış olarak bulunmalı.",\n    "- HTML/CSS/JS önizlemesinde kullanıcı açıkça istemedikçe CDN, uzak script, uzak stylesheet, uzak font veya ağ bağımlılığı kullanma. İlk görünüm ağ olmadan çalışmalı.",\n    "- Animasyon istenirse gerçek CSS keyframes/Web Animations API/vanilla JavaScript veya çalışma alanındaki yerel varlıklarla uygula. Eksik dış kütüphane yüzünden opacity:0/visibility:hidden durumda kalan içerik bırakma.",\n    "- index.html üretiminde geçerli doctype, görünür body içeriği, responsive viewport ve ilk paintte görünür içerik zorunludur; yalnız boş container veya sonradan çalışacağı varsayılan kod bırakma."\n';
  s = once(s, anchor, replacement, "workspace-reality-rules");
  await save(file, s);
}

async function patchPreviewProtocol() {
  const file = "src/main/services/preview-protocol-service.ts"; let s = await read(file);
  s = once(s,
`  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",`,
`  ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".wasm": "application/wasm",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".jpeg": "image/jpeg",`, "preview-mime");
  s = s.replace('  ".json": "application/json; charset=utf-8",\n  ".mjs"', '  ".mjs"');
  s = once(s,
`  addEventListener('unhandledrejection',(event)=>send('error',['Unhandled promise rejection',String(event.reason)]));
  addEventListener('DOMContentLoaded',()=>{try{parent.postMessage({source:'devbox-preview',type:'ready',title:document.title,createdAt:new Date().toISOString()},'*')}catch{}});`,
`  addEventListener('unhandledrejection',(event)=>send('error',['Unhandled promise rejection',String(event.reason)]));
  addEventListener('securitypolicyviolation',(event)=>send('error',['CSP',event.violatedDirective,event.blockedURI||'blocked']));
  addEventListener('DOMContentLoaded',()=>requestAnimationFrame(()=>{try{const body=document.body;const rect=body?.getBoundingClientRect();parent.postMessage({source:'devbox-preview',type:'ready',title:document.title,bodyWidth:Math.round(rect?.width||0),bodyHeight:Math.round(rect?.height||0),createdAt:new Date().toISOString()},'*')}catch{}}));`, "preview-bridge-health");
  await save(file, s);
}

async function patchWorktree() {
  const file = "src/main/services/worktree-service.ts"; let s = await read(file);
  const anchor = `  public async create(repositoryRoot: string, projectId: string, name: string, ref: string, mode: "detached" | "branch"): Promise<Worktree> {`;
  const method = `  public async ensureEvolution(repositoryRoot: string, projectId: string): Promise<Worktree> {
    const projectKey = createHash("sha256").update(projectId).digest("hex").slice(0, 16);
    const name = \`api-evolution-\${projectKey.slice(0, 8)}\`;
    const target = path.join(this.#managedRoot, projectKey, name);
    const branch = \`devbox/\${name}\`;
    await mkdir(path.dirname(target), { recursive: true });
    const registered = await this.list(repositoryRoot);
    const existing = registered.find((worktree) => path.resolve(worktree.path).toLocaleLowerCase("en-US") === path.resolve(target).toLocaleLowerCase("en-US"));
    if (existing) return existing;

    const branchProbe = await this.#runner.run({ executable: "git", args: ["-C", repositoryRoot, "show-ref", "--verify", "--quiet", \`refs/heads/\${branch}\`], cwd: repositoryRoot, timeoutMs: 15_000, maxOutputBytes: 256 * 1024 });
    const args = branchProbe.exitCode === 0
      ? ["-C", repositoryRoot, "worktree", "add", target, branch]
      : ["-C", repositoryRoot, "worktree", "add", "-b", branch, target, "HEAD"];
    const created = await this.#runner.run({ executable: "git", args, cwd: repositoryRoot, timeoutMs: 120_000, maxOutputBytes: 2 * 1_048_576 });
    if (created.exitCode !== 0 || created.timedOut || created.truncated) throw new Error(created.stderr.trim() || "EVOLUTION_WORKTREE_CREATE_FAILED");
    const resolved = (await this.list(repositoryRoot)).find((worktree) => path.resolve(worktree.path).toLocaleLowerCase("en-US") === path.resolve(target).toLocaleLowerCase("en-US"));
    if (!resolved) throw new Error("EVOLUTION_WORKTREE_NOT_REGISTERED");
    return resolved;
  }

`;
  s = once(s, anchor, method + anchor, "worktree-ensure-evolution");
  await save(file, s);
}

async function patchEvolution() {
  const file = "src/main/services/api-evolution-service.ts"; let s = await read(file);
  s = once(s, 'import type { SettingsService } from "./settings-service.js";\n', 'import type { SettingsService } from "./settings-service.js";\nimport type { WorktreeService } from "./worktree-service.js";\n', "evolution-worktree-import");
  s = once(s,
`  readonly #runner: CommandRunner;
  readonly #inFlight`,
`  readonly #runner: CommandRunner;
  readonly #worktrees: WorktreeService | null;
  readonly #inFlight`, "evolution-worktree-field");
  s = once(s,
`  public constructor(database: StateDatabase, projects: ProjectService, agent: AgentService, settings: SettingsService, spec: DevelopmentSpecService, git: GitService, runner: CommandRunner) {
    this.#database = database; this.#projects = projects; this.#agent = agent; this.#settings = settings; this.#spec = spec; this.#git = git; this.#runner = runner;
  }`,
`  public constructor(database: StateDatabase, projects: ProjectService, agent: AgentService, settings: SettingsService, spec: DevelopmentSpecService, git: GitService, runner: CommandRunner, worktrees: WorktreeService | null = null) {
    this.#database = database; this.#projects = projects; this.#agent = agent; this.#settings = settings; this.#spec = spec; this.#git = git; this.#runner = runner; this.#worktrees = worktrees;
  }`, "evolution-constructor");

  s = once(s,
`    const project = this.#projects.get(projectId); let campaign = this.#resetDaily(this.get(projectId));
    const specTask`,
`    const project = this.#projects.get(projectId); let campaign = this.#resetDaily(this.get(projectId));
    const evolutionWorktree = this.#worktrees ? await this.#worktrees.ensureEvolution(project.rootPath, projectId) : null;
    const executionRoot = evolutionWorktree?.path ?? project.rootPath;
    const isolatedEvolutionRoot = Boolean(evolutionWorktree && path.resolve(executionRoot).toLocaleLowerCase("en-US") !== path.resolve(project.rootPath).toLocaleLowerCase("en-US"));
    const specTask`, "evolution-execution-root");

  s = s.replace('worktreePath: project.rootPath', 'worktreePath: executionRoot');
  s = s.replace('`Yazılabilir kök: ${project.rootPath}`', '`Yazılabilir kök: ${executionRoot}`');
  s = once(s,
`      const baselineStatus = await this.#git.status(project.rootPath);
      if (!baselineStatus.available) throw new Error(\`EVOLUTION_REQUIRES_GIT_REPOSITORY:\${baselineStatus.error ?? "NOT_A_GIT_REPOSITORY"}\`);
      if (!baselineStatus.head || !/^[a-f0-9]{40}$/u.test(baselineStatus.head)) throw new Error("EVOLUTION_BASELINE_HEAD_INVALID");
      baselineHead = baselineStatus.head;
      baselineManaged = this.#isManagedWorkspace(project.rootPath);
      if (baselineStatus.changes.length > 0) throw new Error(\`EVOLUTION_WORKSPACE_DIRTY_BASELINE:\${baselineStatus.changes.slice(0, 12).map((item) => item.path).join(",")}\`);
      baselineWasClean = true;
      baselineFingerprint = await this.#workspaceFingerprint(project.rootPath, controller.signal);
      if (!baselineFingerprint) throw new Error("EVOLUTION_REQUIRES_GIT_REPOSITORY");
      const response = await this.#agent.respondForEvolution(
        systemPrompt, project.rootPath, campaign.routing, (progress) => this.#fromAgentProgress(projectId, progress), controller.signal,
        async () => {
          const candidateFingerprint = await this.#workspaceFingerprint(project.rootPath, controller.signal);`,
`      let baselineStatus = await this.#git.status(executionRoot);
      if (!baselineStatus.available) throw new Error(\`EVOLUTION_REQUIRES_GIT_REPOSITORY:\${baselineStatus.error ?? "NOT_A_GIT_REPOSITORY"}\`);
      if (!baselineStatus.head || !/^[a-f0-9]{40}$/u.test(baselineStatus.head)) throw new Error("EVOLUTION_BASELINE_HEAD_INVALID");
      if (baselineStatus.changes.length > 0 && isolatedEvolutionRoot) {
        await this.#restoreManagedWorkspace(executionRoot, baselineStatus.head);
        baselineStatus = await this.#git.status(executionRoot);
      }
      if (baselineStatus.changes.length > 0) throw new Error(\`EVOLUTION_WORKSPACE_DIRTY_BASELINE:\${baselineStatus.changes.slice(0, 12).map((item) => item.path).join(",")}\`);
      baselineHead = baselineStatus.head;
      baselineManaged = isolatedEvolutionRoot || this.#isManagedWorkspace(executionRoot);
      baselineWasClean = true;
      baselineFingerprint = await this.#workspaceFingerprint(executionRoot, controller.signal);
      if (!baselineFingerprint) throw new Error("EVOLUTION_REQUIRES_GIT_REPOSITORY");
      const response = await this.#agent.respondForEvolution(
        systemPrompt, executionRoot, campaign.routing, (progress) => this.#fromAgentProgress(projectId, progress), controller.signal,
        async () => {
          const candidateFingerprint = await this.#workspaceFingerprint(executionRoot, controller.signal);`, "evolution-baseline-isolation");

  for (const [before, after] of [
    ['await this.#restoreManagedWorkspace(project.rootPath, baselineHead)', 'await this.#restoreManagedWorkspace(executionRoot, baselineHead)'],
    ['this.#verifyWorkspace(project.rootPath, baselineFingerprint, controller.signal)', 'this.#verifyWorkspace(executionRoot, baselineFingerprint, controller.signal)'],
    ['this.#commitVerifiedMutation(project.rootPath, specTask, controller.signal)', 'this.#commitVerifiedMutation(executionRoot, specTask, controller.signal)']
  ]) s = s.split(before).join(after);

  s = once(s,
`        const phaseEvidence = this.#spec.writePhaseEvidence(projectId, project.rootPath, specTask.phaseId);
        const current = this.get(projectId);`,
`        const phaseEvidence: string[] = [];
        const current = this.get(projectId);`, "blocked-no-repo-evidence");

  s = once(s,
`      this.#spec.mark(projectId, specTask.taskId, "PASS", { evidence, lastError: null, blockReason: null, acceptance: response.acceptance, deterministicReviewer: "DEVBOX_DETERMINISTIC_GATE_V1" });
      const phaseEvidence = this.#spec.writePhaseEvidence(projectId, project.rootPath, specTask.phaseId);
      const learning: EvolutionLearning`,
`      this.#spec.mark(projectId, specTask.taskId, "PASS", { evidence, lastError: null, blockReason: null, acceptance: response.acceptance, deterministicReviewer: "DEVBOX_DETERMINISTIC_GATE_V1" });
      const phaseEvidence = this.#spec.writePhaseEvidence(projectId, executionRoot, specTask.phaseId);
      const phaseEvidenceCommit = await this.#commitEvidenceSnapshot(executionRoot, specTask, controller.signal);
      const finalEvidence = [...evidence, ...phaseEvidence, ...phaseEvidenceCommit].slice(0, 40);
      this.#spec.mark(projectId, specTask.taskId, "PASS", { evidence: finalEvidence, lastError: null, blockReason: null, acceptance: response.acceptance, deterministicReviewer: "DEVBOX_DETERMINISTIC_GATE_V1" });
      const learning: EvolutionLearning`, "success-evidence-commit");
  s = s.replace('evidence: [...evidence, ...phaseEvidence].slice(0, 40), learnedAt: completedAt', 'evidence: finalEvidence, learnedAt: completedAt');
  s = s.replace('evidence: [...evidence, ...phaseEvidence].slice(0, 40), blockReason: null', 'evidence: finalEvidence, blockReason: null');

  s = once(s,
`      let phaseEvidence: string[] = [];
      try { phaseEvidence = this.#spec.writePhaseEvidence(projectId, project.rootPath, specTask.phaseId); } catch (evidenceError) {
        const evidenceMessage = evidenceError instanceof Error ? evidenceError.message : String(evidenceError);
        if (!recovery && !blocker && !cancelled) this.#spec.mark(projectId, specTask.taskId, "RECOVERY_REQUIRED", { lastError: \`EVIDENCE_WRITE_FAILED:\${evidenceMessage}\`, evidence: [durable.id] });
      }`,
`      const phaseEvidence: string[] = [];`, "failure-no-repo-evidence");

  s = once(s,
`      const recovery = !cancelled && (rollbackFailed || message.includes("EVOLUTION_WORKSPACE_DIRTY_BASELINE") || message.includes("EVOLUTION_BASELINE_HEAD_INVALID") || (!blocker && attempts >= MAX_AUTOMATIC_RETRIES));`,
`      const recovery = !cancelled && (rollbackFailed || (!isolatedEvolutionRoot && (message.includes("EVOLUTION_WORKSPACE_DIRTY_BASELINE") || message.includes("EVOLUTION_BASELINE_HEAD_INVALID"))));`, "continuous-retry");
  s = s.replace(': recovery ? `${specTask.taskId} ${attempts} başarısız denemeden sonra RECOVERY_REQUIRED. Kör tekrar durduruldu.`', ': recovery ? `${specTask.taskId} güvenli recovery gerektiriyor; otomatik ilerleme veri kaybı riski nedeniyle durdu.`');

  const commitAnchor = `  async #commitVerifiedMutation(rootPath: string, specTask: DevelopmentSpecTask, cancellation: AbortSignal): Promise<string[]> {`;
  const evidenceMethod = `  async #commitEvidenceSnapshot(rootPath: string, specTask: DevelopmentSpecTask, cancellation: AbortSignal): Promise<string[]> {
    if (cancellation.aborted) throw new Error("EVOLUTION_CANCELLED");
    const status = await this.#git.status(rootPath);
    if (!status.available) throw new Error(\`EVOLUTION_EVIDENCE_GIT_REQUIRED:\${status.error ?? "NOT_A_GIT_REPOSITORY"}\`);
    if (status.changes.length === 0) return ["phase-evidence:no-change"];
    const outsideEvidence = status.changes.filter((item) => !item.path.replace(/\\\\/gu, "/").startsWith("evidence/"));
    if (outsideEvidence.length > 0) throw new Error(\`EVOLUTION_EVIDENCE_UNEXPECTED_WORKSPACE_CHANGE:\${outsideEvidence.slice(0, 12).map((item) => item.path).join(",")}\`);
    const add = await this.#runner.run({ executable: "git", args: ["-C", rootPath, "add", "-A", "--", "evidence"], cwd: rootPath, cancellation, timeoutMs: 60_000, maxOutputBytes: 2 * 1024 * 1024 });
    if (add.exitCode !== 0 || add.timedOut || add.truncated) throw new Error(\`EVOLUTION_EVIDENCE_GIT_ADD_FAILED:\${add.stderr.slice(0, 500)}\`);
    const commit = await this.#runner.run({ executable: "git", args: ["-C", rootPath, "-c", "user.name=DevBox", "-c", "user.email=devbox@local.invalid", "commit", "--no-gpg-sign", "-m", \`DevBox evidence \${specTask.phaseId} \${specTask.taskId}\`], cwd: rootPath, cancellation, timeoutMs: 2 * 60_000, maxOutputBytes: 4 * 1024 * 1024 });
    if (commit.exitCode !== 0 || commit.timedOut || commit.truncated) throw new Error(\`EVOLUTION_EVIDENCE_COMMIT_FAILED:\${commit.stderr.slice(0, 700) || commit.stdout.slice(0, 700)}\`);
    const head = await this.#runner.run({ executable: "git", args: ["-C", rootPath, "rev-parse", "HEAD"], cwd: rootPath, cancellation, timeoutMs: 30_000, maxOutputBytes: 64 * 1024 });
    const commitSha = head.stdout.trim();
    if (head.exitCode !== 0 || !/^[a-f0-9]{40}$/u.test(commitSha)) throw new Error("EVOLUTION_EVIDENCE_COMMIT_SHA_INVALID");
    return [add.runId, commit.runId, \`evidence-git-commit:\${commitSha}\`];
  }

`;
  s = once(s, commitAnchor, evidenceMethod + commitAnchor, "evidence-commit-method");
  await save(file, s);
}

async function patchMain() {
  const file = "src/main/main.ts"; let s = await read(file);
  s = once(s, 'import { createPreviewProtocolHandler } from "./services/preview-protocol-service.js";\n', 'import { createPreviewProtocolHandler } from "./services/preview-protocol-service.js";\nimport { PreviewRenderService } from "./services/preview-render-service.js";\n', "main-preview-import");
  s = once(s,
`  const developmentSpec = new DevelopmentSpecService(database, developmentSpecPath);
  evolution = new ApiEvolutionService(database, projects, agent, settings, developmentSpec, git, runner);
  const worktrees = new WorktreeService(runner, path.join(app.getPath("userData"), "worktrees"));`,
`  const developmentSpec = new DevelopmentSpecService(database, developmentSpecPath);
  const worktrees = new WorktreeService(runner, path.join(app.getPath("userData"), "worktrees"));
  evolution = new ApiEvolutionService(database, projects, agent, settings, developmentSpec, git, runner, worktrees);
  const previewRender = new PreviewRenderService(projects);`, "main-evolution-worktree");
  s = once(s, '    workspaceTurns,\n    tasks,', '    workspaceTurns,\n    previewRender,\n    tasks,', "main-preview-inject");
  await save(file, s);
}

async function patchIpc() {
  const file = "src/main/ipc.ts"; let s = await read(file);
  s = once(s, 'import type { ProjectService } from "./services/project-service.js";\n', 'import type { ProjectService } from "./services/project-service.js";\nimport type { PreviewRenderService } from "./services/preview-render-service.js";\n', "ipc-preview-import");
  s = once(s, '  workspaceTurns: WorkspaceTurnService;\n  tasks:', '  workspaceTurns: WorkspaceTurnService;\n  previewRender: PreviewRenderService;\n  tasks:', "ipc-preview-service");
  s = once(s,
`    const publishActivity = (activity: { kind: "provider" | "command" | "evidence" | "waiting" | "failure"; stage?: string | null; provider?: string | null; model?: string | null; message: string; createdAt: string }): void => {
      const payload = ThreadActivityEventSchema.parse({ threadId: input.threadId, ...activity });
      services.database.appendTurnActivity(input.threadId, started.turnId, payload.message, payload.createdAt);
      if (!event.sender.isDestroyed()) event.sender.send(IPC_CHANNELS.threadActivity, payload);
    };`,
`    const publishActivity = (activity: { kind: "provider" | "command" | "evidence" | "waiting" | "failure"; stage?: string | null; provider?: string | null; model?: string | null; message: string; createdAt: string }): void => {
      const payload = ThreadActivityEventSchema.parse({ threadId: input.threadId, ...activity });
      try { services.database.appendEvent("thread.agent-internal", input.threadId, payload, activity.kind === "failure"); } catch { /* diagnostics must never pollute or break the user conversation */ }
    };`, "ipc-hide-internal-activity");

  const oldFinal = `    if (baseline) {
      const workspaceResult = ThreadWorkspaceResultSchema.parse(await services.workspaceTurns.finalize({ projectId: project.id, threadId: input.threadId, turnId: started.turnId, intent: "WORKSPACE_MUTATION", before: baseline }));`;
  const newFinal = `    if (baseline) {
      let workspaceResult = ThreadWorkspaceResultSchema.parse(await services.workspaceTurns.finalize({ projectId: project.id, threadId: input.threadId, turnId: started.turnId, intent: "WORKSPACE_MUTATION", before: baseline }));
      if (workspaceResult.verified && workspaceResult.previewPath) {
        const renderEvidence: string[] = [];
        for (let repairAttempt = 0; repairAttempt < 3; repairAttempt += 1) {
          const render = await services.previewRender.verify(project.id, workspaceResult.previewPath);
          renderEvidence.push(...render.evidence);
          if (render.ok) break;
          if (repairAttempt < 2) {
            const repairPrompt = [
              \`\${workspaceResult.previewPath} dosyasını düzelt ve gerçek önizlemeyi çalışır hale getir.\`,
              \`DevBox render doğrulaması başarısız: \${render.detail}\`,
              "Dosyanın mevcut halini oku. Kullanıcı açıkça istemedikçe tüm HTML/CSS/JS ilk görünümü ağdan bağımsız, self-contained ve yerel çalışmalı.",
              "CDN, uzak script/font/stylesheet bağımlılıklarını kaldır. Animasyonları gerçek CSS keyframes/Web Animations API/vanilla JS ile uygula.",
              "İlk paintte görünür içerik zorunlu; opacity:0/visibility:hidden halinde dış kütüphane bekleyen içerik bırakma.",
              "SİMÜLASYON, DEMO, FAKE, SAHTE, placeholder veya yalnız başarı metni yasak. Dosyayı gerçekten değiştir, tekrar oku ve doğrula."
            ].join("\\n");
            assistantContent = await services.agent.respond(repairPrompt, project.rootPath, current.items).then((response) => response.content);
            workspaceResult = ThreadWorkspaceResultSchema.parse(await services.workspaceTurns.finalize({ projectId: project.id, threadId: input.threadId, turnId: started.turnId, intent: "WORKSPACE_MUTATION", before: baseline }));
            continue;
          }
          workspaceResult = ThreadWorkspaceResultSchema.parse({ ...workspaceResult, verified: false, previewPath: null, evidence: [...workspaceResult.evidence, ...renderEvidence, \`preview-render:FAIL:\${render.detail}\`].slice(0, 64) });
        }
        if (workspaceResult.previewPath) workspaceResult = ThreadWorkspaceResultSchema.parse({ ...workspaceResult, evidence: [...workspaceResult.evidence, ...renderEvidence].slice(0, 64) });
      }`;
  s = once(s, oldFinal, newFinal, "ipc-preview-render-gate");
  await save(file, s);
}

async function patchApp() {
  const file = "src/renderer/App.tsx"; let s = await read(file);
  s = once(s,
`function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message.replace(/^Error invoking remote method '[^']+':\\s*/i, "");
  return String(error);
}
`,
`function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message.replace(/^Error invoking remote method '[^']+':\\s*/i, "");
  return String(error);
}

function inferWorkspaceTargetPath(content: string): string | null {
  const match = content.match(/(?:^|[\\s'\"\x60])((?:[a-z0-9._-]+[\\/])?[a-z0-9._-]+\\.(?:html?|css|jsx?|tsx?|json|md|py|go|rs|java|php|vue|svelte))(?:$|[\\s'\"\x60,;:!?])/iu);
  if (!match?.[1]) return null;
  const normalized = match[1].replace(/\\\\/gu, "/").replace(/^\\.\\//u, "");
  return normalized.includes("..") || normalized.startsWith("/") ? null : normalized;
}
`, "app-target-infer");
  s = once(s, '  if (item.role === "activity") return <div className="activity-line completed"><CheckCircle2 size={13} /><span>{item.content}</span><time title={exactDateTime(item.createdAt)}>{new Date(item.createdAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}</time></div>;', '  if (item.role === "activity") return null;', "hide-legacy-activity");
  s = once(s,
`  const [workspaceResult, setWorkspaceResult] = useState<ThreadWorkspaceResult | null>(null);
  const [changeSummaryOpen`,
`  const [workspaceResult, setWorkspaceResult] = useState<ThreadWorkspaceResult | null>(null);
  const [liveWorkspacePath, setLiveWorkspacePath] = useState<string | null>(null);
  const [liveWorkspaceActive, setLiveWorkspaceActive] = useState(false);
  const [changeSummaryOpen`, "app-live-state");
  s = once(s,
`    setWorkspaceResult(null);
    setView("thread");`,
`    setWorkspaceResult(null);
    setLiveWorkspacePath(null);
    setLiveWorkspaceActive(false);
    setView("thread");`, "app-new-thread-reset");
  s = once(s,
`    setComposer("");
    setWorkspaceResult(null);
    setChangeSummaryOpen(false);`,
`    const liveTarget = inferWorkspaceTargetPath(content);
    setComposer("");
    setWorkspaceResult(null);
    setLiveWorkspacePath(liveTarget);
    setLiveWorkspaceActive(Boolean(liveTarget));
    if (liveTarget) setInspectorVisible(true);
    setChangeSummaryOpen(false);`, "app-send-live-start");
  s = once(s,
`    } finally {
      setLiveActivities((current) => current.filter((activity) => activity.threadId !== activeThread.thread.id));
      setBusy(null);
    }`,
`    } finally {
      setLiveActivities((current) => current.filter((activity) => activity.threadId !== activeThread.thread.id));
      setLiveWorkspaceActive(false);
      setBusy(null);
    }`, "app-send-live-stop");
  s = once(s,
`  useEffect(() => window.devbox.onThreadWorkspaceResult((result) => {
    setWorkspaceResult(result);
    setInspectorVisible(true);`,
`  useEffect(() => window.devbox.onThreadWorkspaceResult((result) => {
    setWorkspaceResult(result);
    setLiveWorkspaceActive(false);
    setLiveWorkspacePath(result.previewPath ?? result.primaryFile ?? liveWorkspacePath);
    setInspectorVisible(true);`, "app-workspace-result-live");
  s = s.replace('  }), []);\n\n  useEffect(() => {\n    if (!selectedProject?.isGitRepository)', '  }), [liveWorkspacePath]);\n\n  useEffect(() => {\n    if (!selectedProject?.isGitRepository)');
  s = once(s,
`                    {busy === "message" && !liveActivities.some((activity) => activity.threadId === thread.thread.id) && <div className="activity-line running"><LoaderCircle className="spin" size={14} /><span>İstek izin ve ek bağlam kontrollerinden geçiyor…</span></div>}`,
`                    {busy === "message" && <div className="activity-line running compact"><LoaderCircle className="spin" size={14} /><span>{liveWorkspaceActive ? "Gerçek dosya değişiklikleri diske yazılıyor ve Canvas kod görünümü canlı okunuyor…" : "DevBox yanıt hazırlıyor…"}</span></div>}`, "app-compact-progress");
  s = once(s,
`          {inspectorVisible && <CanvasInspector project={selectedProject} result={workspaceResult} threadTitle=`,
`          {inspectorVisible && <CanvasInspector project={selectedProject} result={workspaceResult} liveTargetPath={liveWorkspacePath} liveActive={liveWorkspaceActive} threadTitle=`, "app-canvas-live-props");
  await save(file, s);
}

async function patchCanvas() {
  const file = "src/renderer/CanvasInspector.tsx"; let s = await read(file);
  s = once(s,
`  result: ThreadWorkspaceResult | null;
  threadTitle: string | null;`,
`  result: ThreadWorkspaceResult | null;
  liveTargetPath: string | null;
  liveActive: boolean;
  threadTitle: string | null;`, "canvas-live-props-type");
  s = once(s,
`  const { project, result, threadTitle, threadState, gitBranch, coreState, onClose, onRefresh } = props;`,
`  const { project, result, liveTargetPath, liveActive, threadTitle, threadState, gitBranch, coreState, onClose, onRefresh } = props;`, "canvas-live-props");
  s = once(s,
`  const [consoleEntries, setConsoleEntries] = useState<ConsoleEntry[]>([]);
  const iframeRef`,
`  const [consoleEntries, setConsoleEntries] = useState<ConsoleEntry[]>([]);
  const [previewState, setPreviewState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const iframeRef`, "canvas-preview-state");
  s = once(s,
`  const defaultTargetPath = result?.previewPath ?? result?.primaryFile ?? null;`,
`  const defaultTargetPath = liveTargetPath ?? result?.previewPath ?? result?.primaryFile ?? null;`, "canvas-live-target");
  s = once(s,
`    } catch (error) {
      setSnapshot(null); setCode(""); setNotice(error instanceof Error ? error.message : String(error));
    } finally { setBusy(false); }`,
`    } catch (error) {
      if (liveActive) { setNotice(null); }
      else { setSnapshot(null); setCode(""); setNotice(error instanceof Error ? error.message : String(error)); }
    } finally { setBusy(false); }`, "canvas-live-missing");
  s = s.replace('  }, [project, targetPath]);', '  }, [liveActive, project, targetPath]);');
  s = once(s,
`  useEffect(() => { setSelectedPath(defaultTargetPath); }, [defaultTargetPath, result?.createdAt]);
  useEffect(() => { void loadFile(); }, [loadFile, result?.createdAt]);
  useEffect(() => {
    if (result?.previewPath) setTab("preview");
    else if (result?.changedFiles.length) setTab("changes");
  }, [result?.createdAt, result?.previewPath, result?.changedFiles.length]);`,
`  useEffect(() => { setSelectedPath(defaultTargetPath); }, [defaultTargetPath, result?.createdAt]);
  useEffect(() => { void loadFile(); }, [loadFile, result?.createdAt]);
  useEffect(() => {
    if (!liveActive || !project || !targetPath) return;
    setTab("code");
    const timer = window.setInterval(() => { void loadFile(); }, 350);
    return () => window.clearInterval(timer);
  }, [liveActive, loadFile, project, targetPath]);
  useEffect(() => {
    if (liveActive) { setTab("code"); return; }
    if (result?.previewPath) { setPreviewState("loading"); setConsoleEntries([]); setRevision((value) => value + 1); setTab("preview"); }
    else if (result?.changedFiles.length) setTab("changes");
  }, [liveActive, result?.createdAt, result?.previewPath, result?.changedFiles.length]);`, "canvas-live-effects");
  s = once(s,
`      if (payload.type === "console" && typeof payload.message === "string") {`,
`      if (payload.type === "ready") { setPreviewState("ready"); return; }
      if (payload.type === "console" && typeof payload.message === "string") {
        if (payload.level === "error") setPreviewState("error");`, "canvas-ready-event");
  s = once(s,
`<div><strong>{targetPath ?? "Dosya yok"}</strong><small>{snapshot ? \`${snapshot.language} · SHA \${snapshot.sha256.slice(0, 10)}\` : "yüklenmedi"}</small></div>`,
`<div><strong>{targetPath ?? "Dosya yok"}</strong><small>{liveActive ? (snapshot ? "CANLI · diskten gerçek dosya okunuyor" : "CANLI · ilk dosya yazımı bekleniyor") : snapshot ? \`${snapshot.language} · SHA \${snapshot.sha256.slice(0, 10)}\` : "yüklenmedi"}</small></div>`, "canvas-live-label");
  s = once(s,
`<strong>{result?.previewPath ?? "HTML önizleme yok"}</strong><small>İzole yerel önizleme</small>`,
`<strong>{result?.previewPath ?? "HTML önizleme yok"}</strong><small>İzole yerel önizleme · {previewState === "ready" ? "HAZIR" : previewState === "error" ? "HATA" : "YÜKLENİYOR"}</small>`, "canvas-preview-label");
  s = once(s,
`<iframe ref={iframeRef} title={\`Önizleme: \${result.previewPath}\`} sandbox="allow-scripts allow-same-origin" src={previewUrl(project.id, result.previewPath, revision)} />`,
`<iframe ref={iframeRef} title={\`Önizleme: \${result.previewPath}\`} sandbox="allow-scripts allow-same-origin" onLoad={() => setPreviewState((current) => current === "error" ? current : "loading")} onError={() => setPreviewState("error")} src={previewUrl(project.id, result.previewPath, revision)} />`, "canvas-iframe-health");
  await save(file, s);
}

await patchPackage();
await patchAgent();
await patchPreviewProtocol();
await patchWorktree();
await patchEvolution();
await patchMain();
await patchIpc();
await patchApp();
await patchCanvas();
console.log("DEVBOX_V013_GIF_RUNTIME_HARDENING_APPLIED");
