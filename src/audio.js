// Tiny synthesized SFX (no audio files needed)
export class Audio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.lastCoin = 0;
  }

  unlock() {
    if (this.ctx) { this.ctx.resume?.(); return; }
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
    } catch { this.ctx = null; }
  }

  suspend() { this.ctx?.suspend?.(); }
  resume() { if (this.enabled) this.ctx?.resume?.(); }

  tone(freq, dur, { type = 'sine', vol = 0.3, slide = 0, delay = 0 } = {}) {
    if (!this.enabled || !this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  noise(dur, { vol = 0.15, freq = 1200 } = {}) {
    if (!this.enabled || !this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(freq, t);
    f.frequency.exponentialRampToValueAtTime(freq * 2.5, t + dur);
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
  }

  whoosh() { this.noise(0.18, { vol: 0.12, freq: 700 }); }
  pop() { this.tone(520, 0.12, { type: 'triangle', vol: 0.3, slide: 500 }); this.tone(1040, 0.1, { vol: 0.15, delay: 0.06 }); }
  fail() { this.tone(300, 0.18, { type: 'square', vol: 0.08, slide: -150 }); }
  coin() {
    const now = performance.now();
    if (now - this.lastCoin < 45) return;
    this.lastCoin = now;
    this.tone(1320 + Math.random() * 200, 0.08, { type: 'square', vol: 0.05 });
    this.tone(1980, 0.1, { type: 'sine', vol: 0.06, delay: 0.03 });
  }
  drop() { this.tone(400, 0.07, { type: 'triangle', vol: 0.12, slide: -120 }); }
  click() { this.tone(880, 0.05, { type: 'triangle', vol: 0.15 }); }
  unlockFx() {
    [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.22, { type: 'triangle', vol: 0.22, delay: i * 0.09 }));
  }
}
