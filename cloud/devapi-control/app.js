const $ = (id) => document.getElementById(id);
const state = { projectId: sessionStorage.getItem("devbox.projectId") ?? "", token: sessionStorage.getItem("devbox.adminToken") ?? "", current: null };
$("projectId").value = state.projectId;
$("adminToken").value = state.token;

function escapeText(value) { return String(value ?? ""); }
function date(value) { return value ? new Date(value).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "medium" }) : "—"; }
function setText(id, value) { $(id).textContent = escapeText(value); }
function authHeaders() { return { authorization: `Bearer ${state.token}`, "content-type": "application/json" }; }
function showNotice(message, failed = true) { const el = $("offline"); el.textContent = message; el.classList.toggle("hidden", !message); el.classList.toggle("error", failed); }

async function api(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { ...authHeaders(), ...(options.headers ?? {}) }, cache: "no-store" });
  const body = await response.json().catch(() => ({ error: `HTTP_${response.status}` }));
  if (!response.ok) throw new Error(body.error ?? `HTTP_${response.status}`);
  return body;
}

async function health() {
  const pill = $("health");
  try {
    const response = await fetch("/api/v1/health", { cache: "no-store" });
    const data = await response.json();
    pill.textContent = data.state;
    pill.className = `pill ${data.state.toLowerCase()}`;
    if (data.state !== "READY") showNotice("Cloud backend henüz tam yapılandırılmadı. DATABASE_URL, DEVBOX_CONTROL_PLANE_TOKEN ve DEVBOX_CONTROL_ADMIN_TOKEN olmadan kalıcı kontrol READY sayılmaz.");
  } catch { pill.textContent = "FAILED"; pill.className = "pill failed"; }
}

function renderDomains(domains = {}) {
  $("domains").replaceChildren(...Object.entries(domains).map(([name, raw]) => {
    const score = Math.max(0, Math.min(100, Number(raw) || 0));
    const node = document.createElement("div"); node.className = "domain";
    const head = document.createElement("div"); const label = document.createElement("span"); label.textContent = name; const strong = document.createElement("strong"); strong.textContent = String(score); head.append(label, strong);
    const track = document.createElement("i"); const bar = document.createElement("b"); bar.style.width = `${score}%`; track.append(bar); node.append(head, track); return node;
  }));
}
function renderRuntime(runtime = {}) {
  const fields = [["stage","Aşama"],["detail","Detay"],["provider","Provider"],["model","Model"],["activeSpecTaskId","Spec task"],["activePhaseId","Faz"],["waitingReason","Bekleme nedeni"],["updatedAt","Güncellendi"]];
  $("runtime").replaceChildren(...fields.map(([key,label]) => { const div=document.createElement("div");const dt=document.createElement("dt");dt.textContent=label;const dd=document.createElement("dd");dd.textContent=key==="updatedAt"?date(runtime[key]):escapeText(runtime[key]??"—");div.append(dt,dd);return div; }));
}
function renderFindings(summary = {}) {
  const severity = summary.bySeverity ?? {};
  $("findingStats").innerHTML = `<span>CRITICAL ${Number(severity.CRITICAL||0)}</span><span>HIGH ${Number(severity.HIGH||0)}</span><span>MEDIUM ${Number(severity.MEDIUM||0)}</span><span>LOW ${Number(severity.LOW||0)}</span>`;
  const items = Array.isArray(summary.items) ? summary.items : [];
  if (!items.length) { $("findings").innerHTML = '<div class="empty">Finding yok.</div>'; return; }
  $("findings").replaceChildren(...items.slice(0,160).map((item) => { const node=document.createElement("article");node.className=`finding ${String(item.severity||"info").toLowerCase()}`;const header=document.createElement("header");const sev=document.createElement("span");sev.textContent=escapeText(item.severity);const title=document.createElement("strong");title.textContent=escapeText(item.title);const owner=document.createElement("span");owner.textContent=`${item.owner} · ${item.status}`;header.append(sev,title,owner);const p=document.createElement("p");p.textContent=escapeText(item.detail);const small=document.createElement("small");small.textContent=`×${item.occurrences} · ${date(item.lastSeenAt)}`;node.append(header,p,small);return node; }));
}
function renderGate(gate) {
  if (!gate) { $("gateChecks").innerHTML='<div class="empty">Release gate sonucu yok.</div>'; return; }
  $("gateChecks").replaceChildren(...(gate.checks??[]).map((check)=>{const node=document.createElement("article");node.className=`gate ${String(check.state).toLowerCase()}`;const header=document.createElement("header");const title=document.createElement("strong");title.textContent=check.title;const st=document.createElement("span");st.textContent=check.state;header.append(title,st);const p=document.createElement("p");p.textContent=check.detail;const small=document.createElement("small");small.textContent=`${check.command??"state check"} · ${check.durationMs} ms${check.blocking?" · blocking":""}`;node.append(header,p,small);return node;}));
}
function renderLearnings(items = []) {
  const values = Array.isArray(items) ? items.slice(-80).reverse() : [];
  if (!values.length) { $("learnings").innerHTML='<div class="empty">Öğrenim kaydı yok.</div>'; return; }
  $("learnings").replaceChildren(...values.map((item)=>{const node=document.createElement("article");node.className="learning";const p=document.createElement("p");p.textContent=escapeText(item.content??item.summary??item);const small=document.createElement("small");small.textContent=escapeText(item.track??item.kind??"evolution learning");node.append(p,small);return node;}));
}
function renderHistory(items = []) {
  const values = Array.isArray(items) ? [...items].reverse() : [];
  if (!values.length) { $("history").innerHTML='<div class="empty">Cloud history yok.</div>'; return; }
  $("history").replaceChildren(...values.map((item)=>{const level=Math.max(1,Number(item.level)||1);const score=Math.max(0,Number(item.score)||0);const bar=document.createElement("i");bar.className="bar";bar.style.height=`${Math.max(10,Math.min(150,level*6+score))}px`;bar.dataset.label=`Seviye ${level} · score ${score} · ${date(item.captured_at)}`;return bar;}));
}

function render(data) {
  const row = data.current; state.current = row;
  if (!row) { showNotice("Bu projectId için cloud snapshot bulunamadı. DevBox masaüstü aynı control-plane endpoint ve token ile en az bir kez senkron olmalı."); return; }
  showNotice("", false);
  const snapshot = row.latest_snapshot ?? {};
  const evolution = snapshot.evolution ?? {}; const findings = snapshot.findings ?? {}; const gate = snapshot.releaseGate ?? null;
  setText("level", evolution.lifetimeLevel ?? evolution.level ?? "—"); setText("stage", evolution.stage ?? "—"); setText("score", evolution.score ?? "—");
  setText("evidence", `${Number(evolution.lifetimeEvidencePoints||0).toLocaleString("tr-TR")} evidence point · ${Number(evolution.validatedImprovementCount||0)} doğrulanmış iyileştirme · ${Number(evolution.stablePromotionCount||0)} promotion`);
  setText("coreProgress", `${Number(evolution.spec?.passCount||0).toLocaleString("tr-TR")} / ${Number(evolution.spec?.totalTaskCount||3362).toLocaleString("tr-TR")}`);
  setText("coreDetail", Number(evolution.spec?.remainingCount||0)===0?"22 faz tamam · adaptif bakım":`${Number(evolution.spec?.remainingCount||0).toLocaleString("tr-TR")} görev kaldı`);
  setText("openFindings", findings.open ?? 0); setText("blockingFindings", `blocking: ${findings.blocking ?? 0}`); setText("gateState", gate?.state ?? "—"); setText("gateTime", gate ? `${gate.mode} · ${date(gate.completedAt)}` : "kanıt bekleniyor");
  setText("heartbeat", date(row.captured_at)); setText("instance", `instance: ${row.instance_id ?? "—"}`); setText("enabledText", evolution.enabled ? (evolution.isRunning?"açık · çalışıyor":"açık · bekliyor") : "kapalı");
  renderDomains(evolution.domainScores); renderRuntime(evolution.runtime); renderFindings(findings); renderGate(gate); renderLearnings(evolution.learnings); renderHistory(data.history);
}

async function refresh() {
  state.projectId = $("projectId").value.trim(); state.token = $("adminToken").value.trim();
  if (state.projectId.length < 8 || state.token.length < 32) return showNotice("Geçerli projectId ve en az 32 karakterlik admin token gerekli.");
  sessionStorage.setItem("devbox.projectId",state.projectId); sessionStorage.setItem("devbox.adminToken",state.token);
  try { render(await api(`/api/v1/state?projectId=${encodeURIComponent(state.projectId)}`)); }
  catch (error) { showNotice(`Cloud state okunamadı: ${error.message}`); }
}
async function command(kind,payload={}) {
  if (!state.projectId || !state.token) await refresh();
  try { await api("/api/v1/commands",{method:"POST",body:JSON.stringify({projectId:state.projectId,kind,payload})}); showNotice("Komut cloud kuyruğuna kaydedildi. Masaüstü bir sonraki poll çevriminde idempotent olarak uygulayacak.",false); setTimeout(()=>void refresh(),1800); }
  catch(error){showNotice(`Komut kaydedilemedi: ${error.message}`);}
}

$("connect").addEventListener("click",()=>void refresh()); $("refresh").addEventListener("click",()=>void refresh());
$("enable").addEventListener("click",()=>void command("evolution.setEnabled",{enabled:true})); $("disable").addEventListener("click",()=>void command("evolution.setEnabled",{enabled:false})); $("run").addEventListener("click",()=>void command("evolution.run")); $("cancel").addEventListener("click",()=>void command("evolution.cancel"));
$("theme").addEventListener("click",()=>{document.body.classList.toggle("light");$("theme").textContent=document.body.classList.contains("light")?"☾":"☀";});
void health(); if(state.projectId&&state.token)void refresh(); setInterval(()=>{if(state.projectId&&state.token)void refresh();},30_000);
