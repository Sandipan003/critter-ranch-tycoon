import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { L, DECK_Y } from '../world/layout.js';
import { WORLD } from '../world/worlds.js';
import { VCOL_MAT, SPECIES, buildHumanoid, buildCritter, clinicGeometry, crossSignGeometry, bedGeometry, disposeBaked } from '../world/models.js';
import { bubbleTexture, textSpriteTexture } from '../world/textures.js';
import { DropZone, CoinPad } from './pads.js';
import { Customer } from './belt.js';
import { BAL } from '../config.js';

const PATIENT_SCALE = 0.62;
const PET_SCALE = 0.42; // a pet in its owner's arms
let BED_GEO = null;

// The clinic on the Doctor Deck. Hurt critters (🩹, white capsules) dropped on the 🩺 pad wait in line,
// and pet owners walk up from the road to the south fence with a sick pet of their own. The doctor
// treats everyone on three beds; every healed critter pays healMul x its price on the clinic's coin
// pad, and pets go back to their owners. Doctor Skill heals faster, Clinic Fees pay more and
// ▶ Heal all treats everyone at once.
export class Clinic {
  constructor(game, animate) {
    this.game = game;
    const C = L.clinic, scene = game.scene;
    const [hx, hz] = C.house;
    const house = new THREE.Mesh(clinicGeometry(), VCOL_MAT);
    house.position.set(hx, DECK_Y, hz);
    house.castShadow = true;
    house.receiveShadow = true;
    const sign = new THREE.Mesh(crossSignGeometry(), VCOL_MAT);
    sign.position.set(hx, DECK_Y + 2.45, hz + 0.9);
    sign.castShadow = true;
    const lbl = new THREE.Sprite(new THREE.SpriteMaterial({ map: textSpriteTexture('🏥 Clinic', '#ffffff', 60), transparent: true, depthWrite: false }));
    lbl.scale.set(3.6, 0.9, 1);
    lbl.position.set(hx - 0.6, DECK_Y + 4.5, hz);
    scene.add(house, sign, lbl);
    // all beds in one mesh (one draw call); it appears with the deck instead of popping in
    BED_GEO = BED_GEO || mergeGeometries(C.beds.map(([x, z]) => bedGeometry().translate(x, 0, z)));
    const beds = new THREE.Mesh(BED_GEO, VCOL_MAT);
    beds.position.y = DECK_Y;
    beds.castShadow = true;
    scene.add(beds);
    this.beds = C.beds.map(([x, z]) => ({ x, z, patient: null, t: 0, built: null, bubble: null }));
    this.door = new THREE.Vector3(hx - 1.0, DECK_Y + 0.9, hz);
    this.pad = new DropZone(scene, C.pad, '🩺');
    this.coinPad = new CoinPad(game, C.coin);
    this.queue = []; // waiting patients { species, value, owner?, built?, bubble? }
    this.incoming = 0; // capsules / pets flying to the door
    this.leaving = []; // healed hurt critters, cheering before they vanish
    this.owners = []; // pet owners on their way, waiting at the fence or going home
    this.ownerTimer = 8;
    this.takeTimer = 0;

    this.doctor = buildHumanoid({ skin: 0xe0a982, hair: 0x2b1d16, shirt: 0xffffff, pants: 0x7cc4ff, shoes: 0xffffff, scale: 1.05, model: 'char-female-d' });
    this.doctor.root.position.set(6.5, DECK_Y, 13.5);
    scene.add(this.doctor.root);
    this.home = new THREE.Vector3(6.5, DECK_Y, 13.5);
    this.docBed = 0;
    this.docTimer = 0;
    const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: bubbleTexture('🩺', '#7cc4ff'), transparent: true, depthWrite: false }));
    tag.scale.set(0.7, 0.82, 1);
    tag.position.y = this.doctor.holdY + 0.35;
    this.doctor.root.add(tag);

    if (animate) {
      for (const o of [house, sign, this.doctor.root]) game.pops.pop(o, 0.6, o.scale.x);
      game.particles.burst(new THREE.Vector3(hx, 2, hz), { color: 0xff7aa8, count: 30, star: true, speed: 7, size: 0.6 });
    }
  }

  healTime() { return BAL.healSec * Math.pow(0.88, this.game.state.upgrades.clinic || 0); }
  feeMul() { return BAL.healMul * (1 + (this.game.state.upgrades.clinicFee || 0) * 0.25); }
  get treating() { return this.beds.filter((b) => b.patient).length; }
  get patients() { return this.queue.length + this.treating + this.incoming; }
  get full() { return this.queue.length + this.incoming >= BAL.clinicWaiting; }
  get maxOwners() { return this.game.low ? 1 : L.clinic.owners.length; } // animated characters

  // coins still owed for everyone in the clinic, at the normal price (pays out when leaving the world)
  pendingValue() {
    const g = this.game;
    return [...this.queue, ...this.beds.filter((b) => b.patient).map((b) => b.patient)].reduce((a, pt) => a + g.saleValue(pt.value), 0);
  }

  update(dt) {
    const g = this.game, p = g.player;
    // far from the camera, everyone here animates less often (all the beds share one distance)
    const lod = g.animLod(this.door);
    this.doctor.lod = lod;
    for (const b of this.beds) if (b.built) b.built.lod = lod;
    for (const l of this.leaving) l.c.lod = lod;
    for (const o of this.owners) o.c.h.lod = o.pet.lod = g.animLod(o.c.mesh.position);
    // the player hands over hurt critters on the 🩺 pad, one after another (from anywhere in the stack)
    if (this.pad.contains(p.pos) && !this.full) {
      this.takeTimer -= dt;
      let i = p.stack.items.length - 1;
      while (i >= 0 && !p.stack.items[i].hurt) i--;
      if (this.takeTimer <= 0 && i >= 0) {
        this.takeTimer = 0.12;
        const [it] = p.stack.items.splice(i, 1);
        this.incoming++;
        g.flyers.fly(it.mesh, it.mesh.getWorldPosition(new THREE.Vector3()), this.door, {
          dur: 0.42, height: 1.8, scaleTo: 0.3,
          onDone: (m) => {
            g.scene.remove(m);
            this.incoming--;
            this.queue.push({ species: it.species, value: it.value });
          },
        });
        g.audio.drop();
      }
    }
    this.updateOwners(dt);
    for (const b of this.beds) if (!b.patient && this.queue.length) this.admit(b, this.queue.shift());
    const ht = this.healTime();
    for (const b of this.beds) {
      if (!b.patient) continue;
      b.t += dt;
      b.built.animate?.(dt, 'idle');
      if (b.t >= ht) this.discharge(b);
    }
    for (let i = this.leaving.length - 1; i >= 0; i--) {
      const l = this.leaving[i];
      l.t += dt;
      l.c.animate?.(dt, 'idle');
      if (l.t > 1.1) l.c.root.scale.setScalar(PATIENT_SCALE * Math.max(0.001, 1 - (l.t - 1.1) / 0.3));
      if (l.t > 1.4) {
        g.particles.puff(l.c.root.position.clone().setY(DECK_Y + 0.8), 0xffffff, 8);
        g.scene.remove(l.c.root);
        l.bubble.material.dispose();
        disposeBaked(l.c.root);
        this.leaving.splice(i, 1);
      }
    }
    this.updateDoctor(dt);
  }

  // ── pet owners ────────────────────────────────────────────
  // a customer with a sick pet of this world (Lv.1–3) in their arms walks up to a free spot by the fence
  spawnOwner() {
    const g = this.game;
    const taken = this.owners.map((o) => o.spot);
    const spot = L.clinic.owners.findIndex((_, i) => !taken.includes(i));
    if (spot < 0) return;
    const level = 1 + Math.floor(Math.random() * 3);
    const table = WORLD.spawn[level];
    const species = table[Math.floor(Math.random() * table.length)];
    const value = Math.round(BAL.levelValue[level] * SPECIES[species].mult * WORLD.valueMul);
    const c = new Customer(g.scene, { x: 3 }, '🏥');
    const pet = buildCritter(species, PET_SCALE / c.mesh.scale.x);
    pet.root.position.y = c.h.holdY - 0.2;
    const bubble = new THREE.Sprite(new THREE.SpriteMaterial({ map: bubbleTexture('🤕', '#ff8fa8'), transparent: true, depthWrite: false }));
    bubble.scale.set(0.8 / PATIENT_SCALE, 0.94 / PATIENT_SCALE, 1);
    bubble.position.y = pet.height + 0.6 / PATIENT_SCALE;
    pet.root.add(bubble);
    c.mesh.add(pet.root);
    c.holding = pet.root;
    const [x, z] = L.clinic.owners[spot];
    c.target.set(x, 0, z);
    this.owners.push({ c, pet, bubble, spot, species, value, state: 'walk' });
  }

  updateOwners(dt) {
    const g = this.game;
    this.ownerTimer -= dt;
    if (this.ownerTimer <= 0) {
      this.ownerTimer = 14 + Math.random() * 10;
      if (this.owners.length < this.maxOwners && !this.full) this.spawnOwner();
    }
    for (let i = this.owners.length - 1; i >= 0; i--) {
      const o = this.owners[i];
      if (o.state !== 'wait') o.pet.animate?.(dt, 'idle'); // in the clinic, the bed animates it
      if (o.state === 'walk') {
        if (!o.c.walkTo(dt, 3.4)) continue;
        // at the fence: the pet hops over to the clinic door and joins the waiting line
        o.c.mesh.rotation.y = Math.PI;
        o.c.bubble.material.map = bubbleTexture('🙏');
        o.c.bubble.visible = true;
        o.c.holding = null;
        o.state = 'wait';
        this.incoming++;
        g.flyers.fly(o.pet.root, o.pet.root.getWorldPosition(new THREE.Vector3()), this.door, {
          dur: 0.6, height: 2.2,
          onDone: (m) => {
            m.visible = false;
            this.incoming--;
            this.queue.push({ species: o.species, value: o.value, owner: o, built: o.pet, bubble: o.bubble });
          },
        });
      } else if (o.state === 'wait' || o.state === 'home') {
        o.c.h.animate(dt, 0);
      } else if (o.state === 'leave' && o.c.walkTo(dt, 3.4)) {
        o.c.dispose(g.scene);
        o.bubble.material.dispose();
        this.owners.splice(i, 1);
      }
    }
  }

  // a healed pet flies back over the fence into its owner's arms, and they head home happily
  returnPet(pt, from) {
    const g = this.game, o = pt.owner;
    const root = pt.built.root;
    root.visible = true;
    pt.bubble.material.map = bubbleTexture('💖', '#ff8fa8');
    o.state = 'home';
    g.flyers.fly(root, from, (v) => o.c.mesh.localToWorld(v.set(0, o.c.h.holdY - 0.2, 0)), {
      dur: 0.6, height: 2.2,
      onDone: (m) => {
        o.c.mesh.add(m);
        m.position.set(0, o.c.h.holdY - 0.2, 0);
        m.rotation.set(0, 0, 0);
        m.scale.setScalar(PET_SCALE / o.c.mesh.scale.x);
        o.c.holding = m;
        o.c.bubble.visible = false; // the pet's 💖 says it all
        o.c.h.emote('happy');
        o.state = 'leave';
        o.c.target.set(o.c.mesh.position.x + 3 + Math.random() * 6, 0, o.c.mesh.position.z + 20);
      },
    });
  }

  // ── treatment ─────────────────────────────────────────────
  admit(b, pt) {
    const g = this.game;
    let c = pt.built, bubble = pt.bubble;
    if (c) {
      // an owner's pet: already built, waiting (hidden) at the door
      g.scene.attach(c.root);
      c.root.visible = true;
      c.root.rotation.set(0, 0, 0);
      bubble.material.map = bubbleTexture('🤕', '#ff8fa8');
    } else {
      c = buildCritter(pt.species, PATIENT_SCALE);
      bubble = new THREE.Sprite(new THREE.SpriteMaterial({ map: bubbleTexture('🤕', '#ff8fa8'), transparent: true, depthWrite: false }));
      bubble.scale.set(0.8 / PATIENT_SCALE, 0.94 / PATIENT_SCALE, 1);
      bubble.position.y = c.height + 0.6 / PATIENT_SCALE;
      c.root.add(bubble);
      g.scene.add(c.root);
    }
    c.root.position.set(b.x - 0.15, DECK_Y + 0.43, b.z);
    g.pops.pop(c.root, 0.35, PATIENT_SCALE);
    Object.assign(b, { patient: pt, t: 0, built: c, bubble });
  }

  // a treated patient pays out and leaves the bed: a pet goes home with its owner, a hurt critter cheers
  discharge(b) {
    const g = this.game;
    const at = new THREE.Vector3(b.x, DECK_Y + 1.2, b.z);
    this.pay(b.patient, at);
    b.built.emote?.('happy', 1.2);
    if (b.patient.owner) this.returnPet(b.patient, at);
    else {
      b.bubble.material.map = bubbleTexture('💖', '#ff8fa8');
      this.leaving.push({ c: b.built, bubble: b.bubble, t: 0 });
    }
    Object.assign(b, { patient: null, t: 0, built: null, bubble: null });
    g.audio.pop();
  }

  pay(pt, at) {
    const g = this.game;
    this.coinPad.add(Math.round(g.saleValue(pt.value) * this.feeMul()), at);
    g.particles.burst(at, { color: 0xff7aa8, count: 14, star: true, speed: 4, size: 0.45 });
    g.floatText.spawn(at.clone().setY(DECK_Y + 2.6), `💖 x${+this.feeMul().toFixed(2)}`, '#ff8fb8', 1.2);
    g.state.stats.healed = (g.state.stats.healed || 0) + 1;
    g.progress.track('heal');
  }

  // ▶ Heal all: everyone in a bed or in the waiting line is healed at once. Returns how many.
  healAll() {
    let n = 0;
    for (const b of this.beds) if (b.patient) { this.discharge(b); n++; }
    while (this.queue.length) {
      const pt = this.queue.shift();
      const at = this.door.clone().add(new THREE.Vector3(-0.4 * (n % 3), 0.4, 0));
      this.pay(pt, at);
      if (pt.owner) this.returnPet(pt, at);
      n++;
    }
    return n;
  }

  // The doctor goes from bed to bed while anyone is being treated, else waits by the door
  updateDoctor(dt) {
    const d = this.doctor, pos = d.root.position;
    let target = this.home, face = 0, bed = null;
    if (this.treating) {
      this.docTimer -= dt;
      if (this.docTimer <= 0 || !this.beds[this.docBed].patient) {
        for (let k = 1; k <= this.beds.length; k++) {
          const j = (this.docBed + k) % this.beds.length;
          if (this.beds[j].patient) { this.docBed = j; break; }
        }
        this.docTimer = 1.8;
        this.treated = false;
      }
      bed = this.beds[this.docBed];
      target = new THREE.Vector3(bed.x - 1.05, DECK_Y, bed.z);
      face = Math.PI / 2;
    }
    const dx = target.x - pos.x, dz = target.z - pos.z, dist = Math.hypot(dx, dz);
    let speed = 0;
    if (dist > 0.08) {
      speed = 3.2;
      const s = Math.min(dist, speed * dt);
      pos.x += (dx / dist) * s;
      pos.z += (dz / dist) * s;
      d.root.rotation.y = Math.atan2(dx, dz);
    } else {
      d.root.rotation.y = face;
      if (bed && !this.treated && this.docTimer < 1.3) {
        this.treated = true;
        d.throwAnim();
        this.game.particles.burst(new THREE.Vector3(bed.x, DECK_Y + 1.1, bed.z), { color: 0x9fe8ff, count: 8, star: true, speed: 2.5, size: 0.35 });
      }
    }
    d.animate(dt, speed);
  }
}
