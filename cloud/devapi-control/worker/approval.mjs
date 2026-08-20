export function assertWorkerApproval(input, expectedRisk = "R2") {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("WORKER_APPROVAL_REQUIRED");
  const approvalId = String(input.approvalId ?? "").trim();
  const riskClass = String(input.riskClass ?? "").trim().toUpperCase();
  const approved = input.approved === true;
  const actor = String(input.actor ?? "").trim().slice(0, 120);
  if (!/^[0-9a-f-]{36}$/iu.test(approvalId)) throw new Error("WORKER_APPROVAL_ID_INVALID");
  if (riskClass !== expectedRisk) throw new Error("WORKER_APPROVAL_RISK_MISMATCH");
  if (!approved) throw new Error("WORKER_APPROVAL_DENIED");
  if (!actor) throw new Error("WORKER_APPROVAL_ACTOR_REQUIRED");
  return Object.freeze({ approvalId, riskClass, approved: true, actor });
}
