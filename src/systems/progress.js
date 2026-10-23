import { WORLD } from '../world/worlds.js';
import { SPECIES } from '../world/models.js';

// Goals on top of the catch → sell → build loop: three missions at a time (each claimed one is replaced
// by a slightly harder one), a 7-day daily reward, and the Critterdex, where every species and golden
// variant caught raises all coin income for good. Rewards are paid in the active world's coins.

const MISSIONS = {
  catch: { w: 3, icon: '🎯', text: (n) => `Catch ${n} critters`, target: (q) => 10 + q * 3 },
  species: { w: 3, text: (n, sp) => `Catch ${n} ${SPECIES[sp].name}${n > 1 ? 's' : ''}`, target: (q) => 3 + Math.floor(q / 2) },
  sell: { w: 2, icon: '🛒', text: (n) => `Sell ${n} critters`, target: (q) => 10 + q * 3 },
  feed: { w: 1, icon: '🍖', text: (n) => `Feed the pens ${n} times`, target: (q) => 5 + q, needs: 'penW' },
  upgrade: { w: 1, icon: '⬆️', text: (n) => `Buy ${n} upgrade${n > 1 ? 's' : ''}`, target: (q) => 2 + Math.floor(q / 8), needs: 'upgrades' },
  golden: { w: 1, icon: '✨', text: (n) => `Catch ${n} golden critter${n > 1 ? 's' : ''}`, target: (q) => 1 + Math.floor(q / 15), mul: 2, minQ: 1 },
  boss: { w: 1, icon: '👑', text: (n) => `Catch ${n} boss critter${n > 1 ? 's' : ''}`, target: (q) => 1 + Math.floor(q / 20), mul: 3, minQ: 3 },
  heal: { w: 2, icon: '🩺', text: (n) => `Heal ${n} hurt critters`, target: (q) => 4 + Math.floor(q / 2), needs: 'clinic' },
  snack: { w: 1, icon: '🍦', text: (n) => `Sell ${n} snacks`, target: (q) => 15 + q * 2, needs: 'snack' },
  vip: { w: 1, icon: '🚚', text: () => 'Fill a VIP truck order', target: () => 1, mul: 2, needs: 'helper1', minQ: 2 },
};
// day 1…7 of the login streak, as multiples of the base reward
export const DAILY = [1, 1.5, 2, 3, 4, 6, 12];
const DEX_SPECIES = 0.02; // +2% coins per species caught
const DEX_GOLDEN = 0.01; // +1% more for its golden variant

const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export class Progress {
  constructor(game) {
    this.game = game;
    const s = game.state;
    s.missions = Array.isArray(s.missions) ? s.missions : [];
    s.dex = s.dex || {};
    s.daily = s.daily || { last: '', streak: 0 };
    // species missions only make sense in a world where that critter lives
    const pool = this.speciesPool();
    s.missions = s.missions.filter((m) => MISSIONS[m.kind] && (m.kind !== 'species' || pool.includes(m.sp)));
    while (s.missions.length < 3) s.missions.push(this.newMission());
    this.updateDexBonus();
  }

  // ── missions ───────────────────────────────────────────────
  speciesPool() {
    const levels = this.game.isUnlocked('grove') ? [1, 2, 3, 4, 5] : [1, 2, 3];
    return [...new Set(levels.flatMap((l) => WORLD.spawn[l]))];
  }

  newMission() {
    const s = this.game.state;
    const q = s.missionsDone || 0;
    const taken = s.missions.map((m) => m.kind);
    const pool = Object.entries(MISSIONS).filter(([id, k]) => (!k.needs || this.game.isUnlocked(k.needs))
      && q >= (k.minQ || 0) && (id === 'species' || !taken.includes(id)));
    let r = Math.random() * pool.reduce((a, [, k]) => a + k.w, 0);
    let pick = pool[0];
    for (const e of pool) { r -= e[1].w; if (r <= 0) { pick = e; break; } }
    const [kind, def] = pick;
    const m = { kind, q, have: 0, n: def.target(q) };
    if (kind === 'species') {
      const used = s.missions.filter((x) => x.kind === 'species').map((x) => x.sp);
      const sp = this.speciesPool().filter((x) => !used.includes(x));
      const list = sp.length ? sp : this.speciesPool();
      m.sp = list[Math.floor(Math.random() * list.length)];
    }
    return m;
  }

  text(m) { return MISSIONS[m.kind].text(m.n, m.sp); }
  icon(m) { return m.kind === 'species' ? SPECIES[m.sp].emoji : MISSIONS[m.kind].icon; }
  // scales with the active world, so a mission is worth the same effort in every world
  reward(m) { return Math.round((50 + 25 * Math.min(m.q, 40)) * WORLD.costMul * (MISSIONS[m.kind].mul || 1)); }
  ready() { return this.game.state.missions.filter((m) => m.have >= m.n).length; }

  track(kind, sp = null, n = 1) {
    for (const m of this.game.state.missions) {
      if (m.kind !== kind || m.have >= m.n || (kind === 'species' && m.sp !== sp)) continue;
      m.have = Math.min(m.n, m.have + n);
      if (m.have >= m.n) {
        this.game.ui.toast(`✅ Mission complete: ${this.text(m)}`);
        this.game.audio.unlockFx();
      }
    }
  }

  claim(i, mul = 1) {
    const g = this.game, s = g.state;
    const m = s.missions[i];
    if (!m || m.have < m.n) return 0;
    const amt = this.reward(m) * mul;
    g.earn(amt);
    g.addXp(3 + Math.floor(m.q / 2));
    s.missionsDone = (s.missionsDone || 0) + 1;
    s.missions.splice(i, 1);
    s.missions.splice(i, 0, this.newMission());
    g.save();
    return amt;
  }

  // ── daily reward ───────────────────────────────────────────
  // `day` is the streak day (1–7) you can claim today, or the one you claimed today
  daily() {
    const d = this.game.state.daily;
    const y = new Date();
    y.setDate(y.getDate() - 1);
    const available = d.last !== dayKey();
    const day = available ? (d.last === dayKey(y) ? (d.streak % 7) + 1 : 1) : d.streak;
    return { available, day };
  }

  dailyAmount(day) {
    const base = 120 * WORLD.costMul * (1 + 0.05 * Math.min(this.game.state.level, 60));
    return Math.round(base * DAILY[day - 1]);
  }

  claimDaily(mul = 1) {
    const g = this.game;
    const { available, day } = this.daily();
    if (!available) return 0;
    const amt = this.dailyAmount(day) * mul;
    g.earn(amt);
    g.state.daily = { last: dayKey(), streak: day };
    g.save();
    return amt;
  }

  // ── Critterdex ─────────────────────────────────────────────
  onCatch(item) {
    const g = this.game;
    this.track('catch');
    this.track('species', item.species);
    if (item.shiny) this.track('golden');
    if (item.boss) this.track('boss');
    const e = g.state.dex[item.species] || (g.state.dex[item.species] = { n: 0, g: 0 });
    const first = e.n === 0, firstGold = item.shiny && e.g === 0;
    e.n++;
    if (item.shiny) e.g++;
    if (first || firstGold) {
      const sp = SPECIES[item.species];
      this.updateDexBonus();
      g.ui.celebrate(`📖 ${firstGold ? 'Golden ' : 'New: '}${sp.emoji} ${sp.name}!`);
      setTimeout(() => g.ui.toast(`Critterdex: all coins +${firstGold && !first ? 1 : first && firstGold ? 3 : 2}% forever`), 900);
    }
  }

  updateDexBonus() {
    let b = 0;
    for (const e of Object.values(this.game.state.dex)) b += (e.n ? DEX_SPECIES : 0) + (e.g ? DEX_GOLDEN : 0);
    this.dexBonus = b;
  }

  dexCounts() {
    const all = Object.keys(SPECIES);
    const dex = this.game.state.dex;
    return { total: all.length, found: all.filter((k) => dex[k]?.n).length, golden: all.filter((k) => dex[k]?.g).length };
  }
}
