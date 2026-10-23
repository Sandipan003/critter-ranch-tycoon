import * as THREE from 'three';
import { THEME } from './worlds.js';

const FONT = '"Fredoka", "Arial Rounded MT Bold", system-ui, sans-serif';

function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function tex(c, { repeat = null, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

// Seeded rng so textures look the same every launch
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// Ground of the active world (grass / snow / scorched earth)
export function grassTexture(p = THEME.ground) {
  const [c, g] = canvas(512);
  const r = rng(7);
  g.fillStyle = p.base;
  g.fillRect(0, 0, 512, 512);
  // soft patches
  for (let i = 0; i < 60; i++) {
    const x = r() * 512, y = r() * 512, rad = 30 + r() * 70;
    const grd = g.createRadialGradient(x, y, 0, x, y, rad);
    const light = r() > 0.5;
    grd.addColorStop(0, light ? p.light : p.dark);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    for (const ox of [-512, 0, 512]) for (const oy of [-512, 0, 512]) {
      g.save(); g.translate(ox, oy); g.beginPath(); g.arc(x, y, rad, 0, 7); g.fill(); g.restore();
    }
  }
  // blades
  for (let i = 0; i < 2600; i++) {
    const x = r() * 512, y = r() * 512;
    const v = r();
    g.strokeStyle = v > 0.6 ? p.blades[0] : v > 0.3 ? p.blades[1] : p.blades[2];
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (r() - 0.5) * 4, y - 4 - r() * 5);
    g.stroke();
  }
  return tex(c, { repeat: [40, 40] });
}

export function plankTexture() {
  const [c, g] = canvas(512);
  const r = rng(11);
  const rows = 8, h = 512 / rows;
  for (let i = 0; i < rows; i++) {
    const base = 150 + r() * 25;
    g.fillStyle = `rgb(${base + 28},${base - 12},${base - 62})`;
    g.fillRect(0, i * h, 512, h);
    // grain
    for (let k = 0; k < 40; k++) {
      g.strokeStyle = `rgba(90,50,20,${0.05 + r() * 0.1})`;
      g.lineWidth = 1 + r() * 2;
      const y = i * h + r() * h;
      g.beginPath();
      g.moveTo(0, y);
      g.bezierCurveTo(170, y + (r() - 0.5) * 6, 340, y + (r() - 0.5) * 6, 512, y);
      g.stroke();
    }
    // seams
    g.fillStyle = 'rgba(70,38,15,0.85)';
    g.fillRect(0, i * h, 512, 3);
    const off = r() * 512;
    g.fillRect(off, i * h, 3, h);
    g.fillRect((off + 256) % 512, i * h, 3, h);
    // highlight
    g.fillStyle = 'rgba(255,230,190,0.12)';
    g.fillRect(0, i * h + 3, 512, 4);
  }
  return tex(c, { repeat: [3, 3] });
}

export function dirtTexture(p = THEME.dirt) {
  const [c, g] = canvas(256);
  const r = rng(3);
  g.fillStyle = p.base;
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) {
    g.fillStyle = r() > 0.5 ? p.specks[0] : p.specks[1];
    g.beginPath();
    g.arc(r() * 256, r() * 256, 1 + r() * 3, 0, 7);
    g.fill();
  }
  return tex(c, { repeat: [4, 4] });
}

export function beltTexture() {
  const [c, g] = canvas(64, 128);
  g.fillStyle = '#4a5878';
  g.fillRect(0, 0, 64, 128);
  g.fillStyle = '#5d6d92';
  for (let y = 0; y < 128; y += 32) g.fillRect(4, y + 4, 56, 18);
  g.fillStyle = 'rgba(0,0,0,0.25)';
  for (let y = 0; y < 128; y += 32) g.fillRect(4, y + 20, 56, 3);
  const t = tex(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// Green dashed circle drawn under the player (like the reference video)
export function ringTexture(color = '#3cff3c') {
  const [c, g] = canvas(256);
  g.strokeStyle = color;
  g.lineWidth = 18;
  g.lineCap = 'round';
  const n = 9;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2;
    g.beginPath();
    g.arc(128, 128, 104, a0, a0 + (Math.PI * 2) / n * 0.62);
    g.stroke();
  }
  return tex(c);
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function drawCoin(g, x, y, r) {
  g.fillStyle = '#e9a400';
  g.beginPath(); g.arc(x, y + r * 0.12, r, 0, 7); g.fill();
  g.fillStyle = '#ffd23a';
  g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  g.strokeStyle = '#f5b400';
  g.lineWidth = r * 0.14;
  g.beginPath(); g.arc(x, y, r * 0.68, 0, 7); g.stroke();
  g.fillStyle = '#c98a00';
  g.font = `700 ${r * 1.05}px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('$', x, y + r * 0.05);
}

// Dashed square unlock tile with price, redrawn as the price drops
export function drawUnlockTile(c, price, progress, label, locked = false) {
  const g = c.getContext('2d');
  const S = c.width;
  g.clearRect(0, 0, S, S);
  g.globalAlpha = locked ? 0.55 : 1;
  // fill progress (green, like the video)
  if (progress > 0) {
    g.fillStyle = 'rgba(90,230,90,0.85)';
    g.fillRect(14, 14 + (S - 28) * (1 - progress), S - 28, (S - 28) * progress);
  } else {
    g.fillStyle = 'rgba(40,30,20,0.18)';
    g.fillRect(14, 14, S - 28, S - 28);
  }
  g.strokeStyle = '#ffffff';
  g.lineWidth = 14;
  g.setLineDash([46, 26]);
  g.lineDashOffset = 20;
  g.strokeRect(14, 14, S - 28, S - 28);
  g.setLineDash([]);
  g.fillStyle = '#ffffff';
  g.strokeStyle = 'rgba(0,0,0,0.45)';
  g.lineWidth = 10;
  g.font = `700 ${S * 0.27}px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const txt = formatNum(price);
  g.strokeText(txt, S / 2, S * 0.4);
  g.fillText(txt, S / 2, S * 0.4);
  if (locked) {
    g.font = `${S * 0.2}px ${FONT}`;
    g.fillText('🔒', S / 2, S * 0.72);
  } else drawCoin(g, S / 2, S * 0.7, S * 0.11);
  g.globalAlpha = 1;
  if (label) {
    g.font = `700 ${S * 0.085}px ${FONT}`;
    g.lineWidth = 6;
    g.strokeText(label, S / 2, S * 0.88);
    g.fillText(label, S / 2, S * 0.88);
  }
}

export function unlockTileCanvas() {
  return canvas(256)[0];
}

// Green outlined square pad (drop zone / coin pad)
export function padTexture(icon) {
  const [c, g] = canvas(256);
  g.fillStyle = 'rgba(120,255,120,0.18)';
  roundRect(g, 10, 10, 236, 236, 26);
  g.fill();
  g.strokeStyle = '#4dff4d';
  g.lineWidth = 12;
  roundRect(g, 10, 10, 236, 236, 26);
  g.stroke();
  if (icon) {
    g.font = `110px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.globalAlpha = 0.85;
    g.fillText(icon, 128, 136);
  }
  return tex(c);
}

// White footprints in a circle — the capture spot
export function footprintTexture(active = false) {
  const [c, g] = canvas(256);
  g.fillStyle = active ? 'rgba(70,255,70,0.35)' : 'rgba(255,255,255,0.12)';
  g.beginPath(); g.arc(128, 128, 112, 0, 7); g.fill();
  g.strokeStyle = active ? '#5dff5d' : '#ffffff';
  g.lineWidth = 12;
  g.setLineDash([34, 18]);
  g.beginPath(); g.arc(128, 128, 110, 0, 7); g.stroke();
  g.setLineDash([]);
  g.fillStyle = active ? '#5dff5d' : '#ffffff';
  const foot = (x, y, flip) => {
    g.save();
    g.translate(x, y);
    if (flip) g.scale(-1, 1);
    g.beginPath(); g.ellipse(0, -14, 20, 30, -0.15, 0, 7); g.fill();
    g.beginPath(); g.ellipse(4, 34, 14, 15, 0, 0, 7); g.fill();
    g.restore();
  };
  foot(98, 118, false);
  foot(158, 118, true);
  return tex(c);
}

// 12,345 → 12.3K → 4.5M → … endless worlds need the long scale too
const SUFFIX = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];
export function formatNum(n) {
  n = Math.floor(n);
  if (n < 1e4) return n.toLocaleString('en-US');
  const e = Math.min(SUFFIX.length - 1, Math.floor(Math.log10(n) / 3));
  const v = n / Math.pow(1000, e);
  return (v >= 100 ? v.toFixed(0) : v.toFixed(1)) + SUFFIX[e];
}

const labelCache = new Map();
// "Lv.3" floating label
// `rare` paints the label gold (the top two critter levels of each world)
export function levelLabelTexture(level, rare = level >= 4, shiny = false) {
  const key = `${level}|${rare}|${shiny}`;
  if (labelCache.has(key)) return labelCache.get(key);
  const [c, g] = canvas(256, 128);
  g.font = `700 ${level >= 10 ? 70 : 84}px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.strokeStyle = 'rgba(40,40,60,0.9)';
  g.lineWidth = 16;
  const text = (shiny ? '★' : '') + 'Lv.' + level;
  if (shiny) g.font = `700 ${level >= 10 ? 60 : 70}px ${FONT}`;
  g.strokeText(text, 128, 66);
  g.fillStyle = shiny ? '#ffb020' : rare ? '#ffd84a' : '#ffffff';
  g.fillText(text, 128, 66);
  const t = tex(c);
  labelCache.set(key, t);
  return t;
}

// "👑 Lv.10" over a boss critter, with a health bar; redrawn on every hit
export function bossLabelTexture(level, hp, max) {
  const [c, g] = canvas(256, 160);
  g.font = `700 58px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.strokeStyle = 'rgba(40,40,60,0.9)';
  g.lineWidth = 14;
  const text = '👑 Lv.' + level;
  g.strokeText(text, 128, 52);
  g.fillStyle = '#ffd84a';
  g.fillText(text, 128, 52);
  const x = 24, y = 104, w = 208, h = 34;
  g.fillStyle = 'rgba(40,40,60,0.9)';
  g.fillRect(x - 5, y - 5, w + 10, h + 10);
  g.fillStyle = '#5a1e2a';
  g.fillRect(x, y, w, h);
  g.fillStyle = hp / max > 0.35 ? '#ff5a4a' : '#ffb020';
  g.fillRect(x, y, Math.max(0, (w * hp) / max), h);
  g.fillStyle = 'rgba(255,255,255,0.35)';
  g.fillRect(x, y, Math.max(0, (w * hp) / max), h * 0.35);
  return tex(c);
}

// Speech bubble with an emoji (customers, pens)
const bubbleCache = new Map();
export function bubbleTexture(emoji, ring = '#ffffff') {
  const key = emoji + ring;
  if (bubbleCache.has(key)) return bubbleCache.get(key);
  const [c, g] = canvas(128, 150);
  g.fillStyle = 'rgba(0,0,0,0.18)';
  g.beginPath(); g.arc(66, 68, 56, 0, 7); g.fill();
  g.fillStyle = '#ffffff';
  g.beginPath(); g.arc(64, 64, 56, 0, 7); g.fill();
  g.beginPath(); g.moveTo(48, 110); g.lineTo(64, 146); g.lineTo(80, 110); g.fill();
  g.strokeStyle = ring;
  g.lineWidth = 8;
  g.beginPath(); g.arc(64, 64, 50, 0, 7); g.stroke();
  g.font = `64px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(emoji, 64, 68);
  const t = tex(c);
  bubbleCache.set(key, t);
  return t;
}

export function textSpriteTexture(text, color = '#ffffff', size = 72) {
  const [c, g] = canvas(512, 128);
  g.font = `700 ${size}px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.strokeStyle = 'rgba(30,30,50,0.85)';
  g.lineWidth = 14;
  g.strokeText(text, 256, 66);
  g.fillStyle = color;
  g.fillText(text, 256, 66);
  return tex(c);
}

export function softDotTexture() {
  const [c, g] = canvas(64);
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.4, 'rgba(255,255,255,0.7)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return tex(c);
}

export function starTexture() {
  const [c, g] = canvas(64);
  g.fillStyle = '#ffffff';
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 11 : 30;
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    g.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r);
  }
  g.closePath();
  g.fill();
  return tex(c);
}

export function shadowBlobTexture() {
  const [c, g] = canvas(128);
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(0,0,0,0.45)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  return tex(c);
}

export function skyTexture() {
  const [c, g] = canvas(16, 256);
  const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, '#7cc8ff');
  grd.addColorStop(0.6, '#c4ecff');
  grd.addColorStop(1, '#e8f8e0');
  g.fillStyle = grd;
  g.fillRect(0, 0, 16, 256);
  return tex(c);
}

export function captureRingTexture(pct) {
  const [c, g] = canvas(256);
  g.clearRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(255,255,255,0.9)';
  g.lineWidth = 6;
  g.beginPath(); g.arc(128, 150, 70, 0, 7); g.stroke();
  g.strokeStyle = '#ffcf1f';
  g.lineWidth = 14;
  g.beginPath(); g.arc(128, 150, 84, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct); g.stroke();
  g.font = `700 30px ${FONT}`;
  g.textAlign = 'center';
  g.fillStyle = '#fff';
  g.strokeStyle = 'rgba(0,0,0,0.6)';
  g.lineWidth = 6;
  g.strokeText('Capture Rate', 128, 30);
  g.fillText('Capture Rate', 128, 30);
  g.font = `700 40px ${FONT}`;
  g.strokeText(Math.round(pct * 100) + '%', 128, 66);
  g.fillText(Math.round(pct * 100) + '%', 128, 66);
  return tex(c);
}
