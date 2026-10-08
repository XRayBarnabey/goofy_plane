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
    const naturalHeight = h < -0.05 ? h * 120 : m * m * 1400 - 6;
    const cityBlend = Math.min(1, Math.max(0, (Math.hypot(x, z) - 650) / 500));
    return 25 * (1 - cityBlend) + naturalHeight * cityBlend;
  }
}

const SIZE = 3000, SEGS = 96;

export class TerrainView {
  group = new THREE.Group();
  private chunks = new Map<string, THREE.Mesh>();
  private mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  constructor(private t: Terrain, scene: THREE.Scene) {
    scene.add(this.group);
    this.addCity();
    const water = new THREE.Mesh(new THREE.PlaneGeometry(40000, 40000).rotateX(-Math.PI / 2),
      new THREE.MeshLambertMaterial({ color: 0x1f6fb5, transparent: true, opacity: 0.85 }));
    water.position.y = WATER_LEVEL;
    this.water = water; scene.add(water);
  }
  private water: THREE.Mesh;
  private addCity() {
    const city = new THREE.Group();
    const asphalt = new THREE.MeshLambertMaterial({ color: 0x333b43 });
    const markings = new THREE.MeshLambertMaterial({ color: 0xe6d16a });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(1800, 1800).rotateX(-Math.PI / 2), asphalt);
    ground.position.y = 25.1;
    city.add(ground);
    for (let i = -5; i <= 5; i++) {
      const road = new THREE.Mesh(new THREE.PlaneGeometry(1800, 24).rotateX(-Math.PI / 2), asphalt);
      road.position.set(i * 150, 25.2, 0);
      city.add(road);
      const crossRoad = road.clone();
      crossRoad.rotation.y = Math.PI / 2;
      crossRoad.position.set(0, 25.2, i * 150);
      city.add(crossRoad);
      const dash = new THREE.Mesh(new THREE.BoxGeometry(2, 0.12, 32), markings);
      dash.position.set(i * 150, 25.35, 0);
      city.add(dash);
    }
    const facadeColors = [0x8a8f98, 0xc2a98a, 0x6f8797, 0xb9b8b0, 0x77807e, 0xa1665a];
    const glassMaterial = new THREE.MeshLambertMaterial({ color: 0x5aa2c8, emissive: 0x1a3a50 });
    const roofMaterial = new THREE.MeshLambertMaterial({ color: 0x3a3f45 });
    const bandMaterial = new THREE.MeshLambertMaterial({ color: 0xdedede });
    const park = new THREE.MeshLambertMaterial({ color: 0x4a9a45 });
    for (let ix = -5; ix <= 5; ix++) for (let iz = -5; iz <= 5; iz++) {
      const x = ix * 150 + ((ix * 37 + iz * 19) % 23);
      const z = iz * 150 + ((iz * 29 + ix * 11) % 23);
      if ((ix * 3 + iz * 5) % 7 === 0) {
        const lawn = new THREE.Mesh(new THREE.BoxGeometry(90, 0.4, 90), park); lawn.position.set(x, 25.3, z); city.add(lawn);
        for (let i = 0; i < 6; i++) {
          const tx = x + ((i * 37) % 70) - 35, tz = z + ((i * 53) % 70) - 35;
          const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.8, 5, 6), new THREE.MeshLambertMaterial({ color: 0x6b4a2b }));
          trunk.position.set(tx, 28, tz);
          const crown = new THREE.Mesh(new THREE.ConeGeometry(4.5, 12, 7), new THREE.MeshLambertMaterial({ color: 0x2f7d32 }));
          crown.position.set(tx, 36, tz); city.add(trunk, crown);
        }
        continue;
      }
      const width = 48 + Math.abs((ix * 7 + iz * 13) % 28);
      const depth = 48 + Math.abs((ix * 11 + iz * 5) % 28);
      const floors = 3 + Math.abs((ix * 17 + iz * 23) % 14);
      const height = floors * 8;
      const building = new THREE.Mesh(
        new THREE.BoxGeometry(width, height, depth),
        new THREE.MeshLambertMaterial({ color: facadeColors[Math.abs(ix * 3 + iz * 7) % facadeColors.length] }),
      );
      building.position.set(x, 25 + height / 2, z);
      city.add(building);
      // window bands on each floor, all four faces
      for (let f = 0; f < floors; f++) {
        const y = 25 + f * 8 + 4.5;
        for (const s of [-1, 1]) {
          const fb = new THREE.Mesh(new THREE.BoxGeometry(width * 0.86, 3.2, 0.3), glassMaterial);
          fb.position.set(x, y, z + s * (depth / 2 + 0.15)); city.add(fb);
          const sb = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3.2, depth * 0.86), glassMaterial);
          sb.position.set(x + s * (width / 2 + 0.15), y, z); city.add(sb);
        }
      }
      const base = new THREE.Mesh(new THREE.BoxGeometry(width + 3, 3, depth + 3), bandMaterial);
      base.position.set(x, 26.5, z); city.add(base);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(width + 2, 1.5, depth + 2), roofMaterial);
      roof.position.set(x, 25 + height + 0.75, z); city.add(roof);
      if (floors > 9) {
        const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.5, 18, 6), roofMaterial);
        antenna.position.set(x, 25 + height + 10, z); city.add(antenna);
      } else {
        const unit = new THREE.Mesh(new THREE.BoxGeometry(width * 0.3, 4, depth * 0.3), bandMaterial);
        unit.position.set(x + width * 0.15, 25 + height + 3.5, z); city.add(unit);
      }
    }
    this.group.add(city);
  }
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
