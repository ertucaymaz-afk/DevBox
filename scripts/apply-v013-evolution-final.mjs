import { readFile, writeFile } from "node:fs/promises";

const file = "src/main/services/api-evolution-service.ts";
let source = (await readFile(file, "utf8")).replace(/\r\n/gu, "\n");
function replaceOnce(before, after, label) {
  if (source.includes(after)) return;
  const at = source.indexOf(before);
  if (at < 0) throw new Error(`PATCH_ANCHOR_MISSING:${label}`);
  if (source.indexOf(before, at + before.length) >= 0) throw new Error(`PATCH_ANCHOR_AMBIGUOUS:${label}`);
  source = source.slice(0, at) + after + source.slice(at + before.length);
}
replaceOnce(
`      let phaseEvidence: string[] = [];
      try { phaseEvidence = this.#spec.writePhaseEvidence(projectId, project.rootPath, specTask.phaseId); } catch (evidenceError) {
        const evidenceMessage = evidenceError instanceof Error ? evidenceError.message : String(evidenceError);
        if (!recovery && !blocker && !cancelled) this.#spec.mark(projectId, specTask.taskId, "RECOVERY_REQUIRED", { lastError: \`EVIDENCE_WRITE_FAILED:\${evidenceMessage}\`, evidence: [durable.id] });
      }`,
`      const phaseEvidence: string[] = [];`,
"failure-evidence-must-not-dirty-user-root"
);
replaceOnce(
`      if (manual && !cancelled && !blocker) throw new Error(\`EVOLUTION_CYCLE_FAILED:\${message}\`);
      return this.get(projectId);`,
`      return this.get(projectId);`,
"manual-recoverable-failure-must-continue"
);
replaceOnce(
`tasks: updated.tasks.map((item) => item.id === task.id ? { ...item, state: "SUCCEEDED" as const, provider: response.provider, model: response.model, threadId: thread.thread.id, evidence: [...evidence, ...phaseEvidence].slice(0, 40), error: null, blockReason: null, retryAfterAt: null, completedAt } : item),`,
`tasks: updated.tasks.map((item) => item.id === task.id ? { ...item, state: "SUCCEEDED" as const, provider: response.provider, model: response.model, threadId: thread.thread.id, evidence: finalEvidence, error: null, blockReason: null, retryAfterAt: null, completedAt } : item),`,
"success-task-final-evidence"
);
await writeFile(file, source, "utf8");
console.log("DEVBOX_V013_EVOLUTION_FINAL_APPLIED");
