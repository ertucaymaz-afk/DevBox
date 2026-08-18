import { randomUUID } from "node:crypto";
import { access, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import type { CommandResult, GitStatus } from "../../shared/contracts.js";
import type { CommandRunner } from "./command-runner.js";
import type { StateDatabase } from "./database.js";
import type { EvolutionFinding, EvolutionFindingService } from "./evolution-finding-service.js";
import type { GitService } from "./git-service.js";
import type { ProjectService } from "./project-service.js";

export type ReleaseGateMode = "PREFLIGHT" | "FULL";
export type ReleaseGateCheckState = "PASS" | "FAIL" | "SKIP";
export type ReleaseGateCheck = {
  id: string;
  title: string;
  state: ReleaseGateCheckState;
  blocking: boolean;
  durationMs: number;
  detail: string;
  command: string | null;
  evidence: string[];
};
export type ReleaseGateRun = {
  id: string;
  projectId: string;
  mode: ReleaseGateMode;
  state: "PASS" | "FAIL";
  head: string | null;
  branch: string | null;
  repositoryRoot: string | null;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  checks: ReleaseGateCheck[];
  blockingFailures: number;
};

type PackageManifest = { name?: string; scripts?: Record<string, string>; packageManager?: string };
type ScriptCheckExecution = { check: ReleaseGateCheck; result: CommandResult | null };
const MAX_GATE_HISTORY = 40;

function compact(value: string, max = 2_000): string { return value.replace(/\s+/gu, " ").trim().slice(0, max); }
function resultEvidence(result: CommandResult): string[] {
  const output = [result.stdout, result.stderr].map((value) => compact(value, 900)).filter(Boolean);
  return [`exit:${result.exitCode ?? "null"}`, `durationMs:${result.durationMs}`, `reason:${result.exitReason}`, ...output].slice(0, 8);
}
function commandPassed(result: CommandResult): boolean { return result.exitCode === 0 && !result.timedOut && result.exitReason === "EXITED"; }
function gitChangeFingerprint(status: GitStatus): string {
  return status.changes.map((change) => `${change.indexStatus}${change.worktreeStatus}:${change.path}`).sort().join("\n");
}
function isSelfReleaseAggregate(item: EvolutionFinding): boolean {
  return item.owner === "release" && item.source === "release-gate" && /release gate başarısız/iu.test(item.title);
}
function blockingFindings(items: EvolutionFinding[]): EvolutionFinding[] {
  return items.filter((item) => item.status === "OPEN" && ["CRITICAL", "HIGH"].includes(item.severity) && !isSelfReleaseAggregate(item));
}

export class ReleaseGateService {
  readonly #database: StateDatabase;
  readonly #projects: ProjectService;
  readonly #git: GitService;
  readonly #runner: CommandRunner;
  readonly #findings: EvolutionFindingService;
  readonly #inFlight = new Set<string>();

  public constructor(database: StateDatabase, projects: ProjectService, git: GitService, runner: CommandRunner, findings: EvolutionFindingService) {
    this.#database = database;
    this.#projects = projects;
    this.#git = git;
    this.#runner = runner;
    this.#findings = findings;
  }

  #historyKey(projectId: string): string { return `release-gate:v1:${projectId}`; }

  public history(projectId: string): ReleaseGateRun[] {
    const raw = this.#database.getSetting<unknown>(this.#historyKey(projectId));
    return Array.isArray(raw) ? raw.filter((item): item is ReleaseGateRun => Boolean(item && typeof item === "object" && (item as ReleaseGateRun).projectId === projectId && typeof (item as ReleaseGateRun).id === "string")).slice(-MAX_GATE_HISTORY) : [];
  }

  public latest(projectId: string): ReleaseGateRun | null { return this.history(projectId).at(-1) ?? null; }

  async #manifest(rootPath: string): Promise<PackageManifest | null> {
    try {
      const raw = await readFile(path.join(rootPath, "package.json"), "utf8");
      const parsed = JSON.parse(raw) as PackageManifest;
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch { return null; }
  }

  async #scriptCheck(rootPath: string, manifest: PackageManifest | null, script: string, id: string, title: string, timeoutMs: number, required: boolean): Promise<ScriptCheckExecution> {
    if (!manifest?.scripts?.[script]) {
      return {
        result: null,
        check: {
          id,
          title,
          state: required ? "FAIL" : "SKIP",
          blocking: required,
          durationMs: 0,
          detail: required ? `package.json içinde zorunlu ${script} betiği yok; release fail-closed bloke edildi.` : `package.json içinde ${script} betiği tanımlı değil.`,
          command: null,
          evidence: []
        }
      };
    }
    const started = performance.now();
    const result = await this.#runner.run({ executable: "pnpm", args: [script], cwd: rootPath, timeoutMs, maxOutputBytes: 8 * 1024 * 1024 });
    const passed = commandPassed(result);
    return {
      result,
      check: {
        id, title,
        state: passed ? "PASS" : "FAIL",
        blocking: !passed,
        durationMs: Math.max(0, Math.round(performance.now() - started)),
        detail: passed ? `${script} gerçek çalışma alanında başarıyla tamamlandı.` : `${script} başarısız; release fail-closed bloke edildi.`,
        command: `pnpm ${script}`,
        evidence: resultEvidence(result)
      }
    };
  }

  public async run(projectId: string, mode: ReleaseGateMode): Promise<ReleaseGateRun> {
    if (this.#inFlight.has(projectId)) throw new Error("RELEASE_GATE_ALREADY_RUNNING");
    this.#inFlight.add(projectId);
    try { return await this.#execute(projectId, mode); }
    finally { this.#inFlight.delete(projectId); }
  }

  async #execute(projectId: string, mode: ReleaseGateMode): Promise<ReleaseGateRun> {
    const startedAt = new Date().toISOString();
    const started = performance.now();
    const project = this.#projects.get(projectId);
    const checks: ReleaseGateCheck[] = [];
    const manifest = await this.#manifest(project.rootPath);
    const strictDevBox = manifest?.name?.trim().toLowerCase() === "devbox";

    const integrityStarted = performance.now();
    const integrity = this.#database.integrityCheck();
    checks.push({
      id: "database-integrity", title: "State DB bütünlüğü", state: integrity.ok ? "PASS" : "FAIL", blocking: !integrity.ok,
      durationMs: Math.round(performance.now() - integrityStarted), detail: `SQLite integrity=${integrity.detail} · schema=${integrity.schemaVersion}`, command: "PRAGMA integrity_check", evidence: [integrity.detail]
    });

    const ownershipStarted = performance.now();
    const git = await this.#git.status(project.rootPath);
    const initialChangeFingerprint = gitChangeFingerprint(git);
    let canonicalProjectRoot = path.resolve(project.rootPath);
    try { canonicalProjectRoot = await realpath(project.rootPath); } catch { /* access check below will fail */ }
    let ownershipState: ReleaseGateCheckState = "SKIP";
    let ownershipBlocking = false;
    let ownershipDetail = "Git deposu yok; repository ownership denetimi uygulanmadı.";
    try { await access(project.rootPath); } catch {
      ownershipState = "FAIL"; ownershipBlocking = true; ownershipDetail = "Seçili proje kökü artık erişilebilir değil.";
    }
    if (git.available && git.repositoryRoot) {
      let canonicalRepoRoot = path.resolve(git.repositoryRoot);
      try { canonicalRepoRoot = await realpath(git.repositoryRoot); } catch { /* preserve normalized path */ }
      const relative = path.relative(canonicalRepoRoot, canonicalProjectRoot);
      const owned = relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
      ownershipState = owned ? "PASS" : "FAIL";
      ownershipBlocking = !owned;
      ownershipDetail = owned
        ? `Proje kökü doğrulanmış Git deposu kapsamındadır${relative ? ` · alt yol: ${relative}` : " · exact root"}.`
        : `Proje kökü Git repositoryRoot dışında kaldı: project=${canonicalProjectRoot} repo=${canonicalRepoRoot}`;
      if (!owned) {
        this.#findings.report({ projectId, source: "release-gate", key: "project-ownership", title: "Project ownership uyuşmazlığı", detail: ownershipDetail, severity: "CRITICAL", owner: "project", track: "release", evidence: [canonicalProjectRoot, canonicalRepoRoot] });
      } else {
        for (const finding of this.#findings.list(projectId, { status: "OPEN", owner: "project", limit: 100 })) {
          if (finding.source === "release-gate" && finding.title === "Project ownership uyuşmazlığı") this.#findings.transition(projectId, finding.id, "RESOLVED", "Canonical project root yeniden doğrulanmış repositoryRoot kapsamına girdi.");
        }
      }
    } else if (strictDevBox && ownershipState !== "FAIL") {
      ownershipState = "FAIL";
      ownershipBlocking = true;
      ownershipDetail = "DevBox release projesinde Git repositoryRoot doğrulanamadı; fail-closed release bloke edildi.";
    }
    checks.push({ id: "project-ownership", title: "Project ownership", state: ownershipState, blocking: ownershipBlocking, durationMs: Math.round(performance.now() - ownershipStarted), detail: ownershipDetail, command: "git rev-parse --show-toplevel", evidence: [canonicalProjectRoot, git.repositoryRoot ?? "non-git"] });

    const findingsBefore = this.#findings.summary(projectId);
    const blockingItems = blockingFindings(findingsBefore.items);
    checks.push({
      id: "blocking-findings", title: "Açık kritik/yüksek bulgular", state: blockingItems.length === 0 ? "PASS" : "FAIL", blocking: blockingItems.length > 0,
      durationMs: 0, detail: blockingItems.length === 0 ? `Açık ${findingsBefore.open} bulgu içinde release bloklayan CRITICAL/HIGH yok.` : `${blockingItems.length} adet CRITICAL/HIGH açık bulgu release'i bloke ediyor.`,
      command: null, evidence: blockingItems.slice(0, 20).map((item) => `${item.severity}:${item.owner}:${item.title}`)
    });

    if (git.available) {
      const diffCheck = await this.#runner.run({ executable: "git", args: ["-C", project.rootPath, "diff", "--check"], cwd: project.rootPath, timeoutMs: 30_000, maxOutputBytes: 2 * 1024 * 1024 });
      checks.push({ id: "git-diff-check", title: "Git diff biçim kapısı", state: commandPassed(diffCheck) ? "PASS" : "FAIL", blocking: !commandPassed(diffCheck), durationMs: diffCheck.durationMs, detail: commandPassed(diffCheck) ? "git diff --check temiz." : "Whitespace/conflict biçim kusuru bulundu.", command: "git diff --check", evidence: resultEvidence(diffCheck) });
      const stagedDiffCheck = await this.#runner.run({ executable: "git", args: ["-C", project.rootPath, "diff", "--cached", "--check"], cwd: project.rootPath, timeoutMs: 30_000, maxOutputBytes: 2 * 1024 * 1024 });
      checks.push({ id: "git-staged-diff-check", title: "Git staged diff biçim kapısı", state: commandPassed(stagedDiffCheck) ? "PASS" : "FAIL", blocking: !commandPassed(stagedDiffCheck), durationMs: stagedDiffCheck.durationMs, detail: commandPassed(stagedDiffCheck) ? "git diff --cached --check temiz." : "Staged whitespace/conflict biçim kusuru bulundu.", command: "git diff --cached --check", evidence: resultEvidence(stagedDiffCheck) });
      const clean = git.changes.length === 0;
      checks.push({ id: "workspace-clean", title: "Çalışma ağacı temizliği", state: clean ? "PASS" : mode === "FULL" ? "FAIL" : "SKIP", blocking: mode === "FULL" && !clean, durationMs: 0, detail: clean ? "Git çalışma ağacı temiz." : `${git.changes.length} değişiklik var${mode === "FULL" ? "; FULL release bloke edildi." : "; PREFLIGHT sırasında bilgi amaçlı gösteriliyor."}`, command: "git status --porcelain=v2", evidence: git.changes.slice(0, 40).map((change) => `${change.indexStatus}${change.worktreeStatus} ${change.path}`) });
    } else {
      checks.push({ id: "git-diff-check", title: "Git diff biçim kapısı", state: "SKIP", blocking: false, durationMs: 0, detail: git.error ?? "Git repository bulunamadı.", command: null, evidence: [] });
      checks.push({ id: "git-staged-diff-check", title: "Git staged diff biçim kapısı", state: "SKIP", blocking: false, durationMs: 0, detail: git.error ?? "Git repository bulunamadı.", command: null, evidence: [] });
    }

    const typecheckExecution = await this.#scriptCheck(project.rootPath, manifest, "typecheck", "typescript", "TypeScript ürün kapısı", 8 * 60_000, strictDevBox);
    checks.push(typecheckExecution.check);
    if (typecheckExecution.check.state === "FAIL" && typecheckExecution.result) {
      const output = [typecheckExecution.result.stdout, typecheckExecution.result.stderr].filter(Boolean).join("\n");
      this.#findings.reportTypeScriptOutput(projectId, output);
    } else if (typecheckExecution.check.state === "PASS") {
      for (const finding of this.#findings.list(projectId, { status: "OPEN", owner: "typescript", limit: 500 })) {
        this.#findings.transition(projectId, finding.id, "RESOLVED", "Release gate typecheck tekrarında hata yeniden üretilemedi; pnpm typecheck PASS.");
      }
    }

    const evolutionExecution = await this.#scriptCheck(project.rootPath, manifest, "evolution:verify", "evolution-reality", "Evolution gerçeklik kapısı", 5 * 60_000, strictDevBox);
    checks.push(evolutionExecution.check);
    const truthExecution = await this.#scriptCheck(project.rootPath, manifest, "truth:audit", "truth-audit", "Ürün gerçeklik audit", 5 * 60_000, strictDevBox);
    checks.push(truthExecution.check);

    if (mode === "FULL") {
      const testsExecution = await this.#scriptCheck(project.rootPath, manifest, "test", "tests", "Regresyon test kapısı", 20 * 60_000, strictDevBox);
      checks.push(testsExecution.check);
      const buildExecution = await this.#scriptCheck(project.rootPath, manifest, "build", "build", "Production build kapısı", 20 * 60_000, strictDevBox);
      checks.push(buildExecution.check);
    }

    if (git.available) {
      const finalGit = await this.#git.status(project.rootPath);
      const statusAvailable = finalGit.available;
      checks.push({
        id: "release-head-stable", title: "Git HEAD sabitliği", state: statusAvailable && finalGit.head === git.head ? "PASS" : "FAIL", blocking: !statusAvailable || finalGit.head !== git.head, durationMs: 0,
        detail: statusAvailable && finalGit.head === git.head ? `Gate boyunca HEAD değişmedi · ${git.head ?? "unborn"}.` : `Gate sırasında Git HEAD değişti · before=${git.head ?? "null"} after=${finalGit.head ?? "null"}.`,
        command: "git rev-parse HEAD", evidence: [git.head ?? "null", finalGit.head ?? "null"]
      });
      const workspaceStable = statusAvailable && gitChangeFingerprint(finalGit) === initialChangeFingerprint;
      checks.push({
        id: "workspace-stable-after-gate", title: "Gate sonrası workspace sabitliği", state: workspaceStable ? "PASS" : "FAIL", blocking: !workspaceStable, durationMs: 0,
        detail: workspaceStable ? "Gate komutları çalışma ağacına yeni değişiklik bırakmadı." : "Gate komutları çalışma ağacı durumunu değiştirdi; yan etkili doğrulama release'i bloke etti.",
        command: "git status --porcelain=v2", evidence: finalGit.changes.slice(0, 40).map((change) => `${change.indexStatus}${change.worktreeStatus} ${change.path}`)
      });
      if (mode === "FULL") {
        const finalClean = statusAvailable && finalGit.changes.length === 0;
        checks.push({
          id: "workspace-clean-after-gate", title: "FULL gate sonrası temiz workspace", state: finalClean ? "PASS" : "FAIL", blocking: !finalClean, durationMs: 0,
          detail: finalClean ? "Test/build sonrasında çalışma ağacı hâlâ temiz." : `${finalGit.changes.length} değişiklik test/build sonrasında kaldı; FULL release bloke edildi.`,
          command: "git status --porcelain=v2", evidence: finalGit.changes.slice(0, 40).map((change) => `${change.indexStatus}${change.worktreeStatus} ${change.path}`)
        });
      }
    }

    const finalIntegrityStarted = performance.now();
    const finalIntegrity = this.#database.integrityCheck();
    checks.push({
      id: "database-integrity-final", title: "Gate sonrası State DB bütünlüğü", state: finalIntegrity.ok ? "PASS" : "FAIL", blocking: !finalIntegrity.ok,
      durationMs: Math.round(performance.now() - finalIntegrityStarted), detail: `Final SQLite integrity=${finalIntegrity.detail} · schema=${finalIntegrity.schemaVersion}`, command: "PRAGMA integrity_check", evidence: [finalIntegrity.detail]
    });

    const refreshedFindings = this.#findings.summary(projectId);
    const lateBlockers = blockingFindings(refreshedFindings.items);
    const blockingFailures = checks.filter((check) => check.blocking && check.state === "FAIL").length + (lateBlockers.length > blockingItems.length ? lateBlockers.length - blockingItems.length : 0);
    const completedAt = new Date().toISOString();
    const run: ReleaseGateRun = {
      id: randomUUID(), projectId, mode, state: blockingFailures === 0 ? "PASS" : "FAIL",
      head: git.head, branch: git.branch, repositoryRoot: git.repositoryRoot,
      startedAt, completedAt, durationMs: Math.max(0, Math.round(performance.now() - started)), checks, blockingFailures
    };
    const history = [...this.history(projectId), run].slice(-MAX_GATE_HISTORY);
    this.#database.setSetting(this.#historyKey(projectId), history);
    this.#database.appendEvent("release.gate.completed", projectId, run, run.state === "FAIL");
    if (run.state === "FAIL") {
      this.#findings.report({ projectId, source: "release-gate", key: `gate:${mode.toLocaleLowerCase("en-US")}`, title: `${mode} release gate başarısız`, detail: `${blockingFailures} bloklayıcı kapı başarısız.`, severity: "HIGH", owner: "release", track: "release", evidence: checks.filter((check) => check.blocking && check.state === "FAIL").map((check) => `${check.id}:${check.detail}`) });
    } else {
      for (const finding of this.#findings.list(projectId, { status: "OPEN", owner: "release", limit: 100 })) {
        if (finding.source === "release-gate") this.#findings.transition(projectId, finding.id, "RESOLVED", `${mode} release gate sonraki çalıştırmada PASS oldu.`);
      }
    }
    return run;
  }
}
