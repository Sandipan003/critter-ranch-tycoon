import { UNLOCKS } from './layout.js';

// ── Worlds ───────────────────────────────────────────────────
// Each world is its own run on the same ranch layout: own look, critters (local Lv.1–5, shown as
// Lv.1–5 / 6–10 / 11–15 / …), coins, pens, pastures, balconies, unlock prices and upgrades. Ranch level
// and stats are shared. Later worlds are harder: critters break free more often (`difficulty.catch`)
// and run faster (`difficulty.speed`). The last unlock of a world opens the next one ("travel").
// Worlds 1–3 are hand-made; from world 4 on they are generated without end (themes cycle, critters
// are mixed from all species by tier, prices x5 per world). Old saves that bought the former world-3
// "Golden Crown" keep its x2 income.

// Colour palettes for the procedural environment (textures.js / models.js / environment.js)
export const THEMES = {
  meadow: {
    sky: 0xbfe6ff, fog: 0xc9ecf2,
    hemi: [0xd8f0ff, 0x4f7f2c, 1.0], sun: [0xfff4e0, 2.4],
    ground: {
      base: '#56b82e', light: 'rgba(140,215,80,0.35)', dark: 'rgba(40,130,40,0.30)',
      blades: ['rgba(150,225,95,0.55)', 'rgba(60,150,45,0.5)', 'rgba(110,200,70,0.5)'],
    },
    dirt: { base: '#c9a37a', specks: ['rgba(150,110,70,0.25)', 'rgba(230,200,160,0.25)'] },
    pine: [0x7a4a2a, 0x2e8a3c, 0x379a44, 0x45ad4f],
    round: [0x7a4a2a, 0x4cae3e, 0x5cc04a, 0x3e9a36],
    rock: [0x8d93a0, 0x5bb83e],
    bush: [0x3f9e34, 0x4fb341],
    tuft: [0x4eae36, 0x6cc84a],
    flower: [0xffffff, 0xffe14a],
  },
  snow: {
    sky: 0xd3e9fb, fog: 0xe2f0fa,
    hemi: [0xeaf5ff, 0x8aa6bf, 1.05], sun: [0xffffff, 2.2],
    ground: {
      base: '#d3e2f0', light: 'rgba(255,255,255,0.45)', dark: 'rgba(140,175,214,0.4)',
      blades: ['rgba(255,255,255,0.7)', 'rgba(180,206,235,0.55)', 'rgba(205,225,245,0.55)'],
    },
    dirt: { base: '#d5e2ee', specks: ['rgba(160,185,212,0.35)', 'rgba(255,255,255,0.45)'] },
    pine: [0x6b4a33, 0x2c6e55, 0x3a8064, 0xeef6fc],
    round: [0x6b4a33, 0xcfe4f4, 0xe9f4fb, 0xb3d3e8],
    rock: [0x8a96a8, 0xf2f8fd],
    bush: [0xc2dcee, 0xe1eff9],
    tuft: [0xa9cde8, 0xd8eaf8],
    flower: [0x9fdcff, 0xffffff],
  },
  desert: {
    sky: 0xffe6bd, fog: 0xf4d6a6,
    hemi: [0xfff2d8, 0xa07a40, 1.0], sun: [0xfff0d0, 2.5],
    ground: {
      base: '#e0bf78', light: 'rgba(255,236,185,0.4)', dark: 'rgba(170,128,68,0.3)',
      blades: ['rgba(200,158,88,0.5)', 'rgba(150,112,58,0.45)', 'rgba(240,214,158,0.5)'],
    },
    dirt: { base: '#d4b070', specks: ['rgba(150,110,60,0.3)', 'rgba(255,235,190,0.35)'] },
    pine: [0x4f7a32, 0x5f9a3c, 0x6fae46, 0x7fbf55],
    round: [0x8a6a3a, 0x7cbf4a, 0x8fd35a, 0x6aa83c],
    rock: [0xc89b62, 0xe8c888],
    bush: [0x9aa84a, 0xb5c062],
    tuft: [0xc8a860, 0xa88a48],
    flower: [0xff7a5a, 0xffe14a],
  },
  twilight: {
    sky: 0x5a4a8e, fog: 0x6c5c9e,
    hemi: [0xc0b0ff, 0x2a2450, 1.0], sun: [0xe0d0ff, 1.9],
    ground: {
      base: '#3f5c50', light: 'rgba(120,210,180,0.25)', dark: 'rgba(10,20,30,0.35)',
      blades: ['rgba(150,255,220,0.5)', 'rgba(40,80,70,0.5)', 'rgba(90,150,130,0.45)'],
    },
    dirt: { base: '#5c4c6e', specks: ['rgba(30,20,45,0.35)', 'rgba(160,140,220,0.3)'] },
    pine: [0x3a2a3a, 0x2a4a5a, 0x34586a, 0x3e667a],
    round: [0x3a2a3a, 0x8a5ad6, 0xa070e8, 0x6a44b8],
    rock: [0x4a4a6a, 0x7ad8ff],
    bush: [0x3a6a6a, 0x4a8a8a],
    tuft: [0x7ae8c8, 0x4ab8a0],
    flower: [0xb8f0ff, 0xff9af0],
  },
  candy: {
    sky: 0xffd8ee, fog: 0xffe4f2,
    hemi: [0xfff0f8, 0xc888b0, 1.05], sun: [0xfff4fa, 2.3],
    ground: {
      base: '#a3e3aa', light: 'rgba(255,255,255,0.35)', dark: 'rgba(110,190,130,0.3)',
      blades: ['rgba(255,170,210,0.55)', 'rgba(130,210,150,0.5)', 'rgba(255,240,150,0.5)'],
    },
    dirt: { base: '#f3cfe0', specks: ['rgba(220,150,190,0.35)', 'rgba(255,255,255,0.45)'] },
    pine: [0xffffff, 0xff7ab8, 0xffa0d0, 0xffc8e4],
    round: [0xf0e0d0, 0xff8ac8, 0x9ad8ff, 0xffe08a],
    rock: [0xf0b8d8, 0xffffff],
    bush: [0xff9ad0, 0xb8f0c8],
    tuft: [0xffb0d8, 0x8fd9a0],
    flower: [0xffe14a, 0xff6ab8],
  },
  lava: {
    sky: 0xffcfa6, fog: 0xf0b48c,
    hemi: [0xffe4cc, 0x6b3a26, 1.0], sun: [0xffd6a6, 2.5],
    ground: {
      base: '#4e3e3b', light: 'rgba(130,85,62,0.32)', dark: 'rgba(18,12,10,0.42)',
      blades: ['rgba(255,150,50,0.6)', 'rgba(95,55,38,0.55)', 'rgba(135,78,50,0.5)'],
    },
    dirt: { base: '#6e5650', specks: ['rgba(40,28,24,0.35)', 'rgba(230,130,70,0.25)'] },
    pine: [0x3b2a24, 0x4a4043, 0x575053, 0x655c5d],
    round: [0x4a3026, 0xe0662e, 0xf08a3a, 0xc94a22],
    rock: [0x4a4448, 0xff7a1f],
    bush: [0x9a4a26, 0xb85c2c],
    tuft: [0xd9692c, 0xa84a22],
    flower: [0xffc23a, 0xff5a1a],
  },
};

const BASE_WORLDS = [
  {
    id: 1, name: 'Sunny Meadow', icon: '🌼', theme: 'meadow',
    levelOffset: 0, valueMul: 1, costMul: 1,
    spawn: {
      1: ['bloop', 'sproutle', 'zapchick', 'emberpup'],
      2: ['bloop', 'sproutle', 'zapchick', 'emberpup', 'frostail'],
      3: ['shadowolf', 'frostail', 'emberpup'],
      4: ['rockhorn', 'shadowolf'],
      5: ['mossgolem', 'rockhorn'],
    },
    pens: { penW: 'bloop', penE: 'emberpup', penSE: 'zapchick', penSW: 'sproutle' },
    labels: {
      penW: ['🐧', 'Bloop Pen'], penE: ['🔥', 'Ember Pen'], grove: ['🌲', 'Wild Grove'],
      yardE: ['🏡', 'East Pasture'], yardW: ['🏡', 'West Pasture'],
    },
    difficulty: { catch: 1, speed: 1 },
    groveToast: '🌲 Rare Lv.4–5 critters roam the far field!',
    finale: { id: 'travel', icon: '🗺️', label: 'Frosty Peaks', cost: 7000, to: 2 },
  },
  {
    id: 2, name: 'Frosty Peaks', icon: '❄️', theme: 'snow',
    levelOffset: 5, valueMul: 6, costMul: 6,
    spawn: {
      1: ['frostcap', 'puffling'],
      2: ['frostcap', 'puffling', 'duskwing'],
      3: ['duskwing', 'snowhop'],
      4: ['snowhop', 'yetiburr'],
      5: ['yetiburr', 'frostwisp'],
    },
    pens: { penW: 'frostcap', penE: 'puffling', penSE: 'snowhop', penSW: 'duskwing' },
    labels: {
      penW: ['🍄', 'Frostcap Pen'], penE: ['🐦', 'Puffling Pen'], grove: ['🏔️', 'Glacier Pass'],
      yardE: ['🏡', 'Snowy Pasture'], yardW: ['🏡', 'Ice Cave Pasture'],
    },
    difficulty: { catch: 0.86, speed: 1.15 },
    groveToast: '🏔️ Rare Lv.9–10 critters roam the glacier!',
    finale: { id: 'travel', icon: '🗺️', label: 'Ember Canyon', cost: 7000, to: 3 },
  },
  {
    id: 3, name: 'Ember Canyon', icon: '🌋', theme: 'lava',
    levelOffset: 10, valueMul: 36, costMul: 36,
    spawn: {
      1: ['cindercat', 'buzzspark'],
      2: ['cindercat', 'buzzspark', 'magmatoad'],
      3: ['magmatoad', 'impyre'],
      4: ['impyre', 'sunlord'],
      5: ['sunlord', 'pyrodrake'],
    },
    pens: { penW: 'cindercat', penE: 'buzzspark', penSE: 'magmatoad', penSW: 'sunlord' },
    labels: {
      penW: ['🐱', 'Cindercat Pen'], penE: ['🐝', 'Buzzspark Pen'], grove: ['🔥', 'Lava Fields'],
      yardE: ['🏡', 'Ash Pasture'], yardW: ['🏡', 'Crater Pasture'],
    },
    difficulty: { catch: 0.74, speed: 1.3 },
    groveToast: '🔥 Rare Lv.14–15 critters roam the lava fields!',
    finale: { id: 'travel', icon: '🗺️', label: 'Sunbaked Dunes', cost: 7000, to: 4 },
  },
];

// ── Endless worlds (4, 5, 6, …) ──────────────────────────────
// Critter tiers for mixing: each generated world draws a few species per tier
const TIERS = [
  ['bloop', 'sproutle', 'zapchick', 'emberpup', 'frostcap', 'puffling', 'cindercat', 'buzzspark'],
  ['frostail', 'duskwing', 'emberpup', 'zapchick', 'puffling'],
  ['shadowolf', 'snowhop', 'magmatoad', 'impyre'],
  ['rockhorn', 'yetiburr', 'sunlord', 'impyre'],
  ['mossgolem', 'frostwisp', 'pyrodrake'],
];
const CYCLE = [
  { theme: 'desert', name: 'Sunbaked Dunes', icon: '🏜️', grove: ['🌵', 'Cactus Flats'], yards: ['Oasis Pasture', 'Dune Pasture'] },
  { theme: 'twilight', name: 'Twilight Woods', icon: '🌙', grove: ['✨', 'Glowing Glade'], yards: ['Moon Pasture', 'Star Pasture'] },
  { theme: 'candy', name: 'Candy Hills', icon: '🍭', grove: ['🍬', 'Sugar Fields'], yards: ['Gumdrop Pasture', 'Lollipop Pasture'] },
  { theme: 'meadow', name: 'Sunny Meadow', icon: '🌼', grove: ['🌲', 'Wild Grove'], yards: ['East Pasture', 'West Pasture'] },
  { theme: 'snow', name: 'Frosty Peaks', icon: '❄️', grove: ['🏔️', 'Glacier Pass'], yards: ['Snowy Pasture', 'Ice Cave Pasture'] },
  { theme: 'lava', name: 'Ember Canyon', icon: '🌋', grove: ['🔥', 'Lava Fields'], yards: ['Ash Pasture', 'Crater Pasture'] },
];
const ROMAN = ['', '', ' II', ' III', ' IV', ' V', ' VI', ' VII', ' VIII', ' IX', ' X'];

function seeded(n) {
  let x = (n * 2654435761) >>> 0;
  return () => ((x = (x * 1664525 + 1013904223) >>> 0) / 4294967296);
}

// Theme + display name of a generated world; repeat visits get numerals ("Sunny Meadow II")
function cycleOf(id) {
  const k = id - 4; // 0 = first generated world
  const c = CYCLE[k % CYCLE.length];
  const earlier = BASE_WORLDS.some((w) => w.theme === c.theme) ? 1 : 0; // meadow/snow/lava had a hand-made world
  const lap = Math.floor(k / CYCLE.length) + 1 + earlier;
  return { c, name: c.name + (lap < 2 ? '' : ROMAN[lap] || ` ${lap}`) };
}

function makeWorld(id) {
  const { c, name } = cycleOf(id);
  const r = seeded(id);
  const pick = (list, n, avoid = []) => {
    const pool = list.filter((x) => !avoid.includes(x));
    const out = [];
    while (out.length < n && pool.length) out.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
    return out;
  };
  const t1 = pick(TIERS[0], 3);
  const t2 = pick(TIERS[1], 1, t1);
  const t3 = pick(TIERS[2], 2);
  const t4 = pick(TIERS[3], 1, t3);
  const t5 = pick(TIERS[4], 1);
  const levelOffset = (id - 1) * 5;
  const mul = 36 * Math.pow(5, id - 3);
  return {
    id, generated: true, name, icon: c.icon, theme: c.theme,
    levelOffset, valueMul: mul, costMul: mul,
    spawn: { 1: t1.slice(0, 2), 2: [...t1, ...t2], 3: [...t2, t3[0]], 4: [...t3, ...t4], 5: [...t4, ...t5] },
    pens: { penW: t1[0], penE: t1[1], penSE: t2[0], penSW: t3[0] },
    labels: {
      grove: c.grove, yardE: ['🏡', c.yards[0]], yardW: ['🏡', c.yards[1]],
    },
    // continues the hand-made curve (1, 0.86, 0.74, …): every world breaks free a bit more often
    difficulty: { catch: Math.max(0.45, Math.pow(0.86, id - 1)), speed: Math.min(2.0, 1 + 0.15 * (id - 1)) },
    groveToast: `${c.grove[0]} Rare Lv.${levelOffset + 4}–${levelOffset + 5} critters roam the ${c.grove[1]}!`,
    finale: { id: 'travel', icon: '🗺️', label: cycleOf(id + 1).name, cost: 7000, to: id + 1 },
  };
}

const generated = new Map();
export function worldById(id) {
  if (id <= BASE_WORLDS.length) return BASE_WORLDS.find((w) => w.id === id);
  if (!generated.has(id)) generated.set(id, makeWorld(id));
  return generated.get(id);
}
// Worlds 1…n for the world map
export function worldsUpTo(n) { return Array.from({ length: n }, (_, i) => worldById(i + 1)); }
export const WORLDS = BASE_WORLDS;

// Tile of the world's last unlock (travel / crown), on the right side of the deck
export const FINALE_TILE = [4.6, -2.6];

export let WORLD = BASE_WORLDS[0];
export let THEME = THEMES.meadow;

// Picks the active world; called once at boot (switching worlds reloads the game)
export function setWorld(id) {
  WORLD = worldById(Math.max(1, Math.floor(id) || 1));
  THEME = THEMES[WORLD.theme];
  return WORLD;
}

// Species that live in a world (spawns + pens), e.g. for preloading models and customer wishes
export function worldSpecies(w = WORLD) {
  return [...new Set([...Object.values(w.spawn).flat(), ...Object.values(w.pens)])];
}
export function levelRange(w) { return `Lv.${w.levelOffset + 1}–${w.levelOffset + 5}`; }

// The unlock chain of the active world: prices scaled, pen/grove names per world, plus the finale.
// `penName(species)` names pens the world doesn't label itself (generated worlds).
export function worldUnlocks(penName = null) {
  const list = UNLOCKS.map((u) => {
    const auto = penName && WORLD.pens[u.id] ? penName(WORLD.pens[u.id]) : null;
    const [icon, label] = WORLD.labels[u.id] || auto || [u.icon, u.label];
    return { ...u, icon, label, cost: Math.round(u.cost * WORLD.costMul) };
  });
  const f = WORLD.finale;
  list.push({ ...f, cost: Math.round(f.cost * WORLD.costMul), tile: FINALE_TILE, requires: list[list.length - 1].id });
  return list;
}
