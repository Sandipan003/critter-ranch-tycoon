import * as THREE from 'three';
import { loadState } from './save.js';

// Graphics quality, decided once at start-up before any material is built.
// Low quality is picked by Settings → Graphics → Low, or automatically ("Auto") on phones with little
// memory, few cores or a known entry-level GPU, and after the game measured slow frames last time.

// entry-level mobile GPUs (Mali-4xx/T/G31–G57, Adreno 3xx–5xx and 610–613, PowerVR / IMG)
const WEAK_GPU = /Mali-(4\d\d|T\d+|G(31|51|52|57)\b)|Adreno[^0-9]*(3\d\d|4\d\d|5\d\d|61[0-3])\b|PowerVR|IMG BXM/i;

function gpuName() {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) return '';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return name;
  } catch {
    return '';
  }
}

function detect() {
  const s = loadState().settings;
  const mem = navigator.deviceMemory || 4;
  const cores = navigator.hardwareConcurrency || 4;
  const gpu = s.quality === 'auto' ? gpuName() : '';
  const weakGpu = WEAK_GPU.test(gpu);
  const low = s.quality === 'low' || (s.quality === 'auto' && (!!s.autoLow || mem <= 2 || cores <= 2 || weakGpu));
  return { low, gpu, weakGpu, mem, cores };
}

export const QUALITY = detect();
export const LOW = QUALITY.low;

// The game's surface material: physically based normally, much cheaper Lambert shading on Low
// (same colours and lights, no specular highlights).
export function surfaceMaterial(params) {
  if (!LOW) return new THREE.MeshStandardMaterial(params);
  const { roughness, metalness, ...rest } = params;
  return new THREE.MeshLambertMaterial(rest);
}
