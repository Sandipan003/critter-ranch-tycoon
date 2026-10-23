import * as THREE from 'three';
import { L } from '../world/layout.js';
import { WORLD } from '../world/worlds.js';
import { VCOL_MAT, buildHumanoid, snackStandGeometry } from '../world/models.js';
import { textSpriteTexture } from '../world/textures.js';
import { BAL } from '../config.js';

// Ice-cream stand beside the customers' queues: every few seconds the vendor sells a snack to someone
// waiting in line, and the coins ride the belt to the coin pad. Earns by itself (offline too);
// Snack Menu upgrades it and ▶ Snack Rush triples it for a while.
export class SnackStand {
  constructor(game, animate) {
    this.game = game;
    const [x, z] = L.snack.pos;
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const stand = new THREE.Mesh(snackStandGeometry(), VCOL_MAT);
    stand.castShadow = true;
    g.add(stand);
    const lbl = new THREE.Sprite(new THREE.SpriteMaterial({ map: textSpriteTexture('🍦 Snacks', '#ffffff', 60), transparent: true, depthWrite: false }));
    lbl.scale.set(3.6, 0.9, 1);
    lbl.position.y = 3.95;
    g.add(lbl);
    game.scene.add(g);
    this.group = g;
    this.vendor = buildHumanoid({ skin: 0xf6c9a4, hair: 0x6b4426, shirt: 0xff8fb8, pants: 0x334155, shoes: 0x3b2a20, hat: 0xffffff, model: 'char-male-a' });
    this.vendor.root.position.set(x + 0.95, 0, z);
    this.vendor.root.rotation.y = -Math.PI / 2; // facing the queue
    game.scene.add(this.vendor.root);
    this.timer = 1.5;
    if (animate) {
      game.pops.pop(g, 0.6, 1);
      game.particles.burst(new THREE.Vector3(x, 1.5, z), { color: 0xff8fb8, count: 26, star: true, speed: 6, size: 0.55 });
    }
  }

  // coins per snack before Snack Rush
  saleValue() {
    const g = this.game;
    return Math.max(1, Math.round(BAL.snackValue * WORLD.valueMul * g.incomeMul() * (1 + (g.state.upgrades.snack || 0) * 0.3)));
  }

  // average coins per second (offline earnings)
  rate() { return this.saleValue() / BAL.snackSec; }

  update(dt) {
    const g = this.game;
    this.vendor.animate(dt, 0);
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = BAL.snackSec * (0.8 + Math.random() * 0.4);
    // someone standing in a queue (not walking up, not leaving)
    const waiting = g.belt.pickups.flatMap((p) => p.queue).filter((c) => c.state === 'ready'
      || (c.state === 'walk' && Math.hypot(c.target.x - c.mesh.position.x, c.target.z - c.mesh.position.z) < 0.1));
    if (!waiting.length) return;
    const c = waiting[Math.floor(Math.random() * waiting.length)];
    const rush = g.boosts.snack > 0;
    const value = this.saleValue() * (rush ? 3 : 1);
    g.belt.addCoinsAt(L.snack.beltX, value, rush ? 3 : 2);
    g.floatText.spawn(c.mesh.position.clone().setY(c.h.holdY + 1.1), '🍦', '#ffffff', 1.2);
    this.vendor.throwAnim();
    if (c.h.emote) c.h.emote('happy');
    g.progress.track('snack');
  }
}
