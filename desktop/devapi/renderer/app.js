const api = window.devapiDesktop;
const nav = document.getElementById('surfaceNav');
const frame = document.getElementById('surfaceFrame');
const title = document.getElementById('surfaceTitle');
const description = document.getElementById('surfaceDescription');
const locationText = document.getElementById('frameLocation');
const frameState = document.getElementById('frameState');
const deploymentBadge = document.getElementById('deploymentBadge');
const healthBadge = document.getElementById('healthBadge');
const desktopHealth = document.getElementById('desktopHealth');
const desktopHealthDetail = document.getElementById('desktopHealthDetail');
const healthFoot = document.getElementById('healthFoot');
const vercelState = document.getElementById('vercelState');
const refreshBtn = document.getElementById('refreshBtn');
const versionText = document.getElementById('versionText');

const descriptions = Object.freeze({
  main: 'DevAPI ürününü, gerçek yeteneklerini, gelişim seviyesini ve kanıt sınırlarını teknik bilgisi olmayanların da anlayacağı biçimde açıklar.',
  runtime: 'Worker, worktree, browser, provider ve veritabanı gibi çalışma katmanlarının gerçekten hangi durumda olduğunu gösterir.',
  docs: 'API sözleşmesi, task yaşam döngüsü, güvenlik sınırları ve geliştirici kullanımını sade Türkçe anlatır.',
  status: 'Source, CI, runtime, preview ve production durumlarını sahte uptime veya uydurma başarı yüzdeleri kullanmadan özetler.',
  console: 'Agent görevleri, approvals, evidence, contracts, security ve deployment merkezleri için masaüstü kontrol yüzeyidir.'
});

let activeKey = 'main';
let surfaces = [];

function setActiveButton(key) {
  for (const button of nav.querySelectorAll('button')) button.classList.toggle('active', button.dataset.key === key);
}

function setFailure(message) {
  frameState.textContent = 'FAILED';
  frameState.style.color = '#c0392b';
  locationText.textContent = String(message ?? 'Bilinmeyen masaüstü hatası');
}

async function openSurface(key) {
  const surface = await api.getSurface(key);
  activeKey = key;
  setActiveButton(key);
  title.textContent = surface?.label ?? 'DevAPI';
  description.textContent = descriptions[key] ?? 'DevAPI yüzeyi';
  locationText.textContent = `devapi-sites/${key}/index.html`;

  if (!surface?.exists || !surface?.url) {
    frame.removeAttribute('src');
    frameState.textContent = 'UNAVAILABLE';
    frameState.style.color = '#c0392b';
    return;
  }

  frameState.textContent = 'LOCAL READY';
  frameState.style.color = '#198754';
  frame.src = surface.url;
}

function renderNav() {
  nav.replaceChildren();
  for (const surface of surfaces) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.key = surface.key;
    button.textContent = surface.label;
    button.disabled = surface.exists === false;
    button.title = surface.exists === false ? 'Bu yüzey paket içinde bulunamadı.' : surface.label;
    button.addEventListener('click', () => openSurface(surface.key).catch((error) => setFailure(error?.message ?? error)));
    nav.appendChild(button);
  }
}

function renderHealth(health) {
  const state = String(health?.state ?? 'FAILED');
  const checks = Array.isArray(health?.checks) ? health.checks : [];
  const passed = checks.filter((check) => check?.state === 'PASS').length;
  const total = checks.length;
  const integrity = health?.integrity ?? {};

  desktopHealth.textContent = state;
  desktopHealth.className = state === 'HEALTHY' ? 'health-good' : 'health-bad';
  desktopHealthDetail.textContent = `${passed}/${total} sağlık kontrolü · bütünlük ${integrity.verified ?? 0}/${integrity.entries ?? 0}`;
  healthBadge.textContent = `DESKTOP · ${state}`;
  healthBadge.classList.toggle('health-ok', state === 'HEALTHY');
  healthBadge.classList.toggle('health-failed', state !== 'HEALTHY');
  healthBadge.classList.remove('health-checking');
  healthFoot.textContent = state === 'HEALTHY'
    ? `Paket bütünlüğü doğrulandı · ${integrity.verified ?? 0}/${integrity.entries ?? 0}`
    : `Sağlık kontrolü başarısız · ${checks.filter((check) => check?.state !== 'PASS').map((check) => check.id).join(', ') || 'detay yok'}`;
}

async function refreshTruth() {
  refreshBtn.disabled = true;
  try {
    const [manifest, health] = await Promise.all([api.getManifest(), api.getHealth()]);
    const state = String(manifest?.deploymentState ?? 'UNAVAILABLE');
    deploymentBadge.textContent = `DEPLOYMENT · ${state}`;
    vercelState.textContent = state;
    deploymentBadge.classList.toggle('verified', state === 'PRODUCTION_VERIFIED');
    renderHealth(health);
    await openSurface(activeKey);
  } finally {
    refreshBtn.disabled = false;
  }
}

async function bootstrap() {
  if (!api) throw new Error('DEVAPI_PRELOAD_BRIDGE_UNAVAILABLE');
  surfaces = await api.listSurfaces();
  if (!Array.isArray(surfaces) || surfaces.length !== 5) throw new Error('DEVAPI_SURFACE_COUNT_INVALID');
  renderNav();
  const build = await api.getBuildInfo();
  versionText.textContent = `DevAPI Desktop v${build.appVersion} · ${build.arch}`;
  await refreshTruth();
}

refreshBtn.addEventListener('click', () => refreshTruth().catch((error) => setFailure(error?.message ?? error)));
frame.addEventListener('error', () => setFailure('Yüzey yüklenemedi.'));
window.addEventListener('error', (event) => setFailure(event.error?.message ?? event.message));
window.addEventListener('unhandledrejection', (event) => setFailure(event.reason?.message ?? event.reason));

bootstrap().catch((error) => {
  healthBadge.textContent = 'DESKTOP · FAILED';
  healthBadge.classList.add('health-failed');
  healthBadge.classList.remove('health-checking');
  desktopHealth.textContent = 'FAILED';
  desktopHealth.className = 'health-bad';
  healthFoot.textContent = 'Masaüstü başlangıç denetimi başarısız.';
  setFailure(error?.message ?? error);
});
