import * as THREE from "three";

function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const WATER_LEVEL = 0;

export class Terrain {
  private perm = new Uint8Array(512);
  constructor(seed: number) {
    const r = mulberry32(seed), p = Array.from({ length: 256 }, (_, i) => i);
    for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
  }
  private grad(h: number, x: number, y: number) {
    switch (h & 3) { case 0: return x + y; case 1: return -x + y; case 2: return x - y; default: return -x - y; }
  }
  private noise(x: number, y: number) {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
    x -= Math.floor(x); y -= Math.floor(y);
    const f = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
    const u = f(x), v = f(y), P = this.perm;
    const a = P[X] + Y, b = P[X + 1] + Y;
    const l = (t: number, p: number, q: number) => p + t * (q - p);
    return l(v, l(u, this.grad(P[a], x, y), this.grad(P[b], x - 1, y)),
                l(u, this.grad(P[a + 1], x, y - 1), this.grad(P[b + 1], x - 1, y - 1)));
  }
  height(x: number, z: number) {
    let h = 0, amp = 1, f = 0.0006, sum = 0;
    for (let i = 0; i < 5; i++) { h += this.noise(x * f, z * f) * amp; sum += amp; amp *= 0.5; f *= 2; }
    h = h / sum;
    const m = Math.max(0, h + 0.1);
    return h < -0.05 ? h * 120 : m * m * 1400 - 6;
  }
}

const SIZE = 3000, SEGS = 96;

export class TerrainView {
  group = new THREE.Group();
  private chunks = new Map<string, THREE.Mesh>();
  private mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  constructor(private t: Terrain, scene: THREE.Scene) {
    scene.add(this.group);
    const water = new THREE.Mesh(new THREE.PlaneGeometry(40000, 40000).rotateX(-Math.PI / 2),
      new THREE.MeshLambertMaterial({ color: 0x1f6fb5, transparent: true, opacity: 0.85 }));
    water.position.y = WATER_LEVEL;
    this.water = water; scene.add(water);
  }
  private water: THREE.Mesh;
  private build(cx: number, cz: number) {
    const g = new THREE.PlaneGeometry(SIZE, SIZE, SEGS, SEGS).rotateX(-Math.PI / 2);
    const pos = g.attributes.position, col = new Float32Array(pos.count * 3), c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + cx * SIZE, z = pos.getZ(i) + cz * SIZE, h = this.t.height(x, z);
      pos.setXYZ(i, x, h, z);
      if (h < 3) c.set(0xd8c98a); else if (h < 120) c.set(0x3f8f3a).lerp(new THREE.Color(0x2e6b2c), h / 120);
      else if (h < 260) c.set(0x7a6a55); else c.set(0xf4f4f4);
      c.offsetHSL(0, 0, (Math.sin(x * 0.05) * Math.cos(z * 0.05)) * 0.02);
      col.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    return new THREE.Mesh(g, this.mat);
  }
  update(px: number, pz: number) {
    const ccx = Math.round(px / SIZE), ccz = Math.round(pz / SIZE), keep = new Set<string>();
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
      const k = `${ccx + dx},${ccz + dz}`; keep.add(k);
      if (!this.chunks.has(k)) { const m = this.build(ccx + dx, ccz + dz); this.chunks.set(k, m); this.group.add(m); }
    }
    for (const [k, m] of this.chunks) if (!keep.has(k)) { this.group.remove(m); m.geometry.dispose(); this.chunks.delete(k); }
    this.water.position.x = px; this.water.position.z = pz;
  }
}
