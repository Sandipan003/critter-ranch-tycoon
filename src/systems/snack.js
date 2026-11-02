import * as THREE from 'three';
import { L } from '../world/layout.js';
import { WORLD } from '../world/worlds.js';
import { VCOL_MAT, buildHumanoid, snackStandGeometry, buildIceCream, buildCoinStack } from '../world/models.js';
import { textSpriteTexture, bubbleTexture } from '../world/textures.js';
import { Customer } from './belt.js';
import { BAL } from '../config.js';

const GAP = 1.2; // between customers in the line

// Ice-cream stand beside the belt's shoppers. Snack lovers walk up from the road, queue at the counter
// and leave with a cone; each snack's coins fly onto the belt and ride to the coin pad. It earns
// offline too. Snack Menu (more coins), Fast Service (a quicker vendor) and ▶ Snack Rush (x3 for a while).
export class SnackStand {
  constructor(game, animate) {
    this.game = game;
    const [x, z] = L.snack.pos;
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = Math.PI / 2; // the counter faces the road (and the camera)
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
    this.vendor.root.position.set(x, 0, z - 0.95); // behind the counter, facing the line
    game.scene.add(this.vendor.root);
    this.front = new THREE.Vector3(x, 0, z + 1.3); // where the first customer stands
    this.line = [];
    this.leaving = [];
    this.spawnTimer = 0.3;
    this.timer = 2;
    if (animate) {
      game.pops.pop(g, 0.6, 1);
      game.particles.burst(new THREE.Vector3(x, 1.5, z), { color: 0xff8fb8, count: 26, star: true, speed: 6, size: 0.55 });
    }
  }

  get maxLine() { return this.game.low ? 2 : 3; } // each one is an animated character
  serveSec() { return BAL.snackSec * Math.pow(0.9, this.game.state.upgrades.snackSpeed || 0); }

  // coins per snack before Snack Rush
  saleValue() {
    const g = this.game;
    return Math.max(1, Math.round(BAL.snackValue * WORLD.valueMul * g.incomeMul() * (1 + (g.state.upgrades.snack || 0) * 0.3)));
  }

  update(dt) {
    const g = this.game;
    this.vendor.lod = g.animLod(this.vendor.root.position);
    for (const c of [...this.line, ...this.leaving]) c.h.lod = g.animLod(c.mesh.position);
    this.vendor.animate(dt, 0);
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && this.line.length < this.maxLine) {
      this.line.push(new Customer(g.scene, { x: this.front.x - 0.8 }, '🍦'));
      this.spawnTimer = Math.min(2, this.serveSec() * 0.8);
    }
    this.line.forEach((c, i) => {
      c.target.set(this.front.x, 0, this.front.z + i * GAP);
      const there = c.walkTo(dt, 3.8);
      if (there) c.mesh.rotation.y = Math.PI; // facing the counter
      c.ready = i === 0 && there;
      c.bubble.visible = c.ready;
    });
    this.timer -= dt;
    if (this.timer <= 0 && this.line[0]?.ready) {
      this.timer = this.serveSec() * (0.85 + Math.random() * 0.3);
      this.serve(this.line.shift());
    }
    for (let i = this.leaving.length - 1; i >= 0; i--) {
      const c = this.leaving[i];
      if (c.walkTo(dt, 3.4)) {
        c.dispose(g.scene);
        this.leaving.splice(i, 1);
      }
    }
  }

  serve(c) {
    const g = this.game;
    const rush = g.boosts.snack > 0;
    const value = this.saleValue() * (rush ? 3 : 1);
    // the coins fly from the counter onto the belt, which carries them to the coin pad
    const coins = buildCoinStack(rush ? 3 : 2);
    g.scene.add(coins);
    g.flyers.fly(coins, new THREE.Vector3(this.front.x, 1.3, this.front.z - 1.2), g.belt.pointAtX(L.snack.beltX), {
      dur: 0.45, height: 1.4,
      onDone: (m) => { g.scene.remove(m); g.belt.addCoinsAt(L.snack.beltX, value, rush ? 3 : 2); },
    });
    // the customer walks off happily with a cone
    const cone = buildIceCream();
    c.mesh.add(cone);
    cone.position.set(0, c.h.holdY - 0.15, 0);
    c.holding = cone;
    c.bubble.material.map = bubbleTexture('😋');
    c.bubble.position.y = c.h.holdY + 0.85;
    c.bubble.visible = true;
    c.h.emote('happy');
    c.state = 'leave';
    c.target.set(c.mesh.position.x + 4 + Math.random() * 8, 0, c.mesh.position.z + 20);
    this.leaving.push(c);
    this.vendor.throwAnim();
    g.audio.coin();
    g.progress.track('snack');
  }
}
