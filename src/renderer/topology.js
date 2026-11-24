// Topology của mesh: cạnh nào thuộc mặt gốc, và dựng lại mặt tứ giác/đa giác để ghi file.
import * as THREE from 'three';

export function quadFlags(g) {
  const pos = g.attributes.position, idx = g.index;
  const tri = (idx ? idx.count : pos.count) / 3 | 0;
  const vid = i => (idx ? idx.getX(i) : i);
  // gộp đỉnh trùng vị trí (glTF tách đỉnh ở đường nối UV)
  const weld = new Map(), wid = new Int32Array(pos.count);
  const q = v => Math.round(v * 1e5);
  for (let i = 0; i < pos.count; i++) {
    const k = q(pos.getX(i)) + ',' + q(pos.getY(i)) + ',' + q(pos.getZ(i));
    let w = weld.get(k); if (w === undefined) { w = weld.size; weld.set(k, w); } wid[i] = w;
  }
  const flags = new Uint8Array(tri).fill(7);
  const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3();
  const nrm = new Float32Array(tri * 3), longest = new Int8Array(tri);
  const edges = new Map();
  for (let t = 0; t < tri; t++) {
    const v = [vid(t * 3), vid(t * 3 + 1), vid(t * 3 + 2)];
    A.fromBufferAttribute(pos, v[0]); B.fromBufferAttribute(pos, v[1]); C.fromBufferAttribute(pos, v[2]);
    const l = [A.distanceToSquared(B), B.distanceToSquared(C), C.distanceToSquared(A)];
    longest[t] = l[0] >= l[1] && l[0] >= l[2] ? 0 : l[1] >= l[2] ? 1 : 2;
    const n = C.clone().sub(B).cross(A.clone().sub(B)).normalize();
    nrm[t * 3] = n.x; nrm[t * 3 + 1] = n.y; nrm[t * 3 + 2] = n.z;
    for (let e = 0; e < 3; e++) {
      const a = wid[v[e]], b = wid[v[(e + 1) % 3]];
      const k = a < b ? a + '_' + b : b + '_' + a;
      const list = edges.get(k); if (list) list.push(t * 3 + e); else edges.set(k, [t * 3 + e]);
    }
  }
  const cand = [];
  for (const list of edges.values()) {
    if (list.length !== 2) continue;
    const [x, y] = list, t1 = x / 3 | 0, t2 = y / 3 | 0;
    if (t1 === t2 || longest[t1] !== x % 3 || longest[t2] !== y % 3) continue;
    const d = nrm[t1 * 3] * nrm[t2 * 3] + nrm[t1 * 3 + 1] * nrm[t2 * 3 + 1] + nrm[t1 * 3 + 2] * nrm[t2 * 3 + 2];
    if (d > 0.82) cand.push([d, x, y]); // lệch dưới ~35°
  }
  cand.sort((a, b) => b[0] - a[0]);
  const used = new Uint8Array(tri);
  for (const [, x, y] of cand) {
    const t1 = x / 3 | 0, t2 = y / 3 | 0;
    if (used[t1] || used[t2]) continue;
    used[t1] = used[t2] = 1;
    flags[t1] &= ~(1 << (x % 3)); flags[t2] &= ~(1 << (y % 3));
  }
  return flags;
}
// Cờ cạnh của mỗi tam giác: lấy từ loader (FBX/OBJ) hoặc ghép tứ giác (GLB)
export function edgeFlags(g) {
  const tri = (g.index ? g.index.count : g.attributes.position.count) / 3 | 0;
  const f = g.userData.edgeFlags;
  return f && f.length === tri ? f : quadFlags(g);
}

// Dựng lại mặt gốc + gộp đỉnh trùng vị trí (control point) cho trình ghi FBX/OBJ.
// Trả về { cp, cpVert, loopCp, loopVert, polyStarts, polyFirstTri }.
export function buildTopo(g) {
  const pos = g.attributes.position, idx = g.index;
  const tri = (idx ? idx.count : pos.count) / 3 | 0;
  const vid = i => (idx ? idx.getX(i) : i);
  const flags = edgeFlags(g);
  // control point = đỉnh trùng vị trí (và trùng xương nếu có skin)
  const sI = g.attributes.skinIndex, sW = g.attributes.skinWeight;
  const cpOf = new Int32Array(pos.count), cpMap = new Map(), cpVert = [];
  const q = v => Math.round(v * 1e5);
  for (let v = 0; v < pos.count; v++) {
    let k = q(pos.getX(v)) + ',' + q(pos.getY(v)) + ',' + q(pos.getZ(v));
    if (sI) k += '|' + sI.getX(v) + ',' + sI.getY(v) + ',' + q(sW.getX(v)) + ',' + q(sW.getY(v));
    let c = cpMap.get(k); if (c === undefined) { c = cpVert.length; cpMap.set(k, c); cpVert.push(v); } cpOf[v] = c;
  }
  // gom tam giác dùng chung cạnh ẩn thành một mặt (union-find)
  const parent = new Int32Array(tri); for (let t = 0; t < tri; t++) parent[t] = t;
  const find = t => { while (parent[t] !== t) t = parent[t] = parent[parent[t]]; return t; };
  const hidden = new Map();
  for (let t = 0; t < tri; t++) for (let e = 0; e < 3; e++) {
    if (flags[t] & (1 << e)) continue;
    const a = cpOf[vid(t * 3 + e)], b = cpOf[vid(t * 3 + (e + 1) % 3)];
    const k = a < b ? a + '_' + b : b + '_' + a;
    const o = hidden.get(k);
    if (o === undefined) hidden.set(k, t); else { const ra = find(t), rb = find(o); if (ra !== rb) parent[ra] = rb; }
  }
  const groups = new Map();
  for (let t = 0; t < tri; t++) { const r = find(t); const l = groups.get(r); if (l) l.push(t); else groups.set(r, [t]); }
  const loopCp = [], loopVert = [], polyStarts = [], polyFirstTri = [];
  const emitTri = t => { polyStarts.push(loopCp.length); polyFirstTri.push(t); for (let k = 0; k < 3; k++) { const v = vid(t * 3 + k); loopVert.push(v); loopCp.push(cpOf[v]); } };
  const order = [...groups.values()].sort((a, b) => a[0] - b[0]);
  for (const ts of order) {
    if (ts.length === 1) { emitTri(ts[0]); continue; }
    // nối các cạnh biên (theo chiều quay của tam giác) thành một vòng
    const next = new Map();
    for (const t of ts) for (let e = 0; e < 3; e++) {
      if (!(flags[t] & (1 << e))) continue;
      const va = vid(t * 3 + e), vb = vid(t * 3 + (e + 1) % 3);
      next.set(cpOf[va], [va, cpOf[vb]]);
    }
    const start = next.keys().next().value, loop = [];
    let c = start, ok = next.size >= 3;
    for (let n = 0; ok && n <= next.size; n++) {
      const step = next.get(c); if (!step) { ok = false; break; }
      loop.push(step[0]); c = step[1];
      if (c === start) break;
    }
    if (!ok || c !== start || loop.length !== next.size) { ts.forEach(emitTri); continue; } // không khép vòng: giữ tam giác
    polyStarts.push(loopCp.length); polyFirstTri.push(Math.min(...ts));
    for (const v of loop) { loopVert.push(v); loopCp.push(cpOf[v]); }
  }
  const cp = new Float32Array(cpVert.length * 3);
  cpVert.forEach((v, i) => { cp[i * 3] = pos.getX(v); cp[i * 3 + 1] = pos.getY(v); cp[i * 3 + 2] = pos.getZ(v); });
  return { cp, cpVert: Int32Array.from(cpVert), loopCp: Int32Array.from(loopCp), loopVert: Int32Array.from(loopVert), polyStarts: Int32Array.from(polyStarts), polyFirstTri: Int32Array.from(polyFirstTri) };
}
