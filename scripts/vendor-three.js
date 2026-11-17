// Chép đúng các file Three.js mà trình xem 3D cần vào src/renderer/vendor/three (giữ cấu trúc thư mục gốc).
// Chạy lại sau khi nâng cấp three: node scripts/vendor-three.js
const fs = require('fs'), path = require('path');
const SRC = path.join(__dirname, '..', 'node_modules', 'three');
const OUT = path.join(__dirname, '..', 'src', 'renderer', 'vendor', 'three');
const FILES = [
  'LICENSE', 'build/three.module.js', 'build/three.core.js',
  'examples/jsm/controls/OrbitControls.js', 'examples/jsm/environments/RoomEnvironment.js',
  'examples/jsm/loaders/FBXLoader.js', 'examples/jsm/loaders/OBJLoader.js', 'examples/jsm/loaders/MTLLoader.js',
  'examples/jsm/loaders/GLTFLoader.js', 'examples/jsm/loaders/DRACOLoader.js', 'examples/jsm/loaders/TGALoader.js',
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
console.log('vendored', FILES.length, 'files from three', require(path.join(SRC, 'package.json')).version);
