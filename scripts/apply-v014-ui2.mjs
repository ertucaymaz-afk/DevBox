import { readFile, writeFile } from "node:fs/promises";

const file = "src/renderer/App.tsx";
let source = (await readFile(file, "utf8")).replace(/\r\n?/gu, "\n");

function exact(before, after, label) {
  const at = source.indexOf(before);
  if (at < 0 || at !== source.lastIndexOf(before)) throw new Error(`V014_UI2_ANCHOR_INVALID:${label}`);
  source = source.slice(0, at) + after + source.slice(at + before.length);
}

exact(
  "function formatThreadTime(value: string): string {",
  `function isWorkspaceFollowupIntent(content: string): boolean {
  return /(?:düzelt|değiştir|güncelle|iyileştir|geliştir|ekle|sil|beğenmedim|devam et|bunu|şunu|onu|aynı|önceki|rengi|tasarımı|görünümü|animasyonu|mobilde)/iu.test(content);
}

function formatThreadTime(value: string): string {`,
  "followup-helper"
);

exact(
  "  const [liveActivities, setLiveActivities] = useState<ThreadActivityEvent[]>([]);",
  `  const [liveActivities, setLiveActivities] = useState<ThreadActivityEvent[]>([]);
  const [pendingTurns, setPendingTurns] = useState<Record<string, number>>({});`,
  "pending-state"
);

exact(
  `  const introStartedAt = useRef(0);

  const updateThreads`,
  `  const introStartedAt = useRef(0);
  const openThreadIdRef = useRef<string | null>(null);
  useEffect(() => { openThreadIdRef.current = thread?.thread.id ?? null; }, [thread?.thread.id]);

  const updateThreads`,
  "open-thread-ref"
);

const sendStart = source.indexOf("  const sendMessage = useCallback(async (): Promise<void> => {");
const sendEnd = source.indexOf("\n\n  useEffect(() => window.devbox.onThreadActivity", sendStart);
if (sendStart < 0 || sendStart !== source.lastIndexOf("  const sendMessage = useCallback(async (): Promise<void> => {") || sendEnd < 0) throw new Error("V014_UI2_SEND_SCOPE_INVALID");
const sendMethod = `  const sendMessage = useCallback(async (): Promise<void> => {
    const content = composer.trim();
    if (!content && draftAttachments.length === 0) return;
    const activeThread = thread ?? await createThread();
    if (!activeThread) return;
    const threadId = activeThread.thread.id;
    const attachmentIds = draftAttachments.map((attachment) => attachment.id);
    const explicitTarget = inferWorkspaceTargetPath(content);
    const previousTarget = workspaceResult?.threadId === threadId ? workspaceResult.primaryFile ?? workspaceResult.previewPath : null;
    const liveTarget = explicitTarget ?? (isWorkspaceFollowupIntent(content) ? previousTarget ?? null : null);

    setComposer("");
    setDraftAttachments([]);
    if (liveTarget) {
      setLiveWorkspacePath(liveTarget);
      setLiveWorkspaceActive(true);
      setInspectorVisible(true);
    }
    setChangeSummaryOpen(false);
    setLiveActivities((current) => current.filter((activity) => activity.threadId !== threadId));
    setPendingTurns((current) => ({ ...current, [threadId]: (current[threadId] ?? 0) + 1 }));

    try {
      const detail = await window.devbox.sendMessage(threadId, content, attachmentIds);
      setThread((current) => current?.thread.id === detail.thread.id ? detail : current);
      await updateThreads();
      if (selectedProject?.id === activeThread.thread.projectId && liveTarget) await loadProject(selectedProject);
      if (openThreadIdRef.current === threadId) {
        requestAnimationFrame(() => {
          if (conversationRef.current) conversationRef.current.scrollTop = conversationRef.current.scrollHeight;
        });
      }
    } catch (error) {
      setNotice(errorMessage(error));
      if (openThreadIdRef.current === threadId) setComposer((current) => current.trim() ? current : content);
    } finally {
      setPendingTurns((current) => {
        const nextCount = Math.max(0, (current[threadId] ?? 1) - 1);
        const next = { ...current };
        if (nextCount === 0) delete next[threadId]; else next[threadId] = nextCount;
        return next;
      });
      setLiveActivities((current) => current.filter((activity) => activity.threadId !== threadId));
      if (openThreadIdRef.current === threadId) setLiveWorkspaceActive(false);
    }
  }, [composer, createThread, draftAttachments, loadProject, selectedProject, thread, updateThreads, workspaceResult]);`;
source = source.slice(0, sendStart) + sendMethod + source.slice(sendEnd);

exact(
  `  useEffect(() => window.devbox.onThreadWorkspaceResult((result) => {
    setWorkspaceResult(result);
    setLiveWorkspaceActive(false);
    setLiveWorkspacePath(result.previewPath ?? result.primaryFile ?? null);
    setInspectorVisible(true);
    setChangeSummaryOpen(false);
  }), []);`,
  `  useEffect(() => window.devbox.onThreadWorkspaceResult((result) => {
    if (openThreadIdRef.current !== result.threadId) return;
    setWorkspaceResult(result);
    setLiveWorkspaceActive(false);
    setLiveWorkspacePath(result.previewPath ?? result.primaryFile ?? null);
    setInspectorVisible(true);
    setChangeSummaryOpen(false);
  }), []);`,
  "workspace-result-thread-guard"
);

exact(
  `  useEffect(() => {
    if (!selectedProject?.isGitRepository) return;
    let active = true;
    const refresh = (): void => {
      void window.devbox.getGitStatus(selectedProject.id).then((status) => {
        if (active) setGitStatus(status);
      }).catch(() => {
        // The explicit Git view exposes command errors; passive polling stays unobtrusive.
      });
    };
    const timer = window.setInterval(refresh, 5_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [selectedProject]);`,
  `  useEffect(() => {
    if (!selectedProject?.isGitRepository) return;
    let active = true;
    const refresh = (): void => {
      if (document.hidden) return;
      void window.devbox.getGitStatus(selectedProject.id).then((status) => {
        if (active) setGitStatus(status);
      }).catch(() => {
        // Explicit Git view exposes errors; passive refresh remains quiet.
      });
    };
    const onVisibility = (): void => { if (!document.hidden) refresh(); };
    const timer = window.setInterval(refresh, 15_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [selectedProject]);`,
  "resource-friendly-git-poll"
);

exact(
  "  const capabilities = bootstrap?.capabilities ?? [];",
  `  const activePendingTurns = thread ? pendingTurns[thread.thread.id] ?? 0 : 0;
  const capabilities = bootstrap?.capabilities ?? [];`,
  "active-pending-count"
);

exact(
  `{busy === "message" && <div className="activity-line running compact"><LoaderCircle className="spin" size={14} /><span>{liveWorkspaceActive ? "Gerçek dosya değişiklikleri diske yazılıyor ve Canvas kod görünümü canlı okunuyor…" : "DevBox yanıt hazırlıyor…"}</span></div>}`,
  `{activePendingTurns > 0 && <div className="activity-line running compact"><LoaderCircle className="spin" size={14} /><span>{liveWorkspaceActive ? "Gerçek dosya değişiklikleri diske yazılıyor ve Canvas kod görünümü canlı okunuyor…" : activePendingTurns > 1 ? \`DevBox yanıt üretiyor · ${activePendingTurns - 1} ek istek aynı sohbet kuyruğunda\` : "DevBox yanıt hazırlıyor…"}</span></div>}`,
  "pending-status-line"
);

exact(
  '<div className={`composer ${busy === "message" ? "busy" : ""}`}>',
  '<div className={`composer ${activePendingTurns > 0 ? "busy" : ""}`}>',
  "composer-pending-class"
);

exact(
  `<textarea ref={composerRef} value={composer} onChange={(event) => setComposer(event.target.value)} placeholder="DevBox'a bir görev verin" disabled={busy === "message"} rows={1}`,
  `<textarea ref={composerRef} value={composer} onChange={(event) => setComposer(event.target.value)} placeholder={activePendingTurns > 0 ? "Yeni mesaj yazabilirsiniz; aynı sohbet içinde sıraya alınır" : "DevBox'a bir görev verin"} rows={1}`,
  "composer-enabled"
);

exact(
  'disabled={(!composer.trim() && draftAttachments.length === 0) || busy === "message"}',
  'disabled={!composer.trim() && draftAttachments.length === 0}',
  "send-enabled"
);

await writeFile(file, source, "utf8");
console.log("DEVBOX_V014_UI2_APPLIED");
