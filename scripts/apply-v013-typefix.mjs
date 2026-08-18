import { readFile, writeFile } from "node:fs/promises";

const file = "src/main/ipc.ts";
let source = (await readFile(file, "utf8")).replace(/\r\n/gu, "\n");
const before = `        for (let repairAttempt = 0; repairAttempt < 3; repairAttempt += 1) {
          const render = await services.previewRender.verify(project.id, workspaceResult.previewPath);
          renderEvidence.push(...render.evidence);
          if (render.ok) break;
          if (repairAttempt < 2) {
            const repairPrompt = [
              \`\${workspaceResult.previewPath} dosyasını düzelt ve gerçek önizlemeyi çalışır hale getir.\`,`;
const after = `        for (let repairAttempt = 0; repairAttempt < 3; repairAttempt += 1) {
          const currentPreviewPath = workspaceResult.previewPath;
          if (!currentPreviewPath) {
            renderEvidence.push("preview-render:FAIL:preview-path-lost");
            break;
          }
          const render = await services.previewRender.verify(project.id, currentPreviewPath);
          renderEvidence.push(...render.evidence);
          if (render.ok) break;
          if (repairAttempt < 2) {
            const repairPrompt = [
              \`\${currentPreviewPath} dosyasını düzelt ve gerçek önizlemeyi çalışır hale getir.\`,`;
if (!source.includes(after)) {
  if (!source.includes(before)) throw new Error("PATCH_ANCHOR_MISSING:ipc-preview-path-narrowing");
  source = source.replace(before, after);
}
await writeFile(file, source, "utf8");
console.log("DEVBOX_V013_TYPEFIX_APPLIED");
