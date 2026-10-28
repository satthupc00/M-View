// Mon View - main process
const { app, BrowserWindow, ipcMain, dialog, shell, clipboard, nativeImage, Menu, protocol, net, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const { pathToFileURL } = require('url');
const { execFile } = require('child_process');
const { Worker } = require('worker_threads');

// ---- Đọc phím Ctrl càng sớm càng tốt (Ctrl + double click ngoài Explorer = cửa sổ mới) ----
let getKeyState = null;
function isCtrlDown() {
  if (process.platform !== 'win32') return false;
  try {
    if (!getKeyState) {
      const koffi = require('koffi');
      getKeyState = koffi.load('user32.dll').func('short __stdcall GetAsyncKeyState(int vKey)');
    }
    return (getKeyState(0x11) & 0x8000) !== 0; // VK_CONTROL
  } catch { return false; }
}
const ctrlAtLaunch = isCtrlDown();

const EXTS = ['png', 'jpg', 'jpeg', 'jfif', 'gif', 'webp', 'ico', 'bmp', 'psd', 'psb', 'tga', 'tif', 'tiff'];
const DECODED = new Set(['psd', 'psb', 'tga', 'tif', 'tiff']);
const extOf = p => path.extname(p).slice(1).toLowerCase();
const isImage = p => EXTS.includes(extOf(p));
const ASSOC_DIR = path.join(os.tmpdir(), 'MonView-assoc');
const inAssocDir = p => path.resolve(p).toLowerCase().startsWith(ASSOC_DIR.toLowerCase());

function fileArgs(argv, cwd) {
  const out = [];
  for (const a of argv.slice(1)) {
    if (!a || a.startsWith('-') || a === '.') continue;
    const p = path.resolve(cwd || process.cwd(), a);
    try { if (fs.statSync(p).isFile() && isImage(p)) out.push(p); } catch {}
  }
  return out;
}

const gotLock = app.requestSingleInstanceLock({ ctrl: ctrlAtLaunch, files: fileArgs(process.argv) });
if (!gotLock) { app.quit(); return; }

app.setAppUserModelId('com.mondiro.monview');
protocol.registerSchemesAsPrivileged([{ scheme: 'mview', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);

// ---- Settings ----
const SETTINGS_FILE = path.join(app.getPath('userData'), 'settings.json');
const DEFAULTS = { bounds: null, maximized: false, bg: '#2B2D31', alpha: true, upscale: false, pixel: true };
let settings = { ...DEFAULTS };
try { settings = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')) }; } catch {}
let saveTimer = null;
function saveSettings() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { try { fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2)); } catch {} }, 300);
}

// ---- Windows ----
const pending = new Map(); // webContents.id -> file
let lastFocused = null;

function boundsVisible(b) {
  return screen.getAllDisplays().some(d => {
    const a = d.workArea;
    return b.x + 80 < a.x + a.width && b.x + b.width - 80 > a.x && b.y >= a.y - 10 && b.y + 40 < a.y + a.height;
  });
}

function createWindow(file, { cascade = false } = {}) {
  let b = { width: 1200, height: 800 };
  if (settings.bounds && boundsVisible(settings.bounds)) b = { ...settings.bounds };
  const from = cascade && lastFocused && !lastFocused.isDestroyed() ? lastFocused : null;
  if (from) { const p = from.getNormalBounds(); b = { x: p.x + 32, y: p.y + 32, width: p.width, height: p.height }; }

  const win = new BrowserWindow({
    ...b, minWidth: 520, minHeight: 340, show: false,
    title: 'Mon View', backgroundColor: '#1F2126',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#1F2126', symbolColor: '#FFFFFF', height: 58 },
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: false, spellcheck: false }
  });
  if (settings.maximized && !from) win.maximize();
  pending.set(win.webContents.id, file || null);
  win.once('ready-to-show', () => win.show());
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  const remember = () => {
    if (win.isDestroyed() || win.isFullScreen()) return;
    settings.maximized = win.isMaximized();
    if (!win.isMaximized() && !win.isMinimized()) settings.bounds = win.getNormalBounds();
    saveSettings();
  };
  win.on('resize', remember); win.on('move', remember); win.on('close', remember);
  win.on('focus', () => { lastFocused = win; });
  win.on('enter-full-screen', () => win.webContents.send('fullscreen', true));
  win.on('leave-full-screen', () => win.webContents.send('fullscreen', false));
  lastFocused = win;
  return win;
}

function openFile(file, newWindow) {
  if (inAssocDir(file)) { BrowserWindow.getAllWindows().forEach(w => w.webContents.send('assoc-refresh')); return; }
  const target = !newWindow && lastFocused && !lastFocused.isDestroyed() ? lastFocused : null;
  if (target) {
    target.webContents.send('open-file', file);
    if (target.isMinimized()) target.restore();
    target.show(); target.focus();
  } else createWindow(file, { cascade: !!newWindow });
}

app.on('second-instance', (_e, argv, cwd, data) => {
  const files = data && Array.isArray(data.files) ? data.files : fileArgs(argv, cwd);
  const ctrl = (data && data.ctrl) || isCtrlDown();
  if (!files.length) {
    if (ctrl || !lastFocused || lastFocused.isDestroyed()) createWindow(null, { cascade: true });
    else { lastFocused.show(); lastFocused.focus(); }
    return;
  }
  openFile(files[0], ctrl);
});

app.whenReady().then(() => {
  Menu.setApplicationMenu(null); // bỏ menu mặc định (Ctrl+0, Ctrl+= của Electron)
  protocol.handle('mview', async req => {
    try {
      const p = decodeURIComponent(new URL(req.url).pathname.slice(1));
      const res = await net.fetch(pathToFileURL(p).toString());
      const h = new Headers(res.headers); h.set('access-control-allow-origin', '*');
      return new Response(res.body, { status: res.status, headers: h });
    } catch { return new Response('', { status: 404 }); }
  });
  const files = fileArgs(process.argv);
  const first = files.find(f => !inAssocDir(f));
  createWindow(first || null);
  setTimeout(() => checkUpdate(false), 3000);
});
app.on('window-all-closed', () => app.quit());

// ---- Thông tin file ----
function gifFrames(buf) {
  if (buf.toString('ascii', 0, 3) !== 'GIF') return 0;
  let p = 13; const f0 = buf[10];
  if (f0 & 0x80) p += 3 * (1 << ((f0 & 7) + 1));
  let n = 0;
  const skipBlocks = () => { while (p < buf.length) { const s = buf[p++]; if (!s) break; p += s; } };
  while (p < buf.length) {
    const b = buf[p++];
    if (b === 0x2C) {
      n++; p += 8; const f = buf[p++];
      if (f & 0x80) p += 3 * (1 << ((f & 7) + 1));
      p++; skipBlocks();
    } else if (b === 0x21) { p++; skipBlocks(); } else break;
  }
  return n;
}
function webpFrames(buf) {
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') return 0;
  let p = 12, n = 0;
  while (p + 8 <= buf.length) {
    const id = buf.toString('ascii', p, p + 4), len = buf.readUInt32LE(p + 4);
    if (id === 'ANMF') n++;
    p += 8 + len + (len & 1);
  }
  return n;
}

ipcMain.handle('init', e => ({
  file: pending.get(e.sender.id) || null,
  version: app.getVersion(),
  settings: { bg: settings.bg, alpha: settings.alpha, upscale: settings.upscale, pixel: settings.pixel },
  fullscreen: BrowserWindow.fromWebContents(e.sender)?.isFullScreen() || false
}));

ipcMain.handle('list-dir', async (_e, file) => {
  try {
    const dir = path.dirname(file);
    const names = (await fsp.readdir(dir, { withFileTypes: true })).filter(d => d.isFile() && isImage(d.name)).map(d => d.name);
    const coll = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
    names.sort(coll.compare);
    return names.map(n => path.join(dir, n));
  } catch { return [file]; }
});

ipcMain.handle('file-info', async (_e, file) => {
  const st = await fsp.stat(file);
  const ext = extOf(file);
  const info = { size: st.size, ext, decoded: DECODED.has(ext) };
  if (ext === 'gif' || ext === 'webp') {
    const buf = await fsp.readFile(file);
    info.frames = ext === 'gif' ? gifFrames(buf) : webpFrames(buf);
  }
  return info;
});

// ---- Giải mã PSD/PSB/TIFF/TGA trong worker riêng ----
let worker = null, jobId = 0;
const jobs = new Map();
function getWorker() {
  if (worker) return worker;
  worker = new Worker(path.join(__dirname, 'decoder.js'));
  worker.on('message', m => { const j = jobs.get(m.id); if (!j) return; jobs.delete(m.id); m.error ? j.reject(new Error(m.error)) : j.resolve(m); });
  worker.on('error', err => { for (const j of jobs.values()) j.reject(err); jobs.clear(); worker = null; });
  worker.on('exit', () => { worker = null; });
  return worker;
}
ipcMain.handle('decode', (_e, file) => new Promise((resolve, reject) => {
  const id = ++jobId; jobs.set(id, { resolve, reject });
  getWorker().postMessage({ id, file });
}).then(({ id, ...rest }) => rest));

// ---- Lệnh ----
ipcMain.handle('settings-set', (_e, patch) => { Object.assign(settings, patch); saveSettings(); });
ipcMain.handle('copy-image', (_e, dataUrl) => clipboard.writeImage(nativeImage.createFromDataURL(dataUrl)));
ipcMain.handle('copy-text', (_e, t) => clipboard.writeText(t));
ipcMain.handle('show-in-folder', (_e, f) => shell.showItemInFolder(f));
ipcMain.handle('open-with', (_e, f) => { execFile('rundll32.exe', ['shell32.dll,OpenAs_RunDLL', f]); });
ipcMain.handle('trash', async (_e, f) => { await shell.trashItem(f); return true; });
ipcMain.handle('new-window', (_e, f) => { createWindow(f || null, { cascade: true }); });
ipcMain.handle('fullscreen', (e, on) => { const w = BrowserWindow.fromWebContents(e.sender); w.setFullScreen(on == null ? !w.isFullScreen() : !!on); });
ipcMain.handle('open-dialog', async e => {
  const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), {
    title: 'Mở ảnh', properties: ['openFile'],
    filters: [{ name: 'Ảnh', extensions: EXTS }, { name: 'Tất cả', extensions: ['*'] }]
  });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle('whatsnew', async () => JSON.parse(await fsp.readFile(path.join(__dirname, 'whatsnew.json'), 'utf8')));

// ---- App mặc định (Windows 10 chỉ cho người dùng tự chọn) ----
function reg(args) {
  return new Promise(res => execFile('reg.exe', args, { windowsHide: true }, (err, out) => res(err ? '' : out)));
}
const regValue = (out, name) => {
  const line = out.split(/\r?\n/).find(l => l.trim().startsWith(name));
  return line ? line.trim().split(/\s{2,}|\t/).slice(2).join(' ').trim() : '';
};
const ASSOC_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'bmp', 'psd', 'psb', 'tga', 'tif', 'tiff'];
ipcMain.handle('assoc-status', async () => {
  if (process.platform !== 'win32') return {};
  const exe = path.basename(process.execPath).toLowerCase();
  const out = {};
  await Promise.all(ASSOC_EXTS.map(async ext => {
    let prog = regValue(await reg(['query', `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\FileExts\\.${ext}\\UserChoice`, '/v', 'ProgId']), 'ProgId');
    if (!prog) prog = regValue(await reg(['query', `HKCR\\.${ext}`, '/ve']), '(');
    let cmd = prog ? regValue(await reg(['query', `HKCR\\${prog}\\shell\\open\\command`, '/ve']), '(') : '';
    out[ext] = !!cmd && cmd.toLowerCase().includes(exe);
  }));
  return out;
});
ipcMain.handle('assoc-pick', async (_e, ext) => {
  await fsp.mkdir(ASSOC_DIR, { recursive: true });
  const f = path.join(ASSOC_DIR, `Mon View.${ext}`);
  await fsp.writeFile(f, Buffer.alloc(0));
  execFile('rundll32.exe', ['shell32.dll,OpenAs_RunDLL', f]);
});
ipcMain.handle('open-default-apps', () => shell.openExternal('ms-settings:defaultapps'));

// ---- Tự cập nhật (GitHub Releases) ----
let updater = null, updState = { state: 'idle' };
function sendUpd(s) { updState = s; BrowserWindow.getAllWindows().forEach(w => w.webContents.send('update-state', s)); }
function getUpdater() {
  if (updater || !app.isPackaged) return updater;
  updater = require('electron-updater').autoUpdater;
  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = true;
  updater.on('checking-for-update', () => sendUpd({ state: 'checking' }));
  updater.on('update-available', i => sendUpd({ state: 'available', version: i.version }));
  updater.on('update-not-available', () => sendUpd({ state: 'latest' }));
  updater.on('download-progress', p => sendUpd({ state: 'downloading', version: updState.version, percent: Math.round(p.percent) }));
  updater.on('update-downloaded', i => sendUpd({ state: 'ready', version: i.version }));
  updater.on('error', err => sendUpd({ state: 'error', manual: updState.manual, message: String(err && err.message || err) }));
  return updater;
}
async function checkUpdate(manual) {
  const u = getUpdater();
  if (!u) { sendUpd({ state: 'latest', dev: true, manual }); return; }
  if (['downloading', 'ready'].includes(updState.state)) { sendUpd(updState); return; }
  updState.manual = manual;
  try { await u.checkForUpdates(); } catch (err) { sendUpd({ state: 'error', manual, message: String(err.message || err) }); }
}
ipcMain.handle('update-check', () => checkUpdate(true));
ipcMain.handle('update-state', () => updState);
ipcMain.handle('update-download', () => getUpdater()?.downloadUpdate());
ipcMain.handle('update-install', () => getUpdater()?.quitAndInstall(true, true));
