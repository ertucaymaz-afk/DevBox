const { app, BrowserWindow, ipcMain, shell, session } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

const SURFACES = Object.freeze({
  main: { label: 'Ana Ürün', folder: 'main' },
  runtime: { label: 'API Runtime', folder: 'runtime' },
  docs: { label: 'Dokümantasyon', folder: 'docs' },
  status: { label: 'Durum Merkezi', folder: 'status' },
  console: { label: 'Agent Console', folder: 'console' }
});

function surfacesRoot() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'devapi-sites')
    : path.resolve(__dirname, '..', '..', 'cloud', 'devapi-sites');
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
    url: exists ? pathToFileURL(filePath).toString() : null
  };
}

function manifestSnapshot() {
  const manifestPath = path.join(surfacesRoot(), 'sites.manifest.json');
  try {
    const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    return {
      ok: true,
      path: manifestPath,
      deploymentState: parsed.deploymentState ?? 'NOT_RUN',
      canonicalDomainsVerified: parsed.canonicalDomainsVerified === true,
      requiredSuffix: parsed.domainPolicy?.requiredSuffix ?? '.vercel.app',
      sites: Array.isArray(parsed.projects) ? parsed.projects : []
    };
  } catch (error) {
    return {
      ok: false,
      deploymentState: 'UNAVAILABLE',
      canonicalDomainsVerified: false,
      requiredSuffix: '.vercel.app',
      sites: [],
      error: String(error?.message ?? error)
    };
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1080,
    minHeight: 720,
    backgroundColor: '#f7f8fa',
    title: 'DevAPI',
    show: false,
    autoHideMenuBar: true,
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

  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    const own = pathToFileURL(path.join(__dirname, 'renderer', 'index.html')).toString();
    if (url !== own) event.preventDefault();
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));

  ipcMain.handle('devapi:list-surfaces', () => Object.keys(SURFACES).map(surfaceDescriptor));
  ipcMain.handle('devapi:get-surface', (_event, key) => surfaceDescriptor(String(key)));
  ipcMain.handle('devapi:get-manifest', () => manifestSnapshot());
  ipcMain.handle('devapi:get-build-info', () => ({
    appVersion: app.getVersion(),
    electronVersion: process.versions.electron,
    chromiumVersion: process.versions.chrome,
    nodeVersion: process.versions.node,
    packaged: app.isPackaged,
    platform: process.platform,
    arch: process.arch
  }));
  ipcMain.handle('devapi:open-external', async (_event, url) => {
    const value = String(url ?? '');
    if (!/^https:\/\//i.test(value)) throw new Error('Yalnız HTTPS bağlantıları açılabilir.');
    await shell.openExternal(value);
    return true;
  });

  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
