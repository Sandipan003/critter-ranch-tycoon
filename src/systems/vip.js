import * as THREE from 'three';
import { L } from '../world/layout.js';
import { WORLD } from '../world/worlds.js';
import { SPECIES, VCOL_MAT, truckGeometry, TRUCK_BED } from '../world/models.js';
import { textSpriteTexture, formatNum } from '../world/textures.js';
import { BAL } from '../config.js';

// VIP truck: every few minutes (once the first helper is hired) a truck parks beside the belt with an
// order for two kinds of this world's critters. Until the order is filled or time runs out it takes
// those critters off the belt before the shoppers do (helpers' catches count too). A filled order pays
// vipMul x their price (▶ x2 with a video); if time runs out it pays the normal price for what it got.

const START_Z = 38; // where the truck appears on the road, and drives back to
const pick = (a) => a[Math.floor(Math.random() * a.length)];

export class VipTruck {
  constructor(game) {
    this.game = game;
    this.state = 'off'; // off | arriving | open | leaving
    this.timer = BAL.vipFirstSec;
    this.order = null; // [{ sp, n, have, held }]
    this.got = []; // coins owed for each critter delivered (normal price)
    this.left = 0;
    this.root = null;
  }

  get ready() { return this.game.state.tutorialDone && this.game.isUnlocked('helper1'); }
  get done() { return this.order.every((l) => l.have >= l.n); }

  build() {
    const root = new THREE.Group();
    const body = new THREE.Mesh(truckGeometry(), VCOL_MAT);
    body.castShadow = true;
    root.add(body);
    const lbl = new THREE.Sprite(new THREE.SpriteMaterial({ map: textSpriteTexture('⭐ VIP ⭐', '#ffd84a', 64), transparent: true, depthWrite: false }));
    lbl.scale.set(3.6, 0.9, 1);
    lbl.position.set(0, 3.0, 0);
    root.add(lbl);
    this.game.scene.add(root);
    this.root = root;
    this.cargo = [];
  }

  honk() {
    const a = this.game.audio;
    a.tone(392, 0.16, { type: 'square', vol: 0.08 });
    a.tone(392, 0.2, { type: 'square', vol: 0.08, delay: 0.24 });
  }

  // two kinds: a common one (Lv.1–2) and a rarer one from the top of the field
  makeOrder() {
    const g = this.game;
    const low = [...new Set([...WORLD.spawn[1], ...WORLD.spawn[2]])];
    const top = WORLD.spawn[g.isUnlocked('grove') ? 5 : 3].filter((sp) => !low.includes(sp));
    const a = pick(low);
    const rest = top.length ? top : low.filter((sp) => sp !== a);
    const order = [{ sp: a, n: 5 + Math.floor(Math.random() * 4), have: 0, held: 0 }];
    if (rest.length) order.push({ sp: pick(rest), n: 2 + Math.floor(Math.random() * 3), have: 0, held: 0 });
    return order;
  }

  arrive() {
    if (!this.root) this.build();
    const [x] = L.vip.park;
    this.root.position.set(x, 0, START_Z);
    this.root.visible = true;
    this.order = this.makeOrder();
    this.got = [];
    this.state = 'arriving';
    this.honk();
  }

  open() {
    const g = this.game;
    this.state = 'open';
    this.left = BAL.vipSec;
    g.belt.vip = { s: g.belt.sAtX(L.vip.beltX), wants: (it) => this.wants(it), take: (it) => this.take(it) };
    const list = this.order.map((l) => `${SPECIES[l.sp].emoji} ${l.n} ${SPECIES[l.sp].name}s`).join(' + ');
    g.ui.celebrate('🚚 VIP order!');
    g.ui.toast(`Sell ${list} within 3 min!`);
    g.tip('vip', `🚚 A VIP truck! It buys ${list} straight off the belt and pays x${BAL.vipMul} if you fill the order in time.`);
    g.audio.unlockFx();
  }

  // the belt asks for each capsule passing the truck: true reserves it
  wants(it) {
    if (this.state !== 'open') return false;
    const line = this.order.find((l) => l.sp === it.species && l.have + l.held < l.n);
    if (!line) return false;
    line.held++;
    return true;
  }

  take(it) {
    const g = this.game;
    const line = this.order.find((l) => l.sp === it.species);
    this.got.push(g.saleValue(it.value));
    const k = this.cargo.length;
    const [sx, sz] = TRUCK_BED.slots[k % TRUCK_BED.slots.length];
    const local = new THREE.Vector3(sx, TRUCK_BED.y + Math.floor(k / TRUCK_BED.slots.length) * 0.4, sz);
    this.cargo.push(it.mesh);
    g.flyers.fly(it.mesh, it.mesh.position.clone(), (v) => this.root.localToWorld(v.copy(local)), {
      dur: 0.5, height: 2,
      onDone: (m) => {
        this.root.attach(m);
        line.held--;
        line.have++;
        g.audio.coin();
        if (this.state === 'open' && this.done) this.close(true);
      },
    });
  }

  close(filled) {
    const g = this.game;
    this.state = 'leaving';
    this.leaveDelay = 1.4;
    this.speed = 0;
    g.belt.vip = null;
    const total = this.got.reduce((a, v) => a + v, 0);
    if (filled) {
      g.state.stats.vip = (g.state.stats.vip || 0) + 1;
      g.progress.track('vip');
      g.ui.vipDone(Math.round(total * BAL.vipMul), this.order);
    } else if (total > 0) {
      g.earn(total);
      g.coinBurstToHud(total);
      g.ui.toast(`🚚 Time's up! The VIP paid ${formatNum(total)} for ${this.got.length} critters`);
    } else g.ui.toast('🚚 The VIP truck left. Sell faster next time!');
    this.honk();
  }

  update(dt) {
    const r = this.root;
    switch (this.state) {
      case 'off':
        if (!this.ready) return;
        this.timer -= dt;
        if (this.timer <= 0) this.arrive();
        break;
      case 'arriving': {
        const d = r.position.z - L.vip.park[1];
        r.position.z -= Math.min(d, Math.max(1.5, d * 1.6) * dt);
        if (d < 0.02) this.open();
        break;
      }
      case 'open':
        this.left -= dt;
        if (this.left <= 0) this.close(false);
        break;
      case 'leaving':
        this.leaveDelay -= dt;
        if (this.leaveDelay > 0) break;
        this.speed = Math.min(11, this.speed + 7 * dt);
        r.position.z += this.speed * dt; // backs out the way it came
        if (r.position.z > START_Z) {
          for (const m of this.cargo) r.remove(m);
          this.cargo = [];
          r.visible = false;
          this.state = 'off';
          this.timer = BAL.vipGapSec[0] + Math.random() * (BAL.vipGapSec[1] - BAL.vipGapSec[0]);
        }
        break;
    }
  }

  // text for the HUD chip, or null
  chip() {
    if (this.state === 'arriving') return '🚚 VIP truck coming…';
    if (this.state !== 'open') return null;
    const s = Math.ceil(this.left);
    const lines = this.order.map((l) => `${SPECIES[l.sp].emoji} ${l.have}/${l.n}`).join(' · ');
    return `🚚 ${lines} · ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }
}
