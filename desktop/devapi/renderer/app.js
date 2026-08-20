const api = window.devapiDesktop;

const byId = (id) => document.getElementById(id);
const refs = Object.freeze({
  nav: byId('surfaceNav'), frame: byId('surfaceFrame'), frameState: byId('frameState'), frameLocation: byId('frameLocation'), surfaceTitle: byId('surfaceTitle'), surfaceDescription: byId('surfaceDescription'),
  homeView: byId('homeView'), taskView: byId('taskView'), surfaceView: byId('surfaceView'), infoPanel: byId('infoPanel'), settingsPanel: byId('settingsPanel'),
  infoEyebrow: byId('infoEyebrow'), infoTitle: byId('infoTitle'), infoText: byId('infoText'), infoState: byId('infoState'), closeInfoPanel: byId('closeInfoPanel'),
  deploymentBadge: byId('deploymentBadge'), healthBadge: byId('healthBadge'), providerBadge: byId('providerBadge'), healthDot: byId('healthDot'), refreshBtn: byId('refreshBtn'), versionText: byId('versionText'),
  projectBtn: byId('projectBtn'), projectName: byId('projectName'), projectPath: byId('projectPath'), projectBreadcrumb: byId('projectBreadcrumb'), projectSelectWide: byId('projectSelectWide'), projectSelectWideText: byId('projectSelectWideText'), attachProjectBtn: byId('attachProjectBtn'),
  taskInput: byId('taskInput'), sendTaskBtn: byId('sendTaskBtn'), newTaskBtn: byId('newTaskBtn'), automationsBtn: byId('automationsBtn'), skillsBtn: byId('skillsBtn'), settingsBtn: byId('settingsBtn'), toolsBtn: byId('toolsBtn'), modelBtn: byId('modelBtn'), modelName: byId('modelName'), modelState: byId('modelState'),
  backHomeBtn: byId('backHomeBtn'), taskBackBtn: byId('taskBackBtn'), threadList: byId('threadList'), clearTaskFilter: byId('clearTaskFilter'), contextHint: byId('contextHint'), sidebarToggle: byId('sidebarToggle'), toast: byId('toast'),
  runtimeNotice: byId('runtimeNotice'), runtimeNoticeTitle: byId('runtimeNoticeTitle'), runtimeNoticeText: byId('runtimeNoticeText'),
  taskTitle: byId('taskTitle'), taskMeta: byId('taskMeta'), taskState: byId('taskState'), taskRequest: byId('taskRequest'), taskPlan: byId('taskPlan'), taskCandidate: byId('taskCandidate'), taskReview: byId('taskReview'), taskTimeline: byId('taskTimeline'),
  runTaskBtn: byId('runTaskBtn'), approveCandidateBtn: byId('approveCandidateBtn'), applyProjectBtn: byId('applyProjectBtn'), rollbackBtn: byId('rollbackBtn'), exportEvidenceBtn: byId('exportEvidenceBtn'), cancelTaskBtn: byId('cancelTaskBtn'),
  closeSettingsBtn: byId('closeSettingsBtn'), apiKeyInput: byId('apiKeyInput'), modelInput: byId('modelInput'), webSearchToggle: byId('webSearchToggle'), secretStorageState: byId('secretStorageState'), providerStateText: byId('providerStateText'), saveSettingsBtn: byId('saveSettingsBtn'), testProviderBtn: byId('testProviderBtn'), clearKeyBtn: byId('clearKeyBtn')
});

const surfaceDescriptions = Object.freeze({
  main: 'DevAPI ürününü, gerçek yeteneklerini, gelişim seviyesini ve kanıt sınırlarını sade Türkçe açıklar.',
  runtime: 'Worker, worktree, browser, provider ve veritabanı katmanlarının gerçek runtime durumunu gösterir.',
  docs: 'API sözleşmesi, task yaşam döngüsü ve güvenlik sınırlarının geliştirici dokümantasyonudur.',
  status: 'Source, CI, runtime, preview ve production durumlarını sahte uptime üretmeden özetler.',
  console: 'Agent görevleri, approvals, evidence, contracts, security ve deployment yönetim yüzeyidir.'
});

let surfaces = [];
let localState = { recentProjects: [], lastProject: null };
let agentTasks = [];
let provider = { configured: false, state: 'UNCONFIGURED', model: 'gpt-5.6-sol', webSearch: true };
let activeTaskId = null;
let toastTimer = null;

function showToast(message, tone = 'neutral') {
  clearTimeout(toastTimer);
  refs.toast.textContent = String(message);
  refs.toast.dataset.tone = tone;
  refs.toast.classList.add('show');
  toastTimer = setTimeout(() => refs.toast.classList.remove('show'), 3800);
}
function setBusy(button, busy, text) {
  if (!button) return;
  if (busy) { button.dataset.original = button.textContent; button.textContent = text || 'Çalışıyor…'; button.disabled = true; }
  else { button.textContent = button.dataset.original || button.textContent; button.disabled = false; delete button.dataset.original; }
}
function hideViews() {
  refs.homeView.hidden = true; refs.taskView.hidden = true; refs.surfaceView.hidden = true; refs.infoPanel.hidden = true; refs.settingsPanel.hidden = true;
}
function showHome({ focus = false } = {}) {
  activeTaskId = null; hideViews(); refs.homeView.hidden = false; refs.newTaskBtn.classList.add('active');
  for (const button of refs.nav.querySelectorAll('button')) button.classList.remove('active');
  if (focus) setTimeout(() => refs.taskInput.focus(), 40);
}
function showInfo({ eyebrow = 'DEVAPI', title, text, state = 'NOT_RUN' }) {
  hideViews(); refs.infoPanel.hidden = false; refs.infoEyebrow.textContent = eyebrow; refs.infoTitle.textContent = title; refs.infoText.textContent = text; refs.infoState.textContent = state; refs.infoState.dataset.state = state;
}
function openSettings() { hideViews(); refs.settingsPanel.hidden = false; renderSettings(); }

function setProject(project) {
  const hasProject = Boolean(project?.path);
  refs.projectName.textContent = hasProject ? project.name || 'Proje' : 'Klasör aç';
  refs.projectPath.textContent = hasProject ? project.path : 'Gerçek Git proje klasörünü seç';
  refs.projectBreadcrumb.textContent = hasProject ? project.path : 'Yerel çalışma alanı';
  refs.contextHint.textContent = hasProject ? project.name || 'Proje seçildi' : 'Proje seçilmedi';
  refs.projectSelectWideText.textContent = hasProject ? `${project.name} · ${project.path}` : 'Projeni seç';
}
async function pickProject() {
  refs.projectBtn.disabled = true; refs.attachProjectBtn.disabled = true; refs.projectSelectWide.disabled = true;
  try {
    const project = await api.pickProject();
    if (!project) return;
    localState = await api.getLocalState(); setProject(project); showToast(`${project.name} çalışma alanı seçildi.`, 'success');
  } catch (error) { showToast(error?.message ?? error, 'error'); }
  finally { refs.projectBtn.disabled = false; refs.attachProjectBtn.disabled = false; refs.projectSelectWide.disabled = false; }
}

function providerVerified() { return provider?.state === 'RUNTIME_VERIFIED'; }
function renderProvider() {
  const state = String(provider?.state || 'UNCONFIGURED');
  refs.providerBadge.textContent = `AGENT ${state.replaceAll('_', ' ')}`;
  refs.providerBadge.dataset.state = state === 'RUNTIME_VERIFIED' ? 'healthy' : provider?.configured ? 'source' : 'blocked';
  refs.modelName.textContent = provider?.model || 'DevAPI Agent'; refs.modelState.textContent = state;
  refs.runtimeNotice.dataset.state = state;
  if (state === 'RUNTIME_VERIFIED') {
    refs.runtimeNoticeTitle.textContent = 'Gerçek model runtime doğrulandı.';
    refs.runtimeNoticeText.textContent = `Planner ve independent reviewer ${provider.model} ile gerçek API isteği yapabilir. Web search ${provider.webSearch ? 'açık' : 'kapalı'}. Kod değişikliği yine insan onayı olmadan uygulanmaz.`;
  } else if (provider?.configured) {
    refs.runtimeNoticeTitle.textContent = 'API anahtarı güvenli kasada, fakat provider henüz doğrulanmadı.';
    refs.runtimeNoticeText.textContent = 'Ayarlar → Gerçek bağlantıyı test et ile provider smoke çalıştır. PASS olmadan model runtime yeşile dönmez.';
  } else {
    refs.runtimeNoticeTitle.textContent = 'Agent runtime yapılandırılmadı.';
    refs.runtimeNoticeText.textContent = 'Ayarlar bölümünden OpenAI API anahtarını işletim sistemi şifreli kasasına kaydet ve bağlantıyı doğrula. Anahtar proje dosyasına veya görev içeriğine yazılmaz.';
  }
}
function renderSettings() {
  refs.modelInput.value = provider?.model || 'gpt-5.6-sol'; refs.webSearchToggle.checked = provider?.webSearch !== false;
  refs.secretStorageState.textContent = provider?.secretStorage || 'CHECKING'; refs.providerStateText.textContent = provider?.state || 'UNCONFIGURED'; refs.apiKeyInput.value = '';
}

function taskStateLabel(state) { return String(state || 'UNKNOWN').replaceAll('_', ' '); }
function renderTasks() {
  refs.threadList.replaceChildren();
  if (!agentTasks.length) { const empty = document.createElement('div'); empty.className = 'empty-thread'; empty.textContent = 'Henüz ajan görevi yok.'; refs.threadList.appendChild(empty); return; }
  for (const task of agentTasks.slice(0, 18)) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'thread-item';
    const title = document.createElement('b'); title.textContent = task.title || 'İsimsiz görev';
    const meta = document.createElement('span'); meta.textContent = taskStateLabel(task.state);
    button.append(title, meta); button.addEventListener('click', () => openTask(task.taskId)); refs.threadList.appendChild(button);
  }
}
function addList(container, title, items) {
  const wrap = document.createElement('div'); wrap.className = 'structured-block';
  const h = document.createElement('b'); h.textContent = title; wrap.appendChild(h);
  const ul = document.createElement('ul');
  for (const item of items || []) { const li = document.createElement('li'); li.textContent = String(item); ul.appendChild(li); }
  if (!ul.children.length) { const li = document.createElement('li'); li.textContent = 'Yok'; ul.appendChild(li); }
  wrap.appendChild(ul); container.appendChild(wrap);
}
function renderTaskDetail(task) {
  refs.taskTitle.textContent = task.title; refs.taskMeta.textContent = `${task.projectName || 'Proje yok'} · Risk ${task.riskClass || 'R2'} · ${task.updatedAt || ''}`; refs.taskState.textContent = taskStateLabel(task.state); refs.taskState.dataset.state = task.state;
  refs.taskRequest.textContent = task.request;
  refs.taskPlan.replaceChildren();
  if (task.plan) { const summary = document.createElement('p'); summary.textContent = task.plan.summary || 'Plan özeti yok.'; refs.taskPlan.appendChild(summary); addList(refs.taskPlan, 'Etkilenecek dosyalar', task.plan.files); addList(refs.taskPlan, 'Adımlar', task.plan.steps); addList(refs.taskPlan, 'Önerilen testler', task.plan.tests); }
  else refs.taskPlan.textContent = 'Plan henüz üretilmedi.';
  refs.taskCandidate.replaceChildren();
  if (task.candidate?.changes?.length) {
    const p = document.createElement('p'); p.textContent = `${task.candidate.summary || 'Aday hazır.'} · Patch ${task.candidate.patchBytes || 0} byte · ${task.candidate.patchDigest?.slice(0, 16) || ''}…`; refs.taskCandidate.appendChild(p);
    for (const change of task.candidate.changes) { const card = document.createElement('div'); card.className = 'change-row'; const name = document.createElement('b'); name.textContent = change.path; const reason = document.createElement('span'); reason.textContent = change.reason || 'Değişiklik'; const hash = document.createElement('code'); hash.textContent = `${(change.beforeSha256 || 'NEW').slice(0, 12)} → ${change.afterSha256.slice(0, 12)}`; card.append(name, reason, hash); refs.taskCandidate.appendChild(card); }
  } else refs.taskCandidate.textContent = task.state === 'NO_CHANGE_REQUIRED' ? 'Model kanıtlı olarak değişiklik gerekmiyor sonucuna ulaştı.' : 'Aday patch henüz yok.';
  refs.taskReview.replaceChildren();
  if (task.review) { const decision = document.createElement('div'); decision.className = 'review-decision'; decision.textContent = `${task.review.decision} · ${task.review.riskDelta || 'NONE'}`; refs.taskReview.appendChild(decision); const p = document.createElement('p'); p.textContent = task.review.summary || ''; refs.taskReview.appendChild(p); addList(refs.taskReview, 'Bulgular', (task.review.findings || []).map((f) => `${f.severity}: ${f.message}`)); addList(refs.taskReview, 'Ek testler', task.review.requiredTests || []); }
  else refs.taskReview.textContent = 'Reviewer henüz çalışmadı.';
  refs.taskTimeline.replaceChildren();
  for (const event of task.events || []) { const item = document.createElement('div'); item.className = 'timeline-item'; const dot = document.createElement('i'); const copy = document.createElement('div'); const b = document.createElement('b'); b.textContent = taskStateLabel(event.toState); const small = document.createElement('small'); small.textContent = `${event.actor} · ${event.createdAt}`; copy.append(b, small); item.append(dot, copy); refs.taskTimeline.appendChild(item); }
  const state = task.state;
  refs.runTaskBtn.hidden = !['CREATED','FAILED','BLOCKED_EXTERNAL','REQUEST_CHANGES'].includes(state);
  refs.runTaskBtn.disabled = !providerVerified();
  refs.runTaskBtn.title = providerVerified() ? 'Gerçek Planner + Coding Agent çalıştır' : 'Önce provider bağlantısını doğrula';
  refs.approveCandidateBtn.hidden = state !== 'WAITING_APPROVAL';
  refs.applyProjectBtn.hidden = state !== 'SOURCE_VERIFIED_CANDIDATE';
  refs.rollbackBtn.hidden = state !== 'APPLIED_TO_PROJECT';
  refs.cancelTaskBtn.hidden = ['APPLIED_TO_PROJECT','ROLLED_BACK','REJECTED','NO_CHANGE_REQUIRED'].includes(state);
}
async function openTask(taskId) {
  activeTaskId = taskId; hideViews(); refs.taskView.hidden = false; refs.newTaskBtn.classList.remove('active');
  try { renderTaskDetail(await api.getAgentTask(taskId)); } catch (error) { showToast(error?.message ?? error, 'error'); }
}
async function refreshTask() { if (activeTaskId) renderTaskDetail(await api.getAgentTask(activeTaskId)); }

async function createTask() {
  const request = refs.taskInput.value.trim();
  if (!request) { refs.taskInput.focus(); showToast('Önce yapılacak görevi yaz.', 'error'); return; }
  if (!localState.lastProject?.path) { showToast('Önce gerçek proje klasörünü seç.', 'error'); await pickProject(); if (!localState.lastProject?.path) return; }
  setBusy(refs.sendTaskBtn, true, '…');
  try {
    const task = await api.createAgentTask({ request, projectPath: localState.lastProject.path });
    refs.taskInput.value = ''; agentTasks = await api.listAgentTasks(50); renderTasks(); await openTask(task.taskId);
    if (providerVerified()) await runActiveTask(); else showToast('Görev kalıcı SQLite task olarak oluşturuldu. Provider bağlantısı bekleniyor.', 'success');
  } catch (error) { showToast(error?.message ?? error, 'error'); }
  finally { setBusy(refs.sendTaskBtn, false); }
}
async function runActiveTask() {
  if (!activeTaskId) return;
  setBusy(refs.runTaskBtn, true, 'Planner + Coding Agent çalışıyor…');
  try { renderTaskDetail(await api.planAgentTask(activeTaskId)); agentTasks = await api.listAgentTasks(50); renderTasks(); showToast('Plan ve bounded candidate gerçek model çağrısıyla hazırlandı.', 'success'); }
  catch (error) { showToast(error?.message ?? error, 'error'); await refreshTask().catch(() => {}); }
  finally { setBusy(refs.runTaskBtn, false); }
}
async function approveCandidate() {
  if (!activeTaskId || !confirm('Aday değişiklik yalnız izole Git worktree içine uygulanacak, iç güvenli doğrulamalar çalışacak ve ayrı Reviewer Agent çağrılacak. Devam edilsin mi?')) return;
  setBusy(refs.approveCandidateBtn, true, 'Worktree + test + review…');
  try { renderTaskDetail(await api.approveAgentCandidate(activeTaskId)); agentTasks = await api.listAgentTasks(50); renderTasks(); showToast('İzole aday doğrulandı ve independent review tamamlandı.', 'success'); }
  catch (error) { showToast(error?.message ?? error, 'error'); await refreshTask().catch(() => {}); }
  finally { setBusy(refs.approveCandidateBtn, false); }
}
async function applyProject() {
  if (!activeTaskId || !confirm('Bu adım Reviewer tarafından onaylanan adayı gerçek proje dosyalarına yazacak. DevAPI önce SHA drift kontrolü yapacak ve geri alma yedeği oluşturacak. Uygulansın mı?')) return;
  setBusy(refs.applyProjectBtn, true, 'Projeye uygulanıyor…');
  try { renderTaskDetail(await api.applyAgentTaskToProject(activeTaskId)); agentTasks = await api.listAgentTasks(50); renderTasks(); showToast('Onaylı değişiklik gerçek projeye SHA kontrollü uygulandı.', 'success'); }
  catch (error) { showToast(error?.message ?? error, 'error'); await refreshTask().catch(() => {}); }
  finally { setBusy(refs.applyProjectBtn, false); }
}
async function rollbackTask() {
  if (!activeTaskId || !confirm('DevAPI yedek manifestine göre bu task değişikliklerini geri alacak. Mevcut dosya SHA değerleri değişmişse işlem fail-closed durur. Devam edilsin mi?')) return;
  setBusy(refs.rollbackBtn, true, 'Geri alınıyor…');
  try { renderTaskDetail(await api.rollbackAgentTask(activeTaskId)); agentTasks = await api.listAgentTasks(50); renderTasks(); showToast('Task değişiklikleri doğrulanmış yedekten geri alındı.', 'success'); }
  catch (error) { showToast(error?.message ?? error, 'error'); }
  finally { setBusy(refs.rollbackBtn, false); }
}
async function cancelTask() { if (!activeTaskId) return; try { renderTaskDetail(await api.cancelAgentTask(activeTaskId)); showToast('Görev iptal edildi.'); } catch (error) { showToast(error?.message ?? error, 'error'); } }
async function exportEvidence() { if (!activeTaskId) return; try { const result = await api.exportAgentEvidence(activeTaskId); if (result) showToast(`Kanıt paketi kaydedildi · ${result.sha256.slice(0, 16)}…`, 'success'); } catch (error) { showToast(error?.message ?? error, 'error'); } }

function renderSurfaceNav() {
  refs.nav.replaceChildren(); const glyphs = { main: '⌂', runtime: '◉', docs: '≡', status: '◌', console: '◇' };
  for (const surface of surfaces) { const button = document.createElement('button'); button.type = 'button'; button.dataset.key = surface.key; button.disabled = !surface.exists; const icon = document.createElement('span'); icon.textContent = glyphs[surface.key] || '□'; const label = document.createElement('b'); label.textContent = surface.label; button.append(icon, label); button.addEventListener('click', () => openSurface(surface.key)); refs.nav.appendChild(button); }
}
async function openSurface(key) {
  try {
    const surface = await api.getSurface(key); hideViews(); refs.surfaceView.hidden = false; refs.newTaskBtn.classList.remove('active'); for (const button of refs.nav.querySelectorAll('button')) button.classList.toggle('active', button.dataset.key === key);
    refs.surfaceTitle.textContent = surface?.label || 'DevAPI'; refs.surfaceDescription.textContent = surfaceDescriptions[key] || 'DevAPI ürün yüzeyi'; refs.frameLocation.textContent = `devapi-sites/${key}/index.html`;
    if (!surface?.exists || !surface?.url) { refs.frame.removeAttribute('src'); refs.frameState.textContent = 'UNAVAILABLE'; refs.frameState.dataset.state = 'failed'; return; }
    refs.frameState.textContent = 'LOCAL READY'; refs.frameState.dataset.state = 'ready'; refs.frame.src = surface.url;
  } catch (error) { refs.frameState.textContent = 'FAILED'; refs.frameState.dataset.state = 'failed'; showToast(error?.message ?? error, 'error'); }
}
function renderHealth(health) { const ok = health?.state === 'HEALTHY'; const integrity = health?.integrity || {}; refs.healthBadge.textContent = ok ? `DESKTOP HEALTHY · ${integrity.verified || 0}/${integrity.entries || 0}` : 'DESKTOP FAILED'; refs.healthBadge.dataset.state = ok ? 'healthy' : 'failed'; refs.healthDot.className = `health-dot ${ok ? 'healthy' : 'failed'}`; }
async function refreshTruth() {
  refs.refreshBtn.disabled = true;
  try {
    const [manifest, health, state, agentHealth, settings, tasks] = await Promise.all([api.getManifest(), api.getHealth(), api.getLocalState(), api.getAgentHealth(), api.getAgentSettings(), api.listAgentTasks(50)]);
    localState = state; provider = settings; agentTasks = tasks; renderHealth(health); renderProvider(); renderTasks(); setProject(localState.lastProject);
    const deployment = String(manifest?.deploymentState || 'UNAVAILABLE'); refs.deploymentBadge.textContent = `PRODUCTION ${deployment.replaceAll('_', ' ')}`; refs.deploymentBadge.dataset.state = deployment === 'PRODUCTION_VERIFIED' ? 'healthy' : 'muted';
    if (agentHealth.sqlite !== 'RUNTIME_VERIFIED') showToast('Agent SQLite persistence sağlık kontrolü başarısız.', 'error');
    if (activeTaskId) await refreshTask();
  } catch (error) { showToast(error?.message ?? error, 'error'); }
  finally { refs.refreshBtn.disabled = false; }
}

async function saveSettings() {
  setBusy(refs.saveSettingsBtn, true, 'Kaydediliyor…');
  try {
    if (refs.apiKeyInput.value.trim()) await api.saveAgentApiKey(refs.apiKeyInput.value.trim());
    provider = await api.setAgentSettings({ model: refs.modelInput.value.trim() || 'gpt-5.6-sol', webSearch: refs.webSearchToggle.checked }); renderProvider(); renderSettings(); showToast('Agent ayarları güvenli kaydedildi.', 'success');
  } catch (error) { showToast(error?.message ?? error, 'error'); }
  finally { setBusy(refs.saveSettingsBtn, false); refs.apiKeyInput.value = ''; }
}
async function testProvider() {
  setBusy(refs.testProviderBtn, true, 'Gerçek API testi…');
  try { const result = await api.testAgentProvider(); provider = await api.getAgentSettings(); renderProvider(); renderSettings(); showToast(`Provider RUNTIME_VERIFIED · ${result.model} · ${result.responseId || 'response'}`, 'success'); }
  catch (error) { showToast(error?.message ?? error, 'error'); }
  finally { setBusy(refs.testProviderBtn, false); }
}
async function clearKey() { if (!confirm('Yerel şifreli OpenAI API anahtarı kaldırılsın mı?')) return; provider = await api.clearAgentApiKey(); renderProvider(); renderSettings(); showToast('API anahtarı kaldırıldı.'); }

function wire() {
  refs.projectBtn.addEventListener('click', pickProject); refs.projectSelectWide.addEventListener('click', pickProject); refs.attachProjectBtn.addEventListener('click', pickProject); refs.sendTaskBtn.addEventListener('click', createTask);
  refs.newTaskBtn.addEventListener('click', () => showHome({ focus: true })); refs.backHomeBtn.addEventListener('click', () => showHome()); refs.taskBackBtn.addEventListener('click', () => showHome()); refs.closeInfoPanel.addEventListener('click', () => showHome()); refs.closeSettingsBtn.addEventListener('click', () => showHome()); refs.refreshBtn.addEventListener('click', refreshTruth);
  refs.clearTaskFilter.addEventListener('click', async () => { agentTasks = await api.listAgentTasks(50); renderTasks(); showToast('Görev listesi yenilendi.'); });
  refs.settingsBtn.addEventListener('click', openSettings); refs.modelBtn.addEventListener('click', openSettings); refs.saveSettingsBtn.addEventListener('click', saveSettings); refs.testProviderBtn.addEventListener('click', testProvider); refs.clearKeyBtn.addEventListener('click', clearKey);
  refs.automationsBtn.addEventListener('click', () => showInfo({ eyebrow: 'OTOMASYONLAR', title: 'Durable automation katmanı', text: 'Desktop task runtime artık gerçek SQLite task/evidence tutuyor. Ancak restart-surviving distributed durable queue henüz ayrı runtime evidence almadan hazır sayılmaz.', state: 'SOURCE_READY' }));
  refs.skillsBtn.addEventListener('click', () => showInfo({ eyebrow: 'BECERİLER', title: 'Gerçek araç sınırı', text: 'Repo tarama, OpenAI Responses planner, opsiyonel web_search, bounded coder, Git worktree, SHA kontrollü patch, node syntax gate, git diff check, independent reviewer, evidence export ve rollback yerel runtime içinde bulunur.', state: 'SOURCE_READY' }));
  refs.toolsBtn.addEventListener('click', () => showInfo({ eyebrow: 'ARAÇLAR', title: 'DevAPI Local Tool Plane', text: 'Aktif araçlar: güvenli repo inventory, Git worktree, bounded file patch, node --check, git diff --check, OpenAI Responses planner/coder/reviewer, web_search, SQLite task/event/evidence ve SHA kontrollü rollback. Git push, publish ve production deploy masaüstü ajanına verilmez.', state: 'SOURCE_READY' }));
  refs.runTaskBtn.addEventListener('click', runActiveTask); refs.approveCandidateBtn.addEventListener('click', approveCandidate); refs.applyProjectBtn.addEventListener('click', applyProject); refs.rollbackBtn.addEventListener('click', rollbackTask); refs.cancelTaskBtn.addEventListener('click', cancelTask); refs.exportEvidenceBtn.addEventListener('click', exportEvidence);
  refs.sidebarToggle.addEventListener('click', () => document.body.classList.toggle('sidebar-collapsed'));
  refs.taskInput.addEventListener('keydown', (event) => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); createTask(); } });
  for (const card of document.querySelectorAll('.quick-card')) card.addEventListener('click', () => { refs.taskInput.value = card.dataset.prompt || ''; refs.taskInput.focus(); });
  document.addEventListener('keydown', (event) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'n') { event.preventDefault(); showHome({ focus: true }); } if (event.key === 'Escape') showHome(); });
  refs.frame.addEventListener('error', () => { refs.frameState.textContent = 'FAILED'; refs.frameState.dataset.state = 'failed'; });
}

async function bootstrap() {
  if (!api) throw new Error('DEVAPI_PRELOAD_BRIDGE_UNAVAILABLE');
  surfaces = await api.listSurfaces(); if (!Array.isArray(surfaces) || surfaces.length !== 5) throw new Error('DEVAPI_SURFACE_COUNT_INVALID');
  renderSurfaceNav(); wire(); const build = await api.getBuildInfo(); refs.versionText.textContent = `v${build.appVersion} · ${build.arch}`; await refreshTruth(); showHome();
}
window.addEventListener('error', (event) => showToast(event.error?.message ?? event.message, 'error'));
window.addEventListener('unhandledrejection', (event) => showToast(event.reason?.message ?? event.reason, 'error'));
bootstrap().catch((error) => { refs.healthBadge.textContent = 'DESKTOP FAILED'; refs.healthBadge.dataset.state = 'failed'; refs.healthDot.className = 'health-dot failed'; showToast(error?.message ?? error, 'error'); });
