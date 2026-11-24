// Mon View - chuyển đổi model 3D sang GLB / FBX / OBJ.
// Chỉ nạp khi bấm chuyển đổi lần đầu.
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { FBXExporter } from '@comfyorg/fbx-exporter-three';
import { buildTopo } from './topology.js';

const enc = new TextEncoder();
const isMesh = o => o.isMesh && !o.userData.isWire && !o.isInstancedMesh;

// target: 'glb' | 'fbx' | 'obj' · srcExt: đuôi file gốc · base: tên file (không đuôi) sẽ lưu
// trả về [{ name, data: Uint8Array }]
export async function convert({ root, clips }, target, srcExt, base) {
  const fromGltf = srcExt === 'glb' || srcExt === 'gltf';
  if (target === 'glb') {
    const data = await new GLTFExporter().parseAsync(root, { binary: true, animations: clips, onlyVisible: true, maxTextureSize: 8192 });
    return [{ name: base + '.glb', data: new Uint8Array(data) }];
  }
  if (target === 'fbx') {
    const meshes = [];
    root.traverse(o => { if (isMesh(o)) meshes.push(o); });
    // giữ mặt tứ giác / đa giác gốc và gộp đỉnh trùng
    for (const m of meshes) m.geometry.userData.fbxTopo = buildTopo(m.geometry);
    // FBX coi ma trận gắn (bindMatrix) = vị trí mesh lúc gắn xương. glTF thường để bindMatrix = đơn vị trong khi mesh
    // nằm dưới node đã xoay/thu nhỏ: đổi về quy ước FBX mà không đổi hình (Inv' = Inv · B · M⁻¹), xuất xong trả lại.
    const rebound = [];
    for (const m of meshes) {
      if (!m.isSkinnedMesh || m.bindMode !== 'attached') continue;
      const M = m.matrixWorld;
      if (m.bindMatrix.equals(M)) continue;
      const corr = m.bindMatrix.clone().multiply(M.clone().invert());
      rebound.push([m, m.skeleton, m.bindMatrix.clone(), m.bindMatrixInverse.clone()]);
      m.skeleton = new THREE.Skeleton(m.skeleton.bones, m.skeleton.boneInverses.map(b => b.clone().multiply(corr)));
      m.bindMatrix.copy(M); m.bindMatrixInverse.copy(M).invert();
    }
    try {
      const data = await new FBXExporter().parseAsync(root, {
        preset: 'threejs', unitScale: fromGltf ? 100 : 1, // glTF tính bằng mét
        animations: clips, includeAnimations: clips.length > 0,
        objectFilter: o => !o.userData.isWire, embedTextures: true, creator: 'Mon View'
      });
      return [{ name: base + '.fbx', data }];
    } finally {
      for (const m of meshes) delete m.geometry.userData.fbxTopo;
      for (const [m, sk, b, bi] of rebound) { m.skeleton.dispose(); m.skeleton = sk; m.bindMatrix.copy(b); m.bindMatrixInverse.copy(bi); }
    }
  }
  if (target === 'obj') return writeOBJ(root, base, fromGltf);
  throw new Error('UNSUPPORTED_TARGET');
}

// OBJ + MTL + texture PNG, giữ mặt tứ giác/đa giác gốc
async function writeOBJ(root, base, fromGltf) {
  root.updateMatrixWorld(true);
  const obj = ['# Mon View', `mtllib ${base}.mtl`], mtl = ['# Mon View'], files = [];
  const matNames = new Map(), texFiles = new Map();
  let vOff = 1, vtOff = 1, vnOff = 1, objIdx = 0;
  const safe = s => (s || '').replace(/\s+/g, '_').replace(/[^\w.-]/g, '') ;
  const V = new THREE.Vector3();

  async function texFile(tex) {
    if (texFiles.has(tex)) return texFiles.get(tex);
    const img = tex.image; let name = null;
    if (img && img.width && img.height) {
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const g = c.getContext('2d');
      if (img.data) g.putImageData(new ImageData(new Uint8ClampedArray(img.data.buffer, img.data.byteOffset, img.width * img.height * 4), img.width, img.height), 0, 0);
      else g.drawImage(img, 0, 0);
      const blob = await new Promise(r => c.toBlob(r, 'image/png'));
      if (blob) { name = `${base}_tex${texFiles.size + 1}.png`; files.push({ name, data: new Uint8Array(await blob.arrayBuffer()) }); }
    }
    texFiles.set(tex, name);
    return name;
  }
  async function matName(m) {
    if (matNames.has(m)) return matNames.get(m);
    let n = safe(m.name) || 'material'; while ([...matNames.values()].includes(n)) n += '_1';
    matNames.set(m, n);
    const c = m.color || new THREE.Color(1, 1, 1);
    mtl.push('', `newmtl ${n}`, `Kd ${c.r.toFixed(4)} ${c.g.toFixed(4)} ${c.b.toFixed(4)}`, 'Ka 0 0 0', 'Ks 0 0 0', `d ${(m.opacity ?? 1).toFixed(3)}`, 'illum 2');
    if (m.map) { const f = await texFile(m.map); if (f) mtl.push(`map_Kd ${f}`); }
    if (m.normalMap) { const f = await texFile(m.normalMap); if (f) mtl.push(`norm ${f}`); }
    return n;
  }

  const meshes = []; root.traverse(o => { if (isMesh(o)) meshes.push(o); });
  for (const o of meshes) {
    const g = o.geometry, topo = buildTopo(g);
    const mw = o.matrixWorld, nm = new THREE.Matrix3().getNormalMatrix(mw);
    obj.push(`o ${safe(o.name) || 'mesh_' + (++objIdx)}`);
    for (let i = 0; i < topo.cp.length; i += 3) { V.set(topo.cp[i], topo.cp[i + 1], topo.cp[i + 2]).applyMatrix4(mw); obj.push(`v ${V.x.toFixed(6)} ${V.y.toFixed(6)} ${V.z.toFixed(6)}`); }
    const mats = [].concat(o.material || []);
    const firstMap = mats.find(m => m.map)?.map;
    const flipV = firstMap ? firstMap.flipY === false : fromGltf; // OBJ đặt gốc UV ở góc dưới
    const uv = g.attributes.uv, nr = g.attributes.normal;
    const uvIdx = new Map(), nIdx = new Map(), loopUv = new Int32Array(topo.loopVert.length), loopN = new Int32Array(topo.loopVert.length);
    topo.loopVert.forEach((v, i) => {
      if (uv) { const u = uv.getX(v), w = flipV ? 1 - uv.getY(v) : uv.getY(v), k = u.toFixed(6) + ' ' + w.toFixed(6); let x = uvIdx.get(k); if (x === undefined) { x = uvIdx.size; uvIdx.set(k, x); obj.push('vt ' + k); } loopUv[i] = x; }
      if (nr) { V.fromBufferAttribute(nr, v).applyMatrix3(nm).normalize(); const k = V.x.toFixed(5) + ' ' + V.y.toFixed(5) + ' ' + V.z.toFixed(5); let x = nIdx.get(k); if (x === undefined) { x = nIdx.size; nIdx.set(k, x); obj.push('vn ' + k); } loopN[i] = x; }
    });
    // vật liệu của từng tam giác theo groups
    const tri = (g.index ? g.index.count : g.attributes.position.count) / 3 | 0, triMat = new Int32Array(tri);
    for (const gr of g.groups) for (let t = gr.start / 3 | 0; t < (gr.start + gr.count) / 3 && t < tri; t++) triMat[t] = gr.materialIndex;
    let curMat = -1;
    for (let p = 0; p < topo.polyStarts.length; p++) {
      const mi = Math.min(triMat[topo.polyFirstTri[p]] || 0, mats.length - 1);
      if (mi !== curMat && mats[mi]) { curMat = mi; obj.push('usemtl ' + await matName(mats[mi])); }
      const s = topo.polyStarts[p], e = p + 1 < topo.polyStarts.length ? topo.polyStarts[p + 1] : topo.loopCp.length;
      const f = [];
      for (let i = s; i < e; i++) { const v = topo.loopCp[i] + vOff; f.push(nr ? `${v}/${uv ? loopUv[i] + vtOff : ''}/${loopN[i] + vnOff}` : uv ? `${v}/${loopUv[i] + vtOff}` : `${v}`); }
      obj.push('f ' + f.join(' '));
    }
    vOff += topo.cp.length / 3; vtOff += uvIdx.size; vnOff += nIdx.size;
  }
  return [{ name: base + '.obj', data: enc.encode(obj.join('\n') + '\n') }, { name: base + '.mtl', data: enc.encode(mtl.join('\n') + '\n') }, ...files];
}
