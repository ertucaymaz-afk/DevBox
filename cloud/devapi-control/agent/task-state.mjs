const ACTIVE = [
  "CREATED", "TRIAGED", "PLANNING", "WAITING_APPROVAL", "WORKSPACE_PROVISIONING",
  "RESEARCHING", "IMPLEMENTING", "VERIFYING", "REVIEWING", "SOURCE_VERIFIED",
  "PREVIEWING", "PREVIEW_VERIFIED", "CANARYING", "CANARY_VERIFIED", "PROMOTING",
  "OBSERVING", "KNOWN_GOOD", "COMPLETED"
];
const TERMINAL_FAILURE = ["BLOCKED", "BLOCKED_EXTERNAL", "FAILED", "CANCELLED", "TIMED_OUT", "ROLLED_BACK", "REJECTED"];
export const TASK_STATES = Object.freeze([...ACTIVE, ...TERMINAL_FAILURE]);
const STATE_SET = new Set(TASK_STATES);
const TERMINAL = new Set(["COMPLETED", ...TERMINAL_FAILURE]);

const NEXT = new Map([
  ["CREATED", new Set(["TRIAGED", "CANCELLED", "REJECTED"])],
  ["TRIAGED", new Set(["PLANNING", "WAITING_APPROVAL", "BLOCKED", "CANCELLED"])],
  ["PLANNING", new Set(["WAITING_APPROVAL", "WORKSPACE_PROVISIONING", "RESEARCHING", "BLOCKED", "FAILED", "CANCELLED"])],
  ["WAITING_APPROVAL", new Set(["WORKSPACE_PROVISIONING", "RESEARCHING", "REJECTED", "CANCELLED", "BLOCKED"])],
  ["WORKSPACE_PROVISIONING", new Set(["RESEARCHING", "IMPLEMENTING", "BLOCKED_EXTERNAL", "FAILED", "CANCELLED", "TIMED_OUT"])],
  ["RESEARCHING", new Set(["IMPLEMENTING", "BLOCKED_EXTERNAL", "FAILED", "CANCELLED", "TIMED_OUT"])],
  ["IMPLEMENTING", new Set(["VERIFYING", "BLOCKED", "FAILED", "CANCELLED", "TIMED_OUT"])],
  ["VERIFYING", new Set(["REVIEWING", "SOURCE_VERIFIED", "FAILED", "BLOCKED", "CANCELLED", "TIMED_OUT"])],
  ["REVIEWING", new Set(["IMPLEMENTING", "SOURCE_VERIFIED", "REJECTED", "FAILED", "CANCELLED"])],
  ["SOURCE_VERIFIED", new Set(["PREVIEWING", "COMPLETED", "CANCELLED"])],
  ["PREVIEWING", new Set(["PREVIEW_VERIFIED", "FAILED", "BLOCKED_EXTERNAL", "CANCELLED", "TIMED_OUT"])],
  ["PREVIEW_VERIFIED", new Set(["CANARYING", "COMPLETED", "CANCELLED"])],
  ["CANARYING", new Set(["CANARY_VERIFIED", "ROLLED_BACK", "FAILED", "CANCELLED", "TIMED_OUT"])],
  ["CANARY_VERIFIED", new Set(["PROMOTING", "COMPLETED", "ROLLED_BACK", "CANCELLED"])],
  ["PROMOTING", new Set(["OBSERVING", "ROLLED_BACK", "FAILED", "BLOCKED_EXTERNAL", "TIMED_OUT"])],
  ["OBSERVING", new Set(["KNOWN_GOOD", "ROLLED_BACK", "FAILED", "TIMED_OUT"])],
  ["KNOWN_GOOD", new Set(["COMPLETED", "ROLLED_BACK"])],
  ["ROLLED_BACK", new Set([])],
  ["COMPLETED", new Set([])]
]);

export function isTaskState(value) { return STATE_SET.has(String(value ?? "")); }
export function isTerminalTaskState(value) { return TERMINAL.has(String(value ?? "")); }

export function assertTaskTransition(from, to) {
  const source = String(from ?? "");
  const target = String(to ?? "");
  if (!STATE_SET.has(source)) throw new Error("TASK_STATE_INVALID_FROM");
  if (!STATE_SET.has(target)) throw new Error("TASK_STATE_INVALID_TO");
  if (source === target) throw new Error("TASK_STATE_NOOP");
  if (TERMINAL.has(source)) throw new Error("TASK_STATE_TERMINAL");
  if (TERMINAL_FAILURE.includes(target)) return true;
  if (!NEXT.get(source)?.has(target)) throw new Error(`TASK_STATE_TRANSITION_DENIED:${source}:${target}`);
  return true;
}

export function normalizeTaskInput(input = {}) {
  const title = String(input.title ?? "").trim().slice(0, 180);
  const request = String(input.request ?? "").trim().slice(0, 12_000);
  const sourceRepo = String(input.sourceRepo ?? "ertucaymaz-afk/DevBox").trim().slice(0, 240);
  const sourceRef = String(input.sourceRef ?? "").trim().slice(0, 240);
  const sourceSha = String(input.sourceSha ?? "").trim().toLowerCase();
  if (title.length < 3) throw new Error("TASK_TITLE_REQUIRED");
  if (request.length < 3) throw new Error("TASK_REQUEST_REQUIRED");
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(sourceRepo)) throw new Error("TASK_SOURCE_REPO_INVALID");
  if (sourceRef.length < 1) throw new Error("TASK_SOURCE_REF_REQUIRED");
  if (!/^[0-9a-f]{40}$/u.test(sourceSha)) throw new Error("TASK_SOURCE_SHA_INVALID");
  return Object.freeze({ title, request, sourceRepo, sourceRef, sourceSha });
}
