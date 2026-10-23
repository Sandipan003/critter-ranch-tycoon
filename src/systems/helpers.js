import * as THREE from 'three';
import { buildHumanoid } from '../world/models.js';
import { DECK_Y } from '../world/layout.js';
import { BackStack } from './stack.js';
import { Catcher, catchStatsFor } from './catcher.js';
import { CapturePad } from './pads.js';

// Worker that catches critters from its own pad and carries them to the belt
export class Helper {
  // `via`: doorway between the helper's balcony and the deck (balcony extensions only)
  constructor(game, padPos, via = null) {
    this.via = via;
    this.game = game;
    this.h = buildHumanoid({
      skin: 0xe8b28c, hair: 0x2b1d16, shirt: 0x2f6fe0, pants: 0x223a7a, shoes: 0x2b2b2b, hat: 0x1f4fb8, scale: 1.0, model: 'char-male-e',
    });
    this.mesh = this.h.root;
    this.mesh.position.set(padPos[0], DECK_Y, padPos[1] + 2);
    game.scene.add(this.mesh);
    game.pops.pop(this.mesh, 0.6, 1);
    this.pad = new CapturePad(game.scene, padPos);
    this.padPos = new THREE.Vector3(padPos[0], DECK_Y, padPos[1]);
    this.stack = new BackStack(this.h.back, 4);
    this.catcher = new Catcher(game, this);
    this.state = 'toPad';
    this.speed = 0;
    this.dropTimer = 0;
    this.catchTime = 0;
  }

  get pos() { return this.mesh.position; }
  handWorld(v) { return this.h.handWorld(v); }
  catchStats() {
    const st = catchStatsFor(this.game.state.upgrades, false, true);
    st.interval *= Math.pow(0.95, this.game.state.upgrades.helpers || 0); // Helper Training
    return st;
  }
  onThrow() { this.h.throwAnim(); }

  // walks to target, going through `via` first when it lies between the helper and the target
  route(target, dt) {
    const v = this.via, p = this.mesh.position;
    if (v && (p.z < v.z - 0.2) !== (target.z < v.z - 0.2) && Math.hypot(p.x - v.x, p.z - v.z) > 0.25) {
      this.moveTo(v, dt);
      return false;
    }
    return this.moveTo(target, dt);
  }

  moveTo(target, dt) {
    const p = this.mesh.position;
    const dx = target.x - p.x, dz = target.z - p.z;
    const d = Math.hypot(dx, dz);
    const sp = 4.2 * (1 + (this.game.state.upgrades.helpers || 0) * 0.06);
    if (d < 0.15) { this.speed = 0; return true; }
    const s = Math.min(d, sp * dt);
    p.x += (dx / d) * s;
    p.z += (dz / d) * s;
    this.mesh.rotation.y = Math.atan2(dx, dz);
    this.speed = sp;
    return false;
  }

  update(dt) {
    const g = this.game;
    this.stack.capacity = 4 + Math.floor(g.state.upgrades.capacity / 2) + Math.floor((g.state.upgrades.helpers || 0) / 2);
    const drop = new THREE.Vector3(g.dropZone.pos[0], DECK_Y, g.dropZone.pos[1]);
    switch (this.state) {
      case 'toPad':
        if (this.route(this.padPos, dt)) { this.state = 'catch'; this.catchTime = 0; }
        break;
      case 'catch': {
        this.speed = 0;
        this.mesh.rotation.y = Math.PI; // face the field
        this.catchTime += dt;
        this.catcher.update(dt, true);
        const done = this.stack.count >= this.stack.capacity || (this.catchTime > 25 && this.stack.count > 0);
        if (done && this.stack.incoming === 0) this.state = 'toDrop';
        break;
      }
      case 'toDrop':
        if (this.route(drop, dt)) this.state = 'drop';
        break;
      case 'drop':
        this.speed = 0;
        this.dropTimer -= dt;
        if (this.dropTimer <= 0) {
          this.dropTimer = 0.14;
          if (!g.dropToBelt(this)) this.state = 'toPad';
        }
        break;
    }
    this.pad.setActive(this.state === 'catch');
    this.h.animate(dt, this.speed, this.stack.count > 0);
    this.stack.update(dt, this.speed);
  }
}
