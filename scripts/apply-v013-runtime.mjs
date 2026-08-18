import { readFile, rm, writeFile } from "node:fs/promises";

async function text(path) { return (await readFile(path, "utf8")).replace(/\r\n/gu, "\n"); }
function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  const at = source.indexOf(before);
  if (at < 0) throw new Error(`PATCH_ANCHOR_MISSING:${label}`);
  if (source.indexOf(before, at + before.length) >= 0) throw new Error(`PATCH_ANCHOR_AMBIGUOUS:${label}`);
  return source.slice(0, at) + after + source.slice(at + before.length);
}

// Reuse the already-reviewed core2 transformations but deliberately skip its obsolete Canvas adapter.
const coreSource = await text("scripts/apply-v013-core2.mjs");
const runtimeSource = replaceOnce(coreSource, "await canvas();\nconsole.log(\"DEVBOX_V013_CORE2_APPLIED\");", "console.log(\"DEVBOX_V013_CORE2_WITHOUT_CANVAS_APPLIED\");", "core2-skip-obsolete-canvas");
const runtimePath = "scripts/.apply-v013-core2-runtime.mjs";
await writeFile(runtimePath, runtimeSource, "utf8");
try { await import(`./.apply-v013-core2-runtime.mjs?run=${Date.now()}`); }
finally { await rm(runtimePath, { force: true }); }

const file = "src/renderer/CanvasInspector.tsx";
let source = await text(file);
source = replaceOnce(source,
`  result: ThreadWorkspaceResult | null;
  threadTitle: string | null;`,
`  result: ThreadWorkspaceResult | null;
  liveTargetPath: string | null;
  liveActive: boolean;
  threadTitle: string | null;`, "canvas-live-props-type");
source = replaceOnce(source,
`  const { project, result, threadTitle, threadState, gitBranch, coreState, onClose, onRefresh } = props;`,
`  const { project, result, liveTargetPath, liveActive, threadTitle, threadState, gitBranch, coreState, onClose, onRefresh } = props;`, "canvas-live-props");
source = replaceOnce(source,
`  const defaultTargetPath = result?.previewPath ?? result?.primaryFile ?? null;`,
`  const defaultTargetPath = liveTargetPath ?? result?.previewPath ?? result?.primaryFile ?? null;`, "canvas-live-target");
source = replaceOnce(source,
`    } catch (error) {
      setSnapshot(null); setCode(""); setNotice(error instanceof Error ? error.message : String(error));
    } finally { setBusy(false); }
  }, [project, targetPath]);`,
`    } catch (error) {
      if (liveActive) setNotice(null);
      else { setSnapshot(null); setCode(""); setNotice(error instanceof Error ? error.message : String(error)); }
    } finally { setBusy(false); }
  }, [liveActive, project, targetPath]);`, "canvas-live-read");
source = replaceOnce(source,
`  useEffect(() => {
    setSelectedPath(defaultTargetPath);
    setRevision((value) => value + 1);
    setConsoleEntries([]);
    setNotice(null);
    setPreviewState(result?.previewPath ? "loading" : "idle");
  }, [defaultTargetPath, result?.createdAt, result?.previewPath]);
  useEffect(() => { void loadFile(); }, [loadFile, result?.createdAt]);
  useEffect(() => {
    if (result?.previewPath) setTab("preview");
    else if (result?.changedFiles.length) setTab("changes");
  }, [result?.createdAt, result?.previewPath, result?.changedFiles.length]);`,
`  useEffect(() => {
    setSelectedPath(defaultTargetPath);
    setConsoleEntries([]);
    setNotice(null);
    if (liveActive) {
      setPreviewState("idle");
      setTab("code");
    } else {
      setRevision((value) => value + 1);
      setPreviewState(result?.previewPath ? "loading" : "idle");
    }
  }, [defaultTargetPath, liveActive, result?.createdAt, result?.previewPath]);
  useEffect(() => { void loadFile(); }, [loadFile, result?.createdAt]);
  useEffect(() => {
    if (!liveActive || !project || !targetPath) return;
    setTab("code");
    const timer = window.setInterval(() => { void loadFile(); }, 350);
    return () => window.clearInterval(timer);
  }, [liveActive, loadFile, project, targetPath]);
  useEffect(() => {
    if (liveActive) { setTab("code"); return; }
    if (result?.previewPath) setTab("preview");
    else if (result?.changedFiles.length) setTab("changes");
  }, [liveActive, result?.createdAt, result?.previewPath, result?.changedFiles.length]);`, "canvas-live-effects-current");
source = replaceOnce(source,
`        const level = typeof payload.level === "string" ? payload.level : "log";
        const createdAt`,
`        const level = typeof payload.level === "string" ? payload.level : "log";
        if (level === "error") setPreviewState("error");
        const createdAt`, "canvas-console-error-state");
source = replaceOnce(source,
`<div><strong>{targetPath ?? "Dosya yok"}</strong><small>{snapshot ? \`${snapshot.language} · SHA \${snapshot.sha256.slice(0, 10)}\` : "yüklenmedi"}</small></div>`,
`<div><strong>{targetPath ?? "Dosya yok"}</strong><small>{liveActive ? (snapshot ? "CANLI · gerçek dosya diskten okunuyor" : "CANLI · ilk dosya yazımı bekleniyor") : snapshot ? \`${snapshot.language} · SHA \${snapshot.sha256.slice(0, 10)}\` : "yüklenmedi"}</small></div>`, "canvas-live-code-label");
await writeFile(file, source, "utf8");
console.log("DEVBOX_V013_RUNTIME_AND_CANVAS_APPLIED");
