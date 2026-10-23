// Floating virtual joystick (touch/mouse) + WASD/arrow keys
export class Input {
  constructor(surface) {
    this.x = 0;
    this.y = 0;
    this.active = false;
    this.keys = new Set();
    this.base = document.getElementById('joy-base');
    this.knob = document.getElementById('joy-knob');
    this.radius = 55;
    this.id = null;
    this.enabled = true;

    surface.addEventListener('pointerdown', (e) => {
      if (!this.enabled || this.id !== null) return;
      this.id = e.pointerId;
      this.ox = e.clientX;
      this.oy = e.clientY;
      this.active = true;
      this.base.style.display = 'block';
      this.base.style.left = `${this.ox}px`;
      this.base.style.top = `${this.oy}px`;
      this.knob.style.transform = 'translate(-50%, -50%)';
      surface.setPointerCapture?.(e.pointerId);
    });
    surface.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.id) return;
      let dx = e.clientX - this.ox, dy = e.clientY - this.oy;
      let d = Math.hypot(dx, dy);
      if (d > this.radius) {
        // drag the base along so the stick never "sticks" at the edge
        const over = d - this.radius;
        this.ox += (dx / d) * over;
        this.oy += (dy / d) * over;
        this.base.style.left = `${this.ox}px`;
        this.base.style.top = `${this.oy}px`;
        dx *= this.radius / d;
        dy *= this.radius / d;
        d = this.radius;
      }
      this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      const m = d / this.radius;
      const dead = 0.12;
      if (m < dead) { this.x = this.y = 0; return; }
      const k = Math.min(1, (m - dead) / (0.7 - dead));
      this.x = (dx / d) * k;
      this.y = (dy / d) * k;
    });
    const end = (e) => {
      if (e.pointerId !== this.id) return;
      this.id = null;
      this.active = false;
      this.x = this.y = 0;
      this.base.style.display = 'none';
    };
    surface.addEventListener('pointerup', end);
    surface.addEventListener('pointercancel', end);

    window.addEventListener('keydown', (e) => this.keys.add(e.key.toLowerCase()));
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());
  }

  reset() {
    this.id = null;
    this.active = false;
    this.x = this.y = 0;
    this.base.style.display = 'none';
  }

  read() {
    let kx = 0, ky = 0;
    const k = this.keys;
    if (k.has('a') || k.has('arrowleft')) kx -= 1;
    if (k.has('d') || k.has('arrowright')) kx += 1;
    if (k.has('w') || k.has('arrowup')) ky -= 1;
    if (k.has('s') || k.has('arrowdown')) ky += 1;
    if (kx || ky) {
      const l = Math.hypot(kx, ky);
      return { x: kx / l, y: ky / l };
    }
    if (!this.enabled) return { x: 0, y: 0 };
    return { x: this.x, y: this.y };
  }
}
