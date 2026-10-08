import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Terrain } from "./terrain";

// Les arbres sont modélisés à l'échelle 1 = hauteur de l'arbre (rayon du tronc = 0.05).
function part(g: THREE.BufferGeometry, color: number, jitter = 0.06, seed = 1) {
  const geo = g.index ? g.toNonIndexed() : g;
  const pos = geo.attributes.position, col = new Float32Array(pos.count * 3), c = new THREE.Color(color), t = new THREE.Color();
  for (let i = 0; i < pos.count; i += 3) { // une teinte par face → aspect facetté
    const k = 1 + Math.sin((i + seed) * 12.9898) * jitter;
    t.copy(c).multiplyScalar(k);
    for (let j = 0; j < 3; j++) col.set([t.r, t.g, t.b], (i + j) * 3);
  }
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  geo.deleteAttribute("uv");
  return geo;
}

function branch(from: THREE.Vector3, to: THREE.Vector3, r0: number, r1: number, color: number) {
  const len = from.distanceTo(to);
  const g = new THREE.CylinderGeometry(r1, r0, len, 6);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize()));
  g.translate((from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2);
  return part(g, color, 0.08, len * 100);
}

function barkAndRoots(parts: THREE.BufferGeometry[], trunkTop: number) {
  const bark = 0x5b3f26, dark = 0x3f2b19;
  parts.push(part(new THREE.CylinderGeometry(0.03, 0.062, trunkTop, 10, 4).translate(0, trunkTop / 2, 0), bark, 0.12, 3));
  parts.push(part(new THREE.CylinderGeometry(0.06, 0.12, 0.05, 10).translate(0, 0.022, 0), dark, 0.1, 9)); // empattement
  for (let i = 0; i < 6; i++) { // grosses racines
    const a = (i / 6) * Math.PI * 2 + 0.3;
    parts.push(branch(new THREE.Vector3(Math.cos(a) * 0.04, 0.06, Math.sin(a) * 0.04), new THREE.Vector3(Math.cos(a) * 0.16, 0, Math.sin(a) * 0.16), 0.022, 0.008, dark));
  }
  for (let i = 0; i < 5; i++) { // nœuds et écorce en relief
    const y = 0.1 + i * 0.13, a = i * 2.4;
    parts.push(part(new THREE.IcosahedronGeometry(0.02, 0).translate(Math.cos(a) * 0.052, y, Math.sin(a) * 0.052), dark, 0.1, i));
  }
}

function conifer() {
  const parts: THREE.BufferGeometry[] = [];
  barkAndRoots(parts, 0.98);
  const greens = [0x1f5a2b, 0x2a6e34, 0x245f2e, 0x33783a];
  for (let i = 0; i < 9; i++) {
    const f = 0.24 + i * 0.085, radius = 0.4 * (1 - (f - 0.2) / 0.85) + 0.03;
    parts.push(part(new THREE.ConeGeometry(radius, 0.2, 9).translate(0, f + 0.07, 0).rotateY(i * 0.7), greens[i % 4], 0.08, i * 7));
    for (let j = 0; j < 4; j++) { // branches inférieures visibles sous chaque étage
      const a = i * 1.1 + (j / 4) * Math.PI * 2;
      parts.push(branch(new THREE.Vector3(0, f, 0), new THREE.Vector3(Math.cos(a) * radius * 0.8, f - 0.03, Math.sin(a) * radius * 0.8), 0.012, 0.004, 0x4a3320));
    }
  }
  parts.push(part(new THREE.ConeGeometry(0.035, 0.12, 6).translate(0, 1.05, 0), 0x3d8c42));
  return mergeGeometries(parts)!;
}

function broadleaf() {
  const parts: THREE.BufferGeometry[] = [];
  barkAndRoots(parts, 0.55);
  const top = new THREE.Vector3(0, 0.55, 0), greens = [0x3f8a35, 0x4c9a3c, 0x356f2e, 0x5aa044];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2, tip = new THREE.Vector3(Math.cos(a) * 0.24, 0.72 + (i % 2) * 0.08, Math.sin(a) * 0.24);
    parts.push(branch(top, tip, 0.02, 0.008, 0x4e3622));
    parts.push(part(new THREE.IcosahedronGeometry(0.15 + (i % 3) * 0.02, 1).translate(tip.x, tip.y + 0.06, tip.z), greens[i % 4], 0.1, i * 5));
    parts.push(part(new THREE.IcosahedronGeometry(0.1, 1).translate(tip.x * 1.5, tip.y - 0.05, tip.z * 1.5), greens[(i + 1) % 4], 0.1, i * 3));
  }
  parts.push(part(new THREE.IcosahedronGeometry(0.22, 1).translate(0, 0.86, 0), greens[1], 0.1, 77));
  parts.push(part(new THREE.IcosahedronGeometry(0.15, 1).translate(0.04, 1, -0.02), greens[3], 0.1, 88));
  return mergeGeometries(parts)!;
}

export function buildForest(terrain: Terrain, scene: THREE.Scene) {
  const group = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const trees = terrain.trees, geos = [conifer(), broadleaf()];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), c = new THREE.Color();
  geos.forEach((geo, kind) => {
    const list = trees.filter((t) => t.kind === kind);
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((t, i) => {
      q.setFromAxisAngle(up, t.rot);
      m.compose(new THREE.Vector3(t.x, t.y - 1, t.z), q, new THREE.Vector3(t.h, t.h, t.h));
      mesh.setMatrixAt(i, m); mesh.setColorAt(i, c.setScalar(t.tint));
    });
    mesh.frustumCulled = false; group.add(mesh);
  });
  // sous-bois : buissons et rochers couverts de mousse
  const random = (() => { let a = terrain.seed ^ 0xbeef; return () => { a = (Math.imul(a, 1664525) + 1013904223) | 0; return (a >>> 0) / 4294967296; }; })();
  const bushGeo = mergeGeometries([
    part(new THREE.IcosahedronGeometry(1, 1), 0x2f6b2c, 0.12, 1),
    part(new THREE.IcosahedronGeometry(0.7, 1).translate(1, -0.2, 0.4), 0x3c8035, 0.12, 2),
    part(new THREE.IcosahedronGeometry(0.6, 1).translate(-0.9, -0.3, -0.5), 0x285c27, 0.12, 3),
  ])!;
  const rockGeo = mergeGeometries([part(new THREE.DodecahedronGeometry(1, 0).scale(1.3, 0.8, 1), 0x77756f, 0.15, 4),
    part(new THREE.DodecahedronGeometry(0.5, 0).translate(0.9, -0.2, 0.3), 0x66645e, 0.15, 5)])!;
  const bushes = new THREE.InstancedMesh(bushGeo, mat, 1100), rocks = new THREE.InstancedMesh(rockGeo, mat, 260);
  let nb = 0, nr = 0;
  const s = new THREE.Vector3(), p = new THREE.Vector3(), forestPos = (rad: number) => {
    const a = random() * Math.PI * 2, d = Math.sqrt(random()) * rad;
    return [-2600 + Math.cos(a) * d, 600 + Math.sin(a) * d] as const;
  };
  for (let i = 0; i < 4000 && (nb < 1100 || nr < 260); i++) {
    const [x, z] = forestPos(1500), y = terrain.height(x, z);
    if (y < 4 || y > 230) continue;
    q.setFromAxisAngle(up, random() * 6.28);
    if (nb < 1100 && i % 4 !== 0) { const k = 6 + random() * 14; m.compose(p.set(x, y + k * 0.3, z), q, s.set(k, k * 0.8, k)); bushes.setMatrixAt(nb, m); bushes.setColorAt(nb++, c.setScalar(0.8 + random() * 0.4)); }
    else if (nr < 260) { const k = 5 + random() * 22; m.compose(p.set(x, y + k * 0.2, z), q, s.set(k, k, k)); rocks.setMatrixAt(nr, m); rocks.setColorAt(nr++, c.setScalar(0.85 + random() * 0.3)); }
  }
  bushes.count = nb; rocks.count = nr;
  bushes.frustumCulled = rocks.frustumCulled = false;
  group.add(bushes, rocks);
  scene.add(group);
  return group;
}
