import { readFile, writeFile } from "node:fs/promises";

const file = "src/main/services/preview-render-service.ts";
let source = (await readFile(file, "utf8")).replace(/\r\n/gu, "\n");
if (!source.includes('from "./preview-render-score.js"')) {
  source = source.replace(
    'import type { ProjectService } from "./project-service.js";\n',
    'import type { ProjectService } from "./project-service.js";\nimport { scorePreviewBitmap, type PreviewPixelScore } from "./preview-render-score.js";\n'
  );
}
const start = source.indexOf("export type PreviewPixelScore = {");
const end = source.indexOf("function previewUrl(projectId: string, relativePath: string): string {");
if (start >= 0 && end > start) {
  const reportStart = source.indexOf("export type PreviewRenderReport = {", start);
  const reportEnd = source.indexOf("type DomMetrics = {", reportStart);
  const scoreStart = source.indexOf("export function scorePreviewBitmap", reportEnd);
  if (reportStart < 0 || reportEnd < 0 || scoreStart < 0) throw new Error("PREVIEW_SCORE_REFACTOR_ANCHOR_INVALID");
  const scoreEnd = source.indexOf("\nfunction previewUrl", scoreStart);
  const reportBlock = source.slice(reportStart, scoreStart);
  source = source.slice(0, start) + reportBlock + source.slice(scoreEnd + 1);
}
await writeFile(file, source, "utf8");
console.log("DEVBOX_V013_PREVIEW_SCORE_REFACTORED");
