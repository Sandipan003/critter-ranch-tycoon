// World layout. +X = right, -Z = up the screen (towards the wild field).
export const DECK_Y = 0.3;

export const L = {
  deck: { x0: -10, x1: 10, z0: -8, z1: 6 },
  balcony: { x0: -6, x1: 6, z0: -11.6, z1: -8 },
  capturePad: [0, -10.2],
  helperPads: [[3.7, -10.3], [-3.7, -10.3]],
  dropZone: [-5.5, 3.6],
  coinPad: [1.5, 3.6],
  machineA: [-5.5, 6.7],
  machineB: [1.5, 6.7],
  beltBottomZ: 11.6,
  pickups: [-2.6, -0.4],
  upgradePad: [5.6, 3.6],
  pens: {
    penW: { x0: -18.6, x1: -10.6, z0: -6.5, z1: 3.5, feed: [-8.4, -3.4], coin: [-8.4, 0.8], species: 'bloop', scale: 3.1, rate: 4 },
    penE: { x0: 10.6, x1: 18.6, z0: -6.5, z1: 3.5, feed: [8.4, -3.4], coin: [8.4, 0.8], species: 'emberpup', scale: 2.9, rate: 10 },
  },
  // Pasture expansions bought with coins: a deck section south of the ranch (entered through
  // `gap` in the south fence) with a pen beyond it. Species/income come from the world.
  yards: {
    yardE: {
      deck: { x0: 3.0, x1: 20.5, z0: 6, z1: 10.6 }, gap: [3.0, 8.4],
      pen: { id: 'penSE', x0: 11, x1: 20, z0: 11.4, z1: 20.4, feed: [12.8, 8.3], coin: [17.2, 8.3], scale: 2.9, rate: 18 },
    },
    yardW: {
      deck: { x0: -20.5, x1: -7.0, z0: 6, z1: 10.6 }, gap: [-9.7, -7.0],
      pen: { id: 'penSW', x0: -20, x1: -11, z0: 11.4, z1: 20.4, feed: [-12.8, 8.3], coin: [-17.2, 8.3], scale: 2.9, rate: 28 },
    },
  },
  // Balcony extensions: more balcony beside the original one, entered through `gap` in the deck's
  // north fence, each with a helper pad
  balconies: {
    balE: { deck: { x0: 6, x1: 13.2, z0: -11.6, z1: -8 }, gap: [6.6, 9.6], pad: [9.9, -10.2] },
    balW: { deck: { x0: -13.2, x1: -6, z0: -11.6, z1: -8 }, gap: [-9.6, -6.6], pad: [-9.9, -10.2] },
  },
  wild: { x0: -26, x1: 26, z0: -50, z1: -15 },
  props: {
    barrels: [[9.1, 5.1]], // the other corners are gateways to the pastures and balconies
  },
};

// Sequential unlocks. Tiles appear when their requirement is met.
export const UNLOCKS = [
  { id: 'upgrades', label: 'Upgrades', icon: '⬆️', cost: 25, tile: [5.6, 3.6], requires: null },
  { id: 'penW', label: 'Bloop Pen', icon: '🐧', cost: 60, tile: [-8.4, -1.3], requires: 'upgrades' },
  { id: 'helper1', label: 'Helper', icon: '🧑‍🌾', cost: 150, tile: [3.7, -10.3], requires: 'penW' },
  { id: 'express', label: 'Express Belt', icon: '⚡', cost: 260, tile: [-2.0, 3.6], requires: 'helper1' },
  { id: 'penE', label: 'Ember Pen', icon: '🔥', cost: 420, tile: [8.4, -1.3], requires: 'express' },
  { id: 'grove', label: 'Wild Grove', icon: '🌲', cost: 750, tile: [0, -5.4], requires: 'penE' },
  { id: 'helper2', label: 'Helper', icon: '🧑‍🌾', cost: 1100, tile: [-3.7, -10.3], requires: 'grove' },
  { id: 'yardE', label: 'East Pasture', icon: '🏡', cost: 1600, tile: [4.6, 0.5], requires: 'helper2' },
  { id: 'balE', label: 'East Balcony', icon: '🪵', cost: 2100, tile: [8.0, -6.6], requires: 'yardE' },
  { id: 'helper3', label: 'Helper', icon: '🧑‍🌾', cost: 2700, tile: [9.9, -10.2], requires: 'balE', preview: false },
  { id: 'yardW', label: 'West Pasture', icon: '🏡', cost: 3400, tile: [-4.8, -3.2], requires: 'helper3' },
  { id: 'balW', label: 'West Balcony', icon: '🪵', cost: 4200, tile: [-8.0, -6.6], requires: 'yardW' },
  { id: 'helper4', label: 'Helper', icon: '🧑‍🌾', cost: 5200, tile: [-9.9, -10.2], requires: 'balW', preview: false },
];

export function inRect(x, z, r, pad = 0) {
  return x >= r.x0 + pad && x <= r.x1 - pad && z >= r.z0 + pad && z <= r.z1 - pad;
}

export function nearSquare(x, z, [cx, cz], half = 1.2) {
  return Math.abs(x - cx) <= half && Math.abs(z - cz) <= half;
}
