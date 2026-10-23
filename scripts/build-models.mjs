// Converts the CC0 character packs in assets-src/ into small game-ready GLBs in public/models/.
//   npm run models
//
// Per model:
//  1. bake the palette texture (or flat material colours) into vertex colours; both packs use
//     flat/gradient palettes, so this is lossless → no textures, one shared material for every character
//  2. merge all skinned meshes/primitives that share a skeleton → 1 draw call per character
//  3. keep only the animation clips the game plays (renamed to idle/walk/run/throw/…)
//  4. resample + meshopt-compress (EXT_meshopt_compression, KHR_mesh_quantization)
import fs from 'node:fs/promises';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, resample, quantize, meshopt, weld } from '@gltf-transform/functions';
import { getPixels } from 'ndarray-pixels';
import { MeshoptEncoder } from 'meshoptimizer';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SRC = path.join(ROOT, 'assets-src');
const OUT = path.join(ROOT, 'public', 'models');

// clip name in the source file → name used by the game
const KENNEY_CLIPS = { idle: 'idle', walk: 'walk', sprint: 'run', 'attack-melee-right': 'throw', 'emote-yes': 'happy' };
// critters flee with 'hop' (small blobs) or 'run' (big monsters); see buildCritter in src/world/models.js
const BLOB_CLIPS = { Idle: 'idle', Walk: 'walk', Jump: 'hop', Dance: 'happy', HitRecieve: 'hit', Bite_Front: 'eat' };
const BIG_CLIPS = { Idle: 'idle', Walk: 'walk', Run: 'run', Yes: 'happy', HitReact: 'hit', Punch: 'eat' };
// flying monsters hover in place for idle/walk and dash with Fast_Flying when startled
const FLY_CLIPS = { Flying_Idle: 'idle', Fast_Flying: 'run', Yes: 'happy', HitReact: 'hit', Headbutt: 'eat' };

const MONSTER_GRADE = { sat: 1.3, light: 1.22 };

// Kenney colormap.png is 512×512; the ginger hair gradient lives in this cell (pixels x0,y0,x1,y1)
const KENNEY_HAIR_CELL = [352, 384, 384, 512];

const MODELS = [
  // the player keeps the original game's red hair
  { out: 'char-player', src: 'kenney-mini-characters/character-female-b.glb', clips: KENNEY_CLIPS,
    recolor: [{ rect: KENNEY_HAIR_CELL, to: [224, 67, 90] }] },
  ...['a', 'b', 'c', 'd', 'e', 'f'].flatMap((v) => [
    { out: `char-female-${v}`, src: `kenney-mini-characters/character-female-${v}.glb`, clips: KENNEY_CLIPS },
    { out: `char-male-${v}`, src: `kenney-mini-characters/character-male-${v}.glb`, clips: KENNEY_CLIPS },
  ]),
  { out: 'mon-fish', src: 'quaternius-ultimate-monsters/Fish.gltf', clips: BLOB_CLIPS, grade: MONSTER_GRADE },
  { out: 'mon-cactoro', src: 'quaternius-ultimate-monsters/Cactoro.gltf', clips: BLOB_CLIPS, grade: MONSTER_GRADE },
  { out: 'mon-chicken', src: 'quaternius-ultimate-monsters/Chicken.gltf', clips: BLOB_CLIPS, grade: MONSTER_GRADE },
  { out: 'mon-dog', src: 'quaternius-ultimate-monsters/Dog.gltf', clips: BLOB_CLIPS, grade: MONSTER_GRADE },
  { out: 'mon-yeti', src: 'quaternius-ultimate-monsters/Yeti.gltf', clips: BLOB_CLIPS, grade: MONSTER_GRADE },
  { out: 'mon-bluedemon', src: 'quaternius-ultimate-monsters/BlueDemon.gltf', clips: BIG_CLIPS, grade: MONSTER_GRADE },
  { out: 'mon-dino', src: 'quaternius-ultimate-monsters/Dino.gltf', clips: BIG_CLIPS, grade: MONSTER_GRADE },
  { out: 'mon-mushroomking', src: 'quaternius-ultimate-monsters/MushroomKing.gltf', clips: BIG_CLIPS, grade: MONSTER_GRADE },
  // Frosty Peaks (world 2) and Ember Canyon (world 3); poly.pizza exports of the same pack, see CREDITS.md
  { out: 'mon-mushnub', src: 'quaternius-ultimate-monsters/Mushnub.glb', clips: BLOB_CLIPS, grade: MONSTER_GRADE },
  { out: 'mon-birb', src: 'quaternius-ultimate-monsters/Birb.glb', clips: BLOB_CLIPS, grade: MONSTER_GRADE },
  { out: 'mon-glub', src: 'quaternius-ultimate-monsters/Glub.glb', clips: FLY_CLIPS, grade: MONSTER_GRADE },
  // the carrot it holds is a separately bound mesh (an extra draw call), so it's left out
  { out: 'mon-bunny', src: 'quaternius-ultimate-monsters/Bunny.glb', clips: BIG_CLIPS, grade: MONSTER_GRADE, dropMeshes: ['Carrot'] },
  { out: 'mon-yetibig', src: 'quaternius-ultimate-monsters/Yeti_Big.glb', clips: BIG_CLIPS, grade: MONSTER_GRADE },
  { out: 'mon-ghost', src: 'quaternius-ultimate-monsters/Ghost.glb', clips: FLY_CLIPS, grade: MONSTER_GRADE },
  { out: 'mon-cat', src: 'quaternius-ultimate-monsters/Cat.glb', clips: BLOB_CLIPS, grade: MONSTER_GRADE },
  { out: 'mon-armabee', src: 'quaternius-ultimate-monsters/Armabee.glb', clips: FLY_CLIPS, grade: MONSTER_GRADE },
  { out: 'mon-frog', src: 'quaternius-ultimate-monsters/Frog.glb', clips: BIG_CLIPS, grade: MONSTER_GRADE },
  { out: 'mon-demonfly', src: 'quaternius-ultimate-monsters/Demon_Flying.glb', clips: FLY_CLIPS, grade: MONSTER_GRADE },
  { out: 'mon-alpaking', src: 'quaternius-ultimate-monsters/Alpaking.glb', clips: FLY_CLIPS, grade: MONSTER_GRADE },
  { out: 'mon-dragon', src: 'quaternius-ultimate-monsters/Dragon.glb', clips: FLY_CLIPS, grade: MONSTER_GRADE },
];

const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const linearToSrgb = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

const luma = (c) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];

// Saturation / lightness boost (sRGB 0–255 in and out) so the muted monster atlas matches the bright game.
function gradeColor([r, g, b], { sat = 1, light = 1 }) {
  const max = Math.max(r, g, b) / 255, min = Math.min(r, g, b) / 255;
  let h = 0, s = 0, l = (max + min) / 2;
  const d = max - min;
  if (d > 1e-6) {
    s = d / (1 - Math.abs(2 * l - 1));
    const [R, G, B] = [r / 255, g / 255, b / 255];
    h = max === R ? ((G - B) / d) % 6 : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
    h *= 60;
  }
  s = Math.min(1, s * sat);
  l = Math.min(0.92, l * light);
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r1, g1, b1] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [(r1 + m) * 255, (g1 + m) * 255, (b1 + m) * 255];
}

// Pixel colour (sRGB 0–255) at x,y, after any recolour rule; a recoloured cell keeps its shading gradient.
function samplePalette(px, x, y, recolor) {
  const rgb = [0, 1, 2].map((c) => px.get(x, y, c));
  for (const r of recolor) {
    const [x0, y0, x1, y1] = r.rect;
    if (x < x0 || x >= x1 || y < y0 || y >= y1) continue;
    const ref = [0, 1, 2].map((c) => px.get(x0, y0, c));
    const k = luma(rgb) / Math.max(1, luma(ref));
    return r.to.map((v) => Math.min(255, v * k));
  }
  return rgb;
}

async function bakeVertexColors(doc, recolor = [], grade = null) {
  const root = doc.getRoot();
  const pixelCache = new Map();
  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const mat = prim.getMaterial();
      const tex = mat && mat.getBaseColorTexture();
      const uv = prim.getAttribute('TEXCOORD_0');
      const pos = prim.getAttribute('POSITION');
      const factor = mat ? mat.getBaseColorFactor() : [1, 1, 1, 1];
      let px = null;
      if (tex && uv) {
        if (!pixelCache.has(tex)) pixelCache.set(tex, await getPixels(tex.getImage(), tex.getMimeType()));
        px = pixelCache.get(tex);
      }
      const n = pos.getCount();
      const out = new Float32Array(n * 3);
      const u = [];
      // models without a texture (the poly.pizza exports) are coloured by their material factor
      const flat = [0, 1, 2].map((c) => linearToSrgb(factor[c]) * 255);
      for (let i = 0; i < n; i++) {
        let srgb = flat;
        if (px) {
          const [W, H] = px.shape;
          uv.getElement(i, u);
          const x = Math.min(W - 1, Math.floor((((u[0] % 1) + 1) % 1) * W));
          const y = Math.min(H - 1, Math.floor((((u[1] % 1) + 1) % 1) * H));
          srgb = samplePalette(px, x, y, recolor).map((v, c) => v * factor[c]);
        }
        if (grade) srgb = gradeColor(srgb, grade);
        for (let c = 0; c < 3; c++) out[i * 3 + c] = srgbToLinear(srgb[c] / 255);
      }
      const color = doc.createAccessor().setType('VEC3').setArray(out).setBuffer(pos.getBuffer());
      prim.setAttribute('COLOR_0', color);
      for (const sem of prim.listSemantics()) if (sem.startsWith('TEXCOORD_')) prim.setAttribute(sem, null);
    }
  }
  // one plain material for everything; the game swaps in its own shared material at load time
  const palette = doc.createMaterial('Palette').setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(0.7).setMetallicFactor(0);
  for (const mesh of root.listMeshes()) for (const prim of mesh.listPrimitives()) prim.setMaterial(palette);
  for (const m of root.listMaterials()) if (m !== palette) m.dispose();
  for (const t of root.listTextures()) t.dispose();
}

function sameSkin(a, b) {
  const ja = a.listJoints(), jb = b.listJoints();
  if (ja.length !== jb.length || ja.some((j, i) => j !== jb[i])) return false;
  const ia = a.getInverseBindMatrices()?.getArray(), ib = b.getInverseBindMatrices()?.getArray();
  if (!ia || !ib || ia.length !== ib.length) return false;
  for (let i = 0; i < ia.length; i++) if (Math.abs(ia[i] - ib[i]) > 1e-5) return false;
  return true;
}

// Concatenates every primitive of every skinned node that uses an equivalent skin into one primitive.
// Attributes are decoded to float (joints to uint16) so differently quantized parts merge safely;
// quantize() re-packs them afterwards.
function mergeSkinnedMeshes(doc) {
  const nodes = doc.getRoot().listNodes().filter((n) => n.getMesh() && n.getSkin());
  const groups = [];
  for (const n of nodes) {
    const g = groups.find((gr) => sameSkin(gr[0].getSkin(), n.getSkin()));
    if (g) g.push(n); else groups.push([n]);
  }
  for (const group of groups) {
    const prims = group.flatMap((n) => n.getMesh().listPrimitives());
    if (prims.length < 2) continue;
    const semantics = prims[0].listSemantics().filter((sem) => prims.every((p) => p.getAttribute(sem)));
    const merged = doc.createPrimitive().setMaterial(prims[0].getMaterial());
    const buffer = prims[0].getAttribute('POSITION').getBuffer();
    let total = 0;
    for (const p of prims) total += p.getAttribute('POSITION').getCount();
    for (const sem of semantics) {
      const first = prims[0].getAttribute(sem);
      const size = first.getElementSize();
      const arr = sem.startsWith('JOINTS_') ? new Uint16Array(total * size) : new Float32Array(total * size);
      let off = 0;
      for (const p of prims) {
        const a = p.getAttribute(sem);
        const el = [];
        for (let i = 0; i < a.getCount(); i++) { a.getElement(i, el); arr.set(el, (off + i) * size); }
        off += a.getCount();
      }
      merged.setAttribute(sem, doc.createAccessor().setType(first.getType()).setArray(arr).setBuffer(buffer));
    }
    const indices = [];
    let base = 0;
    for (const p of prims) {
      const idx = p.getIndices();
      const count = p.getAttribute('POSITION').getCount();
      if (idx) for (let i = 0; i < idx.getCount(); i++) indices.push(idx.getScalar(i) + base);
      else for (let i = 0; i < count; i++) indices.push(i + base);
      base += count;
    }
    const IndexType = base > 65535 ? Uint32Array : Uint16Array;
    merged.setIndices(doc.createAccessor().setType('SCALAR').setArray(new IndexType(indices)).setBuffer(buffer));
    const keep = group[0];
    const mesh = doc.createMesh(keep.getMesh().getName()).addPrimitive(merged);
    for (const n of group) n.getMesh().dispose();
    keep.setMesh(mesh);
    for (const n of group.slice(1)) n.dispose();
  }
}

function keepClips(doc, clips) {
  for (const anim of doc.getRoot().listAnimations()) {
    // poly.pizza exports prefix clips with the armature ("CharacterArmature|Idle")
    const name = clips[anim.getName().split('|').pop()];
    if (name) { anim.setName(name); continue; }
    // samplers outlive their animation and would keep the keyframe accessors alive
    for (const s of anim.listSamplers()) s.dispose();
    anim.dispose();
  }
  const have = doc.getRoot().listAnimations().map((a) => a.getName());
  return have;
}

// Drops channels whose every keyframe equals the bone's rest pose (they only cost JSON + parse time).
function dropStaticChannels(doc, eps = 1e-4) {
  const rest = (node, path) => (path === 'translation' ? node.getTranslation() : path === 'rotation' ? node.getRotation() : node.getScale());
  for (const anim of doc.getRoot().listAnimations()) {
    for (const ch of anim.listChannels()) {
      const node = ch.getTargetNode(), path = ch.getTargetPath();
      if (!node || path === 'weights') continue;
      const out = ch.getSampler().getOutput();
      const r = rest(node, path), el = [];
      let moving = false;
      for (let i = 0; i < out.getCount() && !moving; i++) {
        out.getElement(i, el);
        // q and -q are the same rotation
        const sign = path === 'rotation' && el[3] * r[3] + el[0] * r[0] + el[1] * r[1] + el[2] * r[2] < 0 ? -1 : 1;
        moving = el.some((v, k) => Math.abs(v * sign - r[k]) > eps);
      }
      if (!moving) { const s = ch.getSampler(); ch.dispose(); s.dispose(); }
    }
  }
}

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
await MeshoptEncoder.ready;
await fs.mkdir(OUT, { recursive: true });

let totalIn = 0, totalOut = 0;
for (const m of MODELS) {
  const src = path.join(SRC, m.src);
  const doc = await io.read(src);
  doc.setLogger({ debug() {}, info() {}, warn() {}, error: console.error });
  for (const node of doc.getRoot().listNodes()) if (m.dropMeshes?.includes(node.getMesh()?.getName())) node.dispose();
  await bakeVertexColors(doc, m.recolor, m.grade);
  mergeSkinnedMeshes(doc);
  const clips = keepClips(doc, m.clips);
  await doc.transform(
    prune(),
    dedup(),
    weld(),
    resample({ tolerance: 1e-4 }),
  );
  dropStaticChannels(doc);
  await doc.transform(
    prune({ keepLeaves: true }),
    quantize({ quantizeColor: 8, quantizeNormal: 8, quantizePosition: 14 }),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  );
  const file = path.join(OUT, m.out + '.glb');
  await io.write(file, doc);
  const inSize = (await fs.stat(src)).size, outSize = (await fs.stat(file)).size;
  totalIn += inSize;
  totalOut += outSize;
  const tris = doc.getRoot().listMeshes().flatMap((x) => x.listPrimitives()).reduce((a, p) => a + p.getIndices().getCount() / 3, 0);
  console.log(`${m.out.padEnd(18)} ${(inSize / 1024).toFixed(0).padStart(5)} KB → ${(outSize / 1024).toFixed(1).padStart(5)} KB  meshes=${doc.getRoot().listMeshes().length} tris=${tris} clips=${clips.join(',')}`);
}
console.log(`total ${(totalIn / 1048576).toFixed(2)} MB → ${(totalOut / 1048576).toFixed(2)} MB`);
