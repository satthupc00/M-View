// Chép đúng các file Three.js mà trình xem 3D cần vào src/renderer/vendor/three (giữ cấu trúc thư mục gốc).
// Chạy lại sau khi nâng cấp three: node scripts/vendor-three.js
const fs = require('fs'), path = require('path');
const SRC = path.join(__dirname, '..', 'node_modules', 'three');
const OUT = path.join(__dirname, '..', 'src', 'renderer', 'vendor', 'three');
const FILES = [
  'LICENSE', 'build/three.module.js', 'build/three.core.js',
  'examples/jsm/controls/OrbitControls.js', 'examples/jsm/environments/RoomEnvironment.js',
  'examples/jsm/loaders/FBXLoader.js', 'examples/jsm/loaders/OBJLoader.js', 'examples/jsm/loaders/MTLLoader.js',
  'examples/jsm/loaders/GLTFLoader.js', 'examples/jsm/exporters/GLTFExporter.js', 'examples/jsm/loaders/DRACOLoader.js', 'examples/jsm/loaders/TGALoader.js',
  'examples/jsm/curves/NURBSCurve.js', 'examples/jsm/curves/NURBSUtils.js',
  'examples/jsm/libs/fflate.module.js', 'examples/jsm/libs/meshopt_decoder.module.js',
  'examples/jsm/utils/BufferGeometryUtils.js', 'examples/jsm/utils/SkeletonUtils.js',
  'examples/jsm/libs/draco/gltf/draco_decoder.js', 'examples/jsm/libs/draco/gltf/draco_decoder.wasm', 'examples/jsm/libs/draco/gltf/draco_wasm_wrapper.js'
];
fs.rmSync(OUT, { recursive: true, force: true });
for (const f of FILES) { const d = path.join(OUT, f); fs.mkdirSync(path.dirname(d), { recursive: true }); fs.copyFileSync(path.join(SRC, f), d); }
// Vá loader để ghi lại cạnh nào thuộc mặt gốc (tứ giác / đa giác), giúp lưới hiện đúng topology gốc thay vì tam giác.
// Mỗi tam giác có 3 bit: bit0 = cạnh v0-v1, bit1 = v1-v2, bit2 = v2-v0; bit = 1 là cạnh gốc.
const PATCHES = {
  'examples/jsm/loaders/FBXLoader.js': [
    ['\t\t\tweightsIndices: [],\n\t\t};', '\t\t\tweightsIndices: [],\n\t\t\tedgeFlags: [], // MonView\n\t\t};'],
    ['\t\tfor ( const [ i0, i1, i2 ] of triangles ) {\n',
     '\t\tfor ( const [ i0, i1, i2 ] of triangles ) {\n\n\t\t\t// MonView: cạnh là cạnh gốc khi 2 đỉnh kề nhau trên đa giác\n\t\t\tconst adj = ( a, b ) => { const d = Math.abs( a - b ); return d === 1 || d === faceLength - 1; };\n\t\t\tbuffers.edgeFlags.push( ( adj( i0, i1 ) ? 1 : 0 ) | ( adj( i1, i2 ) ? 2 : 0 ) | ( adj( i2, i0 ) ? 4 : 0 ) );\n'],
    ["\t\tgeo.setAttribute( 'position', positionAttribute );\n", "\t\tgeo.setAttribute( 'position', positionAttribute );\n\t\tgeo.userData.edgeFlags = Uint8Array.from( buffers.edgeFlags ); // MonView\n"]
  ],
  'examples/jsm/loaders/OBJLoader.js': [
    ['\t\t\t\t\tconst v3 = faceVertices[ j + 1 ];\n',
     '\t\t\t\t\tconst v3 = faceVertices[ j + 1 ];\n\t\t\t\t\t// MonView: tam giác quạt (v1, vj, vj+1) của đa giác n đỉnh\n\t\t\t\t\t( state.object.geometry.edgeFlags ||= [] ).push( ( j === 1 ? 1 : 0 ) | 2 | ( j + 1 === faceVertices.length - 1 ? 4 : 0 ) );\n'],
    ["\t\t\t\tbuffergeometry.setAttribute( 'position', new Float32BufferAttribute( geometry.vertices, 3 ) );\n",
     "\t\t\t\tbuffergeometry.setAttribute( 'position', new Float32BufferAttribute( geometry.vertices, 3 ) );\n\t\t\t\tif ( geometry.edgeFlags ) buffergeometry.userData.edgeFlags = Uint8Array.from( geometry.edgeFlags ); // MonView\n"]
  ]
};
for (const [f, list] of Object.entries(PATCHES)) {
  const d = path.join(OUT, f); let s = fs.readFileSync(d, 'utf8');
  for (const [a, b] of list) { if (!s.includes(a)) throw new Error('patch not found in ' + f + ': ' + a.slice(0, 60)); s = s.replace(a, b); }
  fs.writeFileSync(d, s);
}
// ---- Trình ghi FBX (@comfyorg/fbx-exporter-three, MIT) + vá để giữ mặt tứ giác/đa giác gốc và gộp đỉnh trùng.
// Khi geometry.userData.fbxTopo có mặt: { cp: toạ độ control point, loopCp/loopVert: mỗi góc → control point / đỉnh gốc,
// polyStarts: chỉ số góc bắt đầu mỗi mặt, polyFirstTri: tam giác đầu của mỗi mặt (lấy vật liệu), cpVert: đỉnh đại diện của mỗi control point }
const FX_SRC = path.join(__dirname, '..', 'node_modules', '@comfyorg', 'fbx-exporter-three');
const FX_OUT = path.join(__dirname, '..', 'src', 'renderer', 'vendor', 'fbx-exporter');
fs.rmSync(FX_OUT, { recursive: true, force: true });
(function copy(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const s = path.join(dir, e.name), d = path.join(out, e.name);
    if (e.isDirectory()) copy(s, d);
    else if (e.name.endsWith('.js')) { fs.mkdirSync(out, { recursive: true }); fs.writeFileSync(d, fs.readFileSync(s, 'utf8').replace(/\n\/\/# sourceMappingURL=.*$/, '\n')); }
  }
})(path.join(FX_SRC, 'dist'), FX_OUT);
fs.copyFileSync(path.join(FX_SRC, 'LICENSE'), path.join(FX_OUT, 'LICENSE'));
const FX_PATCHES = {
  'builders/objects/geometry.js': [
    ['function attributeToPerLoop(geometry, attr, itemSize) {\n',
     'function attributeToPerLoop(geometry, attr, itemSize) {\n    const topo = geometry.userData && geometry.userData.fbxTopo; // MonView\n    if (topo) { const src = readAttributeFlat(attr, itemSize), lv = topo.loopVert, out = new Float32Array(lv.length * itemSize); for (let i = 0; i < lv.length; i++) for (let k = 0; k < itemSize; k++) out[i * itemSize + k] = src[lv[i] * itemSize + k]; return out; }\n'],
    ["    const posFlat = readAttributeFlat(pos, 3);\n", "    const topo = geometry.userData && geometry.userData.fbxTopo; // MonView\n    const posFlat = topo ? topo.cp : readAttributeFlat(pos, 3);\n"],
    ["    const t_lvi = loopVertexIndices(geometry);\n    const t_ls = polygonLoopStarts(t_lvi.length);\n",
     "    const t_lvi = topo ? Int32Array.from(topo.loopCp) : loopVertexIndices(geometry);\n    const t_ls = topo ? topo.polyStarts : polygonLoopStarts(t_lvi.length);\n"],
    ["    for (const g of groups) {\n        const polyStart = Math.floor(g.start / 3);\n        const polyCount = Math.floor(g.count / 3);\n        const fbxIdx = remapAt(g.materialIndex);\n        for (let i = 0; i < polyCount; i++)\n            t_pm[polyStart + i] = fbxIdx;\n    }\n",
     "    const topo = geometry.userData && geometry.userData.fbxTopo; // MonView\n    const triMat = topo ? new Int32Array(numPolys) : t_pm;\n    for (const g of groups) {\n        const polyStart = Math.floor(g.start / 3);\n        const polyCount = Math.floor(g.count / 3);\n        const fbxIdx = remapAt(g.materialIndex);\n        for (let i = 0; i < polyCount; i++)\n            triMat[polyStart + i] = fbxIdx;\n    }\n    if (topo) { const out = new Int32Array(topo.polyStarts.length); for (let p = 0; p < out.length; p++) out[p] = triMat[topo.polyFirstTri[p]] || 0; elemDataSingleString(layer, 'MappingInformationType', 'ByPolygon'); elemDataSingleString(layer, 'ReferenceInformationType', 'IndexToDirect'); elemDataSingleInt32Array(layer, 'Materials', out); return; }\n"]
  ],
  'data/SceneCollector.js': [
    ["    const count = idxAttr.count;\n    const indices = [];\n    const weights = [];\n    for (let v = 0; v < count; v++) {\n",
     "    const topo = geometry.userData && geometry.userData.fbxTopo; // MonView: trọng số theo control point\n    const count = topo ? topo.cpVert.length : idxAttr.count;\n    const indices = [];\n    const weights = [];\n    for (let cpi = 0; cpi < count; cpi++) {\n        const v = topo ? topo.cpVert[cpi] : cpi;\n"],
    ["            if (w > 0) {\n                indices.push(v);\n", "            if (w > 0) {\n                indices.push(cpi);\n"]
  ],
  'data/morphCollector.js': [
    ["    const base = geom.attributes.position;\n",
     "    const topo = geom.userData && geom.userData.fbxTopo; // MonView\n    const remapTopo = a => { if (!topo) return a; const n = topo.cpVert.length, o = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const v = topo.cpVert[i]; o[i * 3] = a.getX(v); o[i * 3 + 1] = a.getY(v); o[i * 3 + 2] = a.getZ(v); } return { count: n, array: o, itemSize: 3, getX: i => o[i * 3], getY: i => o[i * 3 + 1], getZ: i => o[i * 3 + 2] }; };\n    const base = remapTopo(geom.attributes.position);\n"],
    ["        const attr = morphPos[i];\n", "        const attr = remapTopo(morphPos[i]);\n"]
  ]
};
for (const [f, list] of Object.entries(FX_PATCHES)) {
  const d = path.join(FX_OUT, f); let s = fs.readFileSync(d, 'utf8');
  for (const [a, b] of list) { if (!s.includes(a)) throw new Error('patch not found in ' + f + ': ' + a.slice(0, 70)); s = s.replace(a, b); }
  fs.writeFileSync(d, s);
}
console.log('vendored', FILES.length, 'files from three', require(path.join(SRC, 'package.json')).version);
