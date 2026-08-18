import { readFile, rm, writeFile } from "node:fs/promises";

async function text(path) { return (await readFile(path, "utf8")).replace(/\r\n/gu, "\n"); }
function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  const at = source.indexOf(before);
  if (at < 0) throw new Error(`PATCH_ANCHOR_MISSING:${label}`);
  if (source.indexOf(before, at + before.length) >= 0) throw new Error(`PATCH_ANCHOR_AMBIGUOUS:${label}`);
  return source.slice(0, at) + after + source.slice(at + before.length);
}

// Core runtime/evolution/IPC/App transforms from the reviewed adapter, without its obsolete Canvas block.
const coreSource = await text("scripts/apply-v013-core2.mjs");
const coreRuntime = replaceOnce(
  coreSource,
  "await canvas();\nconsole.log(\"DEVBOX_V013_CORE2_APPLIED\");",
  "console.log(\"DEVBOX_V013_CORE2_WITHOUT_CANVAS_APPLIED\");",
  "core2-skip-obsolete-canvas"
);
const runtimePath = "scripts/.apply-v013-core2-runtime3.mjs";
await writeFile(runtimePath, coreRuntime, "utf8");
try { await import(`./.apply-v013-core2-runtime3.mjs?run=${Date.now()}`); }
finally { await rm(runtimePath, { force: true }); }

const file = "src/renderer/CanvasInspector.tsx";
let source = await text(file);
source = replaceOnce(
  source,
  "  result: ThreadWorkspaceResult | null;\n  threadTitle: string | null;",
  "  result: ThreadWorkspaceResult | null;\n  liveTargetPath: string | null;\n  liveActive: boolean;\n  threadTitle: string | null;",
  "canvas-live-props-type"
);
source = replaceOnce(
  source,
  "  const { project, result, threadTitle, threadState, gitBranch, coreState, onClose, onRefresh } = props;",
  "  const { project, result, liveTargetPath, liveActive, threadTitle, threadState, gitBranch, coreState, onClose, onRefresh } = props;",
  "canvas-live-props"
);
source = replaceOnce(
  source,
  "  const defaultTargetPath = result?.previewPath ?? result?.primaryFile ?? null;",
  "  const defaultTargetPath = liveTargetPath ?? result?.previewPath ?? result?.primaryFile ?? null;",
  "canvas-live-target"
);
source = replaceOnce(
  source,
  "    } catch (error) {\n      setSnapshot(null); setCode(\"\"); setNotice(error instanceof Error ? error.message : String(error));\n    } finally { setBusy(false); }\n  }, [project, targetPath]);",
  "    } catch (error) {\n      if (liveActive) setNotice(null);\n      else { setSnapshot(null); setCode(\"\"); setNotice(error instanceof Error ? error.message : String(error)); }\n    } finally { setBusy(false); }\n  }, [liveActive, project, targetPath]);",
  "canvas-live-read"
);
source = replaceOnce(
  source,
  "  useEffect(() => {\n    setSelectedPath(defaultTargetPath);\n    setRevision((value) => value + 1);\n    setConsoleEntries([]);\n    setNotice(null);\n    setPreviewState(result?.previewPath ? \"loading\" : \"idle\");\n  }, [defaultTargetPath, result?.createdAt, result?.previewPath]);\n  useEffect(() => { void loadFile(); }, [loadFile, result?.createdAt]);\n  useEffect(() => {\n    if (result?.previewPath) setTab(\"preview\");\n    else if (result?.changedFiles.length) setTab(\"changes\");\n  }, [result?.createdAt, result?.previewPath, result?.changedFiles.length]);",
  "  useEffect(() => {\n    setSelectedPath(defaultTargetPath);\n    setConsoleEntries([]);\n    setNotice(null);\n    if (liveActive) {\n      setPreviewState(\"idle\");\n      setTab(\"code\");\n    } else {\n      setRevision((value) => value + 1);\n      setPreviewState(result?.previewPath ? \"loading\" : \"idle\");\n    }\n  }, [defaultTargetPath, liveActive, result?.createdAt, result?.previewPath]);\n  useEffect(() => { void loadFile(); }, [loadFile, result?.createdAt]);\n  useEffect(() => {\n    if (!liveActive || !project || !targetPath) return;\n    setTab(\"code\");\n    const timer = window.setInterval(() => { void loadFile(); }, 350);\n    return () => window.clearInterval(timer);\n  }, [liveActive, loadFile, project, targetPath]);\n  useEffect(() => {\n    if (liveActive) { setTab(\"code\"); return; }\n    if (result?.previewPath) setTab(\"preview\");\n    else if (result?.changedFiles.length) setTab(\"changes\");\n  }, [liveActive, result?.createdAt, result?.previewPath, result?.changedFiles.length]);",
  "canvas-live-effects-current"
);
source = replaceOnce(
  source,
  "        const level = typeof payload.level === \"string\" ? payload.level : \"log\";\n        const createdAt",
  "        const level = typeof payload.level === \"string\" ? payload.level : \"log\";\n        if (level === \"error\") setPreviewState(\"error\");\n        const createdAt",
  "canvas-console-error-state"
);
const codeLabelBefore = "<small>{snapshot ? `${snapshot.language} · SHA ${snapshot.sha256.slice(0, 10)}` : \"yüklenmedi\"}</small>";
const codeLabelAfter = "<small>{liveActive ? (snapshot ? \"CANLI · gerçek dosya diskten okunuyor\" : \"CANLI · ilk dosya yazımı bekleniyor\") : snapshot ? `${snapshot.language} · SHA ${snapshot.sha256.slice(0, 10)}` : \"yüklenmedi\"}</small>";
source = replaceOnce(source, codeLabelBefore, codeLabelAfter, "canvas-live-code-label");
await writeFile(file, source, "utf8");
console.log("DEVBOX_V013_RUNTIME3_APPLIED");
