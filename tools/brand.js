// Brand renderer: makes the app icon, title logo, splash and store graphics from the game's own 3D
// critters (studio lighting, glossy toy material) plus a drawn wordmark. Open tools/brand.html on the
// Vite dev server (`npm run dev`); with the local receiver running it writes the images to brand-out/
// and public/brand/, then `python3 scripts/apply_brand.py` sizes them into the Android resources.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { preloadModels, instantiate } from '../src/world/assets.js';
import { buildCapsule } from '../src/world/models.js';
import '@fontsource/fredoka/600.css';
import '@fontsource/fredoka/700.css';

const FONT = '"Fredoka", "Arial Rounded MT Bold", sans-serif';
const INK = '#2a2440';

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setClearColor(0x000000, 0);
const envTex = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;

// glossy vinyl-toy look for the renders (the game itself uses a plain material)
const TOY = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.42, clearcoat: 0.6, clearcoatRoughness: 0.3, envMapIntensity: 0.55 });

export const ready = (async () => {
  await Promise.all([document.fonts.load(`700 80px ${FONT}`), document.fonts.load(`600 40px ${FONT}`)]);
  await preloadModels(() => {});
})();

function stage() {
  const scene = new THREE.Scene();
  scene.environment = envTex;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a96b0, 0.9));
  const key = new THREE.DirectionalLight(0xfff1dc, 2.6);
  key.position.set(-3, 5, 4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.radius = 6;
  key.shadow.bias = -0.0005;
  Object.assign(key.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3, near: 0.1, far: 20 });
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xbfe4ff, 2.2);
  rim.position.set(3, 3, -4);
  scene.add(rim);
  const fill = new THREE.DirectionalLight(0xffffff, 0.5);
  fill.position.set(4, 1, 3);
  scene.add(fill);
  return scene;
}

// One critter (or character) posed on a transparent background, with a soft contact shadow.
// `items`: [{ key, x, z, yaw, scale, clip, t }] lets several models share one shot.
export function renderShot(items, { w = 1024, h = 1024, yaw = -0.45, pitch = 0.18, fov = 28, pad = 1.08, shadow = 0.32, lookY = 0.5, zoom = 1, eyes = true } = {}) {
  const scene = stage();
  const group = new THREE.Group();
  for (const it of items) {
    if (it.object) {
      const holder = new THREE.Group();
      holder.add(it.object);
      holder.position.set(it.x || 0, it.y || 0, it.z || 0);
      holder.rotation.y = it.yaw || 0;
      group.add(holder);
      continue;
    }
    const { model, animator } = instantiate(it.key, it.scale || 1);
    model.traverse((o) => { if (o.isSkinnedMesh) { o.material = TOY; o.castShadow = true; o.frustumCulled = false; } });
    const holder = new THREE.Group();
    holder.add(model);
    holder.position.set(it.x || 0, it.y || 0, it.z || 0);
    holder.rotation.y = it.yaw || 0;
    group.add(holder);
    const clip = animator.has(it.clip || 'happy') ? (it.clip || 'happy') : 'idle';
    animator.loop(clip, 1, 0);
    const dur = animator.clips.get(clip)?.duration || 1;
    animator.update(dur * (it.t ?? 0.35));
  }
  scene.add(group);
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group, true);
  const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
  if (shadow > 0) {
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.ShadowMaterial({ opacity: shadow }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = box.min.y + 0.001;
    ground.receiveShadow = true;
    scene.add(ground);
  }
  const camera = new THREE.PerspectiveCamera(fov, w / h, 0.05, 100);
  const radius = size.length() / 2 * pad / zoom;
  const dist = radius / Math.sin(THREE.MathUtils.degToRad(Math.min(fov, fov * (w / h)) / 2));
  const target = new THREE.Vector3(center.x, box.min.y + size.y * lookY, center.z);
  camera.position.set(target.x + Math.sin(yaw) * Math.cos(pitch) * dist, target.y + Math.sin(pitch) * dist, target.z + Math.cos(yaw) * Math.cos(pitch) * dist);
  camera.lookAt(target);
  camera.updateMatrixWorld(true);
  const eyeSpots = [];
  if (eyes) group.children.forEach((holder) => cuteEyes(scene, holder, camera, eyeSpots));
  renderer.setPixelRatio(1);
  renderer.setSize(w, h, false);
  renderer.render(scene, camera);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d').drawImage(renderer.domElement, 0, 0);
  // eye positions in canvas pixels (for blush etc.)
  c.eyes = eyeSpots.map(({ p, r }) => {
    const q = p.clone().project(camera);
    const edge = p.clone().add(new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).multiplyScalar(r)).project(camera);
    return { x: (q.x + 1) / 2 * w, y: (1 - q.y) / 2 * h, r: Math.abs(edge.x - q.x) / 2 * w };
  });
  return c;
}

// The monsters' eyes are white with a thin dark slit (sleepy look). For the art, find each eye
// (the eye-white palette colour), and put a big glossy pupil with highlights on it, looking at the viewer.
const EYES = [[0.45, 0.45, 0.55], [0.35, 0.35, 0.4]]; // eye-white colours (two model sets)
const PUPIL = new THREE.MeshPhysicalMaterial({ color: 0x15101f, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.08 });
const IRIS = new THREE.MeshPhysicalMaterial({ color: 0x2b2550, roughness: 0.3, clearcoat: 1 });
const SHINE = new THREE.MeshBasicMaterial({ color: 0xffffff });
const BALL = new THREE.SphereGeometry(1, 32, 24);
function cuteEyes(scene, holder, camera, spots = []) {
  const pts = [];
  const v = new THREE.Vector3();
  holder.traverse((o) => {
    if (!o.isSkinnedMesh && !o.isMesh) return;
    const col = o.geometry.attributes.color;
    if (!col) return;
    for (let i = 0; i < col.count; i++) {
      const x = col.getX(i), y = col.getY(i), z = col.getZ(i);
      if (!EYES.some((e) => Math.abs(x - e[0]) < 0.03 && Math.abs(y - e[1]) < 0.03 && Math.abs(z - e[2]) < 0.03)) continue;
      o.getVertexPosition(i, v);
      pts.push(v.clone().applyMatrix4(o.matrixWorld));
    }
  });
  if (pts.length < 8) return;
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
  const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
  // 2-means on screen position (left eye / right eye), started from the extremes
  const sx = (p) => p.dot(right), sy = (p) => p.dot(up);
  let a = pts.reduce((m, p) => (sx(p) < sx(m) ? p : m)), b = pts.reduce((m, p) => (sx(p) > sx(m) ? p : m));
  let groups = [[], []];
  for (let it = 0; it < 8; it++) {
    groups = [[], []];
    for (const p of pts) groups[p.distanceToSquared(a) <= p.distanceToSquared(b) ? 0 : 1].push(p);
    const mean = (g) => g.reduce((m, p) => m.add(p), new THREE.Vector3()).divideScalar(Math.max(1, g.length));
    a = mean(groups[0]); b = mean(groups[1]);
  }
  for (let gi = 0; gi < 2; gi++) {
    let side = groups[gi];
    if (side.length < 4) continue;
    let c = gi === 0 ? a : b;
    // drop stray points (e.g. teeth with the same colour): keep those near the cluster's median spread
    const ds = side.map((p) => p.distanceTo(c)).sort((x, y) => x - y);
    const med = ds[ds.length >> 1];
    side = side.filter((p) => p.distanceTo(c) <= med * 1.8);
    c = side.reduce((m, p) => m.add(p), new THREE.Vector3()).divideScalar(side.length);
    const toCam = camera.position.clone().sub(c).normalize();
    // apparent radius on screen, and the eye's front-most surface point
    let rr = 0, front = c, best = -Infinity;
    for (const p of side) {
      const d = p.clone().sub(c);
      rr = Math.max(rr, Math.hypot(d.dot(right), d.dot(up)));
      const k = d.dot(toCam);
      if (k > best) { best = k; front = p; }
    }
    const at = c.clone().addScaledVector(toCam, Math.max(0, best) + rr * 0.04);
    spots.push({ p: at.clone(), r: rr });
    const add = (mat, pos, sxx, syy, szz) => {
      const m = new THREE.Mesh(BALL, mat);
      m.position.copy(pos);
      m.lookAt(camera.position);
      m.scale.set(sxx, syy, szz);
      scene.add(m);
    };
    add(IRIS, at, rr * 0.6, rr * 0.66, rr * 0.12);
    add(PUPIL, at.clone().addScaledVector(toCam, rr * 0.03), rr * 0.44, rr * 0.5, rr * 0.12);
    add(SHINE, at.clone().addScaledVector(toCam, rr * 0.08).addScaledVector(up, rr * 0.22).addScaledVector(right, -rr * 0.17), rr * 0.17, rr * 0.17, rr * 0.05);
    add(SHINE, at.clone().addScaledVector(toCam, rr * 0.08).addScaledVector(up, -rr * 0.2).addScaledVector(right, rr * 0.15), rr * 0.08, rr * 0.08, rr * 0.04);
  }
}

export function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

// rich radial background with soft rays and sparkles
export function backdrop(w, h, { inner = '#7fe0ff', mid = '#33b6e8', outer = '#1b5fb8', cx = 0.5, cy = 0.42, rays = 18, rayAlpha = 0.09, sparkles = 26, seed = 7 } = {}) {
  const [c, g] = canvas(w, h);
  const R = Math.hypot(w, h) * 0.62;
  const grd = g.createRadialGradient(w * cx, h * cy, 0, w * cx, h * cy, R);
  grd.addColorStop(0, inner);
  grd.addColorStop(0.45, mid);
  grd.addColorStop(1, outer);
  g.fillStyle = grd;
  g.fillRect(0, 0, w, h);
  g.save();
  g.translate(w * cx, h * cy);
  g.globalAlpha = rayAlpha;
  g.fillStyle = '#ffffff';
  for (let i = 0; i < rays; i++) {
    g.rotate((Math.PI * 2) / rays);
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(R * 1.2, -R * 0.09);
    g.lineTo(R * 1.2, R * 0.09);
    g.fill();
  }
  g.restore();
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < sparkles; i++) {
    const x = rnd() * w, y = rnd() * h, r = (0.004 + rnd() * 0.01) * Math.min(w, h);
    sparkle(g, x, y, r, 0.35 + rnd() * 0.5);
  }
  // soft vignette
  const v = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.hypot(w, h) * 0.6);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(10,20,60,0.35)');
  g.fillStyle = v;
  g.fillRect(0, 0, w, h);
  return c;
}

export function sparkle(g, x, y, r, a = 1) {
  g.save();
  g.globalAlpha = a;
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.moveTo(x, y - r * 2.4);
  g.quadraticCurveTo(x, y, x + r * 2.4, y);
  g.quadraticCurveTo(x, y, x, y + r * 2.4);
  g.quadraticCurveTo(x, y, x - r * 2.4, y);
  g.quadraticCurveTo(x, y, x, y - r * 2.4);
  g.fill();
  g.restore();
}

// soft white glow behind a cut-out render
export function glow(g, img, x, y, w, h, blur, color = 'rgba(255,255,255,0.55)') {
  g.save();
  g.filter = `blur(${blur}px)`;
  g.globalAlpha = 1;
  g.drawImage(tint(img, color), x, y, w, h);
  g.restore();
}

function tint(img, color) {
  const [c, g] = canvas(img.width, img.height);
  g.drawImage(img, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = color;
  g.fillRect(0, 0, c.width, c.height);
  return c;
}

// Chunky game wordmark: extruded, outlined, gradient-filled text with a gloss band
export function wordText(g, text, x, y, size, { fill = ['#fff27a', '#ffc21a', '#ff8a1a'], depth = 0.11, outline = 0.13, align = 'center', tracking = 0 } = {}) {
  g.save();
  g.font = `700 ${size}px ${FONT}`;
  g.textAlign = align;
  g.textBaseline = 'alphabetic';
  g.lineJoin = 'round';
  if (tracking) g.letterSpacing = `${tracking}px`;
  const d = size * depth, ow = size * outline;
  // drop shadow + extrusion
  g.fillStyle = 'rgba(20,10,40,0.35)';
  g.strokeStyle = 'rgba(20,10,40,0.35)';
  g.lineWidth = ow;
  g.strokeText(text, x, y + d + size * 0.06);
  for (let i = d; i > 0; i -= Math.max(1, size / 60)) {
    g.strokeStyle = INK;
    g.lineWidth = ow;
    g.strokeText(text, x, y + i);
    g.fillStyle = '#b8461a';
    g.fillText(text, x, y + i);
  }
  g.strokeStyle = INK;
  g.lineWidth = ow;
  g.strokeText(text, x, y);
  const grd = g.createLinearGradient(0, y - size * 0.8, 0, y + size * 0.05);
  grd.addColorStop(0, fill[0]);
  grd.addColorStop(0.55, fill[1]);
  grd.addColorStop(1, fill[2]);
  g.fillStyle = grd;
  g.fillText(text, x, y);
  // gloss: upper half lighter
  g.save();
  g.beginPath();
  g.rect(x - size * 20, y - size * 0.95, size * 40, size * 0.42);
  g.clip();
  g.fillStyle = 'rgba(255,255,255,0.38)';
  g.fillText(text, x, y);
  g.restore();
  g.restore();
}

// ribbon banner behind "TYCOON"
export function ribbon(g, cx, cy, w, h, { color = ['#ff6b6b', '#d93b4a'], fold = '#9c2234' } = {}) {
  const x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - h / 2, y1 = cy + h / 2, tail = h * 0.75, dip = h * 0.18;
  g.save();
  g.lineJoin = 'round';
  g.lineWidth = h * 0.09;
  g.strokeStyle = INK;
  // tails
  for (const s of [-1, 1]) {
    const xe = s < 0 ? x0 : x1;
    g.beginPath();
    g.moveTo(xe - s * tail * 0.1, y0 + h * 0.25);
    g.lineTo(xe + s * tail, y0 + h * 0.25);
    g.lineTo(xe + s * tail * 0.62, y0 + h * 0.25 + h * 0.5);
    g.lineTo(xe + s * tail, y1 + h * 0.25);
    g.lineTo(xe - s * tail * 0.1, y1 + h * 0.25);
    g.closePath();
    g.fillStyle = fold;
    g.fill();
    g.stroke();
  }
  // band (slightly curved)
  g.beginPath();
  g.moveTo(x0, y0);
  g.quadraticCurveTo(cx, y0 + dip, x1, y0);
  g.lineTo(x1, y1);
  g.quadraticCurveTo(cx, y1 + dip, x0, y1);
  g.closePath();
  const grd = g.createLinearGradient(0, y0, 0, y1);
  grd.addColorStop(0, color[0]);
  grd.addColorStop(1, color[1]);
  g.fillStyle = grd;
  g.fill();
  g.stroke();
  // highlight line
  g.beginPath();
  g.moveTo(x0 + h * 0.2, y0 + h * 0.2);
  g.quadraticCurveTo(cx, y0 + dip + h * 0.2, x1 - h * 0.2, y0 + h * 0.2);
  g.strokeStyle = 'rgba(255,255,255,0.35)';
  g.lineWidth = h * 0.07;
  g.stroke();
  g.restore();
}

// the full logo lockup on a transparent canvas: critters peeking over "Critter Ranch" + "TYCOON" ribbon
export function logo(W = 1600, H = 1000) {
  const [c, g] = canvas(W, H);
  const crowd = renderShot([
    { key: 'mon-chicken', x: -1.05, z: 0, yaw: 0.35, t: 0.05, clip: 'idle' },
    { key: 'mon-fish', x: 0, z: 0.25, yaw: 0, t: 0.05, clip: 'idle', scale: 1.1 },
    { key: 'mon-cat', x: 1.05, z: 0, yaw: -0.35, t: 0.05, clip: 'idle' },
  ], { w: W, h: Math.round(H * 0.62), yaw: 0, pitch: 0.1, fov: 22, pad: 0.6, shadow: 0, lookY: 0.5 });
  const cy = H * 0.11;
  glow(g, crowd, 0, cy, crowd.width, crowd.height, W * 0.012, 'rgba(255,255,255,0.7)');
  g.drawImage(crowd, 0, cy);
  blush(g, crowd, 0, cy);
  wordText(g, 'Critter Ranch', W / 2, H * 0.78, W * 0.135);
  ribbon(g, W / 2, H * 0.895, W * 0.4, W * 0.08);
  wordText(g, 'TYCOON', W / 2, H * 0.895 + W * 0.022, W * 0.06, { fill: ['#ffffff', '#fff3d0', '#ffd9a8'], depth: 0.06, outline: 0.12, tracking: W * 0.008 });
  return c;
}

// The original source models (full texture atlas: round eyes with pupils) for the art. The game
// uses compressed vertex-coloured copies, which blur small texture details like pupils.
const loader = new GLTFLoader();
const originals = new Map();
export async function loadOriginal(name) {
  if (!originals.has(name)) originals.set(name, await loader.loadAsync(`../assets-src/quaternius-ultimate-monsters/${name}`));
  return originals.get(name);
}

// like renderShot, for original models: items [{ name, x, z, yaw, scale (height), clip, t }]
export async function renderOriginal(items, opts = {}) {
  const prepared = [];
  for (const it of items) {
    const gltf = await loadOriginal(it.name);
    const model = cloneSkinned(gltf.scene);
    model.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.frustumCulled = false;
      const m = o.material;
      o.material = new THREE.MeshPhysicalMaterial({ map: m.map || null, color: m.color, roughness: 0.42, clearcoat: 0.6, clearcoatRoughness: 0.3, envMapIntensity: 0.55 });
      if (o.material.map) o.material.map.colorSpace = THREE.SRGBColorSpace;
    });
    const box = new THREE.Box3().setFromObject(model, true);
    const s = (it.scale || 1) / Math.max(0.001, box.max.y - box.min.y);
    model.scale.setScalar(s);
    const mixer = new THREE.AnimationMixer(model);
    const want = (it.clip || 'Idle').toLowerCase();
    const clip = gltf.animations.find((a) => a.name.toLowerCase().replace(/^characterarmature\|/, '') === want)
      || gltf.animations.find((a) => a.name.toLowerCase().includes(want)) || gltf.animations[0];
    if (clip) { mixer.clipAction(clip).play(); mixer.update(clip.duration * (it.t ?? 0.1)); }
    prepared.push({ ...it, object: model });
  }
  return renderShot(prepared, opts);
}

// the game's red/white capture capsule, glossy, tilted
export function capsule(scale = 1.6, rot = [0.5, 0.3, -0.9]) {
  const c = buildCapsule(1);
  c.scale.setScalar(scale);
  c.rotation.set(...rot);
  c.material = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.1 });
  c.castShadow = true;
  return c;
}

// soft pink cheeks under each eye of a render (drawn at the render's offset)
export function blush(g, shot, dx = 0, dy = 0, k = 1) {
  for (const e of shot.eyes || []) {
    const x = dx + e.x * k, y = dy + (e.y + e.r * 1.25) * k, r = e.r * 0.85 * k;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, 'rgba(255,105,140,0.55)');
    grd.addColorStop(1, 'rgba(255,105,140,0)');
    g.fillStyle = grd;
    g.beginPath();
    g.ellipse(x, y, r * 1.3, r * 0.8, 0, 0, Math.PI * 2);
    g.fill();
  }
}

export const PALETTES = {
  sky: { inner: '#9cf0ff', mid: '#36b9ec', outer: '#1c4fa8' },
  meadow: { inner: '#d6ff9e', mid: '#5ccf4a', outer: '#1d6e36' },
  sunset: { inner: '#fff0b0', mid: '#ffb43a', outer: '#d24a1c' },
  candy: { inner: '#ffe0f4', mid: '#ff8fc8', outer: '#9a3486' },
};

// app icon: one big hero critter with the capture capsule on a radial backdrop (no text)
export function icon(key = 'mon-cat', { S = 1024, bg = PALETTES.meadow, yaw = -0.1, pad = 0.78, cap = true, capX = 0.62, capY = 0.12, backdropOn = true } = {}) {
  const [c, g] = canvas(S, S);
  if (backdropOn) g.drawImage(backdrop(S, S, bg), 0, 0);
  const items = [{ key, clip: 'idle', t: 0.05 }];
  if (cap) items.push({ object: capsule(0.78, [0.35, 0.6, -0.75]), x: capX, y: capY, z: 0.42 });
  const hero = renderShot(items, { w: S, h: S, yaw, pitch: 0.12, fov: 24, pad, shadow: backdropOn ? 0.28 : 0, lookY: 0.48 });
  glow(g, hero, 0, S * 0.04, S, S, S * 0.03, 'rgba(255,255,255,0.8)');
  g.drawImage(hero, 0, S * 0.04);
  blush(g, hero, 0, S * 0.04);
  return c;
}

// Play Store feature graphic 1024×500: hero cat with capsule on the left, logo on the right
export function feature(W = 1024, H = 500) {
  const [c, g] = canvas(W, H);
  g.drawImage(backdrop(W, H, { ...PALETTES.meadow, cx: 0.3, cy: 0.5, sparkles: 30 }), 0, 0);
  const hero = renderShot([
    { key: 'mon-cat', clip: 'idle', t: 0.05 },
    { object: capsule(0.7, [0.35, 0.6, -0.75]), x: 0.62, y: 0.1, z: 0.42 },
  ], { w: 520, h: 520, yaw: -0.15, pitch: 0.12, fov: 24, pad: 0.8, shadow: 0.25, lookY: 0.48 });
  glow(g, hero, 10, -6, 520, 520, 14, 'rgba(255,255,255,0.75)');
  g.drawImage(hero, 10, -6);
  blush(g, hero, 10, -6);
  const l = logo(1600, 1000);
  g.drawImage(l, 400, 10, 620, 387.5);
  g.save();
  g.font = `600 30px ${FONT}`;
  g.textAlign = 'center';
  g.lineJoin = 'round';
  g.strokeStyle = 'rgba(20,60,20,0.85)';
  g.lineWidth = 7;
  g.strokeText('Catch · Sell · Grow your ranch', 710, 445);
  g.fillStyle = '#ffffff';
  g.fillText('Catch · Sell · Grow your ranch', 710, 445);
  g.restore();
  return c;
}

// everything the game and Play Store need; scripts/apply_brand.py sizes them into Android resources
export async function exportAll() {
  const out = [];
  out.push(await save('brand-out/icon-1024.png', icon()));
  out.push(await save('brand-out/icon-foreground-1024.png', icon('mon-cat', { backdropOn: false, pad: 1.25 })));
  out.push(await save('brand-out/icon-background-1024.png', backdrop(1024, 1024, PALETTES.meadow)));
  out.push(await save('brand-out/backdrop-2048.png', backdrop(2048, 2048, { ...PALETTES.meadow, cy: 0.45, sparkles: 40 })));
  const l = logo(1600, 1000);
  out.push(await save('brand-out/logo-1600.png', l));
  const small = document.createElement('canvas');
  small.width = 960; small.height = 600;
  small.getContext('2d').drawImage(l, 0, 0, 960, 600);
  out.push(await save('public/brand/logo.webp', small, 'image/webp', 0.9));
  out.push(await save('brand-out/feature-graphic-1024x500.png', feature()));
  return out;
}

export async function save(path, c, type = 'image/png', q = 0.92) {
  const data = c.toDataURL(type, q);
  const r = await fetch('http://localhost:5199/', { method: 'POST', body: JSON.stringify({ path, data }) });
  return r.text();
}
