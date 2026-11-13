// Mon View - trình xem model 3D (FBX, OBJ, GLB, GLTF).
// Module này chỉ được nạp khi mở file 3D đầu tiên, nên không làm chậm việc xem ảnh.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { TGALoader } from 'three/addons/loaders/TGALoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export function createViewer(container, mv) {
  const canvas = document.createElement('canvas');
  canvas.className = 'v3d';
  container.append(canvas);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.6;
  const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 1000);
  scene.add(camera);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x3a3d44, 1.4));
  const key = new THREE.DirectionalLight(0xffffff, 1.8);
  key.position.set(0.6, 1, 0.8); camera.add(key); // đèn đi theo góc nhìn

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true; controls.dampingFactor = 0.12;
  controls.screenSpacePanning = true;
  controls.zoomToCursor = true;
  // trái: xoay · phải: kéo ngang · chuột giữa để app dùng cho toàn màn hình
  controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: null, RIGHT: THREE.MOUSE.PAN };

  let grid = null, root = null, mixer = null, actions = [], cur = -1, playing = false;
  let wire = false, showGrid = true, dirty = true, raf = 0, active = false, tween = null;
  let tPrev = performance.now();
  const delta = () => { const n = performance.now(), d = (n - tPrev) / 1000; tPrev = n; return Math.min(d, 0.1); };
  let lastEmit = 0;
  const listeners = new Set();
  const emit = () => listeners.forEach(f => f());
  controls.addEventListener('change', () => { dirty = true; });

  // --- tìm texture: model hay lưu đường dẫn máy khác, nên thử tên file ở cạnh model và các thư mục texture quen thuộc
  let baseDir = '';
  const manager = new THREE.LoadingManager();
  manager.setURLModifier(url => {
    if (/^(data|blob|mview):/i.test(url)) return url;
    let raw = url; try { raw = decodeURI(url); } catch {}
    raw = raw.replace(/^file:\/\/\/?/i, '');
    const name = raw.split(/[\\/]/).pop();
    const abs = /^([a-z]:[\\/]|\\\\|\/)/i.test(raw);
    const cands = [abs ? raw : mv.join(baseDir, raw), mv.join(baseDir, name), mv.join(baseDir, 'textures', name), mv.join(baseDir, 'Textures', name),
      mv.join(baseDir, 'texture', name), mv.join(baseDir, 'tex', name), mv.join(baseDir, '..', 'textures', name), mv.join(baseDir, '..', 'Textures', name)];
    const hit = cands.find(p => mv.exists(p));
    return mv.fileUrl(hit || cands[1]);
  });
  manager.addHandler(/\.tga$/i, new TGALoader(manager));

  const draco = new DRACOLoader(); // trình quản lý riêng: file giải nén nằm trong app, không đi qua bộ tìm texture
  draco.setDecoderPath(new URL('./vendor/three/examples/jsm/libs/draco/gltf/', location.href).href);

  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); dirty = true;
  }
  new ResizeObserver(resize).observe(container);

  function loop() {
    raf = requestAnimationFrame(loop);
    const dt = delta();
    if (tween) {
      const t = Math.min(1, (performance.now() - tween.t0) / tween.dur), e = 1 - Math.pow(1 - t, 3);
      camera.position.lerpVectors(tween.p0, tween.p1, e); controls.target.lerpVectors(tween.c0, tween.c1, e);
      if (t >= 1) tween = null;
      dirty = true;
    }
    if (controls.update()) dirty = true;
    if (mixer && playing) { mixer.update(dt); dirty = true; const now = performance.now(); if (now - lastEmit > 100) { lastEmit = now; emit(); } }
    if (dirty) { renderer.render(scene, camera); dirty = false; }
  }

  function disposeModel() {
    if (!root) return;
    scene.remove(root);
    root.traverse(o => {
      o.geometry?.dispose();
      for (const m of [].concat(o.material || [])) { for (const k in m) if (m[k]?.isTexture) m[k].dispose(); m.dispose(); }
    });
    root = null; mixer = null; actions = []; cur = -1; playing = false;
  }

  function bounds() {
    const box = new THREE.Box3().setFromObject(root);
    if (box.isEmpty()) box.set(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1));
    return box;
  }

  function frame(anim = true) {
    if (!root) return;
    const box = bounds(), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
    const r = Math.max(size.length() / 2, 1e-3);
    const fov = THREE.MathUtils.degToRad(camera.fov), fit = Math.min(fov, 2 * Math.atan(Math.tan(fov / 2) * camera.aspect));
    const dist = r / Math.sin(fit / 2) * 1.05;
    const dir = camera.position.clone().sub(controls.target).normalize();
    if (!isFinite(dir.x) || dir.lengthSq() < 0.5) dir.set(0.55, 0.35, 1).normalize();
    camera.near = dist / 200; camera.far = dist * 200; camera.updateProjectionMatrix();
    controls.maxDistance = dist * 50; controls.minDistance = dist / 500;
    const p1 = c.clone().add(dir.multiplyScalar(dist));
    if (anim) tween = { t0: performance.now(), dur: 320, p0: camera.position.clone(), p1, c0: controls.target.clone(), c1: c };
    else { camera.position.copy(p1); controls.target.copy(c); }
    dirty = true;
  }

  function setGridFor(box) {
    if (grid) { scene.remove(grid); grid.geometry.dispose(); grid.material.dispose(); }
    const size = box.getSize(new THREE.Vector3());
    const span = Math.pow(10, Math.ceil(Math.log10(Math.max(size.x, size.z, 1e-3) * 1.5)));
    grid = new THREE.GridHelper(span * 2, 20, 0x5a5f69, 0x3a3d44);
    grid.position.set(box.getCenter(new THREE.Vector3()).x, box.min.y, box.getCenter(new THREE.Vector3()).z);
    grid.visible = showGrid;
    scene.add(grid);
  }

  async function load(path) {
    disposeModel();
    baseDir = mv.dirOf(path);
    const ext = path.split('.').pop().toLowerCase();
    const res = await fetch(mv.fileUrl(path));
    if (!res.ok) throw new Error('ENOENT');
    let obj, clips = [];
    if (ext === 'fbx') {
      obj = new FBXLoader(manager).parse(await res.arrayBuffer(), '');
      clips = obj.animations || [];
    } else if (ext === 'obj') {
      const text = await res.text();
      const loader = new OBJLoader(manager);
      const lib = (text.match(/^mtllib\s+(.+)$/m) || [])[1]?.trim();
      const mtlPath = [lib && mv.join(baseDir, lib), path.replace(/\.obj$/i, '.mtl')].find(p => p && mv.exists(p));
      if (mtlPath) {
        const mats = new MTLLoader(manager).parse(mv.readText(mtlPath), '');
        mats.preload(); loader.setMaterials(mats);
      }
      obj = loader.parse(text);
    } else {
      const loader = new GLTFLoader(manager).setDRACOLoader(draco).setMeshoptDecoder(MeshoptDecoder);
      const data = ext === 'glb' ? await res.arrayBuffer() : await res.text();
      const gltf = await new Promise((ok, fail) => loader.parse(data, '', ok, fail));
      obj = gltf.scene; clips = gltf.animations || [];
    }
    root = obj;
    scene.add(root);
    root.traverse(o => { if (o.isMesh) { o.frustumCulled = false; if (wire) applyWire(o); } });
    if (clips.length) {
      mixer = new THREE.AnimationMixer(root);
      actions = clips.map(c => mixer.clipAction(c));
      play(0);
    }
    const box = bounds();
    setGridFor(box);
    frame(false);
    dirty = true; emit();
    return stats(clips);
  }

  function stats(clips) {
    let tris = 0, verts = 0, meshes = 0, bones = 0;
    root.traverse(o => {
      if (o.isBone) bones++;
      if (!o.isMesh || !o.geometry) return;
      meshes++;
      const g = o.geometry, pos = g.attributes.position;
      verts += pos ? pos.count : 0;
      tris += g.index ? g.index.count / 3 : (pos ? pos.count / 3 : 0);
    });
    return { tris: Math.round(tris), verts, meshes, bones, clips: (clips || []).length };
  }

  function applyWire(o) { for (const m of [].concat(o.material || [])) m.wireframe = wire; }
  function setWire(v) { wire = v; root?.traverse(o => o.isMesh && applyWire(o)); dirty = true; }
  function setGrid(v) { showGrid = v; if (grid) grid.visible = v; dirty = true; }
  function setBg(c) { scene.background = new THREE.Color(c); dirty = true; }

  function play(i) {
    if (!actions.length) return;
    if (cur >= 0 && actions[cur]) actions[cur].stop();
    cur = i; actions[cur].reset().play(); playing = true; delta(); emit();
  }
  function togglePlay() { if (!actions.length) return; playing = !playing; delta(); emit(); }
  function seek(t) { if (!mixer || cur < 0) return; mixer.setTime(t); dirty = true; emit(); }

  function zoom(f) {
    const off = camera.position.clone().sub(controls.target).divideScalar(f);
    tween = { t0: performance.now(), dur: 220, p0: camera.position.clone(), p1: controls.target.clone().add(off), c0: controls.target.clone(), c1: controls.target.clone() };
  }

  function snapshot() { renderer.render(scene, camera); return canvas.toDataURL('image/png'); }

  return {
    load, frame, zoom, setWire, setGrid, setBg, play, togglePlay, seek, snapshot,
    get wire() { return wire; }, get grid() { return showGrid; },
    get clips() { return actions.map(a => ({ name: a.getClip().name || 'Animation', duration: a.getClip().duration })); },
    get current() { return cur; }, get playing() { return playing; },
    get time() { return cur >= 0 ? actions[cur].time : 0; },
    onChange: f => listeners.add(f),
    show() { canvas.hidden = false; active = true; resize(); if (!raf) { delta(); loop(); } },
    stop() { cancelAnimationFrame(raf); raf = 0; },
    hide() { canvas.hidden = true; active = false; cancelAnimationFrame(raf); raf = 0; disposeModel(); },
    get active() { return active; }
  };
}
