import * as THREE from 'three';
import { surfaceMaterial } from '../quality.js';
import { buildCritter, VCOL_MAT, mat } from '../world/models.js';
import { stakeLine } from '../world/environment.js';
import { stakeGeometry } from '../world/models.js';
import { dirtTexture, bubbleTexture } from '../world/textures.js';
import { DropZone, CoinPad } from './pads.js';

// A fenced habitat with a giant critter that makes coins (and eats capsules for a bonus)
export class Pen {
  constructor(game, id, def) {
    this.game = game;
    this.id = id;
    this.def = def;
    const scene = game.scene;
    const group = new THREE.Group();
    const cx = (def.x0 + def.x1) / 2, cz = (def.z0 + def.z1) / 2;
    group.position.set(cx, 0, cz);
    scene.add(group);
    this.group = group;

    const w = def.x1 - def.x0, d = def.z1 - def.z0;
    const dt = dirtTexture();
    dt.repeat.set(w / 4, d / 4);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), surfaceMaterial({ map: dt, roughness: 1 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.02;
    floor.receiveShadow = true;
    group.add(floor);

    const hx = w / 2, hz = d / 2;
    const pts = [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz], [-hx, -hz]];
    const stakes = stakeLine(pts, 0.38, id.length * 7);
    const geo = stakeGeometry();
    const im = new THREE.InstancedMesh(geo, VCOL_MAT, stakes.length);
    const m = new THREE.Matrix4();
    stakes.forEach((t, i) => {
      m.compose(new THREE.Vector3(t[0], -0.1, t[2]), new THREE.Quaternion().setFromEuler(new THREE.Euler(t[5], t[3], t[6])), new THREE.Vector3(1, t[7] * 0.9, 1));
      im.setMatrixAt(i, m);
    });
    im.castShadow = true;
    group.add(im);
    // trough
    const trough = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.5, 0.8), mat(0x7a5232));
    trough.position.set(def.x0 < 0 ? hx - 1.6 : -hx + 1.6, 0.25, -hz + 1.2);
    trough.castShadow = true;
    group.add(trough);

    const giant = buildCritter(def.species, def.scale);
    // side pens turn the giant towards the deck; pasture pens (def.facing) face the camera
    giant.root.position.set(def.facing !== undefined ? 0 : def.x0 < 0 ? 0.9 : -0.9, 0, 0.6);
    giant.root.rotation.y = def.facing ?? (def.x0 < 0 ? Math.PI * 0.35 : -Math.PI * 0.35);
    group.add(giant.root);
    this.giant = giant;
    this.giantH = giant.height * def.scale;

    const bubble = new THREE.Sprite(new THREE.SpriteMaterial({ map: bubbleTexture('💰', '#4dff4d'), transparent: true, depthWrite: false }));
    bubble.scale.set(1.3, 1.5, 1);
    bubble.position.set(giant.root.position.x, this.giantH + 0.9, 0.6);
    group.add(bubble);
    this.bubble = bubble;

    this.feed = new DropZone(scene, def.feed, '🍖');
    this.coinPad = new CoinPad(game, def.coin);
    this.timer = 2;
    this.bounce = 0;
    this.feedTimer = 0;
    this.phase = Math.random() * 5;
    game.pops.pop(group, 0.7, 1);
  }

  get mouth() {
    return new THREE.Vector3().copy(this.group.position).add(this.giant.root.position).add(new THREE.Vector3(0, this.giantH * 0.65, 0.5));
  }

  produce(value) {
    this.coinPad.add(value, this.mouth);
    this.bounce = 1;
    if (this.giant.emote) this.giant.emote('happy', 1.4);
    this.game.particles.burst(this.mouth, { color: 0xffe066, count: 6, star: true, speed: 3, size: 0.4 });
  }

  update(dt, actors) {
    const g = this.game;
    this.phase += dt;
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = 5;
      this.produce(Math.round(this.def.rate * g.incomeMul() * g.penMul()));
    }
    // feeding: capsules give a 25% bonus over selling
    for (const a of actors) {
      if (!this.feed.contains(a.pos) || a.stack.count === 0) continue;
      this.feedTimer -= dt;
      if (this.feedTimer > 0) continue;
      this.feedTimer = 0.12;
      const it = a.stack.pop();
      g.progress.track('feed');
      const from = new THREE.Vector3();
      it.mesh.getWorldPosition(from);
      if (this.giant.emote) this.giant.emote('eat', 1.5);
      g.flyers.fly(it.mesh, from, this.mouth, {
        dur: 0.4, height: 2, scaleTo: 0.3,
        onDone: (mesh) => {
          g.scene.remove(mesh);
          this.produce(Math.round(g.saleValue(it.value) * 1.25));
          g.audio.pop();
        },
      });
    }
    // idle + happy bounce
    this.bounce = Math.max(0, this.bounce - dt * 2.5);
    const b = Math.sin(this.bounce * Math.PI) * 0.12;
    // rigged giants breathe through their idle clip; the squash on producing stays
    const breathe = this.giant.animate ? 0 : Math.sin(this.phase * 1.6) * 0.025;
    this.giant.body.scale.set(1 - breathe * 0.5 - b * 0.4, 1 + breathe + b, 1 - breathe * 0.5 - b * 0.4);
    if (this.giant.animate) {
      this.giant.lod = g.animLod(this.group.position);
      this.giant.animate(dt, 'idle');
    }
    this.bubble.position.y = this.giantH + 0.9 + Math.sin(this.phase * 3) * 0.1;
    this.bubble.visible = this.coinPad.value > 0;
  }
}
