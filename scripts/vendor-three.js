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
console.log('vendored', FILES.length, 'files from three', require(path.join(SRC, 'package.json')).version);
