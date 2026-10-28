const { contextBridge, ipcRenderer, webUtils } = require('electron');

const call = (ch, ...a) => ipcRenderer.invoke(ch, ...a);
const on = (ch, fn) => ipcRenderer.on(ch, (_e, ...a) => fn(...a));

contextBridge.exposeInMainWorld('mv', {
  init: () => call('init'),
  listDir: f => call('list-dir', f),
  fileInfo: f => call('file-info', f),
  decode: f => call('decode', f),
  setSettings: p => call('settings-set', p),
  copyImage: d => call('copy-image', d),
  copyText: t => call('copy-text', t),
  showInFolder: f => call('show-in-folder', f),
  openWith: f => call('open-with', f),
  trash: f => call('trash', f),
  newWindow: f => call('new-window', f),
  fullscreen: on => call('fullscreen', on),
  openDialog: () => call('open-dialog'),
  whatsNew: () => call('whatsnew'),
  assocStatus: () => call('assoc-status'),
  assocPick: ext => call('assoc-pick', ext),
  openDefaultApps: () => call('open-default-apps'),
  updateCheck: () => call('update-check'),
  updateState: () => call('update-state'),
  updateDownload: () => call('update-download'),
  updateInstall: () => call('update-install'),
  pathForFile: file => webUtils.getPathForFile(file),
  fileUrl: p => 'mview://f/' + encodeURIComponent(p),
  onOpenFile: fn => on('open-file', fn),
  onFullscreen: fn => on('fullscreen', fn),
  onUpdateState: fn => on('update-state', fn),
  onAssocRefresh: fn => on('assoc-refresh', fn)
});
