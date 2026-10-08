import * as THREE from "three";
import { buildForest } from "./forest";

function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const WATER_LEVEL = 0;
export const RUNWAY = { x: 0, z0: 1200, z1: 2400, halfWidth: 40, y: 25 };
export const RUNWAY_FLAT = 70;
const RUNWAY_BLEND = 250;
export function runwayDistance(x: number, z: number) {
  const dx = Math.max(Math.abs(x - RUNWAY.x) - RUNWAY.halfWidth, 0);
  const dz = Math.max(RUNWAY.z0 - z, z - RUNWAY.z1, 0);
  return Math.hypot(dx, dz);
}
export const onRunway = (x: number, z: number, margin = 0) => runwayDistance(x, z) <= margin;

export interface GiantTree { x: number; z: number; y: number; h: number; r: number; kind: number; rot: number; tint: number }
export const FOREST = { x: -2600, z: 600, radius: 1500 };

export interface BuildingBounds {
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number;
}

function buildingAtCell(ix: number, iz: number): BuildingBounds | null {
  if ((ix * 3 + iz * 5) % 7 === 0) return null;
  return {
    x: ix * 150 + ((ix * 37 + iz * 19) % 23),
    z: iz * 150 + ((iz * 29 + ix * 11) % 23),
    width: 48 + Math.abs((ix * 7 + iz * 13) % 28),
    depth: 48 + Math.abs((ix * 11 + iz * 5) % 28),
    height: (3 + Math.abs((ix * 17 + iz * 23) % 14)) * 8,
  };
}

export class Terrain {
  private perm = new Uint8Array(512);
  constructor(readonly seed: number) {
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
    const base = 25 * (1 - cityBlend) + naturalHeight * cityBlend;
    const rb = Math.min(1, Math.max(0, (runwayDistance(x, z) - RUNWAY_FLAT) / RUNWAY_BLEND));
    const smooth = rb * rb * (3 - 2 * rb);
    return RUNWAY.y * (1 - smooth) + base * smooth;
  }
  private forest: GiantTree[] | null = null;
  get trees(): GiantTree[] {
    if (this.forest) return this.forest;
    const r = mulberry32(this.seed ^ 0x7ee5), list: GiantTree[] = [];
    for (let i = 0; i < 2600 && list.length < 520; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * FOREST.radius;
      const x = FOREST.x + Math.cos(a) * d, z = FOREST.z + Math.sin(a) * d, y = this.height(x, z);
      const kind = r() < 0.6 ? 0 : 1, h = 170 + r() * 130, rad = h * 0.05;
      if (y < 6 || y > 220 || list.some((t) => Math.hypot(t.x - x, t.z - z) < (t.r + rad) * 2.2)) continue;
      list.push({ x, z, y, h, r: rad, kind, rot: r() * Math.PI * 2, tint: 0.85 + r() * 0.3 });
    }
    return this.forest = list;
  }
  /** Tronc d'arbre géant touché par une sphère (utilisé par les avions et le géant). */
  hitsTree(p: THREE.Vector3, radius: number) {
    if (Math.hypot(p.x - FOREST.x, p.z - FOREST.z) > FOREST.radius + 100) return null;
    for (const t of this.trees) {
      const dx = p.x - t.x, dz = p.z - t.z;
      const f = Math.max(0, Math.min(1, (p.y - t.y) / t.h));
      const trunk = t.r * (1.25 - f * 0.55) + radius;
      if (p.y < t.y - radius || p.y > t.y + t.h * 1.05) continue;
      // couronne : large au milieu du feuillage, tronc seul en bas
      const crown = f > 0.3 ? t.r * (t.kind === 0 ? 7.5 * (1 - f) + 1 : 6.5 * Math.sin(Math.min(1, (f - 0.3) / 0.7) * Math.PI) + 1) + radius : 0;
      if (dx * dx + dz * dz < Math.max(trunk, crown) ** 2) return t;
    }
    return null;
  }
  /** Hauteur du toit d'un bâtiment sous (x, z), ou -Infinity. */
  buildingTop(x: number, z: number) {
    if (Math.abs(x) > 1000 || Math.abs(z) > 1000) return -Infinity;
    const cx = Math.round(x / 150), cz = Math.round(z / 150);
    for (let ix = cx - 1; ix <= cx + 1; ix++) for (let iz = cz - 1; iz <= cz + 1; iz++) {
      const b = buildingAtCell(ix, iz);
      if (b && Math.abs(x - b.x) < b.width / 2 && Math.abs(z - b.z) < b.depth / 2) return 25 + b.height;
    }
    return -Infinity;
  }
  collidesWithBuilding(position: THREE.Vector3, radius: number) {
    if (Math.abs(position.x) > 950 || Math.abs(position.z) > 950) return false;
    for (let ix = -5; ix <= 5; ix++) for (let iz = -5; iz <= 5; iz++) {
      const building = buildingAtCell(ix, iz);
      if (!building || position.y + radius < 25 || position.y - radius > 25 + building.height) continue;
      const dx = Math.max(Math.abs(position.x - building.x) - building.width / 2, 0);
      const dz = Math.max(Math.abs(position.z - building.z) - building.depth / 2, 0);
      if (dx * dx + dz * dz < radius * radius) return true;
    }
    return false;
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
    this.addRunway();
    buildForest(t, scene);
    this.addClouds(t.seed);
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
      const buildingData = buildingAtCell(ix, iz);
      const x = buildingData?.x ?? ix * 150 + ((ix * 37 + iz * 19) % 23);
      const z = buildingData?.z ?? iz * 150 + ((iz * 29 + ix * 11) % 23);
      if (!buildingData) {
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
      const { width, depth, height } = buildingData;
      const floors = height / 8;
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
  private addRunway() {
    const g = new THREE.Group(), len = RUNWAY.z1 - RUNWAY.z0, cz = (RUNWAY.z0 + RUNWAY.z1) / 2, y = RUNWAY.y;
    const asphalt = new THREE.MeshLambertMaterial({ color: 0x2b2f34 }), white = new THREE.MeshLambertMaterial({ color: 0xf2f2f2 });
    const apron = new THREE.Mesh(new THREE.PlaneGeometry(RUNWAY.halfWidth * 2 + 12, len + 24).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x555a60 }));
    apron.position.set(RUNWAY.x, y + 0.15, cz); g.add(apron);
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(RUNWAY.halfWidth * 2, len).rotateX(-Math.PI / 2), asphalt);
    strip.position.set(RUNWAY.x, y + 0.3, cz); g.add(strip);
    const add = (w: number, d: number, x: number, z: number, mat = white) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), mat); m.position.set(x, y + 0.45, z); g.add(m);
    };
    for (let z = RUNWAY.z0 + 120; z < RUNWAY.z1 - 100; z += 50) add(2, 24, RUNWAY.x, z);
    for (const side of [-1, 1]) {
      add(1.2, len - 4, RUNWAY.x + side * (RUNWAY.halfWidth - 2), cz);
      for (const end of [RUNWAY.z0 + 30, RUNWAY.z1 - 30]) for (let i = 0; i < 5; i++) add(2.2, 36, RUNWAY.x + side * (4 + i * 3.4), end);
    }
    const lights = new THREE.InstancedMesh(new THREE.SphereGeometry(0.9, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffd36b }), 2 * Math.floor(len / 40));
    const m4 = new THREE.Matrix4();
    for (let i = 0, n = 0; i < Math.floor(len / 40); i++) for (const side of [-1, 1]) lights.setMatrixAt(n++, m4.makeTranslation(RUNWAY.x + side * (RUNWAY.halfWidth + 3), y + 0.8, RUNWAY.z0 + 20 + i * 40));
    g.add(lights);
    // tour de contrôle et hangar
    const tower = new THREE.Mesh(new THREE.BoxGeometry(10, 36, 10), new THREE.MeshLambertMaterial({ color: 0xc9c9c4 })); tower.position.set(RUNWAY.x + 85, y + 18, cz - 100);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(18, 8, 18), new THREE.MeshLambertMaterial({ color: 0x5aa2c8, emissive: 0x1a3a50 })); cab.position.set(RUNWAY.x + 85, y + 40, cz - 100);
    const hangar = new THREE.Mesh(new THREE.BoxGeometry(60, 22, 70), new THREE.MeshLambertMaterial({ color: 0x8a8f98 })); hangar.position.set(RUNWAY.x + 130, y + 11, cz + 140);
    const hangarRoof = new THREE.Mesh(new THREE.BoxGeometry(64, 3, 74), new THREE.MeshLambertMaterial({ color: 0x3a3f45 })); hangarRoof.position.set(RUNWAY.x + 130, y + 23.5, cz + 140);
    g.add(hangarRoof);
    g.add(tower, cab, hangar);
    this.group.add(g);
  }
  private addClouds(seed: number) {
    const random = mulberry32(seed ^ 0x5f3759df);
    const cloudMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.82 });
    for (let i = 0; i < 90; i++) {
      const cloud = new THREE.Group();
      const count = 3 + Math.floor(random() * 4);
      for (let j = 0; j < count; j++) {
        const puff = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), cloudMaterial);
        puff.scale.set(35 + random() * 45, 12 + random() * 14, 24 + random() * 35);
        puff.position.set((random() - 0.5) * 90, (random() - 0.5) * 12, (random() - 0.5) * 55);
        cloud.add(puff);
      }
      cloud.position.set((random() - 0.5) * 30000, 500 + random() * 500, (random() - 0.5) * 30000);
      this.group.add(cloud);
    }
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
