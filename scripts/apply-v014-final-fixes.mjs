import { readFile, writeFile } from "node:fs/promises";

async function patch(file, edits) {
  let source = (await readFile(file, "utf8")).replace(/\r\n?/gu, "\n");
  for (const [label, before, after] of edits) {
    const at = source.indexOf(before);
    if (at < 0 || at !== source.lastIndexOf(before)) throw new Error(`V014_FINAL_ANCHOR_INVALID:${file}:${label}`);
    source = source.slice(0, at) + after + source.slice(at + before.length);
  }
  await writeFile(file, source, "utf8");
}

await patch("src/renderer/App.tsx", [
  ["open-thread-immediate-ref",
`  const openThread = useCallback(async (threadId: string, pushHistory = true): Promise<void> => {
    setBusy("thread");
    try {`,
`  const openThread = useCallback(async (threadId: string, pushHistory = true): Promise<void> => {
    const previousThreadId = openThreadIdRef.current;
    openThreadIdRef.current = threadId;
    setBusy("thread");
    try {`],
  ["open-thread-ref-rollback",
`    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setBusy(null);
    }
  }, [bootstrap?.projects, historyIndex, loadProject, selectedProject?.id]);`,
`    } catch (error) {
      openThreadIdRef.current = previousThreadId;
      setNotice(errorMessage(error));
    } finally {
      setBusy(null);
    }
  }, [bootstrap?.projects, historyIndex, loadProject, selectedProject?.id]);`],
  ["bootstrap-thread-ref",
`          if (active) {
            setThread(detail);
            setDraftAttachments(await window.devbox.listDraftAttachments(detail.thread.id));`,
`          if (active) {
            openThreadIdRef.current = detail.thread.id;
            setThread(detail);
            setDraftAttachments(await window.devbox.listDraftAttachments(detail.thread.id));`],
  ["create-thread-ref",
`      const detail = await window.devbox.createThread(project.id, "Yeni görev");
      setThread(detail);`,
`      const detail = await window.devbox.createThread(project.id, "Yeni görev");
      openThreadIdRef.current = detail.thread.id;
      setThread(detail);`],
  ["new-thread-ref-clear",
`    setThread(null);
    setComposer("");`,
`    openThreadIdRef.current = null;
    setThread(null);
    setComposer("");`],
  ["workspace-refresh-thread-guard",
`      if (selectedProject?.id === activeThread.thread.projectId && liveTarget) await loadProject(selectedProject);`,
`      if (openThreadIdRef.current === threadId && selectedProject?.id === activeThread.thread.projectId && liveTarget) await loadProject(selectedProject);`],
  ["activity-thread-guard",
`  useEffect(() => window.devbox.onThreadActivity((activity) => {
    setLiveActivities((current) => [...current, activity].slice(-80));
    requestAnimationFrame(() => {`,
`  useEffect(() => window.devbox.onThreadActivity((activity) => {
    if (openThreadIdRef.current !== activity.threadId) return;
    setLiveActivities((current) => [...current, activity].slice(-80));
    requestAnimationFrame(() => {`],
  ["snapshot-scroll-guard",
`  useEffect(() => window.devbox.onThreadSnapshot((detail) => {
    setThread((current) => current?.thread.id === detail.thread.id ? detail : current);
    setThreads((current) => {
      const index = current.findIndex((item) => item.id === detail.thread.id);
      if (index < 0) return [detail.thread, ...current];
      return current.map((item) => item.id === detail.thread.id ? detail.thread : item);
    });
    requestAnimationFrame(() => {
      if (conversationRef.current) conversationRef.current.scrollTop = conversationRef.current.scrollHeight;
    });
  }), []);`,
`  useEffect(() => window.devbox.onThreadSnapshot((detail) => {
    const isOpen = openThreadIdRef.current === detail.thread.id;
    setThread((current) => current?.thread.id === detail.thread.id ? detail : current);
    setThreads((current) => {
      const index = current.findIndex((item) => item.id === detail.thread.id);
      if (index < 0) return [detail.thread, ...current];
      return current.map((item) => item.id === detail.thread.id ? detail.thread : item);
    });
    if (isOpen) requestAnimationFrame(() => {
      if (conversationRef.current) conversationRef.current.scrollTop = conversationRef.current.scrollHeight;
    });
  }), []);`],
  ["update-message-thread-guard",
`    try {
      setThread(await window.devbox.updateMessage(thread.thread.id, itemId, content.trim()));
      await updateThreads();`,
`    try {
      const threadId = thread.thread.id;
      const detail = await window.devbox.updateMessage(threadId, itemId, content.trim());
      setThread((current) => current?.thread.id === threadId ? detail : current);
      await updateThreads();`],
  ["regenerate-thread-guard",
`    try {
      setThread(await window.devbox.regenerateMessage(thread.thread.id, itemId));
      await updateThreads();`,
`    try {
      const threadId = thread.thread.id;
      const detail = await window.devbox.regenerateMessage(threadId, itemId);
      setThread((current) => current?.thread.id === threadId ? detail : current);
      await updateThreads();`]
]);

await patch("src/main/services/api-evolution-service.ts", [
  ["continuation-helper",
`export function createAdaptiveEvolutionTask(sequence: number): DevelopmentSpecTask {`,
`export function shouldContinueEvolution(input: {
  enabled: boolean;
  isRunning: boolean;
  remainingCount: number;
  gateState: string | null;
  adaptiveState: DevelopmentSpecPersistedStateName | null;
}): boolean {
  if (!input.enabled || input.isRunning) return false;
  if (input.remainingCount <= 0) return !["BLOCKED_EXTERNAL", "RECOVERY_REQUIRED", "CANCELLED"].includes(input.adaptiveState ?? "FAILED");
  return input.gateState !== "BLOCKED_EXTERNAL" && input.gateState !== "RECOVERY_REQUIRED";
}

export function createAdaptiveEvolutionTask(sequence: number): DevelopmentSpecTask {`],
  ["adaptive-can-continue",
`  #canContinue(campaign: EvolutionCampaign): boolean {
    if (!campaign.enabled || campaign.isRunning || campaign.spec.remainingCount <= 0) return false;
    return campaign.spec.currentGateState !== "BLOCKED_EXTERNAL" && campaign.spec.currentGateState !== "RECOVERY_REQUIRED";
  }`,
`  #canContinue(campaign: EvolutionCampaign): boolean {
    const adaptiveState = campaign.spec.remainingCount <= 0 ? this.#adaptiveState(campaign.projectId).current?.state ?? null : null;
    return shouldContinueEvolution({
      enabled: campaign.enabled,
      isRunning: campaign.isRunning,
      remainingCount: campaign.spec.remainingCount,
      gateState: campaign.spec.currentGateState,
      adaptiveState
    });
  }`]
]);

await patch("src/main/services/api-evolution-service.test.ts", [
  ["continuation-import",
`import { ApiEvolutionService, createAdaptiveEvolutionTask } from "./api-evolution-service.js";`,
`import { ApiEvolutionService, createAdaptiveEvolutionTask, shouldContinueEvolution } from "./api-evolution-service.js";`],
  ["continuation-tests",
`describe("adaptive API evolution tasks", () => {
  it("rotates real maintenance domains after the fixed core graph", () => {`,
`describe("adaptive API evolution tasks", () => {
  it("continues immediately after the fixed graph while respecting adaptive blockers", () => {
    expect(shouldContinueEvolution({ enabled: true, isRunning: false, remainingCount: 0, gateState: null, adaptiveState: null })).toBe(true);
    expect(shouldContinueEvolution({ enabled: true, isRunning: false, remainingCount: 0, gateState: null, adaptiveState: "FAILED" })).toBe(true);
    expect(shouldContinueEvolution({ enabled: true, isRunning: false, remainingCount: 0, gateState: null, adaptiveState: "BLOCKED_EXTERNAL" })).toBe(false);
    expect(shouldContinueEvolution({ enabled: true, isRunning: false, remainingCount: 0, gateState: null, adaptiveState: "RECOVERY_REQUIRED" })).toBe(false);
    expect(shouldContinueEvolution({ enabled: false, isRunning: false, remainingCount: 0, gateState: null, adaptiveState: null })).toBe(false);
  });

  it("rotates real maintenance domains after the fixed core graph", () => {`]
]);

console.log("DEVBOX_V014_FINAL_FIXES_APPLIED");
