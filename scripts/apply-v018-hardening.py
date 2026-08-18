from pathlib import Path


def replace_exact(path: str, old: str, new: str, code: str) -> None:
    target = Path(path)
    text = target.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{code}:{path}:count={count}")
    target.write_text(text.replace(old, new, 1), encoding="utf-8", newline="")


spec = "src/main/services/development-spec-service.ts"
replace_exact(
    spec,
    '  public next(projectId: string, options: { ignoreRetryAfter?: boolean; allowBlockedExternalRetry?: boolean } = {}): DevelopmentSpecTask | null {',
    '  public next(projectId: string, options: { ignoreRetryAfter?: boolean; allowBlockedExternalRetry?: boolean; allowRecoveryRetry?: boolean } = {}): DevelopmentSpecTask | null {',
    "SPEC_NEXT_OPTIONS",
)
replace_exact(
    spec,
    '      if (state?.state === "RECOVERY_REQUIRED" || state?.state === "RUNNING") return null;\n      if (state?.state === "BLOCKED_EXTERNAL") return options.allowBlockedExternalRetry ? task : null;',
    '      if (state?.state === "RUNNING") return null;\n      if (state?.state === "RECOVERY_REQUIRED") return options.allowRecoveryRetry ? task : null;\n      if (state?.state === "BLOCKED_EXTERNAL") return options.allowBlockedExternalRetry ? task : null;',
    "SPEC_RECOVERY_RETRY",
)

api = "src/main/services/api-evolution-service.ts"
replace_exact(
    api,
    '    for (const project of this.#projects.list()) { this.#spec.recoverRunning(project.id); this.get(project.id); }',
    '''    for (const project of this.#projects.list()) {
      const before = this.get(project.id);
      const recovered = this.#spec.recoverRunning(project.id);
      if (recovered > 0) {
        const now = new Date().toISOString();
        const detail = `${recovered} yarım kalmış atomik görev RECOVERY_REQUIRED durumuna alındı. Kör tekrar yapılmadı; Şimdi çalıştır ile açık recovery yeniden denemesi gerekir.`;
        this.#save({
          ...before,
          isRunning: false,
          nextCycleAt: null,
          lastError: detail,
          spec: this.#spec.summary(project.id),
          runtime: { ...before.runtime, stage: "RECOVERY_REQUIRED", detail, waitingReason: detail, updatedAt: now },
          updatedAt: now
        });
        this.#publish(project.id, { stage: "RECOVERY_REQUIRED", kind: "failure", message: detail, provider: before.runtime.provider, model: before.runtime.model });
      } else {
        this.get(project.id);
      }
    }''',
    "API_START_RECOVERY",
)
replace_exact(
    api,
    '    const specTask = this.#spec.next(projectId, { ignoreRetryAfter: manual, allowBlockedExternalRetry: manual });',
    '    const specTask = this.#spec.next(projectId, { ignoreRetryAfter: manual, allowBlockedExternalRetry: manual, allowRecoveryRetry: manual });',
    "API_MANUAL_RECOVERY",
)
replace_exact(
    api,
    '    let baselineFingerprint: string | null = null;',
    '    let baselineFingerprint: string | null = null;\n    let baselineHead: string | null = null;\n    let baselineWasClean = false;\n    let baselineManaged = false;',
    "API_BASELINE_FIELDS",
)
replace_exact(
    api,
    '''      baselineFingerprint = await this.#workspaceFingerprint(project.rootPath, controller.signal);
      if (!baselineFingerprint) throw new Error("EVOLUTION_REQUIRES_GIT_REPOSITORY");''',
    '''      const baselineStatus = await this.#git.status(project.rootPath);
      if (!baselineStatus.available) throw new Error(`EVOLUTION_REQUIRES_GIT_REPOSITORY:${baselineStatus.error ?? "NOT_A_GIT_REPOSITORY"}`);
      if (!baselineStatus.head || !/^[a-f0-9]{40}$/u.test(baselineStatus.head)) throw new Error("EVOLUTION_BASELINE_HEAD_INVALID");
      baselineHead = baselineStatus.head;
      baselineManaged = this.#isManagedWorkspace(project.rootPath);
      if (baselineStatus.changes.length > 0) throw new Error(`EVOLUTION_WORKSPACE_DIRTY_BASELINE:${baselineStatus.changes.slice(0, 12).map((item) => item.path).join(",")}`);
      baselineWasClean = true;
      baselineFingerprint = await this.#workspaceFingerprint(project.rootPath, controller.signal);
      if (!baselineFingerprint) throw new Error("EVOLUTION_REQUIRES_GIT_REPOSITORY");''',
    "API_CLEAN_BASELINE",
)
replace_exact(
    api,
    '''        const blockedAt = new Date().toISOString(); const reason = response.blockReason ?? "Harici bağımlılık gerekli.";
        const evidence = [durable.id, response.sessionId, ...response.evidence].slice(0, 40);''',
    '''        const blockedAt = new Date().toISOString(); const reason = response.blockReason ?? "Harici bağımlılık gerekli.";
        const rollbackEvidence = baselineWasClean && baselineHead && baselineManaged ? await this.#restoreManagedWorkspace(project.rootPath, baselineHead) : [];
        const evidence = [durable.id, response.sessionId, ...response.evidence, ...rollbackEvidence].slice(0, 40);''',
    "API_BLOCKED_ROLLBACK",
)
replace_exact(
    api,
    '''      const failedAt = new Date().toISOString(); const raw = error instanceof Error ? error.message : String(error); const message = raw.slice(0, 1_000); const cancelled = message.includes("EVOLUTION_CANCELLED") || controller.signal.aborted;
      const blocker = !cancelled && this.#isExternalBlocker(message);
      const attempts = this.#spec.getState(projectId, specTask.taskId)?.attempts ?? persistedAttempt;
      const recovery = !cancelled && !blocker && attempts >= MAX_AUTOMATIC_RETRIES;''',
    '''      const failedAt = new Date().toISOString(); const raw = error instanceof Error ? error.message : String(error); let message = raw.slice(0, 1_000); const cancelled = message.includes("EVOLUTION_CANCELLED") || controller.signal.aborted;
      let rollbackEvidence: string[] = [];
      let rollbackFailed = false;
      if (baselineWasClean && baselineHead && baselineManaged) {
        try { rollbackEvidence = await this.#restoreManagedWorkspace(project.rootPath, baselineHead); }
        catch (rollbackError) {
          rollbackFailed = true;
          const rollbackMessage = rollbackError instanceof Error ? rollbackError.message : String(rollbackError);
          message = `${message} | EVOLUTION_ROLLBACK_FAILED:${rollbackMessage}`.slice(0, 1_000);
        }
      }
      const blocker = !cancelled && !rollbackFailed && this.#isExternalBlocker(message);
      const attempts = this.#spec.getState(projectId, specTask.taskId)?.attempts ?? persistedAttempt;
      const recovery = !cancelled && (rollbackFailed || message.includes("EVOLUTION_WORKSPACE_DIRTY_BASELINE") || message.includes("EVOLUTION_BASELINE_HEAD_INVALID") || (!blocker && attempts >= MAX_AUTOMATIC_RETRIES));''',
    "API_FAILURE_ROLLBACK",
)
replace_exact(
    api,
    '      this.#spec.mark(projectId, specTask.taskId, specState, { blockReason: blocker ? message : null, lastError: cancelled ? "Kullanıcı tarafından durduruldu." : message, evidence: [durable.id], retryAfterAt });',
    '      this.#spec.mark(projectId, specTask.taskId, specState, { blockReason: blocker ? message : null, lastError: cancelled ? "Kullanıcı tarafından durduruldu." : message, evidence: [durable.id, ...rollbackEvidence], retryAfterAt });',
    "API_FAILURE_EVIDENCE",
)
replace_exact(
    api,
    '          attempts, blockReason: blocker ? message : null, retryAfterAt, error: cancelled ? "Kullanıcı tarafından durduruldu." : message, evidence: [...item.evidence, durable.id, ...phaseEvidence].slice(0, 40), completedAt: failedAt } : item),',
    '          attempts, blockReason: blocker ? message : null, retryAfterAt, error: cancelled ? "Kullanıcı tarafından durduruldu." : message, evidence: [...item.evidence, durable.id, ...rollbackEvidence, ...phaseEvidence].slice(0, 40), completedAt: failedAt } : item),',
    "API_FAILURE_TASK_EVIDENCE",
)
replace_exact(
    api,
    '''        for (const script of ["typecheck", "test"] as const) {
          if (!scripts[script]) continue;
          const command = commandFor(script);
          this.#publishByRoot(rootPath, { stage: script === "test" ? "TESTING" : "VERIFYING", kind: "command", message: `${packageManager} ${script} bağımsız doğrulaması çalışıyor.`, provider: null, model: null });
          const result = await this.#runner.run({ executable: command.executable, args: command.args, cwd: rootPath, cancellation, timeoutMs: script === "test" ? 15 * 60_000 : 8 * 60_000, maxOutputBytes: 8 * 1024 * 1024 });
          evidence.push(result.runId);
          if (result.exitCode !== 0 || result.timedOut || result.truncated) return { ok: false, evidence, detail: `${script.toUpperCase()}_FAILED:${result.stderr.slice(0, 500)}` };
        }''',
    '''        const verificationScripts = scripts.verify ? ["verify"] : ["typecheck", "test", "build"].filter((script) => Boolean(scripts[script]));
        for (const script of verificationScripts) {
          const command = commandFor(script);
          const stage = script === "test" ? "TESTING" as const : "VERIFYING" as const;
          const timeoutMs = script === "verify" ? 35 * 60_000 : script === "test" || script === "build" ? 20 * 60_000 : 8 * 60_000;
          this.#publishByRoot(rootPath, { stage, kind: "command", message: `${packageManager} ${script} bağımsız doğrulaması çalışıyor.`, provider: null, model: null });
          const result = await this.#runner.run({ executable: command.executable, args: command.args, cwd: rootPath, cancellation, timeoutMs, maxOutputBytes: 16 * 1024 * 1024 });
          evidence.push(result.runId);
          if (result.exitCode !== 0 || result.timedOut || result.truncated) return { ok: false, evidence, detail: `${script.toUpperCase()}_FAILED:${result.stderr.slice(0, 700) || result.stdout.slice(0, 700)}` };
        }''',
    "API_FULL_VERIFY",
)
replace_exact(
    api,
    '    return { ok: true, evidence, detail: "git diff --check ve mevcut proje doğrulama scriptleri PASS" };',
    '    return { ok: true, evidence, detail: "git diff --check ve mevcut en güçlü verify/typecheck/test/build kapıları PASS" };',
    "API_VERIFY_DETAIL",
)
replace_exact(
    api,
    '  #publishByRoot(rootPath: string, event:',
    '''  #isManagedWorkspace(rootPath: string): boolean {
    const markerPath = path.join(rootPath, ".devbox-managed-source.json");
    if (!existsSync(markerPath)) return false;
    try {
      const marker = JSON.parse(readFileSync(markerPath, "utf8")) as Record<string, unknown>;
      return marker.product === "DevBox" && marker.purpose === "persistent-self-development-source" && marker.realityContract === "NO_FABRICATED_OR_REPRESENTATIVE_SUCCESS";
    } catch {
      return false;
    }
  }

  async #restoreManagedWorkspace(rootPath: string, baselineHead: string): Promise<string[]> {
    if (!/^[a-f0-9]{40}$/u.test(baselineHead)) throw new Error("EVOLUTION_ROLLBACK_BASELINE_SHA_INVALID");
    const reset = await this.#runner.run({ executable: "git", args: ["-C", rootPath, "reset", "--hard", baselineHead], cwd: rootPath, timeoutMs: 2 * 60_000, maxOutputBytes: 2 * 1024 * 1024 });
    if (reset.exitCode !== 0 || reset.timedOut || reset.truncated) throw new Error(`EVOLUTION_ROLLBACK_RESET_FAILED:${reset.stderr.slice(0, 500)}`);
    const clean = await this.#runner.run({ executable: "git", args: ["-C", rootPath, "clean", "-fd"], cwd: rootPath, timeoutMs: 2 * 60_000, maxOutputBytes: 2 * 1024 * 1024 });
    if (clean.exitCode !== 0 || clean.timedOut || clean.truncated) throw new Error(`EVOLUTION_ROLLBACK_CLEAN_FAILED:${clean.stderr.slice(0, 500)}`);
    const status = await this.#git.status(rootPath);
    if (!status.available || status.head !== baselineHead || status.changes.length !== 0) throw new Error("EVOLUTION_ROLLBACK_VERIFICATION_FAILED");
    return [reset.runId, clean.runId, `rollback-head:${baselineHead}`];
  }

  #publishByRoot(rootPath: string, event:''',
    "API_RESTORE_METHOD",
)

advanced = "src/renderer/AdvancedViews.tsx"
replace_exact(
    advanced,
    '“Şimdi çalıştır” tek kullanıcı eylemiyle sürekli döngüyü başlatır; Durdurulana kadar görevler otomatik ilerler. Doğrulanmış dosya değişikliği kalıcı Git commit olmadan PASS değildir.',
    '“Şimdi çalıştır” tek kullanıcı eylemiyle sürekli döngüyü başlatır; Durdurulana kadar görevler otomatik ilerler. Gerçek harici engel, üç başarısız doğrulama sonrası recovery veya tamamlanmış görev grafiği fail-closed olarak akışı durdurabilir. Doğrulanmış dosya değişikliği kalıcı Git commit olmadan PASS değildir.',
    "UI_CONTINUOUS_TRUTH",
)
replace_exact(
    advanced,
    '<small>Bir görev kanıtlı PASS olunca sıradaki otomatik başlar · hata halinde backoff · aynı anda tek çevrim · SQLite durable job + heartbeat.</small>',
    '<small>Bir görev kanıtlı PASS olunca sıradaki otomatik başlar · managed-source hatasında doğrulanmış rollback + backoff · aynı anda tek çevrim · SQLite durable job + heartbeat.</small>',
    "UI_ROLLBACK_TRUTH",
)

test = "src/main/services/development-spec-service.test.ts"
replace_exact(
    test,
    '    expect(service.next("project-spec-recovery")).toBeNull();',
    '    expect(service.next("project-spec-recovery")).toBeNull();\n    expect(service.next("project-spec-recovery", { allowRecoveryRetry: true })?.taskId).toBe("MAX-01-001");',
    "SPEC_TEST_RECOVERY_RETRY",
)

verifier = "scripts/verify-api-evolution-v7.mjs"
replace_exact(
    verifier,
    'check("real-verification-gate", service.includes(\'"diff", "--check"\') && service.includes(\'["typecheck", "test"]\'));',
    'check("real-verification-gate", service.includes(\'"diff", "--check"\') && service.includes(\'scripts.verify ? ["verify"] : ["typecheck", "test", "build"]\'));',
    "VERIFY_REAL_GATE",
)
replace_exact(
    verifier,
    'check("manual-blocker-retry", specService.includes("allowBlockedExternalRetry") && service.includes("allowBlockedExternalRetry: manual"));',
    '''check("manual-blocker-retry", specService.includes("allowBlockedExternalRetry") && service.includes("allowBlockedExternalRetry: manual"));
check("manual-recovery-retry", specService.includes("allowRecoveryRetry") && service.includes("allowRecoveryRetry: manual"));
check("clean-baseline-gate", service.includes("EVOLUTION_WORKSPACE_DIRTY_BASELINE") && service.includes("baselineWasClean"));
check("managed-source-rollback", service.includes("#restoreManagedWorkspace") && service.includes("rollback-head:"));
check("restart-runtime-reconciliation", service.includes("yarım kalmış atomik görev RECOVERY_REQUIRED") && service.includes("isRunning: false"));''',
    "VERIFY_V8_CHECKS",
)

for transient in [
    ".devbox-hardening-trigger.txt",
    ".v018-harden-v3-trigger",
    ".github/workflows/harden-v018-v2.yml",
    ".github/workflows/harden-v018-v3.yml",
    ".github/workflows/harden-v018-pr.yml",
]:
    Path(transient).unlink(missing_ok=True)

print("DEVBOX_V018_HARDEN_SOURCE_PASS")
