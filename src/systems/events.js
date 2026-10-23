// Random field events every 2–3 minutes once the tutorial is done: a timed bonus round, and every
// third time a boss critter that takes several capsule hits and runs away if it isn't caught in time.

export const EVENTS = {
  stampede: { icon: '🦬', name: 'Critter Stampede', short: 'Stampede', desc: 'Critters everywhere: catch as many as you can!', dur: 35 },
  golden: { icon: '✨', name: 'Golden Hour', short: 'Golden Hour', desc: 'Golden critters (x5 coins) show up all the time!', dur: 40 },
  rush: { icon: '🛒', name: 'Rush Hour', short: 'Rush Hour', desc: 'Customers pay double for every critter!', dur: 45 },
  lucky: { icon: '🍀', name: 'Lucky Throws', short: 'Lucky Throws', desc: 'Capture rate +30%!', dur: 40 },
};
const BOSS_TIME = 75;
const FIRST_EVENT = 60; // seconds of play before the first one
const GAP = [110, 180];

export class FieldEvents {
  constructor(game) {
    this.game = game;
    this.timer = FIRST_EVENT;
    this.active = null;
    this.left = 0;
    this.last = null;
    this.count = 0;
    this.boss = null;
    this.bossLeft = 0;
  }

  is(id) { return this.active === id; }

  update(dt) {
    const g = this.game;
    if (this.active) {
      this.left -= dt;
      if (this.left <= 0) {
        g.ui.toast(`${EVENTS[this.active].icon} ${EVENTS[this.active].name} is over`);
        this.active = null;
      }
    }
    if (this.boss) {
      this.bossLeft -= dt;
      if (!this.boss.alive || this.boss.state === 'captured') this.boss = null;
      else if (this.bossLeft <= 0) this.bossEscapes();
    }
    if (!g.state.tutorialDone || this.active || this.boss) return;
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = GAP[0] + Math.random() * (GAP[1] - GAP[0]);
    if (++this.count % 3 === 0) this.startBoss();
    else this.start();
  }

  start(id = null) {
    const g = this.game;
    const ids = Object.keys(EVENTS).filter((k) => k !== this.last);
    id = id || ids[Math.floor(Math.random() * ids.length)];
    const e = EVENTS[id];
    this.active = this.last = id;
    this.left = e.dur;
    g.ui.celebrate(`${e.icon} ${e.name}!`);
    g.ui.toast(e.desc);
    g.audio.unlockFx();
    g.haptic();
    if (id === 'golden') for (let i = 0; i < 3; i++) g.critters.spawn(false, { shiny: true });
  }

  startBoss() {
    const g = this.game;
    this.boss = g.critters.spawnBoss();
    this.bossLeft = BOSS_TIME;
    g.ui.celebrate('👑 Boss critter!');
    g.ui.toast('Stand on the footprints and hit it before it escapes!');
    g.audio.unlockFx();
    g.haptic();
  }

  bossCaught(boss) {
    const g = this.game;
    this.boss = null;
    g.ui.celebrate('👑 Boss caught!');
    g.particles.burst(boss.pos.clone().setY(boss.height * 0.6), { color: 0xffd23a, count: 40, star: true, speed: 8, size: 0.7 });
  }

  bossEscapes() {
    const g = this.game, b = this.boss;
    this.boss = null;
    g.particles.puff(b.pos.clone().setY(1), 0xffffff, 24);
    g.critters.remove(b);
    b.dispose(g.scene);
    g.ui.toast('💨 The boss ran away! Upgrade Throw Speed to beat the next one');
  }

  // text for the HUD chip, or null
  chip() {
    const t = (s) => { s = Math.ceil(s); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
    if (this.boss) return { text: `👑 Boss ${this.boss.hp}/${this.boss.maxHp} · ${t(this.bossLeft)}`, boss: true };
    if (this.active) return { text: `${EVENTS[this.active].icon} ${EVENTS[this.active].short} ${t(this.left)}`, boss: false };
    return null;
  }
}
