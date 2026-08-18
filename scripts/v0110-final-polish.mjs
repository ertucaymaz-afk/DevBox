import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
let changed = 0;

async function edit(relativePath, mutate) {
  const file = path.join(root, relativePath);
  const before = (await readFile(file, "utf8")).replace(/\r\n/gu, "\n");
  const after = mutate(before);
  if (after === before) return;
  await writeFile(file, after, "utf8");
  changed += 1;
  process.stdout.write(`V0110_POLISH ${relativePath}\n`);
}

function replaceExact(text, from, to, code) {
  if (text.includes(to)) return text;
  if (!text.includes(from)) throw new Error(`${code}:source-pattern-missing`);
  return text.replace(from, to);
}

await edit("src/renderer/App.tsx", (text) => {
  const createOld = `      setThread(detail);\n      setDraftAttachments([]);\n      await updateThreads();\n      if (selectedProject) await loadProject(selectedProject);\n      setView("thread");`;
  const createNew = `      setThread(detail);\n      setDraftAttachments([]);\n      await updateThreads();\n      setView("thread");`;
  if (text.includes(createOld)) text = text.replace(createOld, createNew);

  const sendOld = `      const detail = await window.devbox.sendMessage(activeThread.thread.id, content, draftAttachments.map((attachment) => attachment.id));\n      setThread(detail);\n      setDraftAttachments([]);\n      await updateThreads();\n      requestAnimationFrame(() => {`;
  const sendNew = `      const detail = await window.devbox.sendMessage(activeThread.thread.id, content, draftAttachments.map((attachment) => attachment.id));\n      setThread(detail);\n      setDraftAttachments([]);\n      await updateThreads();\n      if (selectedProject) await loadProject(selectedProject);\n      requestAnimationFrame(() => {`;
  if (!text.includes(sendNew)) {
    if (!text.includes(sendOld)) throw new Error("APP_SEND_PROJECT_REFRESH:source-pattern-missing");
    text = text.replace(sendOld, sendNew);
  }
  return text;
});

await edit("src/main/services/agent-service.ts", (text) => {
  text = replaceExact(
    text,
    `    report(onProgress, "command", "RUNNING_COMMAND", "hermes chat güvenli modda çalıştırılıyor.", "Hermes / NVIDIA NIM", modelOverride);`,
    `    report(onProgress, "command", "RUNNING_COMMAND", workspaceMutation ? "hermes chat gerçek workspace file/terminal araç döngüsüyle çalıştırılıyor." : "hermes chat güvenli sohbet modunda çalıştırılıyor.", "Hermes / NVIDIA NIM", modelOverride);`,
    "AGENT_MODE_ACTIVITY"
  );
  const argsOld = `        ...(workspaceMutation ? ["--toolsets", "file,terminal", "--ignore-user-config", "--ignore-rules", "--yolo"] : ["--safe-mode"]),`;
  const argsNew = `        ...(workspaceMutation ? ["--toolsets", "file,terminal", "--ignore-user-config", "--ignore-rules", "--checkpoints", "--yolo"] : ["--safe-mode"]),`;
  return replaceExact(text, argsOld, argsNew, "AGENT_WORKSPACE_CHECKPOINTS");
});

process.stdout.write(`V0110_FINAL_POLISH_COMPLETE changed=${changed}\n`);
