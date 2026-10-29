// Mon View - renderer
const $ = s => document.querySelector(s);
const stage = $('#stage'), wrap = $('#wrap');
const BGS = ['#2B2D31', '#1F2126', '#000000', '#808080', '#FFFFFF', '#E8E2D6'];
const NAMES = { jpg: 'JPG', jpeg: 'JPG', jfif: 'JPG', tif: 'TIFF', tiff: 'TIFF' };

const S = { bg: BGS[0], alpha: true, upscale: false, pixel: true };
let list = [], idx = -1, file = null, info = null, dec = null;
let el = null, iw = 0, ih = 0, rot = 0, scale = 1, tx = 0, ty = 0, mode = 'fit', token = 0;
let version = '';

/* ---------- tiện ích ---------- */
const baseName = p => p.split(/[\\/]/).pop();
const extOf = p => (p.split('.').pop() || '').toLowerCase();
const fmtSize = b => b < 1024 ? b + ' B' : b < 1048576 ? (b / 1024).toFixed(0) + ' KB' : (b / 1048576).toFixed(1) + ' MB';
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let toastT = 0;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  t.style.animation = 'none'; void t.offsetWidth; t.style.animation = '';
  clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 2200);
}

/* ---------- hiển thị ---------- */
const effW = () => (rot % 180 ? ih : iw), effH = () => (rot % 180 ? iw : ih);
function stageSize() { const r = stage.getBoundingClientRect(); return { w: r.width, h: r.height }; }
function fitScale() { const { w, h } = stageSize(); return Math.min(w / effW(), h / effH(), S.upscale ? Infinity : 1); }
function center() { const { w, h } = stageSize(); tx = (w - effW() * scale) / 2; ty = (h - effH() * scale) / 2; }
function clampPan() {
  const { w, h } = stageSize(), W = effW() * scale, H = effH() * scale;
  tx = W <= w ? (w - W) / 2 : Math.min(0, Math.max(w - W, tx));
  ty = H <= h ? (h - H) / 2 : Math.min(0, Math.max(h - H, ty));
}
function layoutEl() {
  if (!el) return;
  wrap.style.width = effW() + 'px'; wrap.style.height = effH() + 'px';
  Object.assign(el.style, { width: iw + 'px', height: ih + 'px', left: (effW() - iw) / 2 + 'px', top: (effH() - ih) / 2 + 'px', transform: `rotate(${rot}deg)` });
}
function apply(anim) {
  if (!el) return;
  wrap.classList.toggle('anim', !!anim);
  wrap.style.transform = `translate(${tx}px,${ty}px) scale(${scale})`;
  wrap.style.setProperty('--ck', (16 / scale) + 'px');
  wrap.classList.toggle('pixel', S.pixel && scale >= 2);
  wrap.classList.toggle('checker', S.alpha);
  const { w, h } = stageSize();
  stage.classList.toggle('pan', effW() * scale > w + 1 || effH() * scale > h + 1);
  const z = Math.round(scale * 100 * (dec?.scaled || 1)) + '%';
  $('#zVal').textContent = z; $('#ztip').textContent = z;
  renderMeta();
}
function flashZoom() { const t = $('#ztip'); t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 280); }
function setFit(anim) { mode = 'fit'; scale = fitScale(); center(); apply(anim); }
function zoomAt(f, cx, cy, anim) {
  if (!el) return;
  const { w, h } = stageSize(); if (cx == null) { cx = w / 2; cy = h / 2; }
  const ns = Math.min(32, Math.max(0.01, scale * f));
  tx = cx - (cx - tx) * ns / scale; ty = cy - (cy - ty) * ns / scale; scale = ns; mode = 'free';
  clampPan(); apply(anim); flashZoom();
}
function toggle11(cx, cy) {
  if (!el) return;
  if (mode === 'one') setFit(true);
  else {
    if (cx != null) { zoomAt(1 / scale, cx, cy, true); } else { scale = 1; center(); clampPan(); apply(true); flashZoom(); }
    mode = 'one';
  }
  flashZoom();
}
function rotate(d) { if (!el) return; rot = (rot + d + 360) % 360; layoutEl(); if (mode === 'fit') setFit(true); else { center(); clampPan(); apply(true); } }

function renderMeta() {
  if (!file || !info) { $('#fmeta').innerHTML = ''; return; }
  const ext = extOf(file), parts = [];
  if (!el) { $('#fmeta').innerHTML = `<span class="tag">${NAMES[ext] || ext.toUpperCase()}</span><span>${fmtSize(info.size)}</span>`; return; }
  const W = dec ? dec.fullW : iw, H = dec ? dec.fullH : ih;
  parts.push(`<span><b>${W} × ${H}</b></span>`, `<span class="tag">${NAMES[ext] || ext.toUpperCase()}</span>`);
  if (info.frames > 1) parts.push(`<span>${info.frames} frame</span>`);
  if (dec?.layers) parts.push(`<span>${dec.layers} layer</span>`);
  if (dec?.pages > 1) parts.push(`<span>${dec.pages} trang</span>`);
  if (dec?.scaled > 1) parts.push(`<span title="Ảnh quá lớn, đang hiển thị bản thu nhỏ">xem thu nhỏ 1/${dec.scaled}</span>`);
  if (rot) parts.push(`<span>xoay ${rot}°</span>`);
  parts.push(`<span>${fmtSize(info.size)}</span>`, `<span>Zoom <b>${$('#zVal').textContent}</b></span>`);
  $('#fmeta').innerHTML = parts.join('');
}
function renderHeader() {
  const has = !!file;
  $('#fileInfo').hidden = !has; $('#empty').hidden = has || !!$('#msg').textContent && !$('#msg').hidden;
  $('#fname').textContent = has ? baseName(file) : '';
  document.title = has ? `${baseName(file)} - Mon View` : 'Mon View'; // tên ảnh hiện trên taskbar
  $('#fidx').textContent = has && list.length ? `${idx + 1} / ${list.length}` : '';
  $('#fpath').textContent = has ? file : 'Chưa mở ảnh';
  $('#fpath').title = has ? file : '';
  stage.classList.toggle('single', list.length < 2);
  ['#zOut', '#zIn', '#zVal'].forEach(s => { $(s).disabled = !el; });
  if (!el) $('#zVal').textContent = '–';
}
function showMsg(title, sub) {
  const m = $('#msg');
  if (!title) { m.hidden = true; m.textContent = ''; return; }
  m.innerHTML = `<b>${esc(title)}</b><span>${esc(sub || '')}</span>`; m.hidden = false;
}

/* ---------- mở ảnh ---------- */
const preloadCache = new Map();
function preloadNeighbors() {
  if (list.length < 2) return;
  const want = [list[(idx + 1) % list.length], list[(idx - 1 + list.length) % list.length]].filter(p => !['psd', 'psb', 'tga', 'tif', 'tiff'].includes(extOf(p)));
  for (const k of [...preloadCache.keys()]) if (!want.includes(k)) preloadCache.delete(k);
  for (const p of want) if (!preloadCache.has(p)) { const im = new Image(); im.crossOrigin = 'anonymous'; im.src = mv.fileUrl(p); preloadCache.set(p, im); }
}

async function load(p) {
  const my = ++token;
  file = p; info = null;
  const ldT = setTimeout(() => { if (my === token) $('#loading').hidden = false; }, 150);
  renderHeader();
  try {
    info = await mv.fileInfo(p);
    let node, d = null;
    if (info.decoded) {
      d = await mv.decode(p);
      if (my !== token) return;
      node = document.createElement('canvas'); node.width = d.width; node.height = d.height;
      const px = new Uint8ClampedArray(d.data.buffer, d.data.byteOffset, d.data.byteLength);
      node.getContext('2d').putImageData(new ImageData(px, d.width, d.height), 0, 0);
      d.data = null;
    } else {
      node = new Image(); node.crossOrigin = 'anonymous'; node.decoding = 'async'; node.draggable = false;
      node.src = mv.fileUrl(p);
      await node.decode();
      if (my !== token) return;
    }
    dec = d; el = node; iw = d ? d.width : node.naturalWidth; ih = d ? d.height : node.naturalHeight; rot = 0;
    wrap.replaceChildren(el); wrap.hidden = false; showMsg(null);
    layoutEl(); setFit(false);
    preloadNeighbors();
  } catch (err) {
    if (my !== token) return;
    el = null; dec = null; iw = ih = 0; wrap.replaceChildren(); wrap.hidden = true;
    const m = String(err && err.message || err);
    if (m.includes('NO_COMPOSITE')) showMsg('File này không lưu ảnh gộp', 'Trong Photoshop bật "Maximize PSD and PSB File Compatibility" rồi lưu lại file.');
    else if (m.includes('ENOENT')) showMsg('Không tìm thấy file', 'File đã bị xoá hoặc đổi tên.');
    else showMsg('Không mở được ảnh này', baseName(p));
    renderMeta();
  } finally {
    clearTimeout(ldT);
    if (my === token) { $('#loading').hidden = true; renderHeader(); }
  }
}

async function openFile(p) {
  const same = list.findIndex(x => x.toLowerCase() === p.toLowerCase());
  if (same < 0) {
    list = await mv.listDir(p);
    idx = list.findIndex(x => x.toLowerCase() === p.toLowerCase());
    if (idx < 0) { list = [p]; idx = 0; }
  } else idx = same;
  await load(list[idx]);
}
function nav(d) { if (list.length < 2) return; idx = (idx + d + list.length) % list.length; load(list[idx]); }
function navTo(i) { if (!list.length) return; idx = i; load(list[idx]); }

/* ---------- lệnh ---------- */
async function copyImage() {
  if (!el) return;
  const c = document.createElement('canvas'); c.width = iw; c.height = ih;
  c.getContext('2d').drawImage(el, 0, 0);
  await mv.copyImage(c.toDataURL('image/png'));
  toast('Đã sao chép ảnh');
}
async function copyPath() { if (!file) return; await mv.copyText(file); toast('Đã sao chép đường dẫn'); }
async function trashCurrent() {
  if (!file) return;
  const name = baseName(file);
  try { await mv.trash(file); } catch { toast('Không xoá được file'); return; }
  list.splice(idx, 1);
  toast(`Đã chuyển "${name}" vào thùng rác`);
  if (!list.length) { file = null; el = null; info = null; dec = null; idx = -1; wrap.replaceChildren(); showMsg(null); renderHeader(); renderMeta(); return; }
  idx = Math.min(idx, list.length - 1); load(list[idx]);
}
async function openDialog() { const p = await mv.openDialog(); if (p) openFile(p); }
function setBg(c) { S.bg = c; stage.style.setProperty('--bg', c); $('#bgDot').style.background = c; mv.setSettings({ bg: c }); }
function setAlpha(v) { S.alpha = v; $('#bAlpha').classList.toggle('on', v); wrap.classList.toggle('checker', v); mv.setSettings({ alpha: v }); }
function cycleBg() { setBg(BGS[(BGS.indexOf(S.bg) + 1) % BGS.length]); }

/* ---------- chuột ---------- */
let wAcc = 0, wLast = 0, navLast = 0;
stage.addEventListener('wheel', e => {
  e.preventDefault();
  if (e.ctrlKey) { if (!el) return; const r = stage.getBoundingClientRect(); zoomAt(Math.pow(1.0018, -e.deltaY), e.clientX - r.left, e.clientY - r.top); return; }
  const now = performance.now();
  if (now - wLast > 250) wAcc = 0;
  wLast = now; wAcc += e.deltaY;
  if (Math.abs(wAcc) >= 50 && now - navLast >= 110) { nav(wAcc > 0 ? 1 : -1); wAcc = 0; navLast = now; }
}, { passive: false });

let drag = null;
stage.addEventListener('mousedown', e => { if (e.button === 1) e.preventDefault(); }); // tắt auto-scroll của chuột giữa
stage.addEventListener('pointerdown', e => {
  if (e.button === 1) { e.preventDefault(); mv.fullscreen(); return; }
  if (e.button !== 0 || e.target.closest('.nav,.updcard,.empty button')) return;
  closeCtx();
  if (!el) return;
  drag = { x: e.clientX, y: e.clientY, tx, ty, moved: false };
  stage.setPointerCapture(e.pointerId); stage.classList.add('grabbing');
});
stage.addEventListener('pointermove', e => {
  if (!drag) return;
  if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) > 3) drag.moved = true;
  tx = drag.tx + e.clientX - drag.x; ty = drag.ty + e.clientY - drag.y; clampPan(); apply(false);
  if (mode === 'fit' && drag.moved) mode = 'free';
});
const endDrag = () => { drag = null; stage.classList.remove('grabbing'); };
stage.addEventListener('pointerup', endDrag); stage.addEventListener('pointercancel', endDrag);
stage.addEventListener('dblclick', e => { if (e.target.closest('.nav,.updcard,.empty')) return; const r = stage.getBoundingClientRect(); toggle11(e.clientX - r.left, e.clientY - r.top); });
stage.addEventListener('auxclick', e => e.preventDefault());
document.addEventListener('contextmenu', e => { e.preventDefault(); if (e.target.closest('.top,.dlg')) return; openCtx(e.clientX, e.clientY); });

$('#navL').onclick = () => nav(-1); $('#navR').onclick = () => nav(1);
$('#zIn').onclick = () => zoomAt(1.25, null, null, true);
$('#zOut').onclick = () => zoomAt(1 / 1.25, null, null, true);
$('#zVal').onclick = () => toggle11();
$('#bAlpha').onclick = () => setAlpha(!S.alpha);
$('#bBg').onclick = cycleBg;
$('#bSet').onclick = () => openSettings();
$('#bOpen').onclick = openDialog;

/* ---------- kéo thả ---------- */
let dragDepth = 0;
document.addEventListener('dragenter', e => { if (e.dataTransfer?.types?.includes('Files')) { dragDepth++; $('#drop').hidden = false; } });
document.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; $('#drop').hidden = true; } });
document.addEventListener('dragover', e => e.preventDefault());
document.addEventListener('drop', e => {
  e.preventDefault(); dragDepth = 0; $('#drop').hidden = true;
  const f = e.dataTransfer.files[0]; if (!f) return;
  const p = mv.pathForFile(f); if (p) openFile(p);
});

/* ---------- toàn màn hình ---------- */
mv.onFullscreen(on => {
  document.body.classList.toggle('fs', on);
  stage.querySelector('.fshint')?.remove();
  if (on) { const h = document.createElement('div'); h.className = 'fshint'; h.textContent = 'Toàn màn hình · chuột giữa hoặc Esc để thoát'; stage.append(h); }
});
new ResizeObserver(() => { if (!el) return; if (mode === 'fit') setFit(false); else { clampPan(); apply(false); } }).observe(stage);

/* ---------- menu chuột phải ---------- */
const IC = {
  fit: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>', one: '<rect x="5" y="5" width="14" height="14" rx="2"/><path d="M10 9l2-1v8"/>',
  fs: '<path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3"/>',
  rot: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5"/>', rotl: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5"/>',
  grid: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 12h16M12 4v16"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
  link: '<path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  win: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M12 13v4M10 15h4"/>',
  app: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><path d="M17.5 14v7M14 17.5h7"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>', open: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v1M3 7v10a2 2 0 0 0 2 2h12l4-8H7l-4 8"/>',
  set: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>'
};
const ic = k => `<svg viewBox="0 0 24 24">${IC[k]}</svg>`;
let ctxEl = null;
function closeCtx() { ctxEl?.remove(); ctxEl = null; }
function openCtx(x, y) {
  closeCtx();
  if ($('.veil')) return;
  ctxEl = document.createElement('div'); ctxEl.className = 'ctx';
  const has = !!el, f = !!file;
  const it = (a, icon, label, key, on = true) => `<div class="it${on ? '' : ' dis'}" data-a="${a}">${ic(icon)}${label}${key ? `<span class="k">${key}</span>` : ''}</div>`;
  ctxEl.innerHTML = [
    it('open', 'open', 'Mở ảnh…', 'Ctrl+O'),
    '<hr>',
    mode === 'one' ? it('fit', 'fit', 'Vừa khung', 'Ctrl+0', has) : it('one', 'one', 'Kích thước thật 1:1', 'Ctrl+0', has),
    it('fs', 'fs', document.body.classList.contains('fs') ? 'Thoát toàn màn hình' : 'Toàn màn hình', 'Chuột giữa'),
    it('rotr', 'rot', 'Xoay phải 90°', 'R', has),
    it('rotl', 'rotl', 'Xoay trái 90°', 'Shift+R', has),
    '<hr>',
    it('alpha', 'grid', `${S.alpha ? 'Tắt' : 'Bật'} nền caro (alpha)`, 'A'),
    `<div class="sw">${BGS.map(c => `<i style="background:${c}" data-c="${c}" class="${c === S.bg ? 'on' : ''}" title="Màu nền ${c}"></i>`).join('')}</div>`,
    '<hr>',
    it('copy', 'copy', 'Sao chép ảnh', 'Ctrl+C', has),
    it('path', 'link', 'Sao chép đường dẫn', 'Ctrl+Shift+C', f),
    it('folder', 'folder', 'Mở thư mục chứa ảnh', 'Ctrl+E', f),
    it('newwin', 'win', 'Mở trong cửa sổ mới', 'Ctrl+N'),
    it('openwith', 'app', 'Mở bằng app khác…', '', f),
    '<hr>',
    it('trash', 'trash', 'Chuyển vào thùng rác', 'Del', f),
    it('settings', 'set', 'Cài đặt', '')
  ].join('');
  document.body.append(ctxEl);
  const m = ctxEl.getBoundingClientRect();
  ctxEl.style.left = Math.max(6, Math.min(x, innerWidth - m.width - 6)) + 'px';
  ctxEl.style.top = Math.max(6, Math.min(y, innerHeight - m.height - 6)) + 'px';
  ctxEl.onclick = e => {
    const c = e.target.closest('[data-c]');
    if (c) { setBg(c.dataset.c); ctxEl.querySelectorAll('.sw i').forEach(i => i.classList.toggle('on', i === c)); return; }
    const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return;
    closeCtx(); run(a);
  };
}
function run(a) {
  switch (a) {
    case 'open': return openDialog();
    case 'fit': return setFit(true);
    case 'one': mode = 'free'; return toggle11();
    case 'fs': return mv.fullscreen();
    case 'rotr': return rotate(90);
    case 'rotl': return rotate(-90);
    case 'alpha': return setAlpha(!S.alpha);
    case 'copy': return copyImage();
    case 'path': return copyPath();
    case 'folder': return file && mv.showInFolder(file);
    case 'newwin': return mv.newWindow(file);
    case 'openwith': return file && mv.openWith(file);
    case 'trash': return trashCurrent();
    case 'settings': return openSettings();
  }
}
document.addEventListener('pointerdown', e => { if (ctxEl && !ctxEl.contains(e.target)) closeCtx(); }, true);
window.addEventListener('blur', closeCtx);

/* ---------- dialog ---------- */
function openDialogEl(html, onClick) {
  closeDialog(); closeCtx();
  const v = document.createElement('div'); v.className = 'veil';
  v.innerHTML = `<div class="dragstrip"></div><div class="dlg" role="dialog">${html}</div>`;
  document.body.append(v);
  v.addEventListener('click', e => { if (e.target === v || e.target.closest('[data-x]')) closeDialog(); else onClick?.(e, v); });
  return v;
}
function closeDialog() { document.querySelector('.veil')?.remove(); }
const closeBtn = '<button class="ibtn" data-x title="Đóng (Esc)" aria-label="Đóng"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>';
const ASSOC = [['png', 'PNG'], ['jpg', 'JPG'], ['jpeg', 'JPEG'], ['gif', 'GIF'], ['webp', 'WEBP'], ['ico', 'ICO'], ['bmp', 'BMP'], ['psd', 'PSD'], ['psb', 'PSB'], ['tga', 'TGA'], ['tif', 'TIF'], ['tiff', 'TIFF']];

function openSettings() {
  const v = openDialogEl(`
    <header>Cài đặt${closeBtn}</header>
    <section><h4>Ứng dụng mặc định</h4>
      <div class="fmts" id="fmts">${ASSOC.map(([e, n]) => `<button class="fmt" data-ext="${e}" title="Đặt Mon View làm app mặc định cho file .${e}"><b>${n}</b><span class="st">…</span></button>`).join('')}</div>
      <div class="row"><span class="grow note">Bấm vào một định dạng để đặt Mon View làm app mặc định, hoặc đặt cho tất cả cùng lúc.</span>
        <button class="btn2" id="sDefApps" title="Mở trang Default apps của Windows">Default apps</button>
        <button class="btn-main" id="sDefAll">Đặt mặc định tất cả</button></div>
    </section>
    <section><h4>Khung xem</h4>
      <div class="row"><span class="grow">Màu nền ngoài ảnh</span><div class="sw" id="sSw">${BGS.map(c => `<i style="background:${c}" class="${c === S.bg ? 'on' : ''}" data-c="${c}" title="${c}"></i>`).join('')}</div><input type="color" id="sPick" value="${S.bg}" title="Chọn màu khác"></div>
      <label class="row"><input type="checkbox" id="sAlpha" ${S.alpha ? 'checked' : ''}><span class="grow">Hiện nền caro cho ảnh có alpha</span><kbd>A</kbd></label>
      <label class="row"><input type="checkbox" id="sUp" ${S.upscale ? 'checked' : ''}><span class="grow">Phóng to ảnh nhỏ cho đầy khung khi Fit</span></label>
      <label class="row"><input type="checkbox" id="sPix" ${S.pixel ? 'checked' : ''}><span class="grow">Hiện rõ từng pixel khi zoom từ 200%</span></label>
    </section>
    <section><h4>Phiên bản</h4>
      <div class="row"><span class="grow">Mon View v${esc(version)}</span>
        <button class="btn2" id="sNew"><svg viewBox="0 0 24 24"><path d="M12 3l1.8 4.6L18 9l-4.2 1.4L12 15l-1.8-4.6L6 9l4.2-1.4zM19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/></svg>What's new</button>
        <button class="btn2" id="sUpd"><svg viewBox="0 0 24 24"><path d="M21 12a9 9 0 0 0-15-6.7L3 8M3 3v5h5M3 12a9 9 0 0 0 15 6.7l3-2.7M21 21v-5h-5"/></svg>Kiểm tra cập nhật</button></div>
    </section>`, (e, v) => {
    const c = e.target.closest('[data-c]');
    if (c) { setBg(c.dataset.c); v.querySelectorAll('#sSw i').forEach(i => i.classList.toggle('on', i === c)); v.querySelector('#sPick').value = c.dataset.c; return; }
    const fmt = e.target.closest('.fmt'); if (fmt) { if (!fmt.classList.contains('ok')) setDefault([fmt.dataset.ext]); return; }
    if (e.target.closest('#sDefAll')) { setDefault(ASSOC.map(a => a[0])); return; }
    if (e.target.closest('#sDefApps')) mv.openDefaultApps();
    if (e.target.closest('#sNew')) openWhatsNew();
    if (e.target.closest('#sUpd')) mv.updateCheck();
  });
  v.querySelector('#sPick').oninput = e => { setBg(e.target.value); v.querySelectorAll('#sSw i').forEach(i => i.classList.remove('on')); };
  v.querySelector('#sAlpha').onchange = e => setAlpha(e.target.checked);
  v.querySelector('#sUp').onchange = e => { S.upscale = e.target.checked; mv.setSettings({ upscale: S.upscale }); if (mode === 'fit') setFit(true); };
  v.querySelector('#sPix').onchange = e => { S.pixel = e.target.checked; mv.setSettings({ pixel: S.pixel }); apply(false); };
  refreshAssoc();
}
let assocBusy = false;
async function setDefault(exts) {
  if (assocBusy) return;
  assocBusy = true;
  const box = $('#fmts'), all = $('#sDefAll');
  box?.querySelectorAll('.fmt').forEach(b => { if (exts.includes(b.dataset.ext)) { b.classList.add('busy'); b.querySelector('.st').textContent = 'Đang đặt…'; } });
  if (all) all.disabled = true;
  const r = await mv.assocSet(exts).catch(() => ({ ok: [], failed: exts }));
  assocBusy = false;
  if (all) all.disabled = false;
  box?.querySelectorAll('.fmt.busy').forEach(b => b.classList.remove('busy'));
  await refreshAssoc();
  if (!r.failed.length) toast(exts.length > 1 ? 'Đã đặt Mon View làm app mặc định cho mọi định dạng ảnh' : `Đã đặt Mon View mở file .${exts[0]}`);
  else if (exts.length === 1) { toast('Windows không cho đặt tự động, hãy chọn Mon View trong hộp thoại'); mv.assocPick(exts[0]); }
  else toast(`Chưa đặt được: ${r.failed.map(e => e.toUpperCase()).join(', ')}. Bấm vào từng định dạng để thử lại`);
}
async function refreshAssoc() {
  const box = $('#fmts'); if (!box) return;
  const st = await mv.assocStatus().catch(() => ({}));
  box.querySelectorAll('.fmt').forEach(b => {
    const ok = !!st[b.dataset.ext];
    b.classList.toggle('ok', ok);
    if (!b.classList.contains('busy')) b.querySelector('.st').textContent = ok ? '✓ Mon View' : 'Đặt';
  });
}
window.addEventListener('focus', refreshAssoc);
mv.onAssocRefresh(refreshAssoc);

async function openWhatsNew() {
  const w = await mv.whatsNew().catch(() => null); if (!w) return;
  const d = w.date ? w.date.split('-').reverse().join('/') : '';
  const grp = (t, a) => a && a.length ? `<h5>${t}</h5><ul>${a.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '';
  const pend = upd.state === 'available' || upd.state === 'ready' ? `<div class="row"><span class="grow muted">Có bản mới v${esc(upd.version)}</span><button class="btn-main" id="wUpd">Cập nhật</button></div>` : '';
  openDialogEl(`<header>What's new <span class="sub">v${esc(w.version)}${d ? ' · ' + d : ''}</span>${closeBtn}</header>
    <section class="wn">${grp('Mới', w.new)}${grp('Cải thiện', w.improved)}${grp('Sửa lỗi', w.fixed)}${pend}</section>`,
  e => { if (e.target.closest('#wUpd')) { closeDialog(); upd.state === 'ready' ? mv.updateInstall() : startDownload(); } });
}

/* ---------- cập nhật ---------- */
let upd = { state: 'idle' };
const ub = $('#bUpd');
function renderUpd(s, fromEvent) {
  upd = s;
  ub.classList.remove('checking', 'latestok', 'avail');
  const card = $('#updcard');
  switch (s.state) {
    case 'checking': ub.classList.add('checking'); ub.title = 'Kiểm tra cập nhật · Đang kiểm tra…'; break;
    case 'latest':
      ub.classList.add('latestok'); ub.title = 'Kiểm tra cập nhật · Đã là bản mới nhất'; $('#latest').hidden = false;
      if (fromEvent && s.manual) toast('Bạn đang dùng bản mới nhất');
      card.hidden = true; break;
    case 'available':
      ub.classList.add('avail'); ub.title = `Có bản mới v${s.version} · bấm để cập nhật`; $('#latest').hidden = true;
      card.innerHTML = `<b>Có bản mới v${esc(s.version)}</b><span class="muted">Tải về và cài đặt chỉ mất một lát.</span><div class="row"><button class="btn2" data-u="later">Để sau</button><button class="btn-main" data-u="dl">Cập nhật</button></div>`;
      card.hidden = false; break;
    case 'downloading':
      ub.classList.add('avail'); ub.title = `Đang tải v${s.version}… ${s.percent || 0}%`;
      card.innerHTML = `<b>Đang tải v${esc(s.version || '')}</b><div class="bar"><i style="width:${s.percent || 0}%"></i></div><span class="muted">${s.percent || 0}%</span>`;
      card.hidden = false; break;
    case 'ready':
      ub.classList.add('avail'); ub.title = `Đã tải xong v${s.version} · bấm để cài`;
      card.innerHTML = `<b>Đã tải xong v${esc(s.version)}</b><span class="muted">Mon View sẽ đóng lại, cài bản mới rồi tự mở lại.</span><div class="row"><button class="btn2" data-u="later">Để sau</button><button class="btn-main" data-u="install">Cài ngay</button></div>`;
      card.hidden = false; break;
    case 'error':
      ub.title = 'Kiểm tra cập nhật · Không kết nối được';
      if (fromEvent && s.manual) toast('Không kiểm tra được cập nhật. Kiểm tra lại kết nối mạng.');
      break;
    default: ub.title = 'Kiểm tra cập nhật';
  }
}
function startDownload() { renderUpd({ state: 'downloading', version: upd.version, percent: 0 }); mv.updateDownload(); }
$('#updcard').addEventListener('click', e => {
  const a = e.target.closest('[data-u]')?.dataset.u;
  if (a === 'later') $('#updcard').hidden = true;
  if (a === 'dl') startDownload();
  if (a === 'install') mv.updateInstall();
});
ub.onclick = () => {
  if (upd.state === 'available') { $('#updcard').hidden = false; return; }
  if (upd.state === 'ready') { mv.updateInstall(); return; }
  if (upd.state === 'downloading') { $('#updcard').hidden = false; return; }
  mv.updateCheck();
};
mv.onUpdateState(s => renderUpd(s, true));

/* ---------- phím ---------- */
document.addEventListener('keydown', e => {
  const k = e.key, ctrl = e.ctrlKey || e.metaKey;
  if (k === 'Escape') {
    if ($('.veil')) closeDialog(); else if (ctxEl) closeCtx(); else if (document.body.classList.contains('fs')) mv.fullscreen(false);
    return;
  }
  if ($('.veil')) return;
  if (ctrl && (e.code === 'Digit0' || e.code === 'Numpad0')) { e.preventDefault(); toggle11(); return; }
  if (ctrl && k.toLowerCase() === 'o') { e.preventDefault(); openDialog(); return; }
  if (ctrl && k.toLowerCase() === 'n') { e.preventDefault(); mv.newWindow(file); return; }
  if (ctrl && k.toLowerCase() === 'w') { e.preventDefault(); window.close(); return; }
  if (ctrl && e.shiftKey && k.toLowerCase() === 'c') { e.preventDefault(); copyPath(); return; }
  if (ctrl && k.toLowerCase() === 'c') { e.preventDefault(); copyImage(); return; }
  if (ctrl && k.toLowerCase() === 'e') { e.preventDefault(); if (file) mv.showInFolder(file); return; }
  if (k === 'F11') { e.preventDefault(); mv.fullscreen(); return; }
  if (k === '+' || k === '=' || e.code === 'NumpadAdd') { e.preventDefault(); zoomAt(1.25, null, null, true); return; }
  if (k === '-' || k === '_' || e.code === 'NumpadSubtract') { e.preventDefault(); zoomAt(1 / 1.25, null, null, true); return; }
  if (ctrl) return;
  if (k === 'ArrowRight' || k === 'PageDown') { e.preventDefault(); nav(1); }
  else if (k === 'ArrowLeft' || k === 'PageUp') { e.preventDefault(); nav(-1); }
  else if (k === 'Home') navTo(0);
  else if (k === 'End') navTo(list.length - 1);
  else if (k === 'Delete') trashCurrent();
  else if (k === 'r' || k === 'R') rotate(e.shiftKey ? -90 : 90);
  else if (k === 'a' || k === 'A') setAlpha(!S.alpha);
  else if (k === 'b' || k === 'B') cycleBg();
  else if (k === 'f' || k === 'F') { if (el) setFit(true); }
});

/* ---------- khởi động ---------- */
mv.onOpenFile(p => openFile(p));
(async () => {
  const d = await mv.init();
  version = d.version;
  Object.assign(S, d.settings);
  stage.style.setProperty('--bg', S.bg); $('#bgDot').style.background = S.bg;
  $('#bAlpha').classList.toggle('on', S.alpha);
  document.body.classList.toggle('fs', d.fullscreen);
  renderUpd(await mv.updateState(), false);
  if (d.file) await openFile(d.file); else renderHeader();
})();
