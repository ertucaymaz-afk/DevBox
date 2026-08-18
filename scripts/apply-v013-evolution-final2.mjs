import { readFile, writeFile } from "node:fs/promises";

const file = "src/main/services/api-evolution-service.ts";
let source = (await readFile(file, "utf8")).replace(/\r\n/gu, "\n");
function exact(before, after, label) {
  const at = source.indexOf(before);
  if (at >= 0) {
    if (source.indexOf(before, at + before.length) >= 0) throw new Error(`PATCH_ANCHOR_AMBIGUOUS:${label}`);
    source = source.slice(0, at) + after + source.slice(at + before.length);
    return;
  }
  if (source.includes(after)) return;
  throw new Error(`PATCH_ANCHOR_MISSING:${label}`);
}
const failureBefore = `      this.#spec.mark(projectId, specTask.taskId, specState, { blockReason: blocker ? message : null, lastError: cancelled ? "Kullanıcı tarafından durduruldu." : message, evidence: [durable.id, ...rollbackEvidence], retryAfterAt });
      let phaseEvidence: string[] = [];
      try { phaseEvidence = this.#spec.writePhaseEvidence(projectId, project.rootPath, specTask.phaseId); } catch (evidenceError) {
        const evidenceMessage = evidenceError instanceof Error ? evidenceError.message : String(evidenceError);
        if (!recovery && !blocker && !cancelled) this.#spec.mark(projectId, specTask.taskId, "RECOVERY_REQUIRED", { lastError: \`EVIDENCE_WRITE_FAILED:\${evidenceMessage}\`, evidence: [durable.id] });
      }
      const current = this.get(projectId);`;
const failureAfter = `      this.#spec.mark(projectId, specTask.taskId, specState, { blockReason: blocker ? message : null, lastError: cancelled ? "Kullanıcı tarafından durduruldu." : message, evidence: [durable.id, ...rollbackEvidence], retryAfterAt });
      const phaseEvidence: string[] = [];
      const current = this.get(projectId);`;
exact(failureBefore, failureAfter, "failure-evidence-exact-isolation");
const manualBefore = `      this.#publish(projectId, { stage, kind: cancelled ? "state" : blocker ? "waiting" : recovery ? "failure" : "waiting", message: detail, provider: current.runtime.provider, model: current.runtime.model });
      if (manual && !cancelled && !blocker) throw new Error(\`EVOLUTION_CYCLE_FAILED:\${message}\`);
      return this.get(projectId);`;
const manualAfter = `      this.#publish(projectId, { stage, kind: cancelled ? "state" : blocker ? "waiting" : recovery ? "failure" : "waiting", message: detail, provider: current.runtime.provider, model: current.runtime.model });
      return this.get(projectId);`;
exact(manualBefore, manualAfter, "manual-recoverable-cycle-must-stay-running");
await writeFile(file, source, "utf8");
console.log("DEVBOX_V013_EVOLUTION_FINAL2_APPLIED");
