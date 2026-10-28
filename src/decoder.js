// Worker giải mã các định dạng Chromium không tự đọc được: PSD, PSB, TIFF, TGA
const { parentPort } = require('worker_threads');
const fs = require('fs');
const path = require('path');

// Chromium giới hạn kích thước canvas, ảnh quá lớn sẽ được thu nhỏ để xem
const MAX_SIDE = 16384, MAX_AREA = 160e6;

function downscale(w, h, data) {
  const k = Math.ceil(Math.max(w / MAX_SIDE, h / MAX_SIDE, Math.sqrt((w * h) / MAX_AREA), 1));
  if (k <= 1) return { width: w, height: h, data, scaled: 1 };
  const nw = Math.floor(w / k), nh = Math.floor(h / k), out = new Uint8ClampedArray(nw * nh * 4), n = k * k;
  for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let dy = 0; dy < k; dy++) {
      let i = ((y * k + dy) * w + x * k) * 4;
      for (let dx = 0; dx < k; dx++, i += 4) { r += data[i]; g += data[i + 1]; b += data[i + 2]; a += data[i + 3]; }
    }
    const o = (y * nw + x) * 4;
    out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = a / n;
  }
  return { width: nw, height: nh, data: out, scaled: k };
}

function countLayers(list) {
  let n = 0;
  for (const l of list || []) n += l.children ? countLayers(l.children) : 1;
  return n;
}

function decodePsd(buf) {
  const { readPsd, initializeCanvas } = require('ag-psd');
  // không có canvas trong worker: chỉ cần mảng pixel thô
  initializeCanvas(() => { throw new Error('NO_CANVAS'); }, (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }));
  const psd = readPsd(buf, { skipLayerImageData: true, skipThumbnail: true, skipLinkedFilesData: true, useImageData: true });
  if (!psd.imageData) throw new Error('NO_COMPOSITE');
  return { width: psd.width, height: psd.height, data: psd.imageData.data, layers: countLayers(psd.children) };
}

function decodeTiff(buf) {
  const UTIF = require('utif');
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const ifds = UTIF.decode(ab);
  const pages = ifds.filter(i => i.t256 && i.t257);
  const page = pages.reduce((a, b) => (b.t256[0] * b.t257[0] > a.t256[0] * a.t257[0] ? b : a), pages[0]);
  UTIF.decodeImage(ab, page, ifds);
  return { width: page.width, height: page.height, data: new Uint8ClampedArray(UTIF.toRGBA8(page)), pages: pages.length };
}

function decodeTga(b) {
  const idLen = b[0], cmapType = b[1], type = b[2];
  const cmapStart = b.readUInt16LE(3), cmapLen = b.readUInt16LE(5), cmapDepth = b[7];
  const w = b.readUInt16LE(12), h = b.readUInt16LE(14), bpp = b[16], desc = b[17];
  if (![1, 2, 3, 9, 10, 11].includes(type) || !w || !h) throw new Error('BAD_TGA');
  let p = 18 + idLen;
  const readColor = (src, i, depth, out, o) => {
    if (depth === 32) { out[o] = src[i + 2]; out[o + 1] = src[i + 1]; out[o + 2] = src[i]; out[o + 3] = src[i + 3]; }
    else if (depth === 24) { out[o] = src[i + 2]; out[o + 1] = src[i + 1]; out[o + 2] = src[i]; out[o + 3] = 255; }
    else if (depth === 15 || depth === 16) {
      const v = src[i] | (src[i + 1] << 8);
      out[o] = ((v >> 10) & 31) * 255 / 31; out[o + 1] = ((v >> 5) & 31) * 255 / 31; out[o + 2] = (v & 31) * 255 / 31;
      out[o + 3] = depth === 16 && (desc & 15) ? (v & 0x8000 ? 255 : 0) : 255;
    } else { out[o] = out[o + 1] = out[o + 2] = src[i]; out[o + 3] = 255; }
  };
  let cmap = null;
  if (cmapType === 1) {
    const cb = Math.ceil(cmapDepth / 8);
    cmap = new Uint8Array(cmapLen * 4);
    for (let i = 0; i < cmapLen; i++) readColor(b, p + i * cb, cmapDepth, cmap, i * 4);
    p += cmapLen * cb;
  }
  const px = Math.ceil(bpp / 8), n = w * h;
  // gom dữ liệu pixel thô (giải nén RLE nếu có)
  let raw;
  if (type >= 9) {
    raw = new Uint8Array(n * px);
    let o = 0;
    while (o < raw.length && p < b.length) {
      const c = b[p++], cnt = (c & 127) + 1;
      if (c & 128) { for (let k = 0; k < cnt; k++) for (let j = 0; j < px; j++) raw[o++] = b[p + j]; p += px; }
      else { const len = cnt * px; b.copy(raw, o, p, p + len); o += len; p += len; }
    }
  } else raw = b.subarray(p, p + n * px);
  const out = new Uint8ClampedArray(n * 4);
  const top = desc & 0x20, right = desc & 0x10, kind = type & 7;
  let alphaSeen = false;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sy = top ? y : h - 1 - y, sx = right ? w - 1 - x : x;
    const i = (sy * w + sx) * px, o = (y * w + x) * 4;
    if (kind === 1) { const ci = (raw[i] | (px > 1 ? raw[i + 1] << 8 : 0)) - cmapStart; out.set(cmap.subarray(ci * 4, ci * 4 + 4), o); }
    else if (kind === 3) { out[o] = out[o + 1] = out[o + 2] = raw[i]; out[o + 3] = px === 2 ? raw[i + 1] : 255; }
    else readColor(raw, i, bpp, out, o);
    if (out[o + 3]) alphaSeen = true;
  }
  if (!alphaSeen) for (let o = 3; o < out.length; o += 4) out[o] = 255; // 32-bit nhưng kênh alpha trống
  return { width: w, height: h, data: out };
}

parentPort.on('message', ({ id, file }) => {
  try {
    const buf = fs.readFileSync(file);
    const ext = path.extname(file).slice(1).toLowerCase();
    let r;
    if (ext === 'psd' || ext === 'psb') r = decodePsd(buf);
    else if (ext === 'tif' || ext === 'tiff') r = decodeTiff(buf);
    else if (ext === 'tga') r = decodeTga(buf);
    else throw new Error('UNSUPPORTED');
    const fullW = r.width, fullH = r.height;
    const d = downscale(r.width, r.height, r.data instanceof Uint8ClampedArray ? r.data : new Uint8ClampedArray(r.data.buffer, r.data.byteOffset, r.data.byteLength));
    const data = new Uint8Array(d.data.buffer, d.data.byteOffset, d.data.byteLength);
    parentPort.postMessage({ id, width: d.width, height: d.height, fullW, fullH, scaled: d.scaled, layers: r.layers, pages: r.pages, data }, [data.buffer]);
  } catch (err) {
    parentPort.postMessage({ id, error: String(err && err.message || err) });
  }
});
