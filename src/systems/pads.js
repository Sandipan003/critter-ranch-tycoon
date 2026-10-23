import * as THREE from 'three';
import { DECK_Y, nearSquare } from '../world/layout.js';
import { padTexture, footprintTexture, unlockTileCanvas, drawUnlockTile, textSpriteTexture } from '../world/textures.js';
import { buildCoin, COIN_GEO, COIN_MAT } from '../world/models.js';

function flatPlane(tex, size, y = DECK_Y + 0.02) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = y;
  m.renderOrder = 2;
  return m;
}

// Green square that accepts capsules (belt input / pen feeding)
export class DropZone {
  constructor(scene, pos, icon = '📦') {
    this.pos = pos;
    this.mesh = flatPlane(padTexture(icon), 2.6);
    this.mesh.position.x = pos[0];
    this.mesh.position.z = pos[1];
    scene.add(this.mesh);
    this.timer = 0;
  }
  contains(p) { return nearSquare(p.x, p.z, this.pos, 1.3); }
}

// Coins pile up here; walking over collects them
const MAX_PAD_COINS = 63;
const tmpM = new THREE.Matrix4();
const tmpV = new THREE.Vector3();

export class CoinPad {
  constructor(game, pos) {
    this.game = game;
    this.pos = pos;
    this.value = 0;
    this.shown = 0; // coins visually settled on the pad (instanced)
    this.wanted = 0; // coins settled + in flight
    this.mesh = flatPlane(padTexture('💰'), 2.6);
    this.mesh.position.x = pos[0];
    this.mesh.position.z = pos[1];
    game.scene.add(this.mesh);
    this.pile = new THREE.InstancedMesh(COIN_GEO, COIN_MAT, MAX_PAD_COINS);
    this.pile.count = 0;
    this.pile.castShadow = true;
    this.pile.frustumCulled = false;
    for (let i = 0; i < MAX_PAD_COINS; i++) this.pile.setMatrixAt(i, tmpM.makeTranslation(this.slot(i, tmpV)));
    game.scene.add(this.pile);
  }

  contains(p) { return nearSquare(p.x, p.z, this.pos, 1.3); }

  slot(i, out) {
    const col = i % 9, row = Math.floor(i / 9);
    const cx = (col % 3) - 1, cz = Math.floor(col / 3) - 1;
    return out.set(this.pos[0] + cx * 0.68, DECK_Y + 0.07 + row * 0.1, this.pos[1] + cz * 0.68);
  }

  add(value, from) {
    this.value += value;
    const want = Math.min(MAX_PAD_COINS, Math.ceil(this.value / 3));
    const g = this.game;
    const epoch = this.epoch = this.epoch || 1;
    while (this.wanted < want) {
      const coin = buildCoin();
      const target = this.slot(this.wanted, new THREE.Vector3());
      this.wanted++;
      g.flyers.fly(coin, from || target, target, {
        dur: 0.35, height: 1.2, delay: Math.random() * 0.1,
        onDone: (m) => {
          g.scene.remove(m);
          if (this.epoch !== epoch) return; // collected while in flight
          this.shown = Math.min(this.wanted, this.shown + 1);
          this.pile.count = this.shown;
        },
      });
    }
  }

  // returns collected amount (spawns fly-to-player coins)
  collect(toFn) {
    if (this.value <= 0) return 0;
    const v = this.value;
    this.value = 0;
    const g = this.game;
    const n = Math.max(this.shown, Math.min(12, this.wanted));
    for (let i = 0; i < n; i++) {
      const coin = buildCoin();
      g.flyers.fly(coin, this.slot(i, new THREE.Vector3()), toFn, {
        dur: 0.32, height: 1.4, delay: i * 0.018,
        onDone: (m) => { g.scene.remove(m); g.audio.coin(); },
      });
    }
    this.shown = this.wanted = 0;
    this.pile.count = 0;
    this.epoch = (this.epoch || 1) + 1;
    return v;
  }
}

// The footprint circle where you stand to throw capsules
export class CapturePad {
  constructor(scene, pos) {
    this.pos = pos;
    this.idle = footprintTexture(false);
    this.active = footprintTexture(true);
    this.mesh = flatPlane(this.idle, 2.6);
    this.mesh.position.set(pos[0], DECK_Y + 0.02, pos[1]);
    scene.add(this.mesh);
  }
  contains(p) { return Math.hypot(p.x - this.pos[0], p.z - this.pos[1]) < 1.35; }
  setActive(a) { this.mesh.material.map = a ? this.active : this.idle; }
}

// Dashed square with a price: stand on it to pay coins in
export class UnlockTile {
  // `lockedBy` (text) makes a greyed-out preview that can't be bought yet
  constructor(game, def, paid = 0, lockedBy = null) {
    this.game = game;
    this.def = def;
    this.paid = paid;
    this.locked = !!lockedBy;
    this.lockedBy = lockedBy;
    this.canvas = unlockTileCanvas();
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.mesh = flatPlane(this.tex, 2.5, DECK_Y + 0.03);
    this.mesh.position.x = def.tile[0];
    this.mesh.position.z = def.tile[1];
    game.scene.add(this.mesh);
    const lbl = new THREE.Sprite(new THREE.SpriteMaterial({ map: textSpriteTexture(`${this.locked ? '🔒' : def.icon} ${def.label}`, this.locked ? '#d8d8d8' : '#ffffff', 60), transparent: true, depthWrite: false }));
    lbl.scale.set(4.2, 1.05, 1);
    lbl.position.set(def.tile[0], 2.1, def.tile[1]);
    game.scene.add(lbl);
    this.label = lbl;
    this.lastDrawn = -1;
    this.acc = 0;
    this.fxTimer = 0;
    this.redraw();
    game.pops.pop(this.mesh, 0.5, 1);
  }

  get remaining() { return Math.max(0, this.def.cost - this.paid); }
  contains(p) { return nearSquare(p.x, p.z, this.def.tile, 1.25); }

  redraw() {
    const r = Math.ceil(this.remaining);
    if (r === this.lastDrawn) return;
    this.lastDrawn = r;
    drawUnlockTile(this.canvas, r, this.paid / this.def.cost, '', this.locked);
    this.tex.needsUpdate = true;
  }

  update(dt, player) {
    const g = this.game;
    this.label.position.y = 2.1 + Math.sin(performance.now() / 300) * 0.08;
    if (this.locked) {
      const on = this.contains(player.pos);
      if (on && !this.wasOn) g.ui.toast(`🔒 Unlock ${this.lockedBy}`);
      this.wasOn = on;
      return false;
    }
    if (!this.contains(player.pos) || g.state.coins < 1) { this.acc = 0; return false; }
    // pay over ~1.6s regardless of price
    const rate = Math.max(8, this.def.cost / 1.6);
    this.acc += rate * dt;
    const pay = Math.min(Math.floor(this.acc), Math.floor(g.state.coins), Math.ceil(this.remaining));
    if (pay > 0) {
      this.acc -= pay;
      this.paid += pay;
      g.spend(pay);
      this.fxTimer -= dt;
      if (this.fxTimer <= 0) {
        this.fxTimer = 0.06;
        const coin = buildCoin();
        const from = player.mesh.position.clone().setY(1.6);
        const to = new THREE.Vector3(this.def.tile[0], DECK_Y + 0.1, this.def.tile[1]);
        g.flyers.fly(coin, from, to, { dur: 0.25, height: 1, onDone: (m) => g.scene.remove(m) });
        g.audio.coin();
      }
      this.redraw();
    }
    return this.remaining <= 0;
  }

  dispose() {
    this.game.scene.remove(this.mesh);
    this.game.scene.remove(this.label);
    this.tex.dispose();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.label.material.map.dispose();
    this.label.material.dispose();
  }
}
