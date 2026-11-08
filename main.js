'use strict';
// Vila Empreendedora - Electron main process
const { app, BrowserWindow, Menu, dialog, ipcMain, net, protocol, session, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { autoUpdater } = require('electron-updater');

const APP_ROOT = path.join(__dirname, 'src');
const START_URL = 'app://game/index.html';
const UPDATE_EVERY_MS = 4 * 60 * 60 * 1000;
const MAX_BACKUP_BYTES = 20 * 1024 * 1024;

let win = null;

// The game is served from a private app:// scheme so the page has a stable origin
// (its saved data survives updates) and a strict Content-Security-Policy works.
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });
  app.whenReady().then(start);
}

function start() {
  protocol.handle('app', (request) => {
    const { pathname } = new URL(request.url);
    const file = path.normalize(path.join(APP_ROOT, decodeURIComponent(pathname)));
    if (!file.startsWith(APP_ROOT + path.sep)) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });
  // The game never needs camera, microphone, notifications, etc.
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
  Menu.setApplicationMenu(null);
  registerIpc();
  createWindow();
  setupUpdater();
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 640,
    minHeight: 480,
    show: false,
    backgroundColor: '#16130f',
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false,
    },
  });
  win.once('ready-to-show', () => { win.maximize(); win.show(); });
  win.on('closed', () => { win = null; });

  // External links open in the default browser; the window itself never navigates away.
  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith('app://game/')) return;
    event.preventDefault();
    openExternal(url);
  });
  win.loadURL(START_URL);
}

function openExternal(url) {
  if (/^https?:\/\//i.test(url)) shell.openExternal(url);
}

function registerIpc() {
  ipcMain.handle('app:version', () => app.getVersion());

  ipcMain.handle('backup:save', async (_e, json, suggestedName) => {
    if (typeof json !== 'string' || json.length > MAX_BACKUP_BYTES) return { ok: false, error: 'dados inválidos' };
    const name = String(suggestedName || 'backup.json').replace(/[^\w.-]/g, '_');
    const r = await dialog.showSaveDialog(win, {
      title: 'Salvar backup',
      defaultPath: path.join(app.getPath('documents'), name),
      filters: [{ name: 'Backup da Vila Empreendedora', extensions: ['json'] }],
    });
    if (r.canceled || !r.filePath) return { ok: false };
    try {
      await fs.promises.writeFile(r.filePath, json, 'utf8');
      return { ok: true, path: r.filePath };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('backup:open', async () => {
    const r = await dialog.showOpenDialog(win, {
      title: 'Restaurar backup',
      properties: ['openFile'],
      filters: [{ name: 'Backup da Vila Empreendedora', extensions: ['json'] }],
    });
    if (r.canceled || !r.filePaths.length) return { ok: false };
    try {
      const file = r.filePaths[0];
      const { size } = await fs.promises.stat(file);
      if (size > MAX_BACKUP_BYTES) return { ok: false, error: 'arquivo grande demais' };
      return { ok: true, text: await fs.promises.readFile(file, 'utf8') };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });
}

// Auto-update from GitHub Releases: check at start and every few hours,
// download in the background, then ask to restart. Offline errors stay silent.
function setupUpdater() {
  if (!app.isPackaged) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  let asked = null;

  autoUpdater.on('error', (err) => console.warn('update check failed:', err && err.message));
  autoUpdater.on('update-downloaded', async (info) => {
    if (asked === info.version || !win) return;
    asked = info.version;
    const { response } = await dialog.showMessageBox(win, {
      type: 'info',
      title: 'Atualização pronta',
      message: `A versão ${info.version} da Vila Empreendedora foi baixada.`,
      detail: 'Reiniciar agora? Seu progresso é salvo antes. Se escolher "Depois", a atualização é instalada quando você fechar o jogo.',
      buttons: ['Reiniciar agora', 'Depois'],
      defaultId: 0,
      cancelId: 1,
    });
    if (response === 0) autoUpdater.quitAndInstall();
  });

  const check = () => autoUpdater.checkForUpdates().catch(() => {});
  check();
  setInterval(check, UPDATE_EVERY_MS);
}

app.on('window-all-closed', () => app.quit());
