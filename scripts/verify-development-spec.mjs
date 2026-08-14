import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const graphPath = path.join(process.cwd(), "specs", "development", "geliştirme-spec-task-graph.json");
const graph = JSON.parse(await readFile(graphPath, "utf8"));
const failures = [];
const expectedPhases = Array.from({ length: 22 }, (_, index) => `FAZ-${String(index + 1).padStart(2, "0")}`);
const allowedStates = new Set(["TODO", "IN_PROGRESS", "PASS", "BLOCKED_EXTERNAL"]);

function assert(condition, message) {
  if (!condition) failures.push(message);
}

assert(graph.schemaVersion === 1, "Şema sürümü 1 olmalı.");
assert(graph.generatedBy?.script === "scripts/import-development-spec.mjs", "Üretici betik kimliği eksik.");
assert(/^[A-F0-9]{64}$/u.test(graph.source?.sha256 ?? ""), "Kaynak SHA-256 geçersiz.");
assert(Number.isInteger(graph.source?.lines) && graph.source.lines > 0, "Kaynak satır sayısı geçersiz.");
assert(graph.realityContract?.importedDoesNotMeanImplemented === true, "Alım/tamamlama ayrımı zorunludur.");
assert(graph.realityContract?.productionDemoFakeSimulationAllowed === false, "Üretimde demo/fake/simülasyon yasak olmalıdır.");
assert(Array.isArray(graph.phases), "Faz listesi eksik.");
assert(Array.isArray(graph.tasks), "Görev listesi eksik.");

const phaseIds = graph.phases?.map((phase) => phase.phaseId) ?? [];
assert(JSON.stringify(phaseIds) === JSON.stringify(expectedPhases), "Tam ve sıralı 22 faz bulunmalıdır.");
const taskIds = graph.tasks?.map((task) => task.taskId) ?? [];
assert(new Set(taskIds).size === taskIds.length, "Görev kimlikleri benzersiz olmalıdır.");

for (const task of graph.tasks ?? []) {
  assert(expectedPhases.includes(task.phaseId), `${task.taskId}: geçersiz faz kimliği.`);
  assert(allowedStates.has(task.state), `${task.taskId}: geçersiz görev durumu.`);
  assert(Array.isArray(task.sourceResearch) && task.sourceResearch.length > 0, `${task.taskId}: kaynak izi eksik.`);
  if (task.state === "PASS") {
    assert(Array.isArray(task.evidence) && task.evidence.length > 0, `${task.taskId}: PASS için kanıt zorunlu.`);
    assert(Array.isArray(task.tests) && task.tests.length > 0, `${task.taskId}: PASS için test zorunlu.`);
    assert(Boolean(task.completedAt), `${task.taskId}: PASS için tamamlanma zamanı zorunlu.`);
    assert(Boolean(task.reviewer), `${task.taskId}: PASS için inceleyen kimliği zorunlu.`);
  }
  if (task.state === "BLOCKED_EXTERNAL") assert(Boolean(task.blockReason), `${task.taskId}: dış engel gerekçesi zorunlu.`);
}

for (const phase of graph.phases ?? []) {
  const actual = (graph.tasks ?? []).filter((task) => task.phaseId === phase.phaseId).length;
  assert(phase.taskCount === actual, `${phase.phaseId}: görev sayısı ${phase.taskCount}, gerçek ${actual}.`);
}

const stateCount = (state) => (graph.tasks ?? []).filter((task) => task.state === state).length;
assert(graph.summary?.phaseCount === expectedPhases.length, "Özet faz sayısı uyuşmuyor.");
assert(graph.summary?.taskCount === taskIds.length, "Özet görev sayısı uyuşmuyor.");
assert(graph.summary?.passCount === stateCount("PASS"), "Özet PASS sayısı uyuşmuyor.");
assert(graph.summary?.todoCount === stateCount("TODO"), "Özet TODO sayısı uyuşmuyor.");

if (failures.length > 0) {
  process.stderr.write(`GELISTIRME_SPEC_VERIFY_FAILED\n- ${failures.join("\n- ")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`GELISTIRME_SPEC_VERIFY_PASS phases=${expectedPhases.length} tasks=${taskIds.length} pass=${stateCount("PASS")} todo=${stateCount("TODO")}\n`);
}
