const LEVELS = Object.freeze({ R0: 0, R1: 1, R2: 2, R3: 3, R4: 4 });

const RULES = Object.freeze([
  { pattern: /(?:secret|credential|token|iam|permission|delete\s+data|drop\s+table)/iu, riskClass: "R4", approval: "HUMAN_AND_SECURITY" },
  { pattern: /(?:production|promote|deploy|migration|auth|authorization|database\s+schema)/iu, riskClass: "R3", approval: "HUMAN" },
  { pattern: /(?:shell|execute|patch|edit|write|worktree|install|dependency|browser\s+action)/iu, riskClass: "R2", approval: "POLICY" },
  { pattern: /(?:refactor|format|lint|test|docs|metadata|analy[sz]e|search|read)/iu, riskClass: "R1", approval: "NONE" }
]);

export function classifyTaskRisk(task) {
  const text = String(task ?? "").trim();
  if (!text) throw new Error("TASK_REQUIRED");
  let result = { riskClass: "R1", approval: "NONE" };
  for (const rule of RULES) {
    if (!rule.pattern.test(text)) continue;
    if (LEVELS[rule.riskClass] > LEVELS[result.riskClass]) result = { riskClass: rule.riskClass, approval: rule.approval };
  }
  return result;
}

export function assertAutonomousActionAllowed({ riskClass, approved = false, securityApproved = false } = {}) {
  if (!(riskClass in LEVELS)) throw new Error("RISK_CLASS_INVALID");
  if (riskClass === "R4") {
    if (!approved || !securityApproved) throw new Error("R4_APPROVAL_REQUIRED");
    return true;
  }
  if (riskClass === "R3" && !approved) throw new Error("R3_APPROVAL_REQUIRED");
  return true;
}

export function releasePolicy({ riskClass, sourceVerified, previewVerified, canaryVerified, knownGoodRollback } = {}) {
  if (!(riskClass in LEVELS)) throw new Error("RISK_CLASS_INVALID");
  if (!sourceVerified) return { allowed: false, state: "SOURCE_NOT_VERIFIED" };
  if (LEVELS[riskClass] >= LEVELS.R2 && !previewVerified) return { allowed: false, state: "PREVIEW_REQUIRED" };
  if (LEVELS[riskClass] >= LEVELS.R2 && !canaryVerified) return { allowed: false, state: "CANARY_REQUIRED" };
  if (!knownGoodRollback) return { allowed: false, state: "KNOWN_GOOD_ROLLBACK_REQUIRED" };
  if (riskClass === "R4") return { allowed: false, state: "MANUAL_PRODUCTION_ONLY" };
  return { allowed: true, state: "RELEASE_POLICY_PASS" };
}
