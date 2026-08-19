import { readFile, writeFile } from "node:fs/promises";

async function replaceExact(file, label, before, after) {
  const source = (await readFile(file, "utf8")).replace(/\r\n/gu, "\n");
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one anchor in ${file}, found ${count}`);
  const next = source.replace(before, after);
  if (next === source) throw new Error(`${label}: replacement produced no change`);
  await writeFile(file, next, "utf8");
}

await replaceExact(
  "cloud/devapi-control/app.js",
  "experience-import-and-memory-token",
  `const $ = (id) => document.getElementById(id);\nconst state = {\n  projectId: sessionStorage.getItem("devbox.projectId") ?? "",\n  token: sessionStorage.getItem("devbox.adminToken") ?? "",\n  current: null,\n  projects: [],\n  timer: null\n};\n$("projectId").value = state.projectId;\n$("adminToken").value = state.token;`,
  `import "./experience-v2.js";\n\nconst $ = (id) => document.getElementById(id);\nsessionStorage.removeItem("devbox.adminToken");\nconst state = {\n  projectId: sessionStorage.getItem("devbox.projectId") ?? "",\n  token: "",\n  current: null,\n  projects: [],\n  timer: null\n};\n$("projectId").value = state.projectId;\n$("adminToken").value = "";`
);

await replaceExact(
  "cloud/devapi-control/app.js",
  "stage-and-freshness-helpers",
  `function escapeText(value) { return String(value ?? ""); }\nfunction date(value) { return value ? new Date(value).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "medium" }) : "—"; }\nfunction setText(id, value) { $(id).textContent = escapeText(value); }`,
  `function escapeText(value) { return String(value ?? ""); }\nfunction date(value) { return value ? new Date(value).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "medium" }) : "—"; }\nfunction setText(id, value) { $(id).textContent = escapeText(value); }\nconst STAGE_LABELS = Object.freeze({\n  IDLE: "Hazır", QUEUEING: "Kuyruğa alınıyor", PREPARING: "Hazırlanıyor", PROVIDER_CHECK: "Sağlayıcı doğrulanıyor",\n  AUTH_CHECK: "Oturum doğrulanıyor", MODEL_ATTEMPT: "Model hazırlanıyor", PLANNING: "Planlanıyor", INSPECTING: "Kaynak inceleniyor",\n  EDITING: "Kodlanıyor", RUNNING_COMMAND: "Komut yürütülüyor", TESTING: "Test ediliyor", VERIFYING: "Doğrulanıyor",\n  REVIEWING: "Kanıt inceleniyor", WAITING: "Bekliyor", BACKOFF: "Yeniden deneme bekleniyor", SETTLING: "Sonuçlandırılıyor",\n  COMPLETED: "Tamamlandı", FAILED: "Başarısız", BLOCKED_EXTERNAL: "Harici engel", CANCELLED: "Durduruldu", RECOVERY_REQUIRED: "Kurtarma gerekiyor"\n});\nfunction stageLabel(value) {\n  const key = String(value ?? "").trim();\n  return STAGE_LABELS[key] ?? (key ? key.replaceAll("_", " ").toLocaleLowerCase("tr-TR") : "—");\n}\nfunction syncSnapshotFreshness(capturedAt) {\n  const captured = Date.parse(String(capturedAt ?? ""));\n  const ageMs = Number.isFinite(captured) ? Math.max(0, Date.now() - captured) : Number.POSITIVE_INFINITY;\n  const stale = ageMs > 120_000;\n  document.body.classList.toggle("runtime-connected", Number.isFinite(captured));\n  document.body.classList.toggle("runtime-stale", stale);\n  const heartbeat = $("heartbeat");\n  if (heartbeat) heartbeat.title = Number.isFinite(captured) ? `${Math.round(ageMs / 1000)} saniye önce yakalandı` : "Snapshot zamanı doğrulanamadı";\n}`
);

await replaceExact(
  "cloud/devapi-control/app.js",
  "health-body-state",
  `    pill.textContent = data.state ?? \`HTTP_\${response.status}\`;\n    pill.className = \`pill \${String(data.state ?? "failed").toLowerCase()}\`;\n    if (data.state !== "READY") showNotice("Cloud control plane henüz READY değil. Kalıcı backend veya güvenlik yapılandırması tamamlanmadan sistem hazır görünmez.");\n  } catch {\n    pill.textContent = "FAILED";\n    pill.className = "pill failed";\n  }`,
  `    pill.textContent = data.state ?? \`HTTP_\${response.status}\`;\n    pill.className = \`pill \${String(data.state ?? "failed").toLowerCase()}\`;\n    document.body.classList.toggle("runtime-failed", data.state !== "READY");\n    if (data.state !== "READY") showNotice("Cloud control plane henüz READY değil. Kalıcı backend veya güvenlik yapılandırması tamamlanmadan sistem hazır görünmez.");\n  } catch {\n    pill.textContent = "FAILED";\n    pill.className = "pill failed";\n    document.body.classList.add("runtime-failed");\n  }`
);

await replaceExact(
  "cloud/devapi-control/app.js",
  "memory-only-admin-token",
  `function syncCredentials() {\n  state.token = $("adminToken").value.trim();\n  state.projectId = $("projectId").value.trim();\n  if (state.token.length >= 32) sessionStorage.setItem("devbox.adminToken", state.token);\n  else sessionStorage.removeItem("devbox.adminToken");\n  if (state.projectId.length >= 8) sessionStorage.setItem("devbox.projectId", state.projectId);\n}`,
  `function syncCredentials() {\n  state.token = $("adminToken").value.trim();\n  state.projectId = $("projectId").value.trim();\n  sessionStorage.removeItem("devbox.adminToken");\n  if (state.projectId.length >= 8) sessionStorage.setItem("devbox.projectId", state.projectId);\n  else sessionStorage.removeItem("devbox.projectId");\n}`
);

await replaceExact(
  "cloud/devapi-control/app.js",
  "human-runtime-stage",
  `    const dd=document.createElement("dd"); dd.textContent=key==="updatedAt"?date(runtime[key]):escapeText(runtime[key]??"—");`,
  `    const dd=document.createElement("dd"); dd.textContent=key==="updatedAt"?date(runtime[key]):key==="stage"?stageLabel(runtime[key]):escapeText(runtime[key]??"—");`
);

await replaceExact(
  "cloud/devapi-control/app.js",
  "human-main-stage-and-freshness",
  `  setText("level", evolution.lifetimeLevel ?? evolution.level ?? "—");\n  setText("stage", evolution.stage ?? "—");\n  setText("score", evolution.score ?? "—");`,
  `  setText("level", evolution.lifetimeLevel ?? evolution.level ?? "—");\n  setText("stage", stageLabel(evolution.runtime?.stage ?? evolution.stage));\n  setText("score", evolution.score ?? "—");\n  syncSnapshotFreshness(row.captured_at);`
);

await replaceExact(
  "cloud/devapi-control/index.html",
  "memory-only-auth-copy",
  `<label>Admin token<input id="adminToken" type="password" autocomplete="current-password" placeholder="DEVBOX_CONTROL_ADMIN_TOKEN" /></label>`,
  `<label>Admin token<input id="adminToken" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="DEVBOX_CONTROL_ADMIN_TOKEN" /></label>`
);

await replaceExact(
  "cloud/devapi-control/index.html",
  "memory-only-auth-note",
  `<small>Token yalnız bu sekmenin <code>sessionStorage</code> alanında tutulur. Command API arbitrary shell kabul etmez.</small>`,
  `<small>Admin token yalnız bu sayfanın belleğinde tutulur ve yenilemede silinir. Project ID sekme içinde korunabilir. Command API arbitrary shell kabul etmez.</small>`
);

await replaceExact(
  "cloud/devapi-control/index.html",
  "live-notice",
  `<section id="offline" class="notice hidden"></section>`,
  `<section id="offline" class="notice hidden" role="status" aria-live="polite"></section>`
);

console.log("V020_DEVAPI_EXPERIENCE_V2_MATERIALIZE_PASS");
