import * as THREE from 'three';
import { WORLD } from '../world/worlds.js';
import { buildCapsule, CAPSULE_TIERS } from '../world/models.js';
import { captureRingTexture, formatNum } from '../world/textures.js';
import { BAL } from '../config.js';

// Throws capsules at wild critters for an owner (player or helper)
export class Catcher {
  constructor(game, owner, { showRing = false } = {}) {
    this.game = game;
    this.owner = owner; // { stack, handWorld(v), pos, catchStats() }
    this.timer = 0.2;
    this.showRing = showRing;
    this.inFlight = 0;
  }

  update(dt, active) {
    if (!active) { this.timer = Math.min(this.timer, 0.25); return; }
    const stats = this.owner.catchStats();
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = stats.interval;
    const stack = this.owner.stack;
    for (let k = 0; k < stats.multi; k++) {
      const target = this.game.critters.targetFor(this.owner.pos, BAL.captureRange);
      // a boss needs no backpack space: it pays out on the spot
      if (stack.full && !target?.boss) {
        if (this.owner.onFull) this.owner.onFull();
        break;
      }
      if (!target) break;
      this.throwAt(target, stats, k * 0.12);
    }
  }

  throwAt(critter, stats, delay) {
    const g = this.game;
    if (critter.boss) critter.pendingHits++;
    else {
      critter.reservedBy = this.owner;
      this.owner.stack.incoming++;
    }
    this.inFlight++;
    const tier = Math.min(critter.level, CAPSULE_TIERS.length - 1);
    const cap = buildCapsule(tier);
    const from = this.owner.handWorld(new THREE.Vector3());
    const dist = from.distanceTo(critter.pos);
    if (this.owner.onThrow) this.owner.onThrow(critter);
    g.audio.whoosh();
    g.flyers.fly(cap, from, (v) => v.copy(critter.pos).setY(critter.height * 0.5 + 0.3), {
      dur: 0.45 + dist * 0.012,
      height: 2.5 + dist * 0.06,
      spin: 14,
      delay,
      onDone: () => this.resolve(critter, cap, stats),
    });
  }

  resolve(critter, cap, stats) {
    const g = this.game;
    if (critter.boss) { this.hitBoss(critter, cap, stats); return; }
    const lucky = g.events.is('lucky') ? 1.3 : 1;
    const chance = stats.golden ? 1 : Math.min(0.97,
      (BAL.baseCatch[critter.level] * WORLD.difficulty.catch * critter.catchMul + critter.fails * 0.12) * (1 + stats.power * BAL.captureBonusPerLevel) * lucky);
    if (this.showRing) this.ring(critter, chance);
    const success = Math.random() < chance;
    if (!critter.alive || !success) {
      // capsule bursts, critter hops away annoyed
      g.particles.burst(cap.position, { color: 0xffffff, count: 10, speed: 3, size: 0.3 });
      g.scene.remove(cap);
      if (critter.alive) {
        critter.reservedBy = null;
        critter.startle();
      }
      this.owner.stack.incoming--;
      this.inFlight--;
      g.audio.fail();
      return;
    }
    this.capture(critter, cap);
  }

  // A capsule that reaches a boss usually lands (less often in later worlds; a Golden Throw always
  // lands and hits twice); a miss makes it dodge. The last hit catches it.
  hitBoss(boss, cap, stats) {
    const g = this.game;
    boss.pendingHits--;
    const lands = stats.golden || Math.random() < Math.max(0.55, 0.9 * WORLD.difficulty.catch) * (g.events.is('lucky') ? 1.3 : 1);
    if (boss.alive && boss.state !== 'captured' && boss.hp > 0 && !lands) {
      g.particles.burst(cap.position, { color: 0xffffff, count: 10, speed: 3, size: 0.3 });
      g.floatText.spawn(boss.pos.clone().setY(boss.height + 0.6), 'MISS', '#c8d0ff', 1.1);
      g.scene.remove(cap);
      boss.startle();
      g.audio.fail();
      this.inFlight--;
      return;
    }
    if (boss.alive && boss.state !== 'captured' && boss.hp > 0) boss.setHp(Math.max(0, boss.hp - (stats.golden ? 2 : 1)));
    else {
      g.particles.burst(cap.position, { color: 0xffffff, count: 10, speed: 3, size: 0.3 });
      g.scene.remove(cap);
      this.inFlight--;
      return;
    }
    if (boss.hp > 0) {
      g.particles.burst(cap.position, { color: 0xffb020, count: 14, star: true, speed: 5, size: 0.5 });
      g.floatText.spawn(boss.pos.clone().setY(boss.height + 0.6), `💥 ${boss.hp}`, '#ffffff', 1.3);
      g.scene.remove(cap);
      if (boss.built.emote) boss.built.emote('hit', 1.4);
      g.audio.pop();
      g.haptic();
      this.inFlight--;
      return;
    }
    g.events.bossCaught(boss);
    this.capture(boss, cap);
  }

  capture(critter, cap) {
    const g = this.game;
    critter.state = 'captured';
    if (critter.shiny && this.owner === g.player) g.ui.toast('✨ Golden critter caught! x5 coins');
    g.particles.burst(critter.pos.clone().setY(critter.height * 0.5), { color: 0xfff27a, count: 16, speed: 4, star: true, size: 0.45 });
    g.audio.pop();
    g.haptic();
    cap.rotation.set(0, 0, Math.PI / 2);
    const shrink = { t: 0 };
    const startScale = critter.mesh.scale.x;
    g.tweens.add((dt) => {
      shrink.t += dt / 0.3;
      const k = Math.min(1, shrink.t);
      critter.mesh.scale.setScalar(startScale * (1 - k));
      critter.mesh.position.y = k * 0.6;
      if (k >= 1) {
        g.critters.remove(critter);
        critter.dispose(g.scene);
        return true;
      }
      return false;
    });
    const owner = this.owner;
    if (critter.boss) {
      // the boss's coins fly straight to the catcher
      const item = { value: critter.value, species: critter.species, level: critter.displayLevel, shiny: false, boss: true };
      g.flyers.fly(cap, cap.position.clone(), (v) => v.copy(owner.pos).setY(2.2), {
        dur: 0.6, height: 3, delay: 0.25,
        onDone: () => {
          g.scene.remove(cap);
          this.inFlight--;
          const coins = g.saleValue(item.value);
          g.earn(coins);
          g.floatText.spawn(owner.pos.clone().setY(3.6), `+${formatNum(coins)}`, '#ffe14a', 1.8);
          g.particles.burst(owner.pos.clone().setY(2), { color: 0xffd23a, count: 26, star: true, speed: 6, size: 0.5 });
          g.audio.unlockFx();
          g.onCapture(owner, item);
        },
      });
      return;
    }
    const item = { mesh: cap, tier: cap.userData.tier = Math.min(critter.level, 5), value: critter.value, species: critter.species, level: critter.displayLevel, shiny: critter.shiny, boss: critter.boss };
    g.flyers.fly(cap, cap.position.clone(), (v) => owner.stack.slotWorld(owner.stack.count, v), {
      dur: 0.5,
      height: 2,
      delay: 0.25,
      onDone: () => {
        owner.stack.incoming--;
        this.inFlight--;
        owner.stack.push(item);
        g.onCapture(owner, item);
      },
    });
  }

  ring(critter, chance) {
    const g = this.game;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: captureRingTexture(chance), transparent: true, depthTest: false }));
    s.renderOrder = 998;
    const size = 2.2 + critter.level * 0.4;
    s.scale.set(size, size, 1);
    s.position.copy(critter.pos).setY(critter.height * 0.6 + 0.4);
    g.scene.add(s);
    let t = 0;
    g.tweens.add((dt) => {
      t += dt;
      s.material.opacity = t < 0.5 ? 1 : 1 - (t - 0.5) / 0.3;
      if (t > 0.8) {
        g.scene.remove(s);
        s.material.map.dispose();
        s.material.dispose();
        return true;
      }
      return false;
    });
  }
}

export function catchStatsFor(levels, golden, helper = false) {
  const throwLv = helper ? Math.floor(levels.throw / 2) : levels.throw;
  return {
    interval: BAL.baseThrowInterval * Math.pow(BAL.throwIntervalMul, throwLv) * (golden ? 0.5 : 1) * (helper ? 1.4 : 1),
    multi: 1 + (throwLv >= 3 ? 1 : 0) + (throwLv >= 7 ? 1 : 0) + (golden ? 1 : 0),
    power: levels.power,
    golden: golden && !helper,
  };
}
