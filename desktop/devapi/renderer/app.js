const api = window.devapiDesktop;
const nav = document.getElementById('surfaceNav');
const frame = document.getElementById('surfaceFrame');
const title = document.getElementById('surfaceTitle');
const description = document.getElementById('surfaceDescription');
const locationText = document.getElementById('frameLocation');
const frameState = document.getElementById('frameState');
const deploymentBadge = document.getElementById('deploymentBadge');
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
    button.addEventListener('click', () => openSurface(surface.key));
    nav.appendChild(button);
  }
}

async function refreshTruth() {
  const manifest = await api.getManifest();
  const state = String(manifest?.deploymentState ?? 'UNAVAILABLE');
  deploymentBadge.textContent = `DEPLOYMENT · ${state}`;
  vercelState.textContent = state;
  deploymentBadge.classList.toggle('verified', state === 'PRODUCTION_VERIFIED');
  await openSurface(activeKey);
}

async function bootstrap() {
  surfaces = await api.listSurfaces();
  renderNav();
  const build = await api.getBuildInfo();
  versionText.textContent = `DevAPI Desktop v${build.appVersion} · ${build.arch}`;
  await refreshTruth();
}

refreshBtn.addEventListener('click', refreshTruth);
bootstrap().catch((error) => {
  frameState.textContent = 'FAILED';
  frameState.style.color = '#c0392b';
  locationText.textContent = String(error?.message ?? error);
});
