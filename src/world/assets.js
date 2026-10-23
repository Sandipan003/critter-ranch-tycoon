import * as THREE from 'three';
import { surfaceMaterial } from '../quality.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

// Rigged, animated character models (see CREDITS.md). They are produced by
// `npm run models`, which bakes the palette textures into vertex colours, so
// every character shares this one material.
export const MODEL_MAT = surfaceMaterial({ vertexColors: true, roughness: 0.62 });

export const MODEL_KEYS = [
  'char-player', 'char-female-a', 'char-female-b', 'char-female-c', 'char-female-d', 'char-female-e', 'char-female-f',
  'char-male-a', 'char-male-b', 'char-male-c', 'char-male-d', 'char-male-e', 'char-male-f',
  'mon-fish', 'mon-cactoro', 'mon-chicken', 'mon-dog', 'mon-yeti', 'mon-bluedemon', 'mon-dino', 'mon-mushroomking',
  'mon-mushnub', 'mon-birb', 'mon-glub', 'mon-bunny', 'mon-yetibig', 'mon-ghost',
  'mon-cat', 'mon-armabee', 'mon-frog', 'mon-demonfly', 'mon-alpaking', 'mon-dragon',
];

const templates = new Map(); // key → { scene, clips, height, width }

export function hasModel(key) { return !!key && templates.has(key); }

// Loads every model; a model that fails is skipped so its procedural builder is used instead.
export async function preloadModels(onProgress = () => {}, keys = MODEL_KEYS) {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const base = `${import.meta.env.BASE_URL}models/`;
  let done = 0;
  await Promise.all(keys.map(async (key) => {
    try {
      const gltf = await loader.loadAsync(`${base}${key}.glb`);
      templates.set(key, prepare(gltf));
    } catch (e) {
      console.warn(`[models] ${key} failed to load, using the procedural fallback`, e);
    }
    onProgress(++done / keys.length);
  }));
  return templates.size;
}

function prepare(gltf) {
  const scene = gltf.scene;
  const clips = new Map(gltf.animations.map((c) => [c.name, c]));
  scene.traverse((o) => {
    if (!o.isMesh) return;
    o.material = MODEL_MAT;
    o.castShadow = true;
  });
  // measure in the idle pose (the bind pose is a T-pose)
  const mixer = new THREE.AnimationMixer(scene);
  const idle = clips.get('idle');
  if (idle) { mixer.clipAction(idle).play(); mixer.update(0); }
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(scene, true);
  // padded culling sphere (clones copy it), so animated limbs don't pop at the screen edge
  scene.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    o.computeBoundingSphere();
    o.boundingSphere.radius *= 1.35;
  });
  mixer.stopAllAction();
  mixer.uncacheRoot(scene);
  const size = box.getSize(new THREE.Vector3());
  return { scene, clips, height: size.y, width: Math.max(size.x, size.z), minY: box.min.y };
}

// A fresh instance of a model, scaled so it stands `height` units tall with its feet at y=0.
export function instantiate(key, height) {
  const t = templates.get(key);
  const model = cloneSkinned(t.scene);
  const s = height / t.height;
  model.scale.setScalar(s);
  model.position.y = -t.minY * s;
  const bones = new Map();
  model.traverse((o) => {
    if (!o.isBone) return;
    bones.set(o.name, o);
    // the animation writes bone quaternions every frame; three.js would also convert each one back to
    // Euler angles (unused for bones), which is a big share of a slow phone's frame time
    o.quaternion._onChange(NOOP);
  });
  return { model, bones, animator: new Animator(model, t.clips), width: t.width * s };
}

const NOOP = () => {};

// Frees what a cloned model holds on the GPU (each skeleton has its own bone texture). Geometry
// and materials are shared with the template and stay.
export function disposeInstance(root) {
  root.traverse((o) => { if (o.isSkinnedMesh && o.skeleton) o.skeleton.dispose(); });
}

// Crossfades between looping base states and plays one-shot clips on top.
export class Animator {
  constructor(root, clips) {
    this.mixer = new THREE.AnimationMixer(root);
    this.clips = clips;
    this.actions = new Map();
    this.base = null; // current looping action
    this.shot = null; // current one-shot action
    this.mixer.addEventListener('finished', (e) => {
      if (e.action !== this.shot) return;
      const shot = this.shot;
      this.shot = null;
      if (this.base) this.base.reset().fadeIn(0.15).play();
      shot.fadeOut(0.15);
    });
  }

  has(name) { return this.clips.has(name); }

  action(name) {
    if (!this.actions.has(name)) {
      const clip = this.clips.get(name);
      if (!clip) return null;
      this.actions.set(name, this.mixer.clipAction(clip));
    }
    return this.actions.get(name);
  }

  // Switch the looping state (idle / walk / run …). `timeScale` can follow movement speed.
  loop(name, timeScale = 1, fade = 0.2) {
    const a = this.action(name) || this.action('idle');
    if (!a) return;
    a.timeScale = timeScale;
    if (a === this.base) return;
    const prev = this.base;
    this.base = a;
    if (this.shot) return; // fades in when the one-shot ends
    a.reset().setLoop(THREE.LoopRepeat, Infinity).fadeIn(fade).play();
    a.time = Math.random() * a.getClip().duration; // so crowds don't move in lockstep
    if (prev) prev.fadeOut(fade);
  }

  // Play a clip once, then return to the looping state. With restart=false a clip that is
  // already playing is left to finish (for triggers that fire every few frames).
  once(name, timeScale = 1, { fade = 0.08, restart = true } = {}) {
    const a = this.action(name);
    if (!a || (!restart && this.shot === a)) return;
    if (this.shot && this.shot !== a) this.shot.fadeOut(fade);
    a.reset().setLoop(THREE.LoopOnce, 1);
    a.clampWhenFinished = true;
    a.timeScale = timeScale;
    a.fadeIn(fade).play();
    if (this.base && this.shot !== a) this.base.fadeOut(fade);
    this.shot = a;
  }

  update(dt) { this.mixer.update(dt); }
}
