// ─────────────────────────────────────────────────────────────
//  GAME + ADMOB CONFIG — edit this file before publishing.
// ─────────────────────────────────────────────────────────────

export const GAME_NAME = 'Critter Ranch Tycoon';
export const VERSION = '1.1.1';
// players who finished the tutorial see the "What's new" card once when this changes
export const NEWS = '1.1.0';

// AdMob ad unit IDs.
// While `testMode` is true, Google's official demo units are used so you can
// develop safely (clicking your own live ads gets AdMob accounts banned).
// Only the Play Store build (`npm run android:release`, which runs `vite build --mode release`)
// uses the real units below; the browser and debug APKs always show test ads.
// The AdMob *App ID* is in android/app/src/main/res/values/strings.xml (admob_app_id).
export const ADS = {
  testMode: import.meta.env.MODE !== 'release',
  rewardedId: 'ca-app-pub-7976242341858407/7711577788', // "Rewarded - bonuses"
  interstitialId: 'ca-app-pub-7976242341858407/8026527699', // "Interstitial - unlocks"
  bannerId: 'ca-app-pub-7976242341858407/9004015132', // "Banner - bottom"
  // bottom banner below the game: the game view shrinks to sit above it, so it never covers play.
  // Shown once the tutorial is done, and not on phones under 2 GB of RAM (memory).
  bannerEnabled: true,
  interstitialEveryUnlocks: 3, // show an interstitial after every N unlocks…
  interstitialMinGapSec: 240, // …but never more often than this
};

// Google demo ad units (Android). Safe to use in development.
export const TEST_IDS = {
  rewarded: 'ca-app-pub-3940256099942544/5224354917',
  interstitial: 'ca-app-pub-3940256099942544/1033173712',
  banner: 'ca-app-pub-3940256099942544/6300978111',
};

// ── Balance ──────────────────────────────────────────────────
export const BAL = {
  baseCapacity: 6,
  capacityPerLevel: 2,
  baseThrowInterval: 1.0,
  throwIntervalMul: 0.88,
  baseMoveSpeed: 5.2,
  moveSpeedPerLevel: 0.45,
  captureRange: 30,
  beltSpeed: 2.6,
  levelValue: [0, 4, 9, 18, 30, 50],
  baseCatch: [0, 0.75, 0.55, 0.4, 0.3, 0.22],
  captureBonusPerLevel: 0.08,
  offlineCapHours: 2,
  rewardCooldownSec: 90,
  incomeBoostSec: 120,
  goldenThrowSec: 45,
  // Doctor Deck: once built, this share of wild critters is hurt; healed ones pay healMul x their price
  hurtChance: 0.22,
  healMul: 3,
  healSec: 4.5, // per patient and bed (Doctor Skill shortens it)
  clinicWaiting: 12, // patients waiting for a bed
  // Snack stand: one ice cream every snackSec to a customer in the queue, worth snackValue (x world)
  snackSec: 3,
  snackValue: 3,
  snackRushSec: 120, // ▶ Snack Rush: x3 snack sales
  // VIP truck: an order every few minutes once the first helper is hired; pays vipMul x the price
  vipFirstSec: 75,
  vipGapSec: [200, 280],
  vipSec: 180,
  vipMul: 4,
  // Lucky Wheel: a free spin every few hours, more for a video (a few a day)
  wheelFreeHours: 4,
  wheelAdSpins: 8,
};

// Per-world upgrades (each world starts at Lv.1). Prices grow by `mul` per level and are multiplied
// by the world's costMul, so late levels stay a coin sink; `max: Infinity` never caps (endless sink).
// `requires` hides an upgrade until that unlock; with `teaser` it shows greyed out instead
// ("🔒 Build the … first"), so players see what the Snack Stand and the Doctor Deck will bring.
export const UPGRADES = [
  { id: 'capacity', name: 'Backpack', icon: '🎒', desc: '+2 carry slots', base: 20, mul: 1.6, max: 15 },
  { id: 'throw', name: 'Throw Speed', icon: '💨', desc: 'Throw faster, multi-throw', base: 25, mul: 1.6, max: 15 },
  { id: 'power', name: 'Capture Power', icon: '✨', desc: '+8% capture rate', base: 30, mul: 1.65, max: 12 },
  { id: 'speed', name: 'Run Speed', icon: '👟', desc: 'Move faster', base: 15, mul: 1.5, max: 10 },
  { id: 'value', name: 'Better Prices', icon: '💰', desc: '+15% sale value', base: 40, mul: 1.6, max: Infinity },
  { id: 'pens', name: 'Pen Feeding', icon: '🍖', desc: '+25% coins from every pen', base: 120, mul: 1.55, max: Infinity, requires: 'penW' },
  { id: 'helpers', name: 'Helper Training', icon: '🧑‍🌾', desc: 'Helpers walk, throw and carry more', base: 200, mul: 1.6, max: 15, requires: 'helper1' },
  { id: 'snack', name: 'Snack Menu', icon: '🍦', desc: '+30% coins per snack', base: 300, mul: 1.55, max: Infinity, requires: 'snack', teaser: '🍦 Snack Stand' },
  { id: 'snackSpeed', name: 'Fast Service', icon: '🛎️', desc: 'Snacks are served 10% faster', base: 450, mul: 1.6, max: 10, requires: 'snack', teaser: '🍦 Snack Stand' },
  { id: 'clinic', name: 'Doctor Skill', icon: '🩺', desc: 'The doctor heals 12% faster', base: 1500, mul: 1.6, max: 12, requires: 'clinic', teaser: '🏥 Doctor Deck' },
  { id: 'clinicFee', name: 'Clinic Fees', icon: '💊', desc: '+25% coins for every healed critter', base: 1800, mul: 1.55, max: Infinity, requires: 'clinic', teaser: '🏥 Doctor Deck' },
];
