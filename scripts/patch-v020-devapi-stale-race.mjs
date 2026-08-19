import { readFile, writeFile } from "node:fs/promises";

const appFile = "cloud/devapi-control/app.js";
const verifyFile = "scripts/verify-cloud-ecosystem.mjs";
let app = (await readFile(appFile, "utf8")).replace(/\r\n/gu, "\n");
let verify = (await readFile(verifyFile, "utf8")).replace(/\r\n/gu, "\n");

function replaceOnce(source, before, after, code) {
  const first = source.indexOf(before);
  const last = source.lastIndexOf(before);
  if (first < 0 || first !== last) throw new Error(`${code}: expected exactly one anchor`);
  return source.slice(0, first) + after + source.slice(first + before.length);
}

app = replaceOnce(
  app,
  `  timer: null\n};\n$("projectId").value = state.projectId;`,
  `  timer: null\n};\nlet refreshGeneration = 0;\n$("projectId").value = state.projectId;`,
  "REFRESH_GENERATION_ANCHOR"
);

app = replaceOnce(
  app,
  `function setEmpty(id, message) {\n  const node = document.createElement("div");\n  node.className = "empty";\n  node.textContent = message;\n  $(id).replaceChildren(node);\n}\n`,
  `function setEmpty(id, message) {\n  const node = document.createElement("div");\n  node.className = "empty";\n  node.textContent = message;\n  $(id).replaceChildren(node);\n}\nfunction clearSnapshotView({ clearCollections = false } = {}) {\n  state.current = null;\n  document.body.classList.remove("runtime-connected");\n  document.body.classList.add("runtime-stale");\n  setText("level", "—");\n  setText("stage", "Bağlantı bekleniyor");\n  setText("score", "—");\n  setText("coreProgress", "—");\n  setText("coreDetail", "22 faz / 3362 görev");\n  setText("openFindings", "—");\n  setText("blockingFindings", "blocking: —");\n  setText("gateState", "—");\n  setText("gateTime", "kanıt bekleniyor");\n  setText("heartbeat", "—");\n  setText("instance", "instance: —");\n  setText("enabledText", "state bekleniyor");\n  renderDomains({});\n  renderRuntime({});\n  renderFindings({});\n  renderGate(null);\n  renderLearnings([]);\n  if (clearCollections) {\n    renderCommands([]);\n    renderHistory([]);\n  }\n}\n`,
  "CLEAR_SNAPSHOT_ANCHOR"
);

app = replaceOnce(
  app,
  `  if (!row) {\n    showNotice("Bu projectId için cloud snapshot bulunamadı. DevBox masaüstü aynı control-plane endpoint ve token ile en az bir kez senkron olmalı.");\n    return;\n  }`,
  `  if (!row) {\n    clearSnapshotView();\n    showNotice("Bu projectId için cloud snapshot bulunamadı. DevBox masaüstü aynı control-plane endpoint ve token ile en az bir kez senkron olmalı.");\n    return;\n  }`,
  "NO_ROW_CLEAR_ANCHOR"
);

app = replaceOnce(
  app,
  `async function refresh() {\n  syncCredentials();\n  if (state.projectId.length < 8 || state.token.length < 32) return showNotice("Geçerli projectId ve en az 32 karakterlik admin token gerekli.");\n  try { render(await api(\`/api/v1/state?projectId=\${encodeURIComponent(state.projectId)}\`)); }\n  catch (error) { showNotice(\`Cloud state okunamadı: \${error instanceof Error ? error.message : String(error)}\`); }\n}`,
  `async function refresh() {\n  syncCredentials();\n  const projectId = state.projectId;\n  const token = state.token;\n  const generation = ++refreshGeneration;\n  if (projectId.length < 8 || token.length < 32) {\n    clearSnapshotView({ clearCollections: true });\n    return showNotice("Geçerli projectId ve en az 32 karakterlik admin token gerekli.");\n  }\n  try {\n    const data = await api(\`/api/v1/state?projectId=\${encodeURIComponent(projectId)}\`);\n    if (generation !== refreshGeneration || state.projectId !== projectId || state.token !== token) return;\n    render(data);\n  } catch (error) {\n    if (generation !== refreshGeneration || state.projectId !== projectId || state.token !== token) return;\n    clearSnapshotView({ clearCollections: true });\n    showNotice(\`Cloud state okunamadı: \${error instanceof Error ? error.message : String(error)}\`);\n  }\n}`,
  "REFRESH_RACE_ANCHOR"
);

app = replaceOnce(
  app,
  `$("connect").addEventListener("click",()=>void refresh());`,
  `for (const id of ["projectId", "adminToken"]) {\n  $(id).addEventListener("input", () => {\n    refreshGeneration += 1;\n    clearSnapshotView({ clearCollections: true });\n  });\n}\n$("connect").addEventListener("click",()=>void refresh());`,
  "CREDENTIAL_INVALIDATION_ANCHOR"
);

verify = replaceOnce(
  verify,
  `requireText("devapiApp", "syncSnapshotFreshness", "devapi-snapshot-freshness-ui");`,
  `requireText("devapiApp", "syncSnapshotFreshness", "devapi-snapshot-freshness-ui");\nrequireText("devapiApp", "clearSnapshotView", "devapi-stale-snapshot-clear");\nrequireText("devapiApp", "refreshGeneration", "devapi-refresh-generation-guard");\nrequireText("devapiApp", "generation !== refreshGeneration", "devapi-refresh-race-reject");\nrequireText("devapiApp", "clearSnapshotView({ clearCollections: true })", "devapi-error-collection-clear");`,
  "CLOUD_VERIFY_DEVAPI_RACE_ANCHOR"
);

for (const required of [
  "let refreshGeneration = 0",
  "function clearSnapshotView",
  "generation !== refreshGeneration",
  'for (const id of ["projectId", "adminToken"])',
  "clearSnapshotView({ clearCollections: true })"
]) {
  if (!app.includes(required)) throw new Error(`DEVAPI_STALE_RACE_PATCH_MISSING:${required}`);
}

await writeFile(appFile, app, "utf8");
await writeFile(verifyFile, verify, "utf8");
console.log("V020_DEVAPI_STALE_RACE_PATCH_PASS");
