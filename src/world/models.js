import * as THREE from 'three';
import { surfaceMaterial } from '../quality.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { hasModel, instantiate, disposeInstance } from './assets.js';
import { THEME } from './worlds.js';

// ── shared geometry / material caches ───────────────────────
export const GEO = {
  sphere: new THREE.SphereGeometry(1, 16, 12),
  sphereLo: new THREE.SphereGeometry(1, 8, 6),
  cone: new THREE.ConeGeometry(1, 1, 10),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 12),
  box: new THREE.BoxGeometry(1, 1, 1),
  ico: new THREE.IcosahedronGeometry(1, 0),
  dodeca: new THREE.DodecahedronGeometry(1, 0),
};

const matCache = new Map();
export function mat(color, { rough = 0.62, metal = 0, emissive = 0x000000, ei = 0 } = {}) {
  const key = `${color}|${rough}|${metal}|${emissive}|${ei}`;
  if (!matCache.has(key)) {
    matCache.set(key, surfaceMaterial({
      color, roughness: rough, metalness: metal, emissive, emissiveIntensity: ei,
    }));
  }
  return matCache.get(key);
}

export const VCOL_MAT = surfaceMaterial({ vertexColors: true, roughness: 0.75 });
export const BAKED_MAT = surfaceMaterial({ vertexColors: true, roughness: 0.55 });

// Merge many small coloured meshes into one vertex-coloured mesh (1 draw call).
// Meshes with emissive materials are left alone so they keep their glow.
function bakeable(m) {
  return m.isMesh && (m.material.isMeshStandardMaterial || m.material.isMeshLambertMaterial) && !m.material.vertexColors && !(m.material.emissiveIntensity > 0);
}

function mergeInto(meshes, relativeTo) {
  relativeTo.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(relativeTo.matrixWorld).invert();
  const parts = meshes.map((m) => {
    const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    const c = m.material.color;
    const n = g.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    return g;
  });
  return mergeGeometries(parts);
}

// Bakes the direct static mesh children of `group` (and of `include` subgroups)
// into one mesh. `cacheKey` lets identical models share the merged geometry.
const bakeCache = new Map();
export function bakeGroup(group, { include = [], skip = [], cacheKey = null } = {}) {
  const meshes = [];
  for (const ch of group.children) if (bakeable(ch) && !skip.includes(ch)) meshes.push(ch);
  for (const sub of include) for (const ch of sub.children) if (bakeable(ch)) meshes.push(ch);
  if (!meshes.length) return null;
  let geo = cacheKey && bakeCache.get(cacheKey);
  if (!geo) {
    geo = mergeInto(meshes, group);
    if (cacheKey) bakeCache.set(cacheKey, geo);
    else geo.userData.disposable = true;
  }
  for (const m of meshes) m.parent.remove(m);
  const baked = new THREE.Mesh(geo, BAKED_MAT);
  baked.castShadow = true;
  group.add(baked);
  return baked;
}

// Frees a character that leaves the game: merged procedural geometry and model bone textures
export function disposeBaked(root) {
  root.traverse((o) => { if (o.isMesh && o.geometry.userData.disposable) o.geometry.dispose(); });
  disposeInstance(root);
}

function part(parent, geo, material, [x, y, z], [sx, sy, sz] = [1, 1, 1], rot = null, shadow = true) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
  m.castShadow = shadow;
  parent.add(m);
  return m;
}

// Adds a flat vertex color to a geometry clone so pieces can be merged
function colored(geo, color, transform) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  if (transform) g.applyMatrix4(transform);
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

function M(pos = [0, 0, 0], scale = [1, 1, 1], rot = [0, 0, 0]) {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(...pos),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)),
    new THREE.Vector3(...scale),
  );
}

// ── Humanoids (player, helpers, customers) ───────────────────
// Every humanoid exposes: root, body, back (stack anchor), animate(dt, speed, carrying),
// handWorld(v), throwAnim() and emote(name). `o.model` picks a rigged model; without it
// (or if it failed to load) the procedural figure below is built.
const HUMAN_H = 1.55; // chibi models read bigger than the procedural 1.8-tall figure

export function buildHumanoid(o = {}) {
  if (hasModel(o.model)) return modelHumanoid(o);
  return proceduralHumanoid(o);
}

function modelHumanoid(o) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const { model, bones, animator } = instantiate(o.model, HUMAN_H);
  body.add(model);
  // stack anchor: behind the (big, chibi) head, at the old procedural height
  const back = new THREE.Group();
  back.position.set(0, 0.62, -0.52);
  body.add(back);
  root.scale.setScalar(o.scale || 1);
  const hand = bones.get('arm-right');
  return {
    root, body, head: null, legs: [], arms: [], back, animator,
    holdY: HUMAN_H + 0.3, // where customers hold a bought capsule above their head
    animate(dt, speed) {
      if (speed < 0.1) animator.loop('idle');
      else if (speed < 3.4) animator.loop('walk', THREE.MathUtils.clamp(speed / 2.4, 0.7, 1.5));
      else animator.loop('run', THREE.MathUtils.clamp(speed / 5.6, 0.8, 1.4));
      animator.update(dt);
    },
    handWorld(v) {
      if (!hand) return root.localToWorld(v.set(-0.35, 1.0, 0.25));
      hand.getWorldPosition(v);
      v.y += 0.15;
      return v;
    },
    throwAnim() { animator.once('throw', 1.8); },
    emote(name) { animator.once(name, 1, { restart: false }); },
  };
}

function proceduralHumanoid(o) {
  const c = {
    skin: 0xf6c9a4, hair: 0xe0435a, shirt: 0xffffff, pants: 0x3f63c8, shoes: 0x6b3b22,
    vest: null, backpack: null, hat: null, ponytail: false, scale: 1, ...o,
  };
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const skin = mat(c.skin, { rough: 0.7 });

  // legs (pivot at hip)
  const legs = [];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(0.12 * s, 0.62, 0);
    part(pivot, GEO.sphere, skin, [0, -0.24, 0], [0.095, 0.24, 0.095]);
    part(pivot, GEO.sphere, mat(c.shoes), [0, -0.52, 0.04], [0.12, 0.1, 0.17]);
    body.add(pivot);
    legs.push(pivot);
  }
  // shorts + torso
  part(body, GEO.sphere, mat(c.pants), [0, 0.66, 0], [0.27, 0.16, 0.22]);
  part(body, GEO.sphere, mat(c.shirt), [0, 0.92, 0], [0.26, 0.3, 0.22]);
  if (c.vest) part(body, GEO.sphere, mat(c.vest), [0, 0.92, -0.02], [0.27, 0.26, 0.21]);
  // arms (pivot at shoulder)
  const arms = [];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(0.29 * s, 1.1, 0);
    part(pivot, GEO.sphere, mat(c.shirt), [0, -0.06, 0], [0.1, 0.1, 0.1]);
    part(pivot, GEO.sphere, skin, [0.02 * s, -0.24, 0], [0.075, 0.2, 0.075]);
    part(pivot, GEO.sphere, skin, [0.02 * s, -0.44, 0], [0.08, 0.08, 0.08]);
    body.add(pivot);
    arms.push(pivot);
  }
  // head
  const head = new THREE.Group();
  head.position.set(0, 1.46, 0);
  body.add(head);
  part(head, GEO.sphere, skin, [0, 0, 0], [0.34, 0.33, 0.32]);
  const hairM = mat(c.hair, { rough: 0.5 });
  const cap = new THREE.SphereGeometry(1, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.6);
  part(head, cap, hairM, [0, 0.03, -0.03], [0.37, 0.37, 0.36], [-0.45, 0, 0]);
  // bangs
  part(head, GEO.sphere, hairM, [-0.13, 0.2, 0.22], [0.15, 0.09, 0.1], [0.3, 0, 0.4]);
  part(head, GEO.sphere, hairM, [0.12, 0.21, 0.22], [0.16, 0.09, 0.1], [0.3, 0, -0.3]);
  if (c.ponytail) {
    part(head, GEO.sphere, hairM, [0, 0.05, -0.36], [0.17, 0.2, 0.17]);
    part(head, GEO.sphere, hairM, [0, -0.2, -0.42], [0.12, 0.22, 0.12], [0.3, 0, 0]);
  }
  if (c.hat) {
    part(head, GEO.sphere, mat(c.hat), [0, 0.18, 0], [0.36, 0.2, 0.36]);
    part(head, GEO.cyl, mat(c.hat), [0, 0.14, 0.2], [0.26, 0.03, 0.2]);
  }
  // face
  const eyeM = mat(0x2a1d1a, { rough: 0.25 });
  for (const s of [-1, 1]) {
    part(head, GEO.sphere, eyeM, [0.12 * s, 0.0, 0.29], [0.045, 0.07, 0.03], null, false);
    part(head, GEO.sphereLo, mat(0xffffff, { rough: 0.2 }), [0.12 * s + 0.015, 0.03, 0.315], [0.015, 0.018, 0.01], null, false);
    part(head, GEO.sphereLo, mat(0xff9a9a, { rough: 0.8 }), [0.2 * s, -0.08, 0.25], [0.05, 0.03, 0.02], null, false);
  }
  if (c.backpack) {
    part(body, new RoundedBoxGeometry(1, 1, 1, 2, 0.2), mat(c.backpack), [0, 0.95, -0.26], [0.36, 0.38, 0.2]);
    part(body, new RoundedBoxGeometry(1, 1, 1, 2, 0.2), mat(0x8a5634), [0, 0.86, -0.37], [0.26, 0.16, 0.06]);
  }

  // stack anchor on the back
  const back = new THREE.Group();
  back.position.set(0, 0.62, -0.5);
  body.add(back);

  // bake: torso + head into one mesh, each limb into one mesh
  bakeGroup(body, { include: [head] });
  for (const limb of [...legs, ...arms]) bakeGroup(limb);
  root.scale.setScalar(c.scale);
  let phase = 0;
  return {
    root, body, head, legs, arms, back,
    animate(dt, speed, carrying = false) {
      const moving = speed > 0.1;
      phase += dt * (moving ? 6 + speed * 1.4 : 0);
      const k = moving ? Math.min(1, speed / 4) : 0;
      const sw = Math.sin(phase) * 0.8 * k;
      legs[0].rotation.x = THREE.MathUtils.lerp(legs[0].rotation.x, sw, 0.4);
      legs[1].rotation.x = THREE.MathUtils.lerp(legs[1].rotation.x, -sw, 0.4);
      const armBase = carrying ? -0.5 : 0;
      arms[0].rotation.x = THREE.MathUtils.lerp(arms[0].rotation.x, armBase - sw * 0.7, 0.3);
      arms[1].rotation.x = THREE.MathUtils.lerp(arms[1].rotation.x, armBase + sw * 0.7, 0.3);
      body.position.y = moving ? Math.abs(Math.sin(phase)) * 0.06 : Math.sin(performance.now() / 500) * 0.012;
    },
    holdY: 2.15,
    handWorld(v) { return arms[1].localToWorld(v.set(0, -0.45, 0)); },
    throwAnim() { arms[1].rotation.x = -2.6; },
    emote() {},
  };
}

// ── Critters (all original designs) ──────────────────────────
function eyes(g, y, z, spread, size, iris = 0x1d1d2b, angry = false) {
  for (const s of [-1, 1]) {
    part(g, GEO.sphere, mat(0xffffff, { rough: 0.25 }), [spread * s, y, z], [size, size * 1.15, size * 0.6], null, false);
    part(g, GEO.sphere, mat(iris, { rough: 0.2 }), [spread * s, y - size * 0.05, z + size * 0.4], [size * 0.62, size * 0.75, size * 0.35], null, false);
    part(g, GEO.sphereLo, mat(0xffffff, { rough: 0.1 }), [spread * s + size * 0.2, y + size * 0.3, z + size * 0.62], [size * 0.2, size * 0.2, size * 0.1], null, false);
    if (angry) part(g, GEO.box, mat(0x1a1a24), [spread * s, y + size * 1.15, z + size * 0.3], [size * 1.4, size * 0.25, size * 0.3], [0, 0, 0.45 * s], false);
  }
}

function feet(g, color, spread = 0.22, z = 0.12, size = 0.13) {
  const out = [];
  for (const s of [-1, 1]) out.push(part(g, GEO.sphere, mat(color), [spread * s, 0.07, z], [size, size * 0.7, size * 1.3]));
  return out;
}

// `model` is the rigged model (assets.js), `modelH` its height at scale 1 and `hover` how high a
// flying critter floats. `colors` drive the procedural fallback (its own builder, or `fallback`'s).
// `world` is where the species lives (spawn tables are in worlds.js).
export const SPECIES = {
  bloop: { name: 'Bloop', emoji: '🐧', mult: 1.0, colors: [0x4fb6ff, 0xffffff, 0xffc83a], model: 'mon-fish', modelH: 1.25 },
  sproutle: { name: 'Sproutle', emoji: '🌱', mult: 1.05, colors: [0x86dd5a, 0xeaffd2, 0x3aa53a], model: 'mon-cactoro', modelH: 1.05 },
  zapchick: { name: 'Zapchick', emoji: '⚡', mult: 1.1, colors: [0xffde3d, 0xfff6cc, 0xff9a1a], model: 'mon-chicken', modelH: 1.2 },
  emberpup: { name: 'Emberpup', emoji: '🔥', mult: 1.15, colors: [0xff8a2b, 0xffe0a8, 0xfff0d0], model: 'mon-dog', modelH: 1.0 },
  frostail: { name: 'Frostail', emoji: '❄️', mult: 1.2, colors: [0xbfe7ff, 0xffffff, 0x3a7bd5], model: 'mon-yeti', modelH: 1.1 },
  shadowolf: { name: 'Shadowolf', emoji: '🐺', mult: 1.3, colors: [0x2d355c, 0xdfe2ee, 0xe8324a], model: 'mon-bluedemon', modelH: 1.75 },
  rockhorn: { name: 'Rockhorn', emoji: '🦏', mult: 1.35, colors: [0x7a7396, 0xb9b3cf, 0xf3e3c0], model: 'mon-dino', modelH: 1.6 },
  mossgolem: { name: 'Mossgolem', emoji: '🗿', mult: 1.5, colors: [0x2f6f6a, 0x5fbf5a, 0xb455ff], model: 'mon-mushroomking', modelH: 1.9 },
  // Frosty Peaks
  frostcap: { world: 2, name: 'Frostcap', emoji: '🍄', mult: 1.0, colors: [0x6fb8f0, 0xf3e6cf, 0x2f6fb8], fallback: 'sproutle', model: 'mon-mushnub', modelH: 1.15 },
  puffling: { world: 2, name: 'Puffling', emoji: '🐦', mult: 1.05, colors: [0x3d6fe0, 0xffffff, 0xe03a3a], fallback: 'zapchick', model: 'mon-birb', modelH: 1.1 },
  duskwing: { world: 2, name: 'Duskwing', emoji: '🦇', mult: 1.1, colors: [0x40357a, 0xc9c3e0, 0xffd84a], fallback: 'bloop', model: 'mon-glub', modelH: 1.0, hover: 0.8 },
  snowhop: { world: 2, name: 'Snowhop', emoji: '🐰', mult: 1.2, colors: [0xf4f4f4, 0xffc4d4, 0x3a7bd5], fallback: 'frostail', model: 'mon-bunny', modelH: 1.75 },
  yetiburr: { world: 2, name: 'Yetiburr', emoji: '🏔️', mult: 1.35, colors: [0xe8f2fa, 0x4fa3c8, 0x2d3a5c], fallback: 'mossgolem', model: 'mon-yetibig', modelH: 1.8 },
  frostwisp: { world: 2, name: 'Frostwisp', emoji: '👻', mult: 1.5, colors: [0x3a2050, 0xd6c8f0, 0x9fe8ff], fallback: 'shadowolf', model: 'mon-ghost', modelH: 1.55, hover: 0.6 },
  // Ember Canyon
  cindercat: { world: 3, name: 'Cindercat', emoji: '🐱', mult: 1.0, colors: [0xe08a3a, 0xffe0b0, 0x7a3a1a], fallback: 'emberpup', model: 'mon-cat', modelH: 1.05 },
  buzzspark: { world: 3, name: 'Buzzspark', emoji: '🐝', mult: 1.05, colors: [0xffd23a, 0x2a2a2a, 0xffffff], fallback: 'zapchick', model: 'mon-armabee', modelH: 1.0, hover: 0.8 },
  magmatoad: { world: 3, name: 'Magmatoad', emoji: '🐸', mult: 1.15, colors: [0xe8b030, 0x2a2a2a, 0xff6a2a], fallback: 'rockhorn', model: 'mon-frog', modelH: 1.55 },
  impyre: { world: 3, name: 'Impyre', emoji: '😈', mult: 1.25, colors: [0xc8282a, 0x2a1a1a, 0xffd84a], fallback: 'shadowolf', model: 'mon-demonfly', modelH: 1.35, hover: 0.7 },
  sunlord: { world: 3, name: 'Sunlord', emoji: '🌞', mult: 1.35, colors: [0xc89a2a, 0xffe08a, 0x6a5a2a], fallback: 'zapchick', model: 'mon-alpaking', modelH: 1.2, hover: 0.9 },
  pyrodrake: { world: 3, name: 'Pyrodrake', emoji: '🐉', mult: 1.6, colors: [0xff7a2a, 0xffd08a, 0x5a2a1a], fallback: 'emberpup', model: 'mon-dragon', modelH: 1.6, hover: 0.8 },
};

const BUILDERS = {
  bloop(g, [c, b, a]) {
    part(g, GEO.sphere, mat(c), [0, 0.5, 0], [0.48, 0.5, 0.44]);
    part(g, GEO.sphere, mat(b), [0, 0.42, 0.16], [0.36, 0.36, 0.32]);
    part(g, GEO.sphere, mat(a, { rough: 0.4 }), [0, 0.58, 0.44], [0.2, 0.08, 0.22]);
    for (const s of [-1, 1]) part(g, GEO.sphere, mat(c), [0.46 * s, 0.45, 0], [0.08, 0.24, 0.14], [0, 0, 0.5 * s]);
    part(g, GEO.sphere, mat(c), [0, 1.0, -0.02], [0.08, 0.1, 0.08]);
    part(g, GEO.sphere, mat(c), [0.07, 1.02, 0.03], [0.06, 0.08, 0.06]);
    eyes(g, 0.74, 0.34, 0.15, 0.1);
    return { feet: feet(g, a), height: 1.1 };
  },
  sproutle(g, [c, b, a]) {
    part(g, GEO.sphere, mat(c), [0, 0.44, 0], [0.42, 0.42, 0.4]);
    part(g, GEO.sphere, mat(b), [0, 0.38, 0.14], [0.3, 0.3, 0.3]);
    for (const s of [-1, 1]) part(g, GEO.sphere, mat(a), [0.17 * s, 0.98, -0.04], [0.1, 0.34, 0.05], [0, 0, -0.25 * s]);
    part(g, GEO.cyl, mat(a), [0, 0.92, 0.02], [0.02, 0.18, 0.02]);
    part(g, GEO.sphere, mat(0x5fd35a), [0.08, 1.02, 0.02], [0.1, 0.04, 0.06], [0, 0, 0.4]);
    eyes(g, 0.56, 0.32, 0.14, 0.1);
    for (const s of [-1, 1]) part(g, GEO.sphereLo, mat(0xff9fb0), [0.27 * s, 0.44, 0.3], [0.06, 0.035, 0.02], null, false);
    part(g, GEO.sphere, mat(b), [0, 0.32, -0.38], [0.12, 0.12, 0.12]);
    return { feet: feet(g, c), height: 1.2 };
  },
  zapchick(g, [c, b, a]) {
    part(g, GEO.sphere, mat(c), [0, 0.46, 0], [0.44, 0.44, 0.42]);
    part(g, GEO.sphere, mat(b), [0, 0.38, 0.17], [0.3, 0.28, 0.28]);
    part(g, GEO.cone, mat(a), [0, 0.5, 0.44], [0.07, 0.14, 0.07], [Math.PI / 2, 0, 0]);
    const z = mat(a, { emissive: a, ei: 0.35 });
    part(g, GEO.cone, z, [0, 0.98, 0], [0.08, 0.3, 0.08], [0, 0, 0.35]);
    part(g, GEO.cone, z, [0.08, 1.12, 0], [0.07, 0.24, 0.07], [0, 0, -0.5]);
    part(g, GEO.cone, z, [0.14, 1.22, 0], [0.05, 0.18, 0.05], [0, 0, 0.4]);
    for (const s of [-1, 1]) part(g, GEO.sphere, mat(c), [0.42 * s, 0.5, -0.02], [0.08, 0.18, 0.14], [0, 0, 0.8 * s]);
    eyes(g, 0.62, 0.34, 0.15, 0.09);
    return { feet: feet(g, a, 0.18), height: 1.25 };
  },
  emberpup(g, [c, b, a]) {
    part(g, GEO.sphere, mat(c), [0, 0.46, -0.05], [0.42, 0.42, 0.48]);
    part(g, GEO.sphere, mat(b), [0, 0.38, 0.14], [0.3, 0.28, 0.32]);
    part(g, GEO.sphere, mat(c), [0, 0.5, 0.4], [0.22, 0.16, 0.18]);
    for (const s of [-1, 1]) part(g, GEO.cone, mat(a), [0.16 * s, 0.92, -0.04], [0.07, 0.24, 0.07], [-0.3, 0, -0.35 * s]);
    const flame = mat(0xffb020, { emissive: 0xff6a00, ei: 1.2, rough: 0.4 });
    const tail = new THREE.Group();
    tail.position.set(0, 0.42, -0.48);
    g.add(tail);
    part(tail, GEO.sphere, mat(c), [0, 0.1, -0.12], [0.1, 0.1, 0.24], [0.6, 0, 0]);
    part(tail, GEO.cone, flame, [0, 0.36, -0.24], [0.14, 0.34, 0.14], null, false);
    part(tail, GEO.sphere, mat(0xfff06a, { emissive: 0xffc000, ei: 1.0 }), [0, 0.28, -0.24], [0.1, 0.1, 0.1], null, false);
    eyes(g, 0.68, 0.36, 0.15, 0.1);
    return { feet: feet(g, c, 0.22, 0.14), tail, height: 1.1 };
  },
  frostail(g, [c, b, a]) {
    part(g, GEO.sphere, mat(c), [0, 0.46, 0], [0.4, 0.42, 0.44]);
    part(g, GEO.sphere, mat(b), [0, 0.4, 0.16], [0.28, 0.3, 0.28]);
    part(g, GEO.sphere, mat(b), [0, 0.46, 0.4], [0.16, 0.12, 0.16]);
    part(g, GEO.sphere, mat(0x22223a), [0, 0.5, 0.55], [0.04, 0.035, 0.03], null, false);
    for (const s of [-1, 1]) {
      part(g, GEO.cone, mat(c), [0.2 * s, 0.98, -0.02], [0.12, 0.34, 0.08], [0, 0, -0.3 * s]);
      part(g, GEO.cone, mat(a), [0.25 * s, 1.12, -0.02], [0.05, 0.12, 0.04], [0, 0, -0.3 * s]);
    }
    const tail = new THREE.Group();
    tail.position.set(0, 0.5, -0.4);
    g.add(tail);
    part(tail, GEO.sphere, mat(c), [0, 0.2, -0.2], [0.22, 0.36, 0.22], [-0.6, 0, 0]);
    part(tail, GEO.sphere, mat(0x9fe8ff, { emissive: 0x58c8ff, ei: 0.4 }), [0, 0.5, -0.36], [0.14, 0.16, 0.14]);
    eyes(g, 0.66, 0.34, 0.14, 0.09, 0x2050b0);
    return { feet: feet(g, b, 0.2, 0.14, 0.11), tail, height: 1.25 };
  },
  shadowolf(g, [c, b, a]) {
    part(g, GEO.sphere, mat(c), [0, 0.6, -0.05], [0.46, 0.52, 0.46]);
    part(g, GEO.sphere, mat(b), [0, 0.62, 0.22], [0.3, 0.32, 0.22]);
    part(g, GEO.sphere, mat(c), [0, 1.08, 0.08], [0.32, 0.28, 0.3]);
    part(g, GEO.sphere, mat(c), [0, 1.0, 0.34], [0.16, 0.12, 0.16]);
    part(g, GEO.sphere, mat(0x101018), [0, 1.04, 0.5], [0.05, 0.04, 0.03], null, false);
    const red = mat(a, { rough: 0.45 });
    for (const s of [-1, 1]) {
      part(g, GEO.cone, red, [0.2 * s, 1.42, -0.02], [0.08, 0.36, 0.08], [-0.4, 0, -0.45 * s]);
      part(g, GEO.cone, mat(c), [0.3 * s, 1.26, -0.04], [0.1, 0.24, 0.07], [0, 0, -0.6 * s]);
      part(g, GEO.sphere, mat(c), [0.38 * s, 0.62, 0.08], [0.12, 0.26, 0.12], [0, 0, 0.2 * s]);
      part(g, GEO.cone, mat(0xffffff), [0.38 * s, 0.35, 0.22], [0.03, 0.08, 0.03], [Math.PI / 2, 0, 0], false);
    }
    for (let i = 0; i < 3; i++) part(g, GEO.cone, red, [0, 0.9 - i * 0.22, -0.4 - i * 0.03], [0.07, 0.22, 0.07], [-1.0, 0, 0]);
    const tail = new THREE.Group();
    tail.position.set(0, 0.5, -0.45);
    g.add(tail);
    part(tail, GEO.sphere, mat(c), [0, 0.05, -0.22], [0.12, 0.12, 0.34], [0.3, 0, 0]);
    part(tail, GEO.cone, red, [0, 0.0, -0.58], [0.08, 0.2, 0.08], [-Math.PI / 2, 0, 0]);
    eyes(g, 1.12, 0.3, 0.13, 0.08, 0xff3040, true);
    return { feet: feet(g, c, 0.24, 0.12, 0.15), tail, height: 1.75 };
  },
  rockhorn(g, [c, b, a]) {
    part(g, GEO.sphere, mat(c), [0, 0.58, 0], [0.56, 0.48, 0.62]);
    part(g, GEO.sphere, mat(b), [0, 0.5, 0.3], [0.38, 0.34, 0.32]);
    part(g, GEO.sphere, mat(c), [0, 0.7, 0.56], [0.3, 0.24, 0.24]);
    part(g, GEO.cone, mat(a, { rough: 0.4 }), [0, 0.96, 0.7], [0.1, 0.36, 0.1], [0.5, 0, 0]);
    const rock = mat(0x4f4a66, { rough: 0.9 });
    for (let i = 0; i < 5; i++) {
      const m = part(g, GEO.dodeca, rock, [(i % 2 ? 0.14 : -0.14), 1.0 - Math.abs(i - 2) * 0.06, 0.25 - i * 0.18], [0.14, 0.18, 0.14], [i, i * 2, 0]);
      m.material = rock;
    }
    for (const s of [-1, 1]) for (const z of [-0.3, 0.3]) part(g, GEO.cyl, mat(c), [0.32 * s, 0.16, z], [0.13, 0.32, 0.13]);
    eyes(g, 0.8, 0.74, 0.17, 0.08, 0x2a2240, true);
    return { feet: [], height: 1.45 };
  },
  mossgolem(g, [c, b, a]) {
    part(g, GEO.sphere, mat(c), [0, 0.9, 0], [0.6, 0.66, 0.52]);
    const moss = mat(b, { rough: 0.9 });
    for (let i = 0; i < 7; i++) {
      const ang = (i / 7) * Math.PI * 2;
      part(g, GEO.ico, moss, [Math.cos(ang) * 0.32, 1.42 + (i % 2) * 0.06, Math.sin(ang) * 0.24], [0.2, 0.16, 0.2]);
    }
    part(g, GEO.ico, moss, [0, 1.52, 0], [0.26, 0.2, 0.26]);
    const stone = mat(0x6d7280, { rough: 0.95 });
    for (const s of [-1, 1]) {
      part(g, GEO.dodeca, stone, [0.78 * s, 0.85, 0.05], [0.26, 0.34, 0.26], [0.4, 0.3 * s, 0]);
      part(g, GEO.dodeca, stone, [0.84 * s, 0.4, 0.12], [0.24, 0.22, 0.24]);
      part(g, GEO.dodeca, stone, [0.5 * s, 1.3, -0.05], [0.18, 0.16, 0.18]);
      part(g, GEO.cyl, mat(c), [0.26 * s, 0.18, 0], [0.18, 0.36, 0.18]);
      part(g, GEO.sphere, mat(a, { emissive: a, ei: 1.6, rough: 0.3 }), [0.17 * s, 1.08, 0.46], [0.08, 0.06, 0.04], null, false);
    }
    part(g, GEO.sphere, mat(0x214f4b), [0, 0.86, 0.43], [0.18, 0.06, 0.06], null, false);
    return { feet: [], height: 1.9 };
  },
};

// A critter is { root, body, feet, tail, height } and, for rigged models, `animate(dt, mode, timeScale)`
// (mode: idle | walk | hop | captured) and `emote(name)`.
export function buildCritter(species, scale = 1) {
  const def = SPECIES[species];
  if (hasModel(def.model)) return modelCritter(def, scale);
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const info = BUILDERS[def.fallback || species](body, def.colors);
  // feet are baked too: the whole-body hop reads well and saves draw calls
  bakeGroup(body, { cacheKey: 'critter:' + species });
  if (info.tail) bakeGroup(info.tail, { cacheKey: 'tail:' + species });
  if (def.hover) { body.position.y = def.hover; info.height += def.hover; }
  info.feet = [];
  root.scale.setScalar(scale);
  const blob = new THREE.Mesh(SHADOW_GEO, SHADOW_MAT);
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.02;
  blob.scale.setScalar(0.95);
  root.add(blob);
  return { root, body, ...info };
}

function modelCritter(def, scale) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const { model, animator, width } = instantiate(def.model, def.modelH);
  body.add(model);
  model.position.y += def.hover || 0; // fliers float above their shadow
  root.scale.setScalar(scale);
  const blob = new THREE.Mesh(SHADOW_GEO, SHADOW_MAT);
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.02;
  blob.scale.setScalar(Math.max(0.9, width * 0.95));
  root.add(blob);
  const flee = animator.has('run') ? 'run' : 'hop';
  let hit = false;
  return {
    root, body, feet: [], tail: null, height: def.modelH + (def.hover || 0), animator,
    animate(dt, mode, timeScale = 1) {
      if (mode === 'captured') {
        if (!hit) { hit = true; animator.once('hit', 1.6); }
      } else if (mode === 'hop') animator.loop(flee, 1.3);
      else animator.loop(mode, timeScale);
      animator.update(dt);
    },
    emote(name, timeScale = 1) { animator.once(name, timeScale, { restart: false }); },
  };
}

let SHADOW_GEO = new THREE.PlaneGeometry(1, 1);
let SHADOW_MAT = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, opacity: 0.5 });
export function setShadowBlobTexture(t) { SHADOW_MAT.map = t; SHADOW_MAT.needsUpdate = true; }

// ── Capsules (pills) ─────────────────────────────────────────
export const CAPSULE_TIERS = [
  null,
  [0xe8233a, 0xffffff],
  [0xe8233a, 0xffffff],
  [0xffc21a, 0xffffff],
  [0x8a3dff, 0xffffff],
  [0x18c8b0, 0xffe066],
];
const capGeoCache = new Map();
// `tier` 1–5, or 'hurt': a white first-aid capsule with a wide red band (a hurt critter for the clinic)
function capsuleGeo(tier) {
  if (capGeoCache.has(tier)) return capGeoCache.get(tier);
  const g = new THREE.CapsuleGeometry(0.2, 0.32, 6, 14);
  const hurt = tier === 'hurt';
  const [top, bot] = (hurt ? [0xffffff, 0xffffff] : CAPSULE_TIERS[tier]).map((x) => new THREE.Color(x));
  const band = new THREE.Color(hurt ? 0xff2d55 : 0x30303a);
  const bandH = hurt ? 0.12 : 0.025;
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const cc = Math.abs(y) < bandH ? band : y > 0 ? top : bot;
    col.set([cc.r, cc.g, cc.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  capGeoCache.set(tier, g);
  return g;
}
const CAP_MAT = surfaceMaterial({ vertexColors: true, roughness: 0.28, metalness: 0.05 });
export function buildCapsule(tier = 1) {
  const m = new THREE.Mesh(capsuleGeo(tier), CAP_MAT);
  m.castShadow = true;
  return m;
}

// ── Coins ────────────────────────────────────────────────────
export const COIN_GEO = new THREE.CylinderGeometry(0.3, 0.3, 0.09, 20);
export const COIN_MAT = surfaceMaterial({
  color: 0xffc928, roughness: 0.3, metalness: 0.55, emissive: 0x7a4a00, emissiveIntensity: 0.35,
});
export function buildCoin() {
  const m = new THREE.Mesh(COIN_GEO, COIN_MAT);
  m.castShadow = true;
  return m;
}

const stackCache = new Map();
export function buildCoinStack(n) {
  if (!stackCache.has(n)) {
    const parts = [];
    for (let k = 0; k < n; k++) parts.push(COIN_GEO.clone().translate((k % 2) * 0.03, k * 0.1, 0));
    stackCache.set(n, mergeGeometries(parts));
  }
  const m = new THREE.Mesh(stackCache.get(n), COIN_MAT);
  m.castShadow = true;
  return m;
}

// ── Environment pieces (merged, vertex coloured → instancing) ─
// Environment pieces take the active world's palette (THEMES in worlds.js)
export function pineGeometry([trunk, c1, c2, c3] = THEME.pine) {
  const parts = [
    colored(GEO.cyl, trunk, M([0, 0.5, 0], [0.18, 1.0, 0.18])),
    colored(new THREE.ConeGeometry(1, 1, 8), c1, M([0, 1.6, 0], [1.25, 1.6, 1.25])),
    colored(new THREE.ConeGeometry(1, 1, 8), c2, M([0, 2.5, 0], [1.0, 1.4, 1.0])),
    colored(new THREE.ConeGeometry(1, 1, 8), c3, M([0, 3.3, 0], [0.72, 1.2, 0.72])),
  ];
  return mergeGeometries(parts);
}

export function roundTreeGeometry([trunk, c1, c2, c3] = THEME.round) {
  const parts = [
    colored(GEO.cyl, trunk, M([0, 0.7, 0], [0.2, 1.4, 0.2])),
    colored(new THREE.IcosahedronGeometry(1, 1), c1, M([0, 2.1, 0], [1.2, 1.05, 1.2])),
    colored(new THREE.IcosahedronGeometry(1, 1), c2, M([0.55, 2.6, 0.2], [0.75, 0.7, 0.75])),
    colored(new THREE.IcosahedronGeometry(1, 1), c3, M([-0.5, 2.5, -0.3], [0.7, 0.65, 0.7])),
  ];
  const g = mergeGeometries(parts);
  g.computeVertexNormals();
  return g;
}

export function rockGeometry([stone, top] = THEME.rock) {
  const parts = [
    colored(GEO.dodeca, stone, M([0, 0.45, 0], [1.3, 0.7, 1.1], [0.2, 0.5, 0])),
    colored(new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), top, M([0, 0.82, 0], [1.25, 0.3, 1.05])),
  ];
  const g = mergeGeometries(parts);
  g.computeVertexNormals();
  return g;
}

export function bushGeometry([c1, c2] = THEME.bush) {
  const parts = [
    colored(new THREE.IcosahedronGeometry(1, 1), c1, M([0, 0.35, 0], [0.55, 0.45, 0.55])),
    colored(new THREE.IcosahedronGeometry(1, 1), c2, M([0.35, 0.3, 0.1], [0.4, 0.35, 0.4])),
    colored(new THREE.IcosahedronGeometry(1, 1), c2, M([-0.3, 0.28, 0.15], [0.38, 0.32, 0.38])),
  ];
  const g = mergeGeometries(parts);
  g.computeVertexNormals();
  return g;
}

export function tuftGeometry([c1, c2] = THEME.tuft) {
  const parts = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    parts.push(colored(new THREE.ConeGeometry(1, 1, 3), i % 2 ? c1 : c2,
      M([Math.cos(a) * 0.08, 0.15, Math.sin(a) * 0.08], [0.05, 0.32, 0.05], [Math.sin(a) * 0.3, 0, Math.cos(a) * 0.3])));
  }
  return mergeGeometries(parts);
}

export function flowerGeometry([petal, centre] = THEME.flower) {
  // flat discs: a white blossom with a yellow centre (~12 triangles)
  const up = [-Math.PI / 2, 0, 0];
  return mergeGeometries([
    colored(new THREE.CircleGeometry(1, 6), petal, M([0, 0.06, 0], [0.12, 0.12, 0.12], up)),
    colored(new THREE.CircleGeometry(1, 6), centre, M([0, 0.07, 0], [0.05, 0.05, 0.05], up)),
  ]);
}

export function stakeGeometry() {
  const parts = [
    colored(new THREE.CylinderGeometry(1, 1, 1, 7), 0xb57a45, M([0, 0.7, 0], [0.17, 1.4, 0.17])),
    colored(new THREE.ConeGeometry(1, 1, 7), 0xd39a62, M([0, 1.6, 0], [0.17, 0.42, 0.17])),
  ];
  const g = mergeGeometries(parts);
  g.computeVertexNormals();
  return g;
}

export function railSegmentGeometry(length) {
  const parts = [];
  const posts = Math.max(2, Math.round(length / 1.6) + 1);
  for (let i = 0; i < posts; i++) {
    const x = -length / 2 + (i / (posts - 1)) * length;
    parts.push(colored(GEO.box, 0x9c6a3c, M([x, 0.55, 0], [0.16, 1.1, 0.16])));
  }
  parts.push(colored(GEO.box, 0xb88250, M([0, 1.05, 0], [length, 0.1, 0.14])));
  parts.push(colored(GEO.box, 0xb88250, M([0, 0.62, 0], [length, 0.08, 0.1])));
  return mergeGeometries(parts);
}

export function tableGeometry() {
  return mergeGeometries([
    colored(GEO.box, 0xa8703f, M([0, 0.75, 0], [2.2, 0.12, 1.0])),
    colored(GEO.box, 0x8a5a30, M([-0.9, 0.37, -0.35], [0.12, 0.75, 0.12])),
    colored(GEO.box, 0x8a5a30, M([0.9, 0.37, -0.35], [0.12, 0.75, 0.12])),
    colored(GEO.box, 0x8a5a30, M([-0.9, 0.37, 0.35], [0.12, 0.75, 0.12])),
    colored(GEO.box, 0x8a5a30, M([0.9, 0.37, 0.35], [0.12, 0.75, 0.12])),
    colored(GEO.box, 0xa8703f, M([0, 0.42, 0.85], [2.0, 0.1, 0.36])),
  ]);
}

export function logPileGeometry() {
  const parts = [];
  const rows = [[-0.42, 0, 0.42], [-0.21, 0.21]];
  rows.forEach((row, ri) => row.forEach((x) => {
    parts.push(colored(new THREE.CylinderGeometry(1, 1, 1, 10), 0x8b5a32, M([x, 0.2 + ri * 0.36, 0], [0.2, 1.6, 0.2], [Math.PI / 2, 0, 0])));
    parts.push(colored(new THREE.CylinderGeometry(1, 1, 1, 10), 0xe0b77e, M([x, 0.2 + ri * 0.36, 0.81], [0.17, 0.02, 0.17], [Math.PI / 2, 0, 0])));
  }));
  return mergeGeometries(parts);
}

export function barrelGeometry() {
  const g = mergeGeometries([
    colored(new THREE.CylinderGeometry(0.36, 0.32, 0.9, 12), 0x9a6234, M([0, 0.45, 0])),
    colored(new THREE.CylinderGeometry(0.37, 0.37, 0.07, 12), 0x55555f, M([0, 0.2, 0])),
    colored(new THREE.CylinderGeometry(0.37, 0.37, 0.07, 12), 0x55555f, M([0, 0.72, 0])),
  ]);
  return g;
}

// ── Doctor Deck, snack stand, VIP truck (merged, vertex coloured) ─
// The clinic: white walls, red roof, door and windows on the west side (towards the beds)
export function clinicGeometry() {
  const W = 1.8, D = 4.6, H = 2.0;
  const glass = 0x9fd4ff;
  return mergeGeometries([
    colored(GEO.box, 0xf4f7fb, M([0, H / 2, 0], [W, H, D])),
    colored(GEO.box, 0xc9d6e6, M([0, 0.12, 0], [W + 0.1, 0.24, D + 0.1])),
    colored(GEO.box, 0xe8414f, M([0, H + 0.15, 0], [W + 0.5, 0.3, D + 0.5])),
    colored(GEO.box, 0xc8303e, M([0, H + 0.4, 0], [W * 0.6, 0.2, D + 0.3])),
    colored(GEO.box, 0x5aa8ef, M([-W / 2 - 0.02, 0.78, 0], [0.06, 1.56, 1.0])),
    colored(GEO.box, 0xffffff, M([-W / 2 - 0.03, 1.62, 0], [0.06, 0.12, 1.16])),
    colored(GEO.box, glass, M([-W / 2 - 0.02, 1.2, -1.5], [0.06, 0.62, 0.8])),
    colored(GEO.box, glass, M([-W / 2 - 0.02, 1.2, 1.5], [0.06, 0.62, 0.8])),
    colored(GEO.box, glass, M([0, 1.2, D / 2 + 0.02], [0.9, 0.62, 0.06])),
  ]);
}

// White sign with a red cross, standing on the clinic roof facing the camera
export function crossSignGeometry() {
  return mergeGeometries([
    colored(GEO.box, 0x9aa3b5, M([0, 0.3, 0], [0.12, 0.6, 0.12])),
    colored(GEO.box, 0xffffff, M([0, 1.05, 0], [1.25, 1.25, 0.14])),
    colored(GEO.box, 0xff2d55, M([0, 1.05, 0.08], [0.85, 0.28, 0.04])),
    colored(GEO.box, 0xff2d55, M([0, 1.05, 0.08], [0.28, 0.85, 0.04])),
  ]);
}

// Hospital bed along x, pillow at +x (by the clinic wall)
export function bedGeometry() {
  return mergeGeometries([
    colored(GEO.box, 0x9c6a3c, M([0, 0.2, 0], [1.4, 0.22, 0.95])),
    colored(GEO.box, 0x9c6a3c, M([0.68, 0.42, 0], [0.1, 0.66, 0.95])),
    colored(GEO.box, 0xffffff, M([0, 0.37, 0], [1.3, 0.14, 0.85])),
    colored(GEO.box, 0xf0f3ff, M([0.44, 0.49, 0], [0.32, 0.12, 0.62])),
    colored(GEO.box, 0x7cc4ff, M([-0.2, 0.46, 0], [0.86, 0.06, 0.88])),
  ]);
}

// Ice-cream stand: counter facing -x (the customers' queue), striped awning, a giant cone on top
export function snackStandGeometry() {
  const poles = [[-0.5, -0.85], [0.5, -0.85], [-0.5, 0.85], [0.5, 0.85]]
    .map(([x, z]) => colored(GEO.cyl, 0xe6e6ee, M([x, 1.5, z], [0.05, 1.0, 0.05])));
  const awning = [0, 1, 2, 3, 4].map((i) => colored(GEO.box, i % 2 ? 0xffffff : 0xff5c8a, M([0, 2.05, -0.8 + i * 0.4], [1.4, 0.12, 0.4])));
  return mergeGeometries([
    colored(GEO.box, 0xfff3e0, M([0, 0.5, 0], [1.1, 1.0, 1.8])),
    colored(GEO.box, 0xff8fb8, M([0, 1.04, 0], [1.25, 0.08, 1.95])),
    colored(GEO.box, 0xff8fb8, M([-0.57, 0.5, 0], [0.04, 0.42, 1.5])),
    colored(GEO.box, 0x8fe3ff, M([-0.57, 0.62, 0], [0.05, 0.12, 1.5])),
    ...poles,
    ...awning,
    colored(new THREE.ConeGeometry(0.3, 0.8, 10), 0xe0a050, M([0, 2.5, 0], [1, 1, 1], [Math.PI, 0, 0])),
    colored(new THREE.SphereGeometry(0.34, 12, 8), 0xffb6d0, M([0, 2.98, 0])),
    colored(new THREE.SphereGeometry(0.16, 10, 6), 0xff2d55, M([0, 3.35, 0])),
  ]);
}

// VIP pickup truck facing -z: purple cab in front, open bed behind for the critters it buys
export const TRUCK_BED = { y: 0.95, slots: [-0.5, 0, 0.5].flatMap((x) => [-0.25, 0.3, 0.85, 1.4].map((z) => [x, z])) };
export function truckGeometry() {
  const P = 0x8a4dff, G = 0xffc93a, glass = 0x2b3a66;
  const wheel = (x, z) => [
    colored(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 14), 0x2a2a33, M([x, 0.42, z], [1, 1, 1], [0, 0, Math.PI / 2])),
    colored(new THREE.CylinderGeometry(0.18, 0.18, 0.32, 10), 0xd8dde6, M([x, 0.42, z], [1, 1, 1], [0, 0, Math.PI / 2])),
  ];
  return mergeGeometries([
    colored(GEO.box, 0x3a3a46, M([0, 0.55, 0], [1.8, 0.3, 4.1])),
    colored(GEO.box, P, M([0, 1.25, -1.45], [1.9, 1.2, 1.3])),
    colored(GEO.box, glass, M([0, 1.5, -2.11], [1.6, 0.55, 0.04])),
    colored(GEO.box, glass, M([0.96, 1.5, -1.45], [0.04, 0.5, 0.9])),
    colored(GEO.box, glass, M([-0.96, 1.5, -1.45], [0.04, 0.5, 0.9])),
    colored(GEO.box, G, M([0, 1.9, -1.45], [1.95, 0.08, 1.35])),
    colored(GEO.box, 0xffffff, M([0.6, 0.85, -2.11], [0.3, 0.18, 0.04])),
    colored(GEO.box, 0xffffff, M([-0.6, 0.85, -2.11], [0.3, 0.18, 0.04])),
    colored(GEO.box, P, M([0, 0.75, 0.65], [1.9, 0.12, 2.9])),
    colored(GEO.box, P, M([0.92, 1.1, 0.65], [0.08, 0.6, 2.9])),
    colored(GEO.box, P, M([-0.92, 1.1, 0.65], [0.08, 0.6, 2.9])),
    colored(GEO.box, G, M([0, 1.1, 2.08], [1.9, 0.6, 0.08])),
    colored(GEO.box, G, M([0.93, 1.42, 0.65], [0.1, 0.06, 2.9])),
    colored(GEO.box, G, M([-0.93, 1.42, 0.65], [0.1, 0.06, 2.9])),
    ...wheel(0.95, -1.3), ...wheel(-0.95, -1.3), ...wheel(0.95, 1.3), ...wheel(-0.95, 1.3),
  ]);
}

export function machineMesh() {
  const g = new THREE.Group();
  const shell = new THREE.Mesh(new RoundedBoxGeometry(1.9, 1.5, 1.4, 3, 0.25), mat(0xdfe8f3, { rough: 0.45 }));
  shell.position.y = 0.75;
  shell.castShadow = true;
  g.add(shell);
  const hole = new THREE.Mesh(new RoundedBoxGeometry(1.3, 0.9, 1.5, 2, 0.12), mat(0x283152, { rough: 0.8 }));
  hole.position.y = 0.55;
  g.add(hole);
  const roof = new THREE.Mesh(new RoundedBoxGeometry(2.05, 0.18, 1.55, 2, 0.08), mat(0xb7c6da, { rough: 0.5 }));
  roof.position.y = 1.52;
  roof.castShadow = true;
  g.add(roof);
  return g;
}

export function arrowMesh(color = 0x3dff5a) {
  const g = new THREE.Group();
  const m = mat(color, { emissive: color, ei: 0.45, rough: 0.4 });
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.8, 4), m);
  head.rotation.x = Math.PI;
  head.position.y = 0.4;
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.8, 0.4), m);
  shaft.position.y = 1.15;
  g.add(head, shaft);
  return g;
}

export function rounded(w, h, d, r = 0.1) {
  return new RoundedBoxGeometry(w, h, d, 2, r);
}
