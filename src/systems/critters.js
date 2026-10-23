import * as THREE from 'three';
import { buildCritter, SPECIES, disposeBaked } from '../world/models.js';
import { WORLD } from '../world/worlds.js';
import { levelLabelTexture, bossLabelTexture, bubbleTexture } from '../world/textures.js';
import { BAL } from '../config.js';
import { MODEL_MAT } from '../world/assets.js';

// golden critters: rare, glowing, worth x5 and harder to catch
const SHINY_CHANCE = 0.03;
const SHINY_MAT = MODEL_MAT.clone();
SHINY_MAT.emissive.set(0xffb020);
SHINY_MAT.emissiveIntensity = 0.45;
SHINY_MAT.metalness = 0.35;
SHINY_MAT.roughness = 0.35;
// boss critters: big, glowing red, several capsule hits to catch
const BOSS_MAT = MODEL_MAT.clone();
BOSS_MAT.emissive.set(0xff3a20);
BOSS_MAT.emissiveIntensity = 0.22;
const BOSS_SCALE = 1.7;
export const SPECIAL_MATS = [SHINY_MAT, BOSS_MAT]; // for shader warm-up at load

const LEVEL_SCALE = [0, 0.9, 1.1, 1.55, 1.85, 2.15];
const LEVEL_BAND = [null, [-14.5, -22], [-16, -27], [-20, -34], [-26, -42], [-32, -48]];
const LEVEL_HALF_WIDTH = [0, 11, 13, 16, 19, 22];

export class WildCritter {
  // `boss: hp` makes a boss: roams like a Lv.3 critter but is huge, worth a lot and takes `hp` hits.
  // `hurt` (once the Doctor Deck is built): wears a 🩹, is a little easier to catch and can be healed
  constructor(scene, species, level, pos, shiny = false, { boss = 0, hurt = false } = {}) {
    this.shiny = shiny;
    this.hurt = hurt;
    this.species = species;
    this.level = level; // 1–5 within the world; shown as level + WORLD.levelOffset
    this.displayLevel = (boss ? 5 : level) + WORLD.levelOffset;
    this.value = Math.round(BAL.levelValue[boss ? 5 : level] * SPECIES[species].mult * WORLD.valueMul * (shiny ? 5 : 1) * (boss ? 6 : 1));
    this.catchMul = shiny ? 0.7 : hurt ? 1.15 : 1;
    this.scale = LEVEL_SCALE[level] * (boss ? BOSS_SCALE : 1);
    this.boss = !!boss;
    this.maxHp = this.hp = boss;
    this.pendingHits = 0; // capsules on their way to a boss
    const built = buildCritter(species, this.scale);
    this.built = built;
    this.mesh = built.root;
    this.body = built.body;
    this.baseY = built.body.position.y; // fliers hover
    if (shiny || boss) built.root.traverse((o) => { if (o.isSkinnedMesh) o.material = boss ? BOSS_MAT : SHINY_MAT; });
    this.lod = 1; // animation update interval in frames (far critters animate less often)
    this.frame = 0;
    this.animDt = 0;
    this.feet = built.feet;
    this.tail = built.tail;
    this.height = built.height * this.scale;
    this.mesh.position.copy(pos);
    this.mesh.rotation.y = Math.random() * Math.PI * 2;
    scene.add(this.mesh);

    const map = boss ? bossLabelTexture(this.displayLevel, this.hp, this.maxHp) : levelLabelTexture(this.displayLevel, level >= 4 || shiny, shiny);
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false }));
    const ls = 0.9 + level * 0.25;
    if (boss) label.scale.set(4.2, 2.6, 1);
    else label.scale.set(ls * 1.6, ls * 0.8, 1);
    label.position.y = built.height + (boss ? 1.5 : 0.35) / this.scale;
    label.scale.multiplyScalar(1 / this.scale);
    label.renderOrder = 5;
    this.mesh.add(label);
    this.label = label;
    if (hurt) {
      const b = new THREE.Sprite(new THREE.SpriteMaterial({ map: bubbleTexture('🩹', '#ff6b8a'), transparent: true, depthWrite: false }));
      b.scale.set(0.75 / this.scale, 0.88 / this.scale, 1);
      b.position.y = label.position.y + (0.75 + level * 0.12) / this.scale;
      b.renderOrder = 5;
      this.mesh.add(b);
      this.bandage = b;
    }

    this.state = 'spawn';
    this.timer = 0;
    this.target = new THREE.Vector3();
    this.reservedBy = null;
    this.fails = 0;
    this.phase = Math.random() * 10;
    this.speed = 0;
    this.alive = true;
    this.mesh.scale.setScalar(0.001);
  }

  get pos() { return this.mesh.position; }
  get catchable() { return !this.boss && this.alive && this.state !== 'spawn' && this.state !== 'captured' && !this.reservedBy; }
  // a boss takes many capsules at once, as long as the ones in flight won't already finish it
  get hittable() { return this.boss && this.alive && this.state !== 'spawn' && this.state !== 'captured' && this.hp - this.pendingHits > 0; }

  setHp(hp) {
    this.hp = hp;
    const old = this.label.material.map;
    this.label.material.map = bossLabelTexture(this.displayLevel, this.hp, this.maxHp);
    old.dispose();
  }

  pickTarget() {
    const band = LEVEL_BAND[this.level];
    const half = LEVEL_HALF_WIDTH[this.level];
    this.target.set(
      THREE.MathUtils.clamp(this.pos.x + (Math.random() - 0.5) * 10, -half, half),
      0,
      THREE.MathUtils.clamp(this.pos.z + (Math.random() - 0.5) * 8, band[1], band[0]),
    );
  }

  startle() {
    this.state = 'hop';
    this.timer = 0.6;
    this.fails++;
    this.pickTarget();
  }

  update(dt) {
    this.phase += dt;
    // far critters advance their skeleton every 2nd/3rd frame with the summed time
    this.animDt += dt;
    const doAnim = this.state === 'captured' || ++this.frame % this.lod === 0;
    const anim = doAnim ? this.built.animate : null;
    const adt = this.animDt;
    if (doAnim) this.animDt = 0;
    if (this.state === 'spawn') {
      this.timer += dt;
      const k = Math.min(1, this.timer / 0.5);
      this.mesh.scale.setScalar(this.scale * (k < 1 ? 1.15 * Math.sin(k * Math.PI * 0.5) + (k > 0.8 ? -0.15 * (k - 0.8) * 5 : 0) : 1));
      if (k >= 1) { this.mesh.scale.setScalar(this.scale); this.state = 'idle'; this.timer = Math.random() * 2; }
      if (anim) anim(adt, 'idle');
      return;
    }
    if (this.state === 'captured') {
      if (anim) anim(adt, 'captured');
      return;
    }

    if (this.state === 'idle') {
      this.timer -= dt;
      this.speed = 0;
      if (this.timer <= 0 && !this.reservedBy) { this.state = 'walk'; this.pickTarget(); }
    } else if (this.state === 'walk' || this.state === 'hop') {
      const dx = this.target.x - this.pos.x, dz = this.target.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      const sp = ((this.state === 'hop' ? 4.5 : 1.3) * WORLD.difficulty.speed) / Math.sqrt(this.scale);
      if (d < 0.2 || this.reservedBy) {
        this.state = 'idle';
        this.timer = 1 + Math.random() * 3;
      } else {
        this.pos.x += (dx / d) * sp * dt;
        this.pos.z += (dz / d) * sp * dt;
        const want = Math.atan2(dx, dz);
        let diff = want - this.mesh.rotation.y;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        this.mesh.rotation.y += diff * Math.min(1, dt * 6);
        this.speed = sp;
      }
      if (this.state === 'hop') this.timer -= dt;
    }

    const moving = this.speed > 0;
    if (this.built.animate) {
      if (anim) anim(adt, !moving ? 'idle' : this.state === 'hop' ? 'hop' : 'walk', 1.1 / Math.sqrt(this.scale));
      return;
    }
    // cute bounce animation (procedural fallback)
    const f = moving ? 9 : 2.2;
    const bob = moving ? Math.abs(Math.sin(this.phase * f)) * 0.12 : 0;
    this.body.position.y = this.baseY + bob;
    const squash = moving ? 1 : 1 + Math.sin(this.phase * f) * 0.03;
    this.body.scale.set(1 / Math.sqrt(squash), squash, 1 / Math.sqrt(squash));
    if (this.tail) this.tail.rotation.y = Math.sin(this.phase * 5) * 0.35;
    if (this.feet.length) {
      this.feet[0].position.z = 0.12 + (moving ? Math.sin(this.phase * f) * 0.08 : 0);
      this.feet[1].position.z = 0.12 - (moving ? Math.sin(this.phase * f) * 0.08 : 0);
    }
  }

  dispose(scene) {
    this.alive = false;
    scene.remove(this.mesh);
    if (this.boss) this.label.material.map.dispose();
    this.label.material.dispose();
    this.bandage?.material.dispose(); // its texture is shared (bubble cache)
    disposeBaked(this.mesh);
  }
}

export class CritterSpawner {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.timer = 0;
  }

  get maxCount() {
    const stampede = this.game.events?.is('stampede') ? (this.game.low ? 6 : 10) : 0;
    return (this.game.isUnlocked('grove') ? 24 : 18) - (this.game.low ? 6 : 0) + stampede;
  }

  rollLevel() {
    const r = Math.random();
    if (this.game.isUnlocked('grove')) {
      if (r < 0.32) return 1;
      if (r < 0.58) return 2;
      if (r < 0.8) return 3;
      if (r < 0.94) return 4;
      return 5;
    }
    if (r < 0.55) return 1;
    if (r < 0.85) return 2;
    return 3;
  }

  spawn(initial = false, { shiny = Math.random() < (this.game.events?.is('golden') ? 0.3 : SHINY_CHANCE) } = {}) {
    const level = this.rollLevel();
    const table = WORLD.spawn[level];
    const species = table[Math.floor(Math.random() * table.length)];
    const band = LEVEL_BAND[level];
    const half = LEVEL_HALF_WIDTH[level];
    const pos = new THREE.Vector3(
      (Math.random() * 2 - 1) * half,
      0,
      band[1] + Math.random() * (band[0] - band[1]),
    );
    const hurt = !shiny && !!this.game.clinic && Math.random() < BAL.hurtChance;
    const c = new WildCritter(this.game.scene, species, level, pos, shiny, { hurt });
    const now = performance.now();
    if (shiny && !initial && now - (this.lastShinyToast || 0) > 30000) {
      this.lastShinyToast = now;
      this.game.ui.toast('✨ A golden critter appeared! Worth x5');
    }
    if (initial) c.timer = Math.random() * 0.3;
    this.list.push(c);
    return c;
  }

  // a boss of the world's strongest critters, near the front of the field
  spawnBoss() {
    const g = this.game;
    const table = WORLD.spawn[g.isUnlocked('grove') ? 5 : 4];
    const species = table[Math.floor(Math.random() * table.length)];
    const pos = new THREE.Vector3((Math.random() * 2 - 1) * 8, 0, -21 - Math.random() * 5);
    // tougher in later worlds and when helpers join the fight
    const hp = Math.min(30, 6 + WORLD.id * 2 + g.helpers.length * 2);
    const c = new WildCritter(g.scene, species, 3, pos, false, { boss: hp });
    this.list.push(c);
    g.particles.burst(pos.clone().setY(2), { color: 0xff5a4a, count: 30, star: true, speed: 7, size: 0.7 });
    return c;
  }

  // what a catcher at `from` throws at next: a boss in range first, else the nearest critter
  targetFor(from, range) {
    const b = this.game.events?.boss;
    if (b && b.hittable && Math.hypot(b.pos.x - from.x, b.pos.z - from.z) < range) return b;
    return this.nearestCatchable(from, range);
  }

  remove(c) {
    const i = this.list.indexOf(c);
    if (i >= 0) this.list.splice(i, 1);
  }

  nearestCatchable(from, range) {
    let best = null, bd = range * range;
    for (const c of this.list) {
      if (!c.catchable) continue;
      const dx = c.pos.x - from.x, dz = c.pos.z - from.z;
      const d = dx * dx + dz * dz;
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  update(dt) {
    this.timer -= dt;
    if (this.list.length < this.maxCount && this.timer <= 0) {
      this.spawn();
      this.timer = this.game.events?.is('stampede') ? 0.2 : 0.8;
    }
    const look = this.game.camLook;
    this.sparkle = (this.sparkle || 0) - dt;
    const sparkle = this.sparkle <= 0;
    if (sparkle) this.sparkle = 0.45;
    for (const c of this.list) {
      const d = Math.hypot(c.pos.x - look.x, c.pos.z - look.z);
      c.lod = this.game.low ? (d > 26 ? 3 : d > 16 ? 2 : 1) : d > 34 ? 3 : d > 22 ? 2 : 1;
      c.update(dt);
      if (sparkle && c.shiny && c.alive && c.state !== 'captured') {
        this.game.particles.burst(c.pos.clone().setY(c.height * 0.6), { color: 0xffe066, count: 2, star: true, speed: 1.5, size: 0.35 });
      }
    }
  }
}
