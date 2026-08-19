const { app, BrowserWindow, ipcMain, shell, session, protocol, net, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'devapi',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: false,
      stream: true
    }
  }
]);

const SURFACES = Object.freeze({
  main: { label: 'Ana Ürün', folder: 'main' },
  runtime: { label: 'API Runtime', folder: 'runtime' },
  docs: { label: 'Dokümantasyon', folder: 'docs' },
  status: { label: 'Durum Merkezi', folder: 'status' },
  console: { label: 'Agent Console', folder: 'console' }
});

const MAX_TASKS = 50;
const MAX_TASK_TEXT = 6000;
const MAX_RECENT_PROJECTS = 8;
let mainWindow = null;

function rendererRoot() {
  return path.join(__dirname, 'renderer');
}

function surfacesRoot() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'devapi-sites')
    : path.resolve(__dirname, '..', '..', 'cloud', 'devapi-sites');
}

function integrityPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'integrity.json')
    : path.join(__dirname, 'resources', 'integrity.json');
}

function statePath() {
  return path.join(app.getPath('userData'), 'desktop-state.json');
}

function redact(value) {
  return String(value ?? '')
    .replace(/sk-[A-Za-z0-9_-]{16,}/g, '[REDACTED_OPENAI_KEY]')
    .replace(/(postgres(?:ql)?:\/\/[^:\s/]+:)[^@\s]+@/gi, '$1[REDACTED]@')
    .replace(/(Bearer\s+)[A-Za-z0-9._~-]+/gi, '$1[REDACTED]');
}

function logFailure(kind, error) {
  try {
    if (!app.isReady()) return;
    const dir = app.getPath('userData');
    fs.mkdirSync(dir, { recursive: true });
    const line = JSON.stringify({
      at: new Date().toISOString(),
      kind,
      message: redact(error?.message ?? error),
      stack: redact(error?.stack ?? '')
    });
    fs.appendFileSync(path.join(dir, 'devapi-crash.log'), `${line}\n`, 'utf8');
  } catch {
    // Crash logging must never create a second crash.
  }
}

function safeResolve(root, rawPath) {
  const decoded = decodeURIComponent(String(rawPath ?? '')).replace(/^\/+/, '');
  if (!decoded || decoded.includes('\0')) return null;
  const candidate = path.resolve(root, decoded);
  const relative = path.relative(root, candidate);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return candidate;
}

function protocolResponse(status, body) {
  return new Response(body, {
    status,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
}

function registerLocalProtocol() {
  protocol.handle('devapi', async (request) => {
    try {
      const value = new URL(request.url);
      let root;
      if (value.host === 'desktop') root = rendererRoot();
      else if (value.host === 'surface') root = surfacesRoot();
      else return protocolResponse(404, 'DEVAPI_PROTOCOL_HOST_NOT_FOUND');

      const filePath = safeResolve(root, value.pathname);
      if (!filePath) return protocolResponse(400, 'DEVAPI_PROTOCOL_PATH_INVALID');
      const stat = fs.statSync(filePath, { throwIfNoEntry: false });
      if (!stat?.isFile()) return protocolResponse(404, 'DEVAPI_PROTOCOL_FILE_NOT_FOUND');
      return net.fetch(pathToFileURL(filePath).toString());
    } catch (error) {
      logFailure('protocol', error);
      return protocolResponse(500, 'DEVAPI_PROTOCOL_FAILED');
    }
  });
}

function surfaceDescriptor(key) {
  const surface = SURFACES[key];
  if (!surface) return null;
  const filePath = path.join(surfacesRoot(), surface.folder, 'index.html');
  const exists = fs.existsSync(filePath);
  return {
    key,
    label: surface.label,
    exists,
    url: exists ? `devapi://surface/${encodeURIComponent(surface.folder)}/index.html` : null
  };
}

function manifestSnapshot() {
  const manifestPath = path.join(surfacesRoot(), 'sites.manifest.json');
  try {
    const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    return {
      ok: true,
      deploymentState: parsed.deploymentState ?? 'NOT_RUN',
      canonicalDomainsVerified: parsed.canonicalDomainsVerified === true,
      requiredSuffix: parsed.domainPolicy?.requiredSuffix ?? '.vercel.app',
      customComDomains: parsed.domainPolicy?.customComDomains === true,
      sites: Array.isArray(parsed.projects) ? parsed.projects : []
    };
  } catch (error) {
    return {
      ok: false,
      deploymentState: 'UNAVAILABLE',
      canonicalDomainsVerified: false,
      requiredSuffix: '.vercel.app',
      customComDomains: false,
      sites: [],
      error: redact(error?.message ?? error)
    };
  }
}

function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function verifyIntegrity() {
  const file = integrityPath();
  if (!fs.existsSync(file)) {
    return { state: app.isPackaged ? 'FAILED' : 'NOT_RUN', entries: 0, verified: 0, failures: app.isPackaged ? ['INTEGRITY_MANIFEST_MISSING'] : [] };
  }

  try {
    const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
    const entries = Array.isArray(manifest.entries) ? manifest.entries : [];
    const failures = [];
    let verified = 0;

    for (const entry of entries) {
      const scope = String(entry.scope ?? '');
      const relative = String(entry.path ?? '');
      const root = scope === 'app' ? app.getAppPath() : scope === 'resources' ? process.resourcesPath : null;
      if (!root) {
        failures.push(`INVALID_SCOPE:${scope}:${relative}`);
        continue;
      }
      const target = safeResolve(root, relative);
      if (!target || !fs.existsSync(target)) {
        failures.push(`MISSING:${scope}:${relative}`);
        continue;
      }
      const stat = fs.statSync(target, { throwIfNoEntry: false });
      if (!stat?.isFile()) {
        failures.push(`NOT_FILE:${scope}:${relative}`);
        continue;
      }
      if (Number(entry.bytes) !== stat.size) {
        failures.push(`SIZE:${scope}:${relative}`);
        continue;
      }
      if (String(entry.sha256).toLowerCase() !== sha256File(target)) {
        failures.push(`SHA256:${scope}:${relative}`);
        continue;
      }
      verified += 1;
    }

    return {
      state: entries.length > 0 && failures.length === 0 && verified === entries.length ? 'VERIFIED' : 'FAILED',
      sourceSha: String(manifest.sourceSha ?? ''),
      entries: entries.length,
      verified,
      failures
    };
  } catch (error) {
    return { state: 'FAILED', entries: 0, verified: 0, failures: [`PARSE:${redact(error?.message ?? error)}`] };
  }
}

function defaultLocalState() {
  return {
    schemaVersion: 1,
    tasks: [],
    recentProjects: [],
    lastProject: null,
    updatedAt: new Date().toISOString()
  };
}

function normalizeLocalState(value) {
  const base = defaultLocalState();
  const tasks = Array.isArray(value?.tasks) ? value.tasks.slice(0, MAX_TASKS) : [];
  const recentProjects = Array.isArray(value?.recentProjects) ? value.recentProjects.slice(0, MAX_RECENT_PROJECTS) : [];
  return {
    ...base,
    tasks,
    recentProjects,
    lastProject: value?.lastProject && typeof value.lastProject === 'object' ? value.lastProject : recentProjects[0] ?? null,
    updatedAt: String(value?.updatedAt ?? base.updatedAt)
  };
}

function readLocalState() {
  try {
    const file = statePath();
    if (!fs.existsSync(file)) return defaultLocalState();
    return normalizeLocalState(JSON.parse(fs.readFileSync(file, 'utf8')));
  } catch (error) {
    logFailure('local-state-read', error);
    return defaultLocalState();
  }
}

function writeLocalState(nextState) {
  const normalized = normalizeLocalState({ ...nextState, updatedAt: new Date().toISOString() });
  const file = statePath();
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(temp, JSON.stringify(normalized, null, 2), { encoding: 'utf8', flag: 'wx' });
  fs.renameSync(temp, file);
  return normalized;
}

function sanitizeTaskText(raw) {
  const text = String(raw ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim();
  if (text.length < 2) throw new Error('DEVAPI_TASK_TEXT_TOO_SHORT');
  if (text.length > MAX_TASK_TEXT) throw new Error('DEVAPI_TASK_TEXT_TOO_LONG');
  return text;
}

function createDraftTask(raw) {
  const text = sanitizeTaskText(raw);
  const state = readLocalState();
  const task = {
    taskId: `local_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
    title: text.length > 58 ? `${text.slice(0, 55)}…` : text,
    request: text,
    state: 'WAITING_RUNTIME',
    runtimeState: 'BLOCKED_EXTERNAL',
    reasonCode: 'MODEL_RUNTIME_NOT_CONNECTED_TO_DESKTOP',
    project: state.lastProject,
    createdAt: new Date().toISOString()
  };
  state.tasks.unshift(task);
  state.tasks = state.tasks.slice(0, MAX_TASKS);
  writeLocalState(state);
  return task;
}

async function pickProjectDirectory() {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'DevAPI ile çalışılacak proje klasörünü seç',
    buttonLabel: 'Klasörü Aç',
    properties: ['openDirectory', 'dontAddToRecent']
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const selected = path.resolve(result.filePaths[0]);
  const stat = fs.statSync(selected, { throwIfNoEntry: false });
  if (!stat?.isDirectory()) throw new Error('DEVAPI_PROJECT_DIRECTORY_INVALID');
  const descriptor = {
    name: path.basename(selected) || selected,
    path: selected,
    selectedAt: new Date().toISOString()
  };
  const state = readLocalState();
  state.recentProjects = [descriptor, ...state.recentProjects.filter((item) => item?.path !== selected)].slice(0, MAX_RECENT_PROJECTS);
  state.lastProject = descriptor;
  writeLocalState(state);
  return descriptor;
}

function userDataWritable() {
  try {
    const dir = app.getPath('userData');
    fs.mkdirSync(dir, { recursive: true });
    const target = path.join(dir, `.health-${process.pid}-${Date.now()}.tmp`);
    fs.writeFileSync(target, 'ok', { encoding: 'utf8', flag: 'wx' });
    const value = fs.readFileSync(target, 'utf8');
    fs.unlinkSync(target);
    return value === 'ok';
  } catch (error) {
    logFailure('user-data-write', error);
    return false;
  }
}

function healthSnapshot() {
  const surfaces = Object.keys(SURFACES).map(surfaceDescriptor);
  const manifest = manifestSnapshot();
  const integrity = verifyIntegrity();
  const checks = [
    { id: 'bundle', state: surfaces.length === 5 && surfaces.every((item) => item?.exists) ? 'PASS' : 'FAILED', detail: `${surfaces.filter((item) => item?.exists).length}/5 yüzey bulundu` },
    { id: 'manifest', state: manifest.ok && manifest.sites.length === 5 ? 'PASS' : 'FAILED', detail: manifest.ok ? `${manifest.sites.length}/5 manifest kaydı` : 'Manifest okunamadı' },
    { id: 'domain-policy', state: manifest.requiredSuffix === '.vercel.app' && manifest.customComDomains === false ? 'PASS' : 'FAILED', detail: `${manifest.requiredSuffix} · customCom=${manifest.customComDomains}` },
    { id: 'integrity', state: integrity.state === 'VERIFIED' || (!app.isPackaged && integrity.state === 'NOT_RUN') ? 'PASS' : 'FAILED', detail: `${integrity.verified}/${integrity.entries} dosya doğrulandı` },
    { id: 'user-data', state: userDataWritable() ? 'PASS' : 'FAILED', detail: 'Yerel kullanıcı veri dizini yazma/okuma testi' },
    { id: 'protocol', state: protocol.isProtocolHandled('devapi') ? 'PASS' : 'FAILED', detail: 'devapi:// güvenli yerel protokolü' }
  ];
  const failed = checks.filter((check) => check.state !== 'PASS');
  return {
    state: failed.length === 0 ? 'HEALTHY' : 'FAILED',
    checks,
    integrity,
    manifest: {
      deploymentState: manifest.deploymentState,
      canonicalDomainsVerified: manifest.canonicalDomainsVerified,
      requiredSuffix: manifest.requiredSuffix,
      sites: manifest.sites.length
    },
    runtime: {
      appVersion: app.getVersion(),
      electronVersion: process.versions.electron,
      chromiumVersion: process.versions.chrome,
      nodeVersion: process.versions.node,
      packaged: app.isPackaged,
      platform: process.platform,
      arch: process.arch,
      modelRuntime: 'BLOCKED_EXTERNAL'
    },
    checkedAt: new Date().toISOString()
  };
}

function trustedSender(event) {
  const senderUrl = String(event?.senderFrame?.url ?? '');
  if (!senderUrl.startsWith('devapi://desktop/')) throw new Error('DEVAPI_IPC_UNTRUSTED_SENDER');
}

function isPrivateOrLocalHostname(hostname) {
  const host = String(hostname).toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host === '::1') return true;
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host)) return true;
  const match = host.match(/^172\.(\d+)\./);
  return Boolean(match && Number(match[1]) >= 16 && Number(match[1]) <= 31);
}

function assertExternalUrl(raw) {
  const value = new URL(String(raw ?? ''));
  if (value.protocol !== 'https:') throw new Error('DEVAPI_EXTERNAL_HTTPS_REQUIRED');
  if (value.username || value.password) throw new Error('DEVAPI_EXTERNAL_USERINFO_BLOCKED');
  if (isPrivateOrLocalHostname(value.hostname)) throw new Error('DEVAPI_EXTERNAL_PRIVATE_HOST_BLOCKED');
  return value.toString();
}

async function writeSmokeEvidence() {
  const target = process.env.DEVAPI_SMOKE_OUTPUT;
  if (!target) return;
  try {
    const health = healthSnapshot();
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, JSON.stringify({
      schemaVersion: 1,
      state: health.state === 'HEALTHY' ? 'PACKAGED_RUNTIME_VERIFIED' : 'FAILED',
      rendererLoaded: true,
      sourceSha: health.integrity.sourceSha ?? '',
      health
    }, null, 2), 'utf8');
  } catch (error) {
    logFailure('smoke-evidence', error);
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1040,
    minHeight: 700,
    backgroundColor: '#f2f2f1',
    title: 'DevAPI',
    show: false,
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'build', 'icon.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      spellcheck: false
    }
  });

  mainWindow = win;
  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event, url) => {
    if (url !== 'devapi://desktop/index.html') event.preventDefault();
  });
  win.webContents.on('render-process-gone', (_event, details) => logFailure('renderer-gone', new Error(`${details.reason}:${details.exitCode}`)));
  win.webContents.on('did-fail-load', (_event, code, description, url) => logFailure('renderer-load', new Error(`${code}:${description}:${url}`)));
  win.webContents.once('did-finish-load', () => void writeSmokeEvidence());
  void win.loadURL('devapi://desktop/index.html');
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  app.whenReady().then(() => {
    registerLocalProtocol();
    session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);

    ipcMain.handle('devapi:list-surfaces', (event) => { trustedSender(event); return Object.keys(SURFACES).map(surfaceDescriptor); });
    ipcMain.handle('devapi:get-surface', (event, key) => { trustedSender(event); return surfaceDescriptor(String(key)); });
    ipcMain.handle('devapi:get-manifest', (event) => { trustedSender(event); return manifestSnapshot(); });
    ipcMain.handle('devapi:get-health', (event) => { trustedSender(event); return healthSnapshot(); });
    ipcMain.handle('devapi:get-local-state', (event) => { trustedSender(event); return readLocalState(); });
    ipcMain.handle('devapi:create-draft-task', (event, text) => { trustedSender(event); return createDraftTask(text); });
    ipcMain.handle('devapi:pick-project', async (event) => { trustedSender(event); return pickProjectDirectory(); });
    ipcMain.handle('devapi:get-build-info', (event) => {
      trustedSender(event);
      return {
        appVersion: app.getVersion(),
        electronVersion: process.versions.electron,
        chromiumVersion: process.versions.chrome,
        nodeVersion: process.versions.node,
        packaged: app.isPackaged,
        platform: process.platform,
        arch: process.arch
      };
    });
    ipcMain.handle('devapi:open-external', async (event, url) => {
      trustedSender(event);
      const safeUrl = assertExternalUrl(url);
      await shell.openExternal(safeUrl);
      return true;
    });

    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  }).catch((error) => {
    logFailure('ready', error);
    app.exit(1);
  });
}

process.on('unhandledRejection', (reason) => logFailure('unhandled-rejection', reason));
process.on('uncaughtException', (error) => {
  logFailure('uncaught-exception', error);
  app.exit(1);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
