import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const workspace = process.cwd();
const inputFlag = process.argv.indexOf("--input");
const input = inputFlag >= 0 ? process.argv[inputFlag + 1] : null;
if (!input) throw new Error("KULLANIM: node scripts/import-development-spec.mjs --input <geliştirme.md>");

const absoluteInput = path.resolve(input);
const [raw, inputStat] = await Promise.all([readFile(absoluteInput, "utf8"), stat(absoluteInput)]);
const normalized = raw.replace(/\r\n?/gu, "\n");
const lines = (normalized.endsWith("\n") ? normalized.slice(0, -1) : normalized).split("\n");
const sha256 = createHash("sha256").update(raw, "utf8").digest("hex").toUpperCase();

const phaseTitles = new Map();
for (const line of lines) {
  const match = line.match(/^FAZ-(0[1-9]|1[0-9]|2[0-2])\s{2,}(.+?)\s*$/u);
  if (match && !phaseTitles.has(match[1])) phaseTitles.set(match[1], match[2].trim());
}

const expectedPhases = Array.from({ length: 22 }, (_, index) => String(index + 1).padStart(2, "0"));
const missingPhases = expectedPhases.filter((phase) => !phaseTitles.has(phase));
if (missingPhases.length > 0) throw new Error(`GELISTIRME_SPEC_PHASES_MISSING:${missingPhases.join(",")}`);

const taskPattern = /\b(ULT|MAX|PREM|SRCMAX|V013MAX|NİHAİ-GÖREV|NIHAI-GOREV)-(0[1-9]|1[0-9]|2[0-2])-(\d{3})\b/gu;
const tasks = new Map();

function cleanTitle(line, taskId) {
  const withoutMarkdown = line.replace(/^\s*(?:#{1,6}|[-*])\s*/u, "").replaceAll("`", "").trim();
  const tail = withoutMarkdown.slice(withoutMarkdown.indexOf(taskId) + taskId.length).replace(/^\s*(?:—|–|-)\s*/u, "").trim();
  return tail || taskId;
}

for (let index = 0; index < lines.length; index += 1) {
  const line = lines[index];
  for (const match of line.matchAll(taskPattern)) {
    const [taskId, family, phase] = match;
    const existing = tasks.get(taskId);
    if (existing) {
      existing.occurrences.push(index + 1);
      continue;
    }
    let title = cleanTitle(line, taskId);
    if (title === taskId) {
      const nextMeaningful = lines.slice(index + 1, index + 5).find((candidate) => candidate.trim() && !candidate.trim().startsWith("**Traceability:**"));
      if (nextMeaningful) title = nextMeaningful.replace(/^\s*(?:#{1,6}|[-*])\s*/u, "").trim().slice(0, 500);
    }
    tasks.set(taskId, {
      taskId,
      phaseId: `FAZ-${phase}`,
      family,
      parentTaskId: null,
      title,
      objective: title,
      requirementIds: [],
      dependencies: [],
      sourceResearch: [{ sourceSha256: sha256, line: index + 1 }],
      plannedFiles: [],
      touchedFiles: [],
      commands: [],
      tests: [],
      failureTests: [],
      securityChecks: [],
      performanceChecks: [],
      uxChecks: [],
      evidence: [],
      reviewer: null,
      startedAt: null,
      completedAt: null,
      state: "TODO",
      blockReason: null,
      retryCount: 0,
      regressionImpact: null,
      occurrences: [index + 1]
    });
  }
}

const taskList = [...tasks.values()].sort((left, right) => left.phaseId.localeCompare(right.phaseId) || left.taskId.localeCompare(right.taskId, "tr"));
const phases = expectedPhases.map((phase) => {
  const phaseTasks = taskList.filter((task) => task.phaseId === `FAZ-${phase}`);
  const families = Object.fromEntries([...new Set(phaseTasks.map((task) => task.family))].sort().map((family) => [family, phaseTasks.filter((task) => task.family === family).length]));
  return {
    phaseId: `FAZ-${phase}`,
    title: phaseTitles.get(phase),
    state: "TODO",
    taskCount: phaseTasks.length,
    families,
    passCount: 0,
    blockedExternalCount: 0,
    verifiedCoverage: 0
  };
});

const graph = {
  schemaVersion: 1,
  generatedBy: {
    script: "scripts/import-development-spec.mjs",
    version: 1
  },
  source: {
    fileName: path.basename(absoluteInput),
    sha256,
    bytes: inputStat.size,
    lines: lines.length
  },
  realityContract: {
    importedDoesNotMeanImplemented: true,
    automaticallyPassedTasks: 0,
    readinessRequiresRuntimeEvidence: true,
    productionDemoFakeSimulationAllowed: false
  },
  summary: {
    phaseCount: phases.length,
    taskCount: taskList.length,
    passCount: 0,
    todoCount: taskList.length,
    duplicateReferenceCount: taskList.reduce((total, task) => total + Math.max(0, task.occurrences.length - 1), 0)
  },
  phases,
  tasks: taskList
};

const specificationDirectory = path.join(workspace, "specs", "development");
const documentationDirectory = path.join(workspace, "docs");
await Promise.all([mkdir(specificationDirectory, { recursive: true }), mkdir(documentationDirectory, { recursive: true })]);
const graphPath = path.join(specificationDirectory, "geliştirme-spec-task-graph.json");
const reportPath = path.join(documentationDirectory, "GELISTIRME-MD-ALIM-RAPORU.md");

const phaseRows = phases.map((phase) => `| ${phase.phaseId} | ${phase.title} | ${phase.taskCount} | TODO |`).join("\n");
const report = `# DevBox geliştirme.md alım raporu\n\n` +
  `Bu rapor, \`${path.basename(absoluteInput)}\` dosyasının tamamının makine-okunur görev grafiğine alındığını kanıtlar. İçe aktarma hiçbir görevi kendiliğinden tamamlanmış saymaz.\n\n` +
  `- SHA-256: \`${sha256}\`\n` +
  `- Boyut: ${inputStat.size.toLocaleString("tr-TR")} bayt\n` +
  `- Satır: ${lines.length.toLocaleString("tr-TR")}\n` +
  `- Top-level faz: ${phases.length}\n` +
  `- Benzersiz atomik görev: ${taskList.length.toLocaleString("tr-TR")}\n` +
  `- Otomatik PASS: **0**\n` +
  `- Görev grafiği: \`specs/development/geliştirme-spec-task-graph.json\`\n\n` +
  `| Faz | Kapsam | Görev | Başlangıç durumu |\n|---|---|---:|---|\n${phaseRows}\n\n` +
  `## Gerçeklik notu\n\n` +
  `Dosyanın içe alınması uygulamanın 22 fazı tamamladığı anlamına gelmez. Her görev ancak kaynak, test, negatif test, güvenlik/performance/UX denetimi ve gerçek çalışma kanıtı bağlandıktan sonra PASS olabilir. Dış hesap, sertifika, fiziksel ikinci makine veya uzun temiz-VM testi gerektiren işler BLOCKED_EXTERNAL ya da TODO kalır.\n`;

await Promise.all([
  writeFile(graphPath, `${JSON.stringify(graph, null, 2)}\n`, "utf8"),
  writeFile(reportPath, report, "utf8")
]);

process.stdout.write(`${JSON.stringify({ graphPath, reportPath, ...graph.summary, source: graph.source }, null, 2)}\n`);
