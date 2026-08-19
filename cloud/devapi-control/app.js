const $ = (id) => document.getElementById(id);
const state = {
  projectId: sessionStorage.getItem("devbox.projectId") ?? "",
  token: sessionStorage.getItem("devbox.adminToken") ?? "",
  current: null,
  projects: [],
  timer: null
};
$("projectId").value = state.projectId;
$("adminToken").value = state.token;

function escapeText(value) { return String(value ?? ""); }
function date(value) { return value ? new Date(value).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "medium" }) : "—"; }
function setText(id, value) { $(id).textContent = escapeText(value); }
function authHeaders() { return { authorization: `Bearer ${state.token}` }; }
function showNotice(message, failed = true) {
  const el = $("offline");
  el.textContent = message;
  el.classList.toggle("hidden", !message);
  el.classList.toggle("error", failed);
}
function setEmpty(id, message) {
  const node = document.createElement("div");
  node.className = "empty";
  node.textContent = message;
  $(id).replaceChildren(node);
}

async function api(path, options = {}) {
  const headers = {
    ...authHeaders(),
    ...(options.body ? { "content-type": "application/json" } : {}),
    ...(options.headers ?? {})
  };
  const response = await fetch(path, { ...options, headers, cache: "no-store", signal: options.signal ?? AbortSignal.timeout(8000) });
  const body = await response.json().catch(() => ({ error: `HTTP_${response.status}` }));
  if (!response.ok) throw new Error(body.error ?? `HTTP_${response.status}`);
  return body;
}

async function health() {
  const pill = $("health");
  try {
    const response = await fetch("/api/v1/health", { cache: "no-store", signal: AbortSignal.timeout(5000) });
    const data = await response.json().catch(() => ({ state: `HTTP_${response.status}` }));
    pill.textContent = data.state ?? `HTTP_${response.status}`;
    pill.className = `pill ${String(data.state ?? "failed").toLowerCase()}`;
    if (data.state !== "READY") showNotice("Cloud control plane henüz READY değil. Kalıcı backend veya güvenlik yapılandırması tamamlanmadan sistem hazır görünmez.");
  } catch {
    pill.textContent = "FAILED";
    pill.className = "pill failed";
  }
}

function syncCredentials() {
  state.token = $("adminToken").value.trim();
  state.projectId = $("projectId").value.trim();
  if (state.token.length >= 32) sessionStorage.setItem("devbox.adminToken", state.token);
  else sessionStorage.removeItem("devbox.adminToken");
  if (state.projectId.length >= 8) sessionStorage.setItem("devbox.projectId", state.projectId);
}

async function discoverProjects() {
  syncCredentials();
  if (state.token.length < 32) return showNotice("Cloud projelerini listelemek için en az 32 karakterlik admin token gerekli.");
  try {
    const data = await api("/api/v1/projects?limit=100");
    state.projects = Array.isArray(data.items) ? data.items : [];
    const picker = $("projectPicker");
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = state.projects.length ? `${state.projects.length} cloud projesi bulundu` : "Cloud projesi bulunamadı";
    const options = state.projects.map((item) => {
      const option = document.createElement("option");
      option.value = escapeText(item.projectId);
      const level = item.level ? ` · seviye ${item.level}` : "";
      const blocking = Number(item.blockingFindings || 0) > 0 ? ` · ${item.blockingFindings} blocking` : "";
      option.textContent = `${escapeText(item.projectName)}${level}${blocking} · ${date(item.capturedAt)}`;
      return option;
    });
    picker.replaceChildren(placeholder, ...options);
    if (state.projectId && state.projects.some((item) => item.projectId === state.projectId)) picker.value = state.projectId;
    showNotice(state.projects.length ? "Cloud proje envanteri doğrulandı." : "Henüz cloud snapshot göndermiş bir DevBox projesi yok.", false);
  } catch (error) {
    showNotice(`Cloud proje envanteri okunamadı: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function renderDomains(domains = {}) {
  const entries = Object.entries(domains);
  if (!entries.length) return setEmpty("domains", "Domain score kaydı yok.");
  $("domains").replaceChildren(...entries.map(([name, raw]) => {
    const score = Math.max(0, Math.min(100, Number(raw) || 0));
    const node = document.createElement("div");
    node.className = "domain";
    const head = document.createElement("div");
    const label = document.createElement("span"); label.textContent = name;
    const strong = document.createElement("strong"); strong.textContent = String(score);
    head.append(label, strong);
    const track = document.createElement("i");
    const bar = document.createElement("b"); bar.style.width = `${score}%`;
    track.append(bar); node.append(head, track); return node;
  }));
}
function renderRuntime(runtime = {}) {
  const fields = [["stage","Aşama"],["detail","Detay"],["provider","Provider"],["model","Model"],["activeSpecTaskId","Spec task"],["activePhaseId","Faz"],["waitingReason","Bekleme nedeni"],["updatedAt","Güncellendi"]];
  $("runtime").replaceChildren(...fields.map(([key,label]) => {
    const div=document.createElement("div");
    const dt=document.createElement("dt"); dt.textContent=label;
    const dd=document.createElement("dd"); dd.textContent=key==="updatedAt"?date(runtime[key]):escapeText(runtime[key]??"—");
    div.append(dt,dd); return div;
  }));
}
function renderFindingStats(summary = {}) {
  const severity = summary.bySeverity ?? {};
  $("findingStats").replaceChildren(...["CRITICAL","HIGH","MEDIUM","LOW"].map((name) => {
    const span = document.createElement("span");
    span.textContent = `${name} ${Number(severity[name] || 0)}`;
    return span;
  }));
}
function renderFindings(summary = {}) {
  renderFindingStats(summary);
  const items = Array.isArray(summary.items) ? summary.items : [];
  if (!items.length) return setEmpty("findings", "Finding yok.");
  $("findings").replaceChildren(...items.slice(0,160).map((item) => {
    const node=document.createElement("article"); node.className=`finding ${String(item.severity||"info").toLowerCase()}`;
    const header=document.createElement("header");
    const sev=document.createElement("span"); sev.textContent=escapeText(item.severity);
    const title=document.createElement("strong"); title.textContent=escapeText(item.title);
    const owner=document.createElement("span"); owner.textContent=`${escapeText(item.owner)} · ${escapeText(item.status)}`;
    header.append(sev,title,owner);
    const p=document.createElement("p"); p.textContent=escapeText(item.detail);
    const small=document.createElement("small"); small.textContent=`×${Number(item.occurrences||0)} · ${date(item.lastSeenAt)}`;
    node.append(header,p,small); return node;
  }));
}
function renderGate(gate) {
  if (!gate) return setEmpty("gateChecks", "Release gate sonucu yok.");
  $("gateChecks").replaceChildren(...(gate.checks??[]).map((check)=>{
    const node=document.createElement("article"); node.className=`gate ${String(check.state).toLowerCase()}`;
    const header=document.createElement("header");
    const title=document.createElement("strong"); title.textContent=escapeText(check.title);
    const st=document.createElement("span"); st.textContent=escapeText(check.state);
    header.append(title,st);
    const p=document.createElement("p"); p.textContent=escapeText(check.detail);
    const small=document.createElement("small"); small.textContent=`${escapeText(check.command??"state check")} · ${Number(check.durationMs||0)} ms${check.blocking?" · blocking":""}`;
    node.append(header,p,small); return node;
  }));
}
function renderLearnings(items = []) {
  const values = Array.isArray(items) ? items.slice(-80).reverse() : [];
  if (!values.length) return setEmpty("learnings", "Öğrenim kaydı yok.");
  $("learnings").replaceChildren(...values.map((item)=>{
    const node=document.createElement("article"); node.className="learning";
    const p=document.createElement("p"); p.textContent=escapeText(item.content??item.summary??item);
    const small=document.createElement("small"); small.textContent=escapeText(item.track??item.kind??"evolution learning");
    node.append(p,small); return node;
  }));
}
function renderHistory(items = []) {
  const values = Array.isArray(items) ? [...items].reverse() : [];
  if (!values.length) return setEmpty("history", "Cloud history yok.");
  $("history").replaceChildren(...values.map((item)=>{
    const level=Math.max(1,Number(item.level)||1);
    const score=Math.max(0,Number(item.score)||0);
    const bar=document.createElement("i"); bar.className="bar";
    bar.style.height=`${Math.max(10,Math.min(150,level*6+score))}px`;
    bar.dataset.label=`Seviye ${level} · score ${score} · ${date(item.captured_at)}`;
    return bar;
  }));
}
function renderCommands(items = []) {
  const commands = Array.isArray(items) ? items : [];
  if (!commands.length) return setEmpty("commands", "Cloud komut geçmişi yok.");
  $("commands").replaceChildren(...commands.map((item) => {
    const status = String(item.apply_status ?? item.applyStatus ?? "PENDING").toUpperCase();
    const node = document.createElement("article"); node.className = `command ${status.toLowerCase()}`;
    const head = document.createElement("header");
    const title = document.createElement("strong"); title.textContent = `#${Number(item.sequence||0)} · ${escapeText(item.kind)}`;
    const badge = document.createElement("span"); badge.textContent = status;
    head.append(title, badge);
    const detail = document.createElement("p"); detail.textContent = escapeText(item.apply_detail ?? item.applyDetail ?? "Cloud kuyruğunda masaüstü ACK bekleniyor.");
    const small = document.createElement("small");
    const applied = item.applied_at ?? item.appliedAt;
    small.textContent = `${date(item.created_at ?? item.createdAt)}${applied ? ` · uygulandı ${date(applied)}` : ""}${item.applied_instance_id ? ` · ${escapeText(item.applied_instance_id)}` : ""}`;
    node.append(head, detail, small); return node;
  }));
}

function render(data) {
  const row = data.current; state.current = row;
  renderCommands(data.commands);
  renderHistory(data.history);
  if (!row) {
    showNotice("Bu projectId için cloud snapshot bulunamadı. DevBox masaüstü aynı control-plane endpoint ve token ile en az bir kez senkron olmalı.");
    return;
  }
  showNotice("", false);
  const snapshot = row.latest_snapshot ?? {};
  const evolution = snapshot.evolution ?? {};
  const findings = snapshot.findings ?? {};
  const gate = snapshot.releaseGate ?? null;
  setText("level", evolution.lifetimeLevel ?? evolution.level ?? "—");
  setText("stage", evolution.stage ?? "—");
  setText("score", evolution.score ?? "—");
  setText("evidence", `${Number(evolution.lifetimeEvidencePoints||0).toLocaleString("tr-TR")} evidence point · ${Number(evolution.validatedImprovementCount||0)} doğrulanmış iyileştirme · ${Number(evolution.stablePromotionCount||0)} promotion`);
  setText("coreProgress", `${Number(evolution.spec?.passCount||0).toLocaleString("tr-TR")} / ${Number(evolution.spec?.totalTaskCount||3362).toLocaleString("tr-TR")}`);
  setText("coreDetail", Number(evolution.spec?.remainingCount||0)===0?"22 faz tamam · adaptif bakım":`${Number(evolution.spec?.remainingCount||0).toLocaleString("tr-TR")} görev kaldı`);
  setText("openFindings", findings.open ?? 0);
  setText("blockingFindings", `blocking: ${findings.blocking ?? 0}`);
  setText("gateState", gate?.state ?? "—");
  setText("gateTime", gate ? `${gate.mode} · ${date(gate.completedAt)}` : "kanıt bekleniyor");
  setText("heartbeat", date(row.captured_at));
  setText("instance", `instance: ${row.instance_id ?? "—"}`);
  setText("enabledText", evolution.enabled ? (evolution.isRunning?"açık · çalışıyor":"açık · bekliyor") : "kapalı");
  renderDomains(evolution.domainScores);
  renderRuntime(evolution.runtime);
  renderFindings(findings);
  renderGate(gate);
  renderLearnings(evolution.learnings);
}

async function refresh() {
  syncCredentials();
  if (state.projectId.length < 8 || state.token.length < 32) return showNotice("Geçerli projectId ve en az 32 karakterlik admin token gerekli.");
  try { render(await api(`/api/v1/state?projectId=${encodeURIComponent(state.projectId)}`)); }
  catch (error) { showNotice(`Cloud state okunamadı: ${error instanceof Error ? error.message : String(error)}`); }
}
async function command(kind,payload={}) {
  syncCredentials();
  if (state.projectId.length < 8 || state.token.length < 32) return showNotice("Komut göndermek için doğrulanmış projectId ve admin token gerekli.");
  try {
    const result = await api("/api/v1/commands",{method:"POST",body:JSON.stringify({projectId:state.projectId,kind,payload})});
    const queued = result.item ?? {};
    showNotice(`Komut #${Number(queued.sequence||0)} cloud kuyruğuna PENDING olarak kaydedildi. Masaüstü ACK gelmeden uygulanmış sayılmayacak.`,false);
    setTimeout(()=>void refresh(),1200);
  } catch(error) {
    showNotice(`Komut kaydedilemedi: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function scheduleRefresh() {
  if (state.timer !== null || document.hidden) return;
  state.timer = window.setInterval(() => {
    if (state.projectId && state.token) void refresh();
    void health();
  }, 30_000);
}
function stopRefresh() {
  if (state.timer !== null) window.clearInterval(state.timer);
  state.timer = null;
}

$("connect").addEventListener("click",()=>void refresh());
$("refresh").addEventListener("click",()=>void refresh());
$("discover").addEventListener("click",()=>void discoverProjects());
$("projectPicker").addEventListener("change",(event)=>{
  const value = event.currentTarget.value;
  if (!value) return;
  $("projectId").value = value;
  state.projectId = value;
  sessionStorage.setItem("devbox.projectId", value);
  void refresh();
});
$("enable").addEventListener("click",()=>void command("evolution.setEnabled",{enabled:true}));
$("disable").addEventListener("click",()=>void command("evolution.setEnabled",{enabled:false}));
$("run").addEventListener("click",()=>void command("evolution.run"));
$("cancel").addEventListener("click",()=>void command("evolution.cancel"));
$("theme").addEventListener("click",()=>{
  document.body.classList.toggle("light");
  $("theme").textContent=document.body.classList.contains("light")?"☾":"☀";
});
document.addEventListener("visibilitychange",()=>document.hidden?stopRefresh():scheduleRefresh());

void health();
if (state.token) void discoverProjects().then(() => { if (state.projectId) void refresh(); });
scheduleRefresh();
