import * as THREE from 'three';
import { surfaceMaterial } from '../quality.js';
import { L, DECK_Y } from './layout.js';
import * as T from './textures.js';
import { THEME } from './worlds.js';
import {
  VCOL_MAT, pineGeometry, roundTreeGeometry, rockGeometry, bushGeometry, tuftGeometry, flowerGeometry,
  stakeGeometry, railSegmentGeometry, barrelGeometry,
} from './models.js';

function rand(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function instanced(geo, transforms, { cast = true, receive = false } = {}) {
  const im = new THREE.InstancedMesh(geo, VCOL_MAT, transforms.length);
  const m = new THREE.Matrix4();
  transforms.forEach((t, i) => {
    m.compose(
      new THREE.Vector3(t[0], t[1], t[2]),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(t[5] || 0, t[3] || 0, t[6] || 0)),
      new THREE.Vector3(t[4] || 1, t[7] || t[4] || 1, t[4] || 1),
    );
    im.setMatrixAt(i, m);
  });
  im.castShadow = cast;
  im.receiveShadow = receive;
  im.computeBoundingSphere();
  return im;
}

// Palisade of sharpened stakes along a polyline
export function stakeLine(points, spacing = 0.36, seed = 1) {
  const r = rand(seed);
  const out = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, z0] = points[i], [x1, z1] = points[i + 1];
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.round(len / spacing));
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      const h = 0.85 + r() * 0.3;
      out.push([x0 + (x1 - x0) * t, DECK_Y - 0.2, z0 + (z1 - z0) * t, r() * 6, 1, (r() - 0.5) * 0.08, (r() - 0.5) * 0.08, h]);
    }
  }
  return out;
}

export function deckBox(x0, x1, z0, z1, y = DECK_Y, plank) {
  const w = x1 - x0, d = z1 - z0;
  const top = plank.clone();
  top.needsUpdate = true;
  top.repeat.set(w / 6, d / 6);
  // one material for all faces: a per-face material array costs 6 draw calls (+6 shadow) per deck
  const g = new THREE.BoxGeometry(w, y, d);
  const topM = surfaceMaterial({ map: top, roughness: 0.8 });
  const mesh = new THREE.Mesh(g, topM);
  mesh.position.set((x0 + x1) / 2, y / 2, (z0 + z1) / 2);
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  return mesh;
}

// Palisade around the main deck (gaps for the balcony, the belt machines and any bought pasture)
// and around each bought pasture deck. Rebuilt whenever a pasture is added.
function cutGaps(x0, x1, gaps) {
  const out = [];
  let a = x0;
  for (const [g0, g1] of [...gaps].sort((p, q) => p[0] - q[0])) {
    if (g1 <= a || g0 >= x1) continue;
    if (g0 > a) out.push([a, g0]);
    a = Math.max(a, g1);
  }
  if (a < x1) out.push([a, x1]);
  return out;
}

export function addRail(scene, len, x, z, rotY) {
  const m = new THREE.Mesh(railSegmentGeometry(len), VCOL_MAT);
  m.position.set(x, DECK_Y, z);
  m.rotation.y = rotY;
  m.castShadow = true;
  scene.add(m);
  return m;
}

// `opened`: bought pastures (gaps in the south fence), balconies (gaps in the north fence) and the
// Doctor Deck (a gap in the East Pasture's south fence)
export function buildPalisade(scene, opened = []) {
  const D = L.deck, B = L.balcony;
  const openYards = opened.filter((id) => L.yards[id]);
  const southGaps = openYards.map((id) => L.yards[id].gap);
  const northGaps = opened.filter((id) => L.balconies[id]).map((id) => L.balconies[id].gap);
  const south = (x0, x1, seed) => cutGaps(x0, x1, southGaps).flatMap(([a, b], i) => stakeLine([[a, D.z1], [b, D.z1]], 0.36, seed * 10 + i));
  const north = (x0, x1, seed) => cutGaps(x0, x1, northGaps).flatMap(([a, b], i) => stakeLine([[a, D.z0], [b, D.z0]], 0.36, seed * 10 + i));
  const stakes = [
    ...north(D.x0, B.x0, 1),
    ...north(B.x1, D.x1, 2),
    ...stakeLine([[D.x0, D.z0], [D.x0, D.z1]], 0.36, 3),
    ...stakeLine([[D.x1, D.z0], [D.x1, D.z1]], 0.36, 4),
    ...south(D.x0, L.machineA[0] - 1.1, 5),
    ...south(L.machineA[0] + 1.1, L.machineB[0] - 1.1, 6),
    ...south(L.machineB[0] + 1.1, D.x1, 7),
  ];
  const clinic = opened.includes('clinic');
  openYards.forEach((id, k) => {
    const Y = L.yards[id].deck;
    const seed = 20 + k * 5;
    // the stretch of the yard's north edge that isn't the main deck's south fence
    const north = Y.x0 < D.x0 ? [Y.x0, D.x0] : [D.x1, Y.x1];
    const southGap = id === 'yardE' && clinic ? [L.clinic.gap] : [];
    stakes.push(
      ...stakeLine([[north[0], Y.z0], [north[1], Y.z0]], 0.36, seed),
      ...stakeLine([[Y.x0, Y.z0], [Y.x0, Y.z1]], 0.36, seed + 1),
      ...stakeLine([[Y.x1, Y.z0], [Y.x1, Y.z1]], 0.36, seed + 2),
      ...cutGaps(Y.x0, Y.x1, southGap).flatMap(([a, b], i) => stakeLine([[a, Y.z1], [b, Y.z1]], 0.36, seed + 3 + i * 50)),
    );
  });
  if (clinic) {
    const C = L.clinic.deck;
    stakes.push(
      ...stakeLine([[C.x0, C.z0], [C.x0, C.z1]], 0.36, 40),
      ...stakeLine([[C.x1, C.z0], [C.x1, C.z1]], 0.36, 41),
      ...stakeLine([[C.x0, C.z1], [C.x1, C.z1]], 0.36, 42),
    );
  }
  const mesh = instanced(stakeGeometry(), stakes);
  scene.add(mesh);
  return mesh;
}

export function buildEnvironment(scene, { low = false } = {}) {
  const density = low ? 0.35 : 1; // grass tufts / flowers / far trees on weak phones
  const r = rand(42);
  const plank = T.plankTexture();

  // sky + ground
  scene.background = new THREE.Color(THEME.sky);
  scene.fog = new THREE.Fog(THEME.fog, 48, 105);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(260, 260),
    surfaceMaterial({ map: T.grassTexture(), roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // dirt path the customers walk along
  const dirt = T.dirtTexture();
  const path = new THREE.Mesh(new THREE.PlaneGeometry(4, 40), surfaceMaterial({ map: dirt, roughness: 1, transparent: true, opacity: 0.85 }));
  path.rotation.x = -Math.PI / 2;
  path.position.set(-1.5, 0.01, 33);
  path.receiveShadow = true;
  scene.add(path);

  // decks
  const D = L.deck, B = L.balcony;
  scene.add(deckBox(D.x0, D.x1, D.z0, D.z1, DECK_Y, plank));
  scene.add(deckBox(B.x0, B.x1, B.z0, B.z1, DECK_Y, plank));

  // (the palisade is built by buildPalisade, because pastures open gaps in it)

  // balcony railing
  const rail = (len, x, z, rotY) => addRail(scene, len, x, z, rotY);
  rail(B.x1 - B.x0, 0, B.z0 + 0.1, 0);
  rail(B.z1 - B.z0, B.x0 + 0.1, (B.z0 + B.z1) / 2, Math.PI / 2);
  rail(B.z1 - B.z0, B.x1 - 0.1, (B.z0 + B.z1) / 2, Math.PI / 2);

  // props on the deck
  const prop = (geo, [x, z], rotY = 0, s = 1) => {
    const m = new THREE.Mesh(geo, VCOL_MAT);
    m.position.set(x, DECK_Y, z);
    m.rotation.y = rotY;
    m.scale.setScalar(s);
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
  };
  const barrel = barrelGeometry();
  L.props.barrels.forEach((p, i) => prop(barrel, p, i));

  // trees around the base + framing the field
  const pines = [], rounds = [], rocks = [], bushes = [];
  // pens, plus the pasture plots (deck + pen) that are kept clear until they're bought
  const inPen = (x, z) => (Math.abs(x) > 10 && Math.abs(x) < 19.6 && z > -7.6 && z < 4.6)
    || (Math.abs(x) > 2.4 && Math.abs(x) < 21.4 && z > 5.4 && z < 21.4);
  const avoid = (x, z) =>
    (x > -24 && x < 24 && z > -14 && z < 24) || // base + customer area
    (x > -28 && x < 28 && z > -52 && z < -14 && Math.abs(x) < 20); // keep field open
  for (let i = 0; i < 170 * (low ? 0.6 : 1); i++) {
    const x = (r() - 0.5) * 150, z = -80 + r() * 130;
    if (avoid(x, z)) continue;
    const s = 0.8 + r() * 0.7;
    (r() > 0.45 ? pines : rounds).push([x, 0, z, r() * 6, s]);
  }
  // a few trees inside the field for depth, like the reference
  for (let i = 0; i < 16; i++) {
    const x = (r() - 0.5) * 50, z = -20 - r() * 34;
    pines.push([x, 0, z, r() * 6, 0.6 + r() * 0.4]);
  }
  for (let i = 0; i < 18; i++) {
    const x = (r() - 0.5) * 56, z = -16 - r() * 38;
    const near = z > -26 && Math.abs(x) < 12;
    rocks.push([x, 0, z, r() * 6, near ? 0.35 + r() * 0.3 : 0.5 + r() * 0.9]);
  }
  for (let i = 0; i < 40; i++) {
    const x = (r() - 0.5) * 70, z = -14 + r() * 40;
    if (x > -11 && x < 11 && z > -12 && z < 8) continue;
    if (x > -7 && x < 4 && z > 6 && z < 20) continue;
    if (inPen(x, z)) continue;
    bushes.push([x, 0, z, r() * 6, 0.7 + r() * 0.8]);
  }
  scene.add(instanced(pineGeometry(), pines));
  scene.add(instanced(roundTreeGeometry(), rounds));
  scene.add(instanced(rockGeometry(), rocks, { receive: true }));
  scene.add(instanced(bushGeometry(), bushes));

  // grass tufts + flowers (cheap detail)
  const tufts = [], flowers = [];
  for (let i = 0; i < 1800 * density; i++) {
    const x = (r() - 0.5) * 110, z = -70 + r() * 110;
    if (x > -10.5 && x < 10.5 && z > -12 && z < 6.5) continue;
    if (inPen(x, z)) continue;
    tufts.push([x, 0, z, r() * 6, 0.8 + r() * 0.8]);
  }
  for (let i = 0; i < 70 * density; i++) {
    const cx = (r() - 0.5) * 80, cz = -60 + r() * 90;
    if (cx > -11 && cx < 11 && cz > -12 && cz < 7) continue;
    if (inPen(cx, cz)) continue;
    for (let k = 0; k < 8; k++) flowers.push([cx + (r() - 0.5) * 2.5, 0, cz + (r() - 0.5) * 2.5, r() * 6, 0.8 + r() * 0.6]);
  }
  scene.add(instanced(tuftGeometry(), tufts, { cast: false }));
  scene.add(instanced(flowerGeometry(), flowers, { cast: false }));

  return { plank, dirt };
}

// Lighting rig; the sun follows the camera target so shadows stay crisp
export function buildLights(scene) {
  const hemi = new THREE.HemisphereLight(...THEME.hemi);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(...THEME.sun);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const s = sun.shadow.camera;
  s.left = -26; s.right = 26; s.top = 26; s.bottom = -26; s.near = 1; s.far = 90;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.03;
  sun.shadow.radius = 3;
  scene.add(sun);
  scene.add(sun.target);
  const offset = new THREE.Vector3(-14, 30, 12);
  return {
    sun,
    follow(target) {
      sun.position.copy(target).add(offset);
      sun.target.position.copy(target);
    },
  };
}
