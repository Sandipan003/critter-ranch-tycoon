import * as THREE from 'three';

const SPACING = 0.4;

// A wobbly tower of capsules carried on someone's back
export class BackStack {
  constructor(anchor, capacity) {
    this.anchor = anchor;
    this.capacity = capacity;
    this.items = []; // { mesh, tier, value }
    this.incoming = 0; // capsules in flight towards this stack
    this.lean = 0;
    this.leanV = 0;
  }

  get count() { return this.items.length; }
  get full() { return this.items.length + this.incoming >= this.capacity; }
  get space() { return Math.max(0, this.capacity - this.items.length - this.incoming); }

  // World position of slot i (used as the flight target)
  slotWorld(i, out = new THREE.Vector3()) {
    out.set(0, i * SPACING + 0.2, 0);
    return this.anchor.localToWorld(out);
  }

  push(item) {
    const { mesh } = item;
    this.anchor.attach(mesh);
    mesh.rotation.set(0, 0, Math.PI / 2);
    mesh.position.set(0, this.items.length * SPACING + 0.2, 0);
    mesh.scale.setScalar(1);
    this.items.push(item);
  }

  pop() {
    const item = this.items.pop();
    return item || null;
  }

  update(dt, speed) {
    // spring the lean towards a target based on running speed
    const target = -Math.min(speed, 8) * 0.018;
    this.leanV += (target - this.lean) * 60 * dt;
    this.leanV *= Math.exp(-7 * dt);
    this.lean += this.leanV * dt;
    const t = performance.now() / 1000;
    this.items.forEach((it, i) => {
      const h = i + 1;
      it.mesh.position.z = this.lean * Math.pow(h, 1.35);
      it.mesh.position.x = Math.sin(t * 3 + i * 0.5) * 0.004 * h;
      it.mesh.position.y = i * SPACING + 0.2;
    });
  }
}
