const KEY = 'critter_ranch_save_v1';

export const freshUpgrades = () => ({ capacity: 0, throw: 0, power: 0, speed: 0, value: 0, pens: 0, helpers: 0 });

export function defaultState() {
  return {
    coins: 0,
    xp: 0,
    level: 1,
    // coins / unlocked / paid / upgrades belong to the active world; other worlds are parked in `worlds`
    world: 1,
    maxWorld: 1, // highest world reached
    worlds: {}, // { [id]: { coins, unlocked, paid, upgrades } }
    crown: false, // Golden Crown bought in the last world: all income x2
    unlocked: [],
    paid: {}, // partial payments on unlock tiles
    upgrades: freshUpgrades(),
    adCooldowns: {},
    stats: { caught: 0, sold: 0, earned: 0, unlocks: 0 },
    settings: { sound: true, haptics: true, quality: 'auto' }, // quality: auto | high | low
    profile: { name: 'Rancher', avatar: '👩‍🦰' },
    lastSeen: Date.now(),
    tutorialDone: false,
  };
}

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultState();
    const d = defaultState();
    const s = JSON.parse(raw);
    return { ...d, ...s, upgrades: { ...d.upgrades, ...s.upgrades }, stats: { ...d.stats, ...s.stats }, settings: { ...d.settings, ...s.settings }, profile: { ...d.profile, ...s.profile } };
  } catch {
    return defaultState();
  }
}

export function saveState(state) {
  try {
    state.lastSeen = Date.now();
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch { /* storage full or unavailable */ }
}

export function clearState() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
