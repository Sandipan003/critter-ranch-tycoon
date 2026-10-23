import * as THREE from 'three';
import { surfaceMaterial } from '../quality.js';
import { L, DECK_Y } from '../world/layout.js';
import { beltTexture, bubbleTexture } from '../world/textures.js';
import { machineMesh, buildCoinStack, buildHumanoid, mat, SPECIES, disposeBaked } from '../world/models.js';
import { BAL } from '../config.js';
import { worldSpecies } from '../world/worlds.js';

const BELT_Y = 0.55;
const SPACING = 0.75;
const SHIRTS = [0x3d7be0, 0xe05a3d, 0x47b36b, 0x8f5ad6, 0xf2b134, 0x2fb6c4, 0xd94f8a, 0x6b7280];
const HAIRS = [0x2b1d16, 0x6b4426, 0xe8c070, 0x1d1d1d, 0xa0522d, 0xd9d9d9];
const SKINS = [0xf6c9a4, 0xe0a982, 0xc68863, 0x8d5a3b, 0xf9d7bd];
// every Kenney character except the player's and the helpers'
const CUSTOMER_MODELS = ['a', 'b', 'c', 'd', 'e', 'f'].flatMap((v) => [`char-female-${v}`, `char-male-${v}`])
  .filter((k) => k !== 'char-female-b' && k !== 'char-male-e');
const pick = (a) => a[Math.floor(Math.random() * a.length)];
// customers ask for critters of the active world (read lazily: the world is picked at boot)
const worldEmojis = () => worldSpecies().map((sp) => SPECIES[sp].emoji);

function buildPath() {
  const [ax, az] = L.machineA, [bx, bz] = L.machineB;
  const zb = L.beltBottomZ, r = 1.4;
  const p = new THREE.CurvePath();
  const v = (x, z) => new THREE.Vector3(x, BELT_Y, z);
  p.add(new THREE.LineCurve3(v(ax, az + 0.3), v(ax, zb - r)));
  p.add(new THREE.QuadraticBezierCurve3(v(ax, zb - r), v(ax, zb), v(ax + r, zb)));
  p.add(new THREE.LineCurve3(v(ax + r, zb), v(bx - r, zb)));
  p.add(new THREE.QuadraticBezierCurve3(v(bx - r, zb), v(bx, zb), v(bx, zb - r)));
  p.add(new THREE.LineCurve3(v(bx, zb - r), v(bx, bz + 0.3)));
  return p;
}

function ribbon(path, width, y, samples = 160) {
  const pos = [], uv = [], idx = [];
  const len = path.getLength();
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i <= samples; i++) {
    const u = i / samples;
    const p = path.getPointAt(u);
    const t = path.getTangentAt(u);
    const n = new THREE.Vector3().crossVectors(up, t).normalize().multiplyScalar(width / 2);
    pos.push(p.x - n.x, y, p.z - n.z, p.x + n.x, y, p.z + n.z);
    const vv = (u * len) / 1.6;
    uv.push(0, vv, 1, vv);
    if (i < samples) {
      const a = i * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

class Customer {
  constructor(scene, spot) {
    this.h = buildHumanoid({
      skin: pick(SKINS), hair: pick(HAIRS), shirt: pick(SHIRTS), pants: pick([0x334155, 0x3f63c8, 0x5b4636, 0x222831]),
      shoes: 0x3b2a20, hat: Math.random() < 0.35 ? pick([0xd0312d, 0x2f5fd0, 0x2a2a2a]) : null, scale: 1.05 + Math.random() * 0.1,
      model: pick(CUSTOMER_MODELS),
    });
    this.mesh = this.h.root;
    this.mesh.position.set(spot.x + (Math.random() - 0.5) * 3, 0, 23 + Math.random() * 2);
    scene.add(this.mesh);
    this.bubble = new THREE.Sprite(new THREE.SpriteMaterial({ map: bubbleTexture(pick(worldEmojis())), transparent: true, depthWrite: false }));
    this.bubble.scale.set(0.9, 1.05, 1);
    this.bubble.position.y = this.h.holdY + 0.2;
    this.bubble.visible = false;
    this.mesh.add(this.bubble);
    this.target = new THREE.Vector3();
    this.state = 'walk';
    this.holding = null;
  }

  walkTo(dt, speed = 3.2) {
    const p = this.mesh.position;
    const dx = this.target.x - p.x, dz = this.target.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.05) { this.h.animate(dt, 0); return true; }
    const s = Math.min(d, speed * dt);
    p.x += (dx / d) * s;
    p.z += (dz / d) * s;
    this.mesh.rotation.y = Math.atan2(dx, dz);
    this.h.animate(dt, speed, !!this.holding);
    return false;
  }
}

export class SellBelt {
  constructor(game) {
    this.game = game;
    const scene = game.scene;
    this.path = buildPath();
    this.length = this.path.getLength();
    this.items = []; // ordered: index 0 = furthest along
    this.pending = []; // capsules waiting inside machine A
    this.speedMul = 1;

    // visuals
    this.tex = beltTexture();
    this.tex.repeat.set(1, 1);
    const belt = new THREE.Mesh(ribbon(this.path, 1.1, BELT_Y), surfaceMaterial({ map: this.tex, roughness: 0.6 }));
    belt.receiveShadow = true;
    scene.add(belt);
    const frame = new THREE.Mesh(ribbon(this.path, 1.45, BELT_Y - 0.06), mat(0x8fa3c2, { rough: 0.5 }));
    frame.receiveShadow = true;
    scene.add(frame);
    const side = new THREE.Mesh(ribbon(this.path, 1.45, BELT_Y - 0.3), mat(0x6a7da0, { rough: 0.6 }));
    scene.add(side);
    // little legs
    for (let s = 1; s < this.length; s += 2.2) {
      const p = this.path.getPointAt(s / this.length);
      const leg = new THREE.Mesh(new THREE.BoxGeometry(1.3, BELT_Y - 0.06, 0.25), mat(0x5c6f93));
      leg.position.set(p.x, (BELT_Y - 0.06) / 2, p.z);
      const t = this.path.getTangentAt(s / this.length);
      leg.rotation.y = Math.atan2(t.x, t.z) + Math.PI / 2;
      leg.castShadow = true;
      scene.add(leg);
    }
    const mA = machineMesh();
    mA.position.set(L.machineA[0], DECK_Y - 0.25, L.machineA[1]);
    scene.add(mA);
    const mB = machineMesh();
    mB.position.set(L.machineB[0], DECK_Y - 0.25, L.machineB[1]);
    scene.add(mB);
    this.mouthA = new THREE.Vector3(L.machineA[0], 1.1, L.machineA[1] - 0.2);
    this.mouthB = new THREE.Vector3(L.machineB[0], 1.1, L.machineB[1] - 0.2);
    this.machineB = mB;

    // pickup points on the bottom straight
    this.pickups = [];
    this.setPickupCount(1);
    this.customers = [];
    this.spawnTimer = 0;
  }

  sAtX(x) {
    // arc length position on the bottom straight for a given x
    const [ax] = L.machineA;
    const r = 1.4;
    const first = L.beltBottomZ - r - (L.machineA[1] + 0.3);
    const corner = this.path.curves[1].getLength();
    return first + corner + (x - (ax + r));
  }

  setPickupCount(n) {
    while (this.pickups.length < n) {
      const x = L.pickups[this.pickups.length];
      this.pickups.push({ x, s: this.sAtX(x), spot: new THREE.Vector3(x, 0, L.beltBottomZ + 1.3), queue: [] });
    }
  }

  get speed() { return BAL.beltSpeed * this.speedMul; }

  // start with a few shoppers already waiting
  prefill() {
    for (const p of this.pickups) {
      while (p.queue.length < 3) {
        const c = new Customer(this.game.scene, p.spot);
        c.mesh.position.set(p.spot.x, 0, p.spot.z + p.queue.length * 1.25);
        p.queue.push(c);
        this.customers.push(c);
      }
    }
  }

  addCapsule(item) {
    this.pending.push(item);
  }

  // Customers -----------------------------------------------------------
  updateCustomers(dt) {
    const scene = this.game.scene;
    this.spawnTimer -= dt;
    const total = this.pickups.reduce((a, p) => a + p.queue.length, 0);
    // fewer people in the queues on Low (each one is an animated character)
    if (this.spawnTimer <= 0 && total < this.pickups.length * (this.game.low ? 3 : 5)) {
      const p = this.pickups.reduce((a, b) => (b.queue.length < a.queue.length ? b : a));
      const c = new Customer(scene, p.spot);
      p.queue.push(c);
      this.customers.push(c);
      this.spawnTimer = 0.7;
    }
    for (const p of this.pickups) {
      p.queue.forEach((c, i) => {
        if (c.state === 'walk' || c.state === 'ready') {
          c.target.set(p.spot.x, 0, p.spot.z + i * 1.25);
          const arrived = c.walkTo(dt, 4.2);
          if (arrived) {
            c.mesh.rotation.y = Math.PI; // face the belt
            c.state = i === 0 ? 'ready' : 'walk';
          }
          c.bubble.visible = i === 0 && arrived;
        }
      });
    }
    for (let i = this.customers.length - 1; i >= 0; i--) {
      const c = this.customers[i];
      if (c.state === 'leave') {
        if (c.walkTo(dt, 3.6)) {
          scene.remove(c.mesh);
          disposeBaked(c.mesh);
          this.customers.splice(i, 1);
        }
        if (c.holding) c.holding.rotation.y += dt * 3;
      }
    }
  }

  serve(pickup, item) {
    const g = this.game;
    const c = pickup.queue.shift();
    c.state = 'leave';
    c.h.emote('happy');
    c.bubble.material.map = bubbleTexture('😍');
    c.bubble.visible = true;
    const cap = item.mesh;
    g.flyers.fly(cap, cap.position.clone(), new THREE.Vector3(c.mesh.position.x, c.h.holdY + 0.45, c.mesh.position.z), {
      dur: 0.35, height: 0.8,
      onDone: () => {
        c.mesh.attach(cap);
        cap.position.set(0, c.h.holdY, 0);
        c.holding = cap;
        c.bubble.position.y = c.h.holdY + 0.85;
      },
    });
    c.target.set(c.mesh.position.x + (Math.random() > 0.5 ? 14 : -14), 0, c.mesh.position.z + 22);
    // the customer pays: a little coin stack rides the belt to the coin pad
    const coins = buildCoinStack(Math.min(4, 1 + Math.floor(item.value / 8)));
    coins.position.copy(this.path.getPointAt(pickup.s / this.length));
    g.scene.add(coins);
    const value = g.saleValue(item.value) * (g.events.is('rush') ? 2 : 1);
    g.progress.track('sell');
    return { kind: 'coins', mesh: coins, s: pickup.s, value };
  }

  update(dt) {
    const g = this.game;
    this.tex.offset.y -= (this.speed * dt) / 1.6;
    this.updateCustomers(dt);

    // feed waiting capsules into the start of the belt
    const last = this.items[this.items.length - 1];
    if (this.pending.length && (!last || last.s > SPACING)) {
      const it = this.pending.shift();
      it.kind = 'capsule';
      it.s = 0;
      g.scene.attach(it.mesh);
      it.mesh.rotation.set(0, 0, Math.PI / 2);
      it.mesh.visible = true;
      this.items.push(it);
    }

    const lastPickup = this.pickups[this.pickups.length - 1];
    const spawned = [];
    let limit = Infinity;
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      let next = Math.min(it.s + this.speed * dt, limit - SPACING);
      if (it.kind === 'capsule') {
        for (const p of this.pickups) {
          if (it.s <= p.s + 0.01 && next >= p.s) {
            const front = p.queue[0];
            if (front && front.state === 'ready') {
              it.served = p;
              next = p.s;
              break;
            } else if (p === lastPickup) {
              next = Math.min(next, p.s);
            }
          }
        }
      }
      it.s = Math.max(it.s, next);
      const u = Math.min(1, it.s / this.length);
      const pt = this.path.getPointAt(u);
      it.mesh.position.set(pt.x, pt.y + (it.kind === 'capsule' ? 0.22 : 0.05), pt.z);
      if (it.kind === 'capsule') {
        const tg = this.path.getTangentAt(u);
        it.mesh.rotation.y = Math.atan2(tg.x, tg.z) + Math.PI / 2;
      }
      limit = it.s;
    }
    // resolve served capsules + arrivals at machine B
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      if (it.served) {
        const p = it.served;
        this.items.splice(i, 1);
        spawned.push(this.serve(p, it));
      } else if (it.s >= this.length - 0.01) {
        this.items.splice(i, 1);
        if (it.kind === 'coins') {
          g.scene.remove(it.mesh);
          g.coinPad.add(it.value, this.mouthB);
        } else {
          // unsold capsule loops back into the machine queue
          this.pending.push(it);
          it.mesh.visible = false;
        }
      }
    }
    for (const s of spawned) {
      // insert keeping order by s descending
      let idx = this.items.findIndex((x) => x.s < s.s);
      if (idx < 0) idx = this.items.length;
      this.items.splice(idx, 0, s);
    }
    // keep machine B gently pulsing when coins arrive
    this.machineB.scale.y = THREE.MathUtils.lerp(this.machineB.scale.y, 1, dt * 8);
  }
}
