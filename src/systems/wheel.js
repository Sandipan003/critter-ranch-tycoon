import { BAL } from '../config.js';
import { formatNum } from '../world/textures.js';

// Lucky Wheel: a free spin every few hours, and a few more each day for a video. Coin prizes are
// multiples of the 🎁 free-coins amount, so they keep pace with the world's prices.
export const PRIZES = [
  { kind: 'coins', mul: 1, icon: '🪙', w: 22 },
  { kind: 'income', icon: '💰', label: 'x2 Coins', w: 12 },
  { kind: 'coins', mul: 2, icon: '🪙', w: 16 },
  { kind: 'golden', icon: '⚡', label: '100% Catch', w: 12 },
  { kind: 'coins', mul: 1.5, icon: '🪙', w: 18 },
  { kind: 'coins', mul: 3, icon: '💰', w: 10 },
  { kind: 'coins', mul: 5, icon: '💎', w: 7 },
  { kind: 'coins', mul: 12, icon: '👑', label: 'JACKPOT', w: 3, jackpot: true },
];

const dayKey = (d = new Date()) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

export class Wheel {
  constructor(game) {
    this.game = game;
  }

  get st() { return this.game.state.wheel; }
  freeReady() { return Date.now() >= this.st.next; }
  freeIn() { return Math.max(0, (this.st.next - Date.now()) / 1000); }
  adsLeft() { return this.st.day === dayKey() ? Math.max(0, BAL.wheelAdSpins - this.st.ads) : BAL.wheelAdSpins; }

  coins(p) { return Math.round(this.game.freeCoinsAmount() * p.mul); }

  // uses up the spin (free, or one of today's video spins) and returns the winning segment's index
  spin(free) {
    const s = this.st;
    if (free) s.next = Date.now() + BAL.wheelFreeHours * 3600 * 1000;
    else {
      if (s.day !== dayKey()) { s.day = dayKey(); s.ads = 0; }
      s.ads++;
    }
    let r = Math.random() * PRIZES.reduce((a, p) => a + p.w, 0);
    let i = 0;
    while (i < PRIZES.length - 1 && (r -= PRIZES[i].w) > 0) i++;
    this.game.save();
    return i;
  }

  // pays the prize; returns the text shown under the wheel
  award(i) {
    const g = this.game, p = PRIZES[i];
    g.audio.unlockFx();
    if (p.kind === 'income') {
      g.boosts.income = Math.max(g.boosts.income, BAL.incomeBoostSec);
      return '💰 Double coins for 2 minutes!';
    }
    if (p.kind === 'golden') {
      g.boosts.golden = Math.max(g.boosts.golden, BAL.goldenThrowSec);
      return '⚡ Golden Throw: 100% capture for 45 s!';
    }
    const amt = this.coins(p);
    g.earn(amt);
    g.coinBurstToHud(amt);
    g.save();
    return p.jackpot ? `👑 JACKPOT! +${formatNum(amt)}` : `+${formatNum(amt)} coins!`;
  }
}
