// Đọc "ảnh gộp" (composite) của PSD/PSB mà không phân tích layer.
// Chỉ cần độ dài từng khối để nhảy tới phần Image Data ở cuối file, nên file có layer/hiệu ứng lạ vẫn mở được.
// Hỗ trợ: Bitmap, Grayscale, Indexed, RGB, CMYK, Multichannel, Duotone, Lab; 1/8/16/32-bit; nén Raw/RLE/ZIP.
const zlib = require('zlib');

const MODE = { BITMAP: 0, GRAY: 1, INDEXED: 2, RGB: 3, CMYK: 4, MULTI: 7, DUOTONE: 8, LAB: 9 };

// Đọc tên + số layer thật (bỏ các mốc mở/đóng group) — chỉ để hiện thông tin, lỗi thì bỏ qua
function countLayers(b, start, end, psb) {
  try {
    let p = start;
    const infoLen = psb ? Number(b.readBigUInt64BE(p)) : b.readUInt32BE(p); p += psb ? 8 : 4;
    if (!infoLen) {
      // ảnh 16/32-bit: thông tin layer nằm trong khối Lr16/Lr32 ở cuối phần layer
      const at = Math.max(...['8BIMLr16', '8BIMLr32', '8B64Lr16', '8B64Lr32'].map(k => b.indexOf(k, p, 'latin1')));
      if (at < 0 || at > end) return { count: 0, mergedAlpha: false };
      p = at + 8 + (psb ? 8 : 4);
      return { ...records(b, p, end, psb), global: true };
    }
    return records(b, p, end, psb);
  } catch { return { count: 0, mergedAlpha: false }; }
}
function records(b, p, end, psb) {
  const raw = b.readInt16BE(p); p += 2;
  const n = Math.abs(raw);
  let count = 0;
  for (let i = 0; i < n && p < end; i++) {
    p += 16;
    const ch = b.readUInt16BE(p); p += 2 + ch * (psb ? 10 : 6);
    p += 12; // '8BIM' + blend key + opacity, clipping, flags, filler
    const extra = b.readUInt32BE(p); p += 4;
    const extraEnd = p + extra;
    let q = p;
    q += 4 + b.readUInt32BE(q); // mask data
    q += 4 + b.readUInt32BE(q); // blending ranges
    q += Math.floor((b[q] + 1 + 3) / 4) * 4; // tên pascal, đệm 4 byte
    let divider = false;
    while (q + 12 <= extraEnd) {
      const sig = b.toString('latin1', q, q + 4); if (sig !== '8BIM' && sig !== '8B64') break;
      const key = b.toString('latin1', q + 4, q + 8);
      const long8 = psb && ['LMsk', 'Lr16', 'Lr32', 'Layr', 'Mt16', 'Mt32', 'Mtrn', 'Alph', 'FMsk', 'lnk2', 'FEid', 'FXid', 'PxSD'].includes(key);
      const len = long8 ? Number(b.readBigUInt64BE(q + 8)) : b.readUInt32BE(q + 8);
      const data = q + 8 + (long8 ? 8 : 4);
      if ((key === 'lsct' || key === 'lsdk') && b.readUInt32BE(data) > 0) divider = true;
      q = data + len;
      while (q < extraEnd && q < data + len + 4 && !/^8B(IM|64)$/.test(b.toString('latin1', q, q + 4))) q++; // bỏ byte đệm
    }
    if (!divider) count++;
    p = extraEnd;
  }
  return { count, mergedAlpha: raw < 0 };
}

// tên các kênh alpha (resource 1045 unicode, hoặc 1006 pascal)
function readAlphaNames(b, p, end) {
  let uni = null, pas = null;
  try {
    while (p + 12 <= end && b.toString('latin1', p, p + 4) === '8BIM') {
      const id = b.readUInt16BE(p + 4);
      let q = p + 6; q += (b[q] + 2) & ~1; // tên resource, đệm chẵn
      const size = b.readUInt32BE(q); q += 4;
      const e = q + size;
      if (id === 1045) {
        uni = [];
        while (q + 4 <= e) { const n = b.readUInt32BE(q); q += 4; let t = ''; for (let i = 0; i < n; i++, q += 2) t += String.fromCharCode(b.readUInt16BE(q)); uni.push(t.replace(/\0+$/, '')); }
      } else if (id === 1006) {
        pas = [];
        while (q < e) { const n = b[q]; pas.push(b.toString('latin1', q + 1, q + 1 + n)); q += 1 + n; }
      }
      p = e + (size & 1);
    }
  } catch {}
  return uni || pas || [];
}

function decodeComposite(b, { maxSide = 16384, maxArea = 160e6 } = {}) {
  if (b.toString('latin1', 0, 4) !== '8BPS') throw new Error('NOT_PSD');
  const version = b.readUInt16BE(4), psb = version === 2;
  const channels = b.readUInt16BE(12), h = b.readUInt32BE(14), w = b.readUInt32BE(18);
  const depth = b.readUInt16BE(22), mode = b.readUInt16BE(24);
  let p = 26;
  const cmLen = b.readUInt32BE(p); const cmStart = p + 4; p = cmStart + cmLen;
  const resLen = b.readUInt32BE(p);
  const alphaNames = readAlphaNames(b, p + 4, p + 4 + resLen);
  p += 4 + resLen;
  const lmStart = p;
  const lmLen = psb ? Number(b.readBigUInt64BE(p)) : b.readUInt32BE(p); p += (psb ? 8 : 4);
  const layers = countLayers(b, p, p + lmLen, psb);
  // khối Mtrn/Mt16/Mt32: Photoshop đánh dấu ảnh gộp có độ trong suốt
  const lmEnd = p + lmLen + (psb ? 8 : 4);
  const mergedTransparency = ['Mtrn', 'Mt16', 'Mt32'].some(k => ['8BIM', '8B64'].some(sg => { const i = b.indexOf(sg + k, p, 'latin1'); return i >= 0 && i < lmEnd; }));
  p += lmLen;
  if (p + 2 > b.length) throw new Error('NO_COMPOSITE');
  const comp = b.readUInt16BE(p); p += 2;

  // chọn hệ số thu nhỏ để vừa giới hạn canvas
  const k = Math.ceil(Math.max(w / maxSide, h / maxSide, Math.sqrt((w * h) / maxArea), 1));
  const nw = Math.floor(w / k) || 1, nh = Math.floor(h / k) || 1;
  const bpc = depth === 1 ? 0 : depth / 8;               // byte mỗi kênh mỗi pixel
  const rowBytes = depth === 1 ? Math.ceil(w / 8) : w * bpc;

  // các kênh cần dùng
  const colorCh = { [MODE.RGB]: 3, [MODE.CMYK]: 4, [MODE.LAB]: 3 }[mode] || 1;
  // kênh phụ đầu tiên là độ trong suốt khi: số layer âm, hoặc có kênh không tên (kênh alpha người dùng luôn có tên)
  const extraCh = channels - colorCh;
  const hasAlpha = extraCh > 0 && (layers.mergedAlpha || mergedTransparency || extraCh > alphaNames.length ||
    (layers.global && alphaNames[0] === 'Transparency' && alphaNames.length === extraCh));
  const useCh = Math.min(channels, colorCh + (hasAlpha ? 1 : 0));

  // RLE: bảng độ dài từng hàng của mọi kênh
  let rleLens = null;
  if (comp === 1) {
    const n = channels * h, sz = psb ? 4 : 2;
    rleLens = new Uint32Array(n);
    for (let i = 0; i < n; i++) rleLens[i] = psb ? b.readUInt32BE(p + i * 4) : b.readUInt16BE(p + i * 2);
    p += n * sz;
  }
  let zipData = null;
  if (comp === 2 || comp === 3) zipData = zlib.inflateSync(b.subarray(p));
  if (comp > 3) throw new Error('UNSUPPORTED_COMPRESSION_' + comp);

  const planes = [];
  // 32-bit là ánh sáng tuyến tính: giữ 16-bit để tách nền trắng rồi mới đổi gamma
  const hi = depth === 32;
  const row = Buffer.alloc(rowBytes), row8 = hi ? new Uint16Array(w) : new Uint8Array(w);
  const acc = k > 1 ? new Uint32Array(nw * nh) : null;
  let rleRow = 0, rawPos = p, zipPos = 0;

  const unpackBits = (src, s, len, out) => {
    let i = s, o = 0; const e = s + len;
    while (i < e && o < out.length) {
      const n = src[i++];
      if (n < 128) { const c = n + 1; src.copy(out, o, i, i + c); i += c; o += c; }
      else if (n > 128) { const c = 257 - n; out.fill(src[i++], o, o + c); o += c; }
    }
  };
  const to8 = () => {
    if (depth === 8) { for (let x = 0; x < w; x++) row8[x] = row[x]; }
    else if (depth === 16) { for (let x = 0; x < w; x++) row8[x] = row[x * 2]; }
    else if (depth === 32) {
      for (let x = 0; x < w; x++) {
        row8[x] = Math.round(Math.min(1, Math.max(0, row.readFloatBE(x * 4))) * 65535);
      }
    } else { for (let x = 0; x < w; x++) row8[x] = row[x >> 3] & (0x80 >> (x & 7)) ? 0 : 255; } // 1-bit: 1 = đen
  };
  // ZIP có dự đoán: cộng dồn theo hàng
  const unpredict = () => {
    if (comp !== 3) return;
    if (depth === 8) { for (let x = 1; x < w; x++) row[x] = (row[x] + row[x - 1]) & 255; }
    else if (depth === 16) { for (let x = 1; x < w; x++) row.writeUInt16BE((row.readUInt16BE(x * 2) + row.readUInt16BE(x * 2 - 2)) & 0xffff, x * 2); }
    else if (depth === 32) {
      const t = Buffer.from(row);
      for (let x = 1; x < rowBytes; x++) t[x] = (t[x] + t[x - 1]) & 255;
      for (let x = 0; x < w; x++) for (let j = 0; j < 4; j++) row[x * 4 + j] = t[j * w + x];
    }
  };

  for (let c = 0; c < channels; c++) {
    const want = c < useCh;
    const plane = want ? (hi ? new Uint16Array(nw * nh) : new Uint8Array(nw * nh)) : null;
    if (acc) acc.fill(0);
    for (let y = 0; y < h; y++) {
      if (comp === 1) {
        const len = rleLens[rleRow++];
        if (want) { row.fill(0); unpackBits(b, rawPos, len, row); }
        rawPos += len;
      } else if (comp === 0) {
        if (want) { row.fill(0); if (rawPos < b.length) b.copy(row, 0, rawPos, Math.min(b.length, rawPos + rowBytes)); }
        rawPos += rowBytes;
      } else {
        if (want) { zipData.copy(row, 0, zipPos, zipPos + rowBytes); unpredict(); }
        zipPos += rowBytes;
      }
      if (!want) continue;
      to8();
      if (!acc) { plane.set(row8, y * w); continue; }
      const ty = Math.floor(y / k); if (ty >= nh) continue;
      const base = ty * nw;
      for (let x = 0, tx = 0; tx < nw; tx++) { let s = 0; for (let j = 0; j < k; j++) s += row8[x++]; acc[base + tx] += s; }
    }
    if (want) {
      if (acc) { const n = k * k; for (let i = 0; i < plane.length; i++) plane[i] = acc[i] / n; }
      planes.push(plane);
    }
  }

  const N = nw * nh;
  let matted = false;
  if (hi) {
    const Ah = hasAlpha ? planes[colorCh] : null;
    for (let c = 0; c < planes.length; c++) {
      const src = planes[c], dst = new Uint8Array(N);
      if (c === colorCh) { for (let i = 0; i < N; i++) dst[i] = Math.round(src[i] / 257); }
      else for (let i = 0; i < N; i++) {
        let v = src[i] / 65535;
        if (Ah) { const a = Ah[i] / 65535; v = a > 0 ? (a < 1 ? (v - 1 + a) / a : v) : 0; }
        dst[i] = Math.round(Math.pow(Math.min(1, Math.max(0, v)), 1 / 2.2) * 255);
      }
      planes[c] = dst;
    }
    matted = true;
  }
  // ghép thành RGBA
  const out = new Uint8ClampedArray(nw * nh * 4);
  let A;
  if (mode === MODE.RGB) {
    for (let i = 0; i < N; i++) { out[i * 4] = planes[0][i]; out[i * 4 + 1] = planes[1][i]; out[i * 4 + 2] = planes[2][i]; }
  } else if (mode === MODE.CMYK) {
    // giá trị CMYK trong PSD lưu đảo (255 = không mực)
    const [C, M, Y, K] = planes;
    for (let i = 0; i < N; i++) { const kk = (K ? K[i] : 255) / 255; out[i * 4] = C[i] * kk; out[i * 4 + 1] = M[i] * kk; out[i * 4 + 2] = Y[i] * kk; }
  } else if (mode === MODE.LAB) {
    const [L, a, bb] = planes;
    const f = t => (t > 0.206893 ? t * t * t : (t - 16 / 116) / 7.787);
    const g = v => { v = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055; return Math.round(Math.min(1, Math.max(0, v)) * 255); };
    for (let i = 0; i < N; i++) {
      const l = L[i] * 100 / 255, A2 = a[i] - 128, B2 = bb[i] - 128;
      const fy = (l + 16) / 116, fx = fy + A2 / 500, fz = fy - B2 / 200;
      const X = 0.95047 * f(fx), Yv = f(fy), Z = 1.08883 * f(fz);
      out[i * 4] = g(3.2406 * X - 1.5372 * Yv - 0.4986 * Z);
      out[i * 4 + 1] = g(-0.9689 * X + 1.8758 * Yv + 0.0415 * Z);
      out[i * 4 + 2] = g(0.0557 * X - 0.2040 * Yv + 1.0570 * Z);
    }
  } else if (mode === MODE.INDEXED && cmLen >= 768) {
    const P = planes[0];
    for (let i = 0; i < N; i++) { const v = P[i]; out[i * 4] = b[cmStart + v]; out[i * 4 + 1] = b[cmStart + 256 + v]; out[i * 4 + 2] = b[cmStart + 512 + v]; }
  } else { // Bitmap, Grayscale, Duotone, Multichannel: dùng kênh đầu tiên như ảnh xám
    const P = planes[0];
    for (let i = 0; i < N; i++) out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = P[i];
  }
  A = hasAlpha ? planes[colorCh] : null;
  for (let i = 0; i < N; i++) out[i * 4 + 3] = A ? A[i] : 255;
  // Photoshop trộn màu ảnh gộp với nền trắng ở vùng trong suốt: tách nền trắng ra
  if (A && !matted) for (let i = 0; i < N; i++) {
    const a = A[i]; if (a === 255) continue;
    for (let j = 0; j < 3; j++) out[i * 4 + j] = a ? (out[i * 4 + j] - 255 + a) * 255 / a : 0;
  }
  return { width: nw, height: nh, fullW: w, fullH: h, scaled: k, data: out, layers: layers.count, depth, mode };
}

module.exports = { decodeComposite };
