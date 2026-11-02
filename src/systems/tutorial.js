import { formatNum } from '../world/textures.js';
import { NEWS } from '../config.js';

// First-time guide: a welcome card, then six steps (move → catch → sell → collect → first unlock →
// first pen), each with a card at the top of the screen and the green arrow pointing where to go,
// then a "How to play" card. Steps a player has already done are skipped, so the guide picks up
// where they are after a restart. Ad buttons, events and the side buttons wait until it's finished.

// where to go to earn coins, depending on what the player carries
function loop(g) {
  const p = g.player;
  if (g.coinPad.value > 0 && p.stack.count === 0) return { target: g.coinPad.pos, text: 'collect them on the 💰 pad' };
  if (p.stack.count > 0 && (p.stack.full || !p.capturing)) return { target: g.dropZone.pos, text: 'sell critters at the 📦 belt' };
  return { target: g.capturePad.pos, text: 'catch more on the 👣 footprints' };
}

// a step that buys an unlock tile: point at it when affordable, otherwise at the earning loop
function buyStep(id, icon, title, why) {
  return {
    id, icon, title, quiet: true, // buying already celebrates
    skip: (g) => g.isUnlocked(id),
    done: (g) => g.isUnlocked(id),
    show(g) {
      const tile = g.tiles[id];
      if (!tile || tile.locked) return { text: why, target: null };
      const need = tile.remaining - g.state.coins;
      if (need <= 0 || tile.paid > 0) return { text: `${why} Walk onto the green ${icon} tile!`, target: tile.def.tile };
      const l = loop(g);
      return { text: `${why} Need ${formatNum(need)} more coins: ${l.text}.`, target: l.target };
    },
  };
}

const STEPS = [
  {
    id: 'move', icon: '👆', title: 'Move around',
    skip: (g) => g.state.stats.caught > 0,
    start(g, t) { t.from = g.player.pos.clone(); },
    done: (g, t) => g.player.pos.distanceTo(t.from) > 2.5,
    show: () => ({ text: 'Put your finger anywhere on the screen and drag to walk.', target: null, hand: true }),
  },
  {
    id: 'catch', icon: '👣', title: 'Catch critters',
    skip: (g) => g.state.stats.caught >= 3 || g.state.stats.sold > 0,
    done: (g) => g.player.stack.count >= 3 || g.player.stack.full,
    show: (g) => (g.player.capturing
      ? { text: 'Stay still: you throw capsules all by yourself! Catch 3 critters.', target: null }
      : { text: 'Walk onto the green 👣 footprints at the front of the balcony.', target: g.capturePad.pos }),
  },
  {
    id: 'sell', icon: '📦', title: 'Sell your critters',
    skip: (g) => g.state.stats.sold > 0 && g.player.stack.count === 0,
    done: (g) => g.state.stats.sold > 0 && g.player.stack.count === 0,
    show: (g) => ({ text: 'Carry them to the 📦 belt and stand there until your backpack is empty.', target: g.dropZone.pos }),
  },
  {
    id: 'coins', icon: '💰', title: 'Collect your coins',
    skip: (g) => g.state.stats.earned > 0,
    done: (g) => g.state.stats.earned > 0,
    show: (g) => ({ text: g.coinPad.value > 0 ? 'Customers paid! Stand on the 💰 pad to collect the coins.' : 'Customers buy your critters, and the coins ride back to you on the belt…', target: g.coinPad.pos }),
  },
  buyStep('upgrades', '⬆️', 'Spend your coins', 'Coins buy new things for your ranch.'),
  buyStep('penW', '🐧', 'Build a pen', 'Pens make coins for you, even offline!'),
];

export class Tutorial {
  constructor(game) {
    this.game = game;
    this.active = !game.state.tutorialDone;
    this.i = -1;
    this.t = {};
    this.wait = 0;
  }

  get total() { return STEPS.length; }

  // shown once the player taps Play
  begin() {
    if (!this.active) return;
    const g = this.game;
    if (g.state.stats.caught > 0) { this.next(); return; }
    this.welcomePending = true;
    g.ui.later(() => {
      this.welcomeShown = true;
      g.ui.welcome(() => { this.welcomePending = false; this.next(); });
    });
  }

  next() {
    const g = this.game;
    do this.i++; while (this.i < STEPS.length && STEPS[this.i].skip(g));
    if (this.i >= STEPS.length) { this.finish(); return; }
    this.t = {};
    STEPS[this.i].start?.(g, this.t);
  }

  finish() {
    const g = this.game;
    this.active = false;
    this.i = STEPS.length;
    g.ui.tutCard(null);
    g.state.tutorialDone = true;
    g.state.news = NEWS; // the guide's last card covers the new features, no "What's new" later
    g.save();
    g.onTutorialDone?.();
    g.ui.later(() => g.ui.howToPlay(true));
  }

  // called every frame; returns the guide arrow target ([x, z] or Vector3) or null
  update(dt) {
    if (!this.active || this.i >= STEPS.length) return null;
    const g = this.game;
    if (this.i < 0) {
      // the welcome card was closed with the back button instead of "Let's start!"
      if (this.welcomePending && this.welcomeShown && !document.querySelector('.modal.welcome')) {
        this.welcomePending = false;
        this.next();
      }
      return null;
    }
    const step = STEPS[this.i];
    if (this.wait > 0) {
      this.wait -= dt;
      if (this.wait <= 0) this.next();
      return null;
    }
    if (step.done(g, this.t)) {
      if (!step.quiet) {
        g.ui.celebrate('✅ Nice!');
        g.audio.unlockFx();
      }
      g.ui.tutCard(null);
      this.wait = 1.1;
      return null;
    }
    const s = step.show(g, this.t);
    g.ui.tutCard({ n: this.i + 1, total: STEPS.length, icon: step.icon, title: step.title, text: s.text, hand: !!s.hand });
    return s.target;
  }
}
