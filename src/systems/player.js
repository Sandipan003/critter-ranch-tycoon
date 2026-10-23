import * as THREE from 'three';
import { buildHumanoid } from '../world/models.js';
import { L, DECK_Y } from '../world/layout.js';
import { ringTexture } from '../world/textures.js';
import { BackStack } from './stack.js';
import { Catcher, catchStatsFor } from './catcher.js';
import { BAL } from '../config.js';

const WALK = [
  { x0: L.deck.x0 + 0.55, x1: L.deck.x1 - 0.55, z0: L.deck.z0 + 0.4, z1: L.deck.z1 - 0.5 },
  { x0: L.balcony.x0 + 0.5, x1: L.balcony.x1 - 0.5, z0: L.balcony.z0 + 0.55, z1: L.deck.z0 + 1 },
];
const OBSTACLES = [
  ...L.props.barrels.map(([x, z]) => ({ x, z, r: 0.55 })),
];

function clampWalk(p, rects) {
  for (const r of rects) if (p.x >= r.x0 && p.x <= r.x1 && p.z >= r.z0 && p.z <= r.z1) return;
  let best = null, bd = Infinity;
  for (const r of rects) {
    const x = THREE.MathUtils.clamp(p.x, r.x0, r.x1), z = THREE.MathUtils.clamp(p.z, r.z0, r.z1);
    const d = (x - p.x) ** 2 + (z - p.z) ** 2;
    if (d < bd) { bd = d; best = [x, z]; }
  }
  p.x = best[0];
  p.z = best[1];
}

export class Player {
  constructor(game) {
    this.game = game;
    this.h = buildHumanoid({
      skin: 0xf7cfae, hair: 0xe0435a, shirt: 0xffffff, vest: null, pants: 0x3f63c8, shoes: 0x6b3b22,
      backpack: 0x9a6a44, ponytail: true, scale: 1.12, model: 'char-player',
    });
    this.mesh = this.h.root;
    this.mesh.position.set(0, DECK_Y, -2);
    this.mesh.rotation.y = Math.PI;
    game.scene.add(this.mesh);

    const ring = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.7), new THREE.MeshBasicMaterial({ map: ringTexture(), transparent: true, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.renderOrder = 3;
    game.scene.add(ring);
    this.ring = ring;

    this.stack = new BackStack(this.h.back, BAL.baseCapacity);
    this.catcher = new Catcher(game, this, { showRing: true });
    this.walk = WALK.map((r) => ({ ...r })); // grows when pastures are bought
    this.vel = new THREE.Vector3();
    this.speed = 0;
    this.fullWarned = 0;
  }

  get pos() { return this.mesh.position; }
  addWalk(rect) { this.walk.push(rect); }
  handWorld(v) { return this.h.handWorld(v); }
  catchStats() { return catchStatsFor(this.game.state.upgrades, this.game.boosts.golden > 0); }
  onThrow() { this.h.throwAnim(); }
  onFull() {
    const now = performance.now();
    if (now - this.fullWarned > 2500) {
      this.fullWarned = now;
      this.game.floatText.spawn(this.mesh.position.clone().setY(3.4), 'FULL!', '#ff6b6b', 1.2);
      if (!this.game.tutorial.active) this.game.tip('full', '🎒 Backpack full! Bring your critters to the 📦 belt. The Backpack upgrade lets you carry more.');
    }
  }

  update(dt, input) {
    const g = this.game;
    const up = g.state.upgrades;
    this.stack.capacity = BAL.baseCapacity + up.capacity * BAL.capacityPerLevel;
    const maxSpeed = BAL.baseMoveSpeed + up.speed * BAL.moveSpeedPerLevel;
    const target = new THREE.Vector3(input.x, 0, input.y).multiplyScalar(maxSpeed);
    this.vel.lerp(target, Math.min(1, dt * 12));
    this.speed = this.vel.length();
    if (this.speed > 0.05) {
      this.mesh.position.addScaledVector(this.vel, dt);
      const want = Math.atan2(this.vel.x, this.vel.z);
      let diff = want - this.mesh.rotation.y;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.mesh.rotation.y += diff * Math.min(1, dt * 14);
    }
    // collisions
    for (const o of OBSTACLES) {
      const dx = this.pos.x - o.x, dz = this.pos.z - o.z;
      const d = Math.hypot(dx, dz);
      if (d < o.r && d > 0.0001) {
        this.pos.x = o.x + (dx / d) * o.r;
        this.pos.z = o.z + (dz / d) * o.r;
      }
    }
    clampWalk(this.pos, this.walk);
    this.pos.y = DECK_Y;

    const onPad = g.capturePad.contains(this.pos);
    g.capturePad.setActive(onPad);
    this.capturing = onPad && this.speed < 0.5;
    if (this.capturing) {
      // face the field while throwing
      let diff = Math.PI - this.mesh.rotation.y;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.mesh.rotation.y += diff * Math.min(1, dt * 8);
    }
    this.catcher.update(dt, this.capturing);
    this.h.animate(dt, this.speed, this.stack.count > 0);
    this.stack.update(dt, this.speed);
    this.ring.position.set(this.pos.x, DECK_Y + 0.03, this.pos.z);
    this.ring.rotation.z += dt * 0.6;
  }
}
