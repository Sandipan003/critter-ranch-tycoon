import * as THREE from 'three';
import { softDotTexture, starTexture, textSpriteTexture } from '../world/textures.js';

const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

// Objects flying along an arc (capsules, coins). `to` may be a function for moving targets.
export class Flyers {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
  }

  fly(obj, from, to, { dur = 0.45, height = 1.5, spin = 0, scaleTo = null, onDone = null, delay = 0 } = {}) {
    if (obj.parent !== this.scene) this.scene.attach(obj);
    obj.position.copy(from);
    const f = { obj, from: from.clone(), to, dur, height, spin, t: -delay, onDone, s0: obj.scale.x, scaleTo };
    if (delay > 0) obj.visible = false;
    this.list.push(f);
    return f;
  }

  update(dt) {
    const tmp = new THREE.Vector3();
    for (let i = this.list.length - 1; i >= 0; i--) {
      const f = this.list[i];
      f.t += dt;
      if (f.t < 0) continue;
      f.obj.visible = true;
      const k = Math.min(1, f.t / f.dur);
      const e = ease(k);
      const target = typeof f.to === 'function' ? f.to(tmp) : f.to;
      f.obj.position.lerpVectors(f.from, target, e);
      f.obj.position.y += Math.sin(Math.PI * k) * f.height;
      if (f.spin) f.obj.rotation.x += f.spin * dt;
      if (f.scaleTo != null) f.obj.scale.setScalar(THREE.MathUtils.lerp(f.s0, f.scaleTo, e));
      if (k >= 1) {
        this.list.splice(i, 1);
        f.onDone?.(f.obj);
      }
    }
  }
}

// Pooled sprite particles
export class Particles {
  constructor(scene) {
    this.scene = scene;
    this.dot = softDotTexture();
    this.star = starTexture();
    this.pool = [];
    this.live = [];
    this.amount = 1; // fraction of particles spawned (0.5 on Low)
  }

  _get(map) {
    let s = this.pool.pop();
    if (!s) {
      s = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }));
      this.scene.add(s);
    }
    s.material.map = map;
    s.material.needsUpdate = true;
    s.visible = true;
    return s;
  }

  burst(pos, { color = 0xffffff, count = 12, speed = 4, life = 0.6, size = 0.35, gravity = -6, star = false, up = 2 } = {}) {
    count = Math.ceil(count * this.amount);
    for (let i = 0; i < count; i++) {
      const s = this._get(star ? this.star : this.dot);
      s.material.color.set(color);
      s.material.opacity = 1;
      s.position.copy(pos);
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.6);
      s.userData = {
        v: new THREE.Vector3(Math.cos(a) * v, up + Math.random() * speed * 0.6, Math.sin(a) * v),
        life, t: 0, size: size * (0.6 + Math.random() * 0.8), gravity,
      };
      s.scale.setScalar(s.userData.size);
      this.live.push(s);
    }
  }

  puff(pos, color = 0xffffff, count = 10) {
    this.burst(pos, { color, count, speed: 2.2, life: 0.7, size: 0.9, gravity: 1, up: 0.6 });
  }

  update(dt) {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const s = this.live[i];
      const u = s.userData;
      u.t += dt;
      u.v.y += u.gravity * dt;
      s.position.addScaledVector(u.v, dt);
      const k = u.t / u.life;
      s.material.opacity = 1 - k;
      s.scale.setScalar(u.size * (1 - k * 0.5));
      if (k >= 1) {
        s.visible = false;
        this.live.splice(i, 1);
        this.pool.push(s);
      }
    }
  }
}

// "+12" style floating numbers. Almost every number is different, so each texture is shared only
// while identical texts are on screen and freed (GPU memory) when the last of them fades out.
export class FloatText {
  constructor(scene) {
    this.scene = scene;
    this.cache = new Map(); // key → { tex, refs }
    this.live = [];
  }

  spawn(pos, text, color = '#ffe14a', size = 1.6) {
    const key = text + color;
    let entry = this.cache.get(key);
    if (!entry) {
      entry = { tex: textSpriteTexture(text, color), refs: 0 };
      this.cache.set(key, entry);
    }
    entry.refs++;
    const tex = entry.tex;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
    s.userData.key = key;
    s.renderOrder = 999;
    s.position.copy(pos);
    s.scale.set(size * 4, size, 1);
    s.userData.t = 0;
    this.scene.add(s);
    this.live.push(s);
  }

  update(dt) {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const s = this.live[i];
      s.userData.t += dt;
      const t = s.userData.t;
      s.position.y += dt * 1.6;
      s.material.opacity = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.5;
      if (t > 1.2) {
        this.scene.remove(s);
        s.material.dispose();
        this.live.splice(i, 1);
        const entry = this.cache.get(s.userData.key);
        if (entry && --entry.refs <= 0) {
          entry.tex.dispose();
          this.cache.delete(s.userData.key);
        }
      }
    }
  }
}

// Scale-pop animation helper for anything that appears
export class Pops {
  constructor() { this.list = []; }
  pop(obj, dur = 0.5, target = obj.scale.x || 1) {
    obj.scale.setScalar(0.001);
    this.list.push({ obj, t: 0, dur, target });
  }
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.t += dt;
      const k = Math.min(1, p.t / p.dur);
      // back-out easing
      const c = 1.9;
      const e = 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2);
      p.obj.scale.setScalar(Math.max(0.001, p.target * e));
      if (k >= 1) this.list.splice(i, 1);
    }
  }
}
