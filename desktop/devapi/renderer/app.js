const api = window.devapiDesktop;

const refs = Object.freeze({
  nav: document.getElementById('surfaceNav'),
  frame: document.getElementById('surfaceFrame'),
  frameState: document.getElementById('frameState'),
  frameLocation: document.getElementById('frameLocation'),
  surfaceTitle: document.getElementById('surfaceTitle'),
  surfaceDescription: document.getElementById('surfaceDescription'),
  homeView: document.getElementById('homeView'),
  surfaceView: document.getElementById('surfaceView'),
  infoPanel: document.getElementById('infoPanel'),
  infoEyebrow: document.getElementById('infoEyebrow'),
  infoTitle: document.getElementById('infoTitle'),
  infoText: document.getElementById('infoText'),
  infoState: document.getElementById('infoState'),
  closeInfoPanel: document.getElementById('closeInfoPanel'),
  deploymentBadge: document.getElementById('deploymentBadge'),
  healthBadge: document.getElementById('healthBadge'),
  healthDot: document.getElementById('healthDot'),
  refreshBtn: document.getElementById('refreshBtn'),
  versionText: document.getElementById('versionText'),
  projectBtn: document.getElementById('projectBtn'),
  projectName: document.getElementById('projectName'),
  projectPath: document.getElementById('projectPath'),
  projectBreadcrumb: document.getElementById('projectBreadcrumb'),
  attachProjectBtn: document.getElementById('attachProjectBtn'),
  taskInput: document.getElementById('taskInput'),
  sendTaskBtn: document.getElementById('sendTaskBtn'),
  newTaskBtn: document.getElementById('newTaskBtn'),
  automationsBtn: document.getElementById('automationsBtn'),
  skillsBtn: document.getElementById('skillsBtn'),
  backHomeBtn: document.getElementById('backHomeBtn'),
  threadList: document.getElementById('threadList'),
  clearTaskFilter: document.getElementById('clearTaskFilter'),
  contextHint: document.getElementById('contextHint'),
  sidebarToggle: document.getElementById('sidebarToggle'),
  toast: document.getElementById('toast')
});

const surfaceDescriptions = Object.freeze({
  main: 'DevAPI ürününü, gerçek yeteneklerini, gelişim seviyesini ve kanıt sınırlarını sade Türkçe açıklar.',
  runtime: 'Worker, worktree, browser, provider ve veritabanı katmanlarının gerçek runtime durumunu gösterir.',
  docs: 'API sözleşmesi, task yaşam döngüsü ve güvenlik sınırlarının geliştirici dokümantasyonudur.',
  status: 'Source, CI, runtime, preview ve production durumlarını sahte uptime üretmeden özetler.',
  console: 'Agent görevleri, approvals, evidence, contracts, security ve deployment yönetim yüzeyidir.'
});

let surfaces = [];
let localState = { tasks: [], recentProjects: [], lastProject: null };
let activeSurface = null;
let toastTimer = null;

function showToast(message, tone = 'neutral') {
  clearTimeout(toastTimer);
  refs.toast.textContent = String(message);
  refs.toast.dataset.tone = tone;
  refs.toast.classList.add('show');
  toastTimer = setTimeout(() => refs.toast.classList.remove('show'), 3200);
}

function showHome({ focus = false } = {}) {
  activeSurface = null;
  refs.surfaceView.hidden = true;
  refs.infoPanel.hidden = true;
  refs.homeView.hidden = false;
  for (const button of refs.nav.querySelectorAll('button')) button.classList.remove('active');
  refs.newTaskBtn.classList.add('active');
  if (focus) setTimeout(() => refs.taskInput.focus(), 30);
}

function showInfo({ eyebrow = 'DEVAPI', title, text, state = 'NOT_RUN' }) {
  refs.homeView.hidden = true;
  refs.surfaceView.hidden = true;
  refs.infoPanel.hidden = false;
  refs.infoEyebrow.textContent = eyebrow;
  refs.infoTitle.textContent = title;
  refs.infoText.textContent = text;
  refs.infoState.textContent = state;
  refs.infoState.dataset.state = state;
}

function setProject(project) {
  if (!project?.path) {
    refs.projectName.textContent = 'Klasör aç';
    refs.projectPath.textContent = 'Gerçek proje klasörünü seç';
    refs.projectBreadcrumb.textContent = 'Yerel çalışma alanı';
    refs.contextHint.textContent = 'Proje seçilmedi';
    return;
  }
  refs.projectName.textContent = project.name || 'Proje';
  refs.projectPath.textContent = project.path;
  refs.projectBreadcrumb.textContent = project.path;
  refs.contextHint.textContent = project.name || 'Proje seçildi';
}

async function pickProject() {
  refs.projectBtn.disabled = true;
  refs.attachProjectBtn.disabled = true;
  try {
    const project = await api.pickProject();
    if (!project) return;
    localState = await api.getLocalState();
    setProject(project);
    showToast(`${project.name} çalışma alanı olarak seçildi.`, 'success');
  } catch (error) {
    showToast(error?.message ?? error, 'error');
  } finally {
    refs.projectBtn.disabled = false;
    refs.attachProjectBtn.disabled = false;
  }
}

function taskStateLabel(task) {
  if (task?.state === 'WAITING_RUNTIME') return 'Runtime bekliyor';
  return task?.state || 'Bilinmiyor';
}

function renderTasks() {
  refs.threadList.replaceChildren();
  const tasks = Array.isArray(localState.tasks) ? localState.tasks : [];
  if (tasks.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-thread';
    empty.textContent = 'Henüz yerel görev yok.';
    refs.threadList.appendChild(empty);
    return;
  }

  for (const task of tasks.slice(0, 12)) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'thread-item';
    const title = document.createElement('b');
    title.textContent = task.title || 'İsimsiz görev';
    const meta = document.createElement('span');
    meta.textContent = taskStateLabel(task);
    button.append(title, meta);
    button.addEventListener('click', () => {
      showInfo({
        eyebrow: 'YEREL GÖREV',
        title: task.title || 'Görev',
        text: `${task.request}\n\nBu görev masaüstünde gerçek olarak kaydedildi. Model runtime henüz bağlanmadığı için sahte cevap üretilmedi ve görev ${task.state} durumunda tutuluyor.`,
        state: task.runtimeState || task.state || 'NOT_RUN'
      });
    });
    refs.threadList.appendChild(button);
  }
}

async function createTask() {
  const text = refs.taskInput.value.trim();
  if (!text) {
    refs.taskInput.focus();
    showToast('Önce yapılacak görevi yaz.', 'error');
    return;
  }
  refs.sendTaskBtn.disabled = true;
  try {
    const task = await api.createDraftTask(text);
    localState = await api.getLocalState();
    renderTasks();
    refs.taskInput.value = '';
    showInfo({
      eyebrow: 'GÖREV OLUŞTURULDU',
      title: task.title,
      text: `Görev yerel state dosyasına kaydedildi. Seçili proje: ${task.project?.path || 'yok'}. Gerçek model runtime masaüstüne bağlanmadığı için görev yürütülmedi; WAITING_RUNTIME durumunda tutuluyor.`,
      state: task.runtimeState
    });
    showToast('Görev gerçek olarak kaydedildi; model runtime bekleniyor.', 'success');
  } catch (error) {
    showToast(error?.message ?? error, 'error');
  } finally {
    refs.sendTaskBtn.disabled = false;
  }
}

function renderSurfaceNav() {
  refs.nav.replaceChildren();
  const glyphs = { main: '⌂', runtime: '◉', docs: '≡', status: '◌', console: '◇' };
  for (const surface of surfaces) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.key = surface.key;
    button.disabled = !surface.exists;
    button.innerHTML = `<span>${glyphs[surface.key] || '□'}</span><b>${surface.label}</b>`;
    button.addEventListener('click', () => openSurface(surface.key));
    refs.nav.appendChild(button);
  }
}

async function openSurface(key) {
  try {
    const surface = await api.getSurface(key);
    activeSurface = key;
    refs.homeView.hidden = true;
    refs.infoPanel.hidden = true;
    refs.surfaceView.hidden = false;
    refs.newTaskBtn.classList.remove('active');
    for (const button of refs.nav.querySelectorAll('button')) button.classList.toggle('active', button.dataset.key === key);
    refs.surfaceTitle.textContent = surface?.label || 'DevAPI';
    refs.surfaceDescription.textContent = surfaceDescriptions[key] || 'DevAPI ürün yüzeyi';
    refs.frameLocation.textContent = `devapi-sites/${key}/index.html`;
    if (!surface?.exists || !surface?.url) {
      refs.frame.removeAttribute('src');
      refs.frameState.textContent = 'UNAVAILABLE';
      refs.frameState.dataset.state = 'failed';
      return;
    }
    refs.frameState.textContent = 'LOCAL READY';
    refs.frameState.dataset.state = 'ready';
    refs.frame.src = surface.url;
  } catch (error) {
    refs.frameState.textContent = 'FAILED';
    refs.frameState.dataset.state = 'failed';
    showToast(error?.message ?? error, 'error');
  }
}

function renderHealth(health) {
  const state = String(health?.state || 'FAILED');
  const integrity = health?.integrity || {};
  const ok = state === 'HEALTHY';
  refs.healthBadge.textContent = ok ? `DESKTOP HEALTHY · ${integrity.verified || 0}/${integrity.entries || 0}` : 'DESKTOP FAILED';
  refs.healthBadge.dataset.state = ok ? 'healthy' : 'failed';
  refs.healthDot.className = `health-dot ${ok ? 'healthy' : 'failed'}`;
}

async function refreshTruth() {
  refs.refreshBtn.disabled = true;
  try {
    const [manifest, health, state] = await Promise.all([api.getManifest(), api.getHealth(), api.getLocalState()]);
    localState = state;
    renderHealth(health);
    const deployment = String(manifest?.deploymentState || 'UNAVAILABLE');
    refs.deploymentBadge.textContent = `PRODUCTION ${deployment.replaceAll('_', ' ')}`;
    refs.deploymentBadge.dataset.state = deployment === 'PRODUCTION_VERIFIED' ? 'healthy' : 'muted';
    setProject(localState.lastProject);
    renderTasks();
  } catch (error) {
    showToast(error?.message ?? error, 'error');
  } finally {
    refs.refreshBtn.disabled = false;
  }
}

function wireStaticInteractions() {
  refs.projectBtn.addEventListener('click', pickProject);
  refs.attachProjectBtn.addEventListener('click', pickProject);
  refs.sendTaskBtn.addEventListener('click', createTask);
  refs.newTaskBtn.addEventListener('click', () => showHome({ focus: true }));
  refs.backHomeBtn.addEventListener('click', () => showHome());
  refs.closeInfoPanel.addEventListener('click', () => showHome());
  refs.refreshBtn.addEventListener('click', refreshTruth);
  refs.clearTaskFilter.addEventListener('click', async () => { localState = await api.getLocalState(); renderTasks(); showToast('Görev listesi yenilendi.'); });
  refs.automationsBtn.addEventListener('click', () => showInfo({ eyebrow: 'OTOMASYONLAR', title: 'Otomasyon motoru henüz desktop runtime’a bağlanmadı', text: 'Bu ekran bir demo üretmiyor. Durable task/automation katmanı gerçek runtime evidence alınana kadar NOT_RUN olarak kalır.', state: 'NOT_RUN' }));
  refs.skillsBtn.addEventListener('click', () => showInfo({ eyebrow: 'BECERİLER', title: 'Araç ve beceri kataloğu', text: 'Repo, worker, worktree ve bounded coding executor source/runtime temelleri mevcut. Model tabanlı beceriler OPENAI_API_KEY ve gerçek provider bridge olmadan BLOCKED_EXTERNAL kalır.', state: 'BLOCKED_EXTERNAL' }));
  refs.sidebarToggle.addEventListener('click', () => document.body.classList.toggle('sidebar-collapsed'));
  refs.taskInput.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      createTask();
    }
  });
  for (const card of document.querySelectorAll('.quick-card')) {
    card.addEventListener('click', () => {
      refs.taskInput.value = card.dataset.prompt || '';
      refs.taskInput.focus();
    });
  }
  document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'n') {
      event.preventDefault();
      showHome({ focus: true });
    }
    if (event.key === 'Escape') showHome();
  });
  refs.frame.addEventListener('error', () => {
    refs.frameState.textContent = 'FAILED';
    refs.frameState.dataset.state = 'failed';
  });
}

async function bootstrap() {
  if (!api) throw new Error('DEVAPI_PRELOAD_BRIDGE_UNAVAILABLE');
  surfaces = await api.listSurfaces();
  if (!Array.isArray(surfaces) || surfaces.length !== 5) throw new Error('DEVAPI_SURFACE_COUNT_INVALID');
  renderSurfaceNav();
  wireStaticInteractions();
  const build = await api.getBuildInfo();
  refs.versionText.textContent = `v${build.appVersion} · ${build.arch}`;
  await refreshTruth();
  showHome();
}

window.addEventListener('error', (event) => showToast(event.error?.message ?? event.message, 'error'));
window.addEventListener('unhandledrejection', (event) => showToast(event.reason?.message ?? event.reason, 'error'));

bootstrap().catch((error) => {
  refs.healthBadge.textContent = 'DESKTOP FAILED';
  refs.healthBadge.dataset.state = 'failed';
  refs.healthDot.className = 'health-dot failed';
  showToast(error?.message ?? error, 'error');
});
