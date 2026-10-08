import * as THREE from "three";

export function makePlane(color: number, model = 0) {
  const g = new THREE.Group();
  const m = new THREE.MeshLambertMaterial({ color, flatShading: true });
  const w = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
  const dark = new THREE.MeshLambertMaterial({ color: 0x35424c, flatShading: true });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.4, 7, 8).rotateX(Math.PI / 2), m);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.7, 1.5, 8).rotateX(-Math.PI / 2), w);
  nose.position.z = -4.2;
  const wing = new THREE.Mesh(new THREE.BoxGeometry(model === 2 ? 18 : 11, 0.15, model === 2 ? 2.4 : 1.8), w); wing.position.z = -0.5;
  const tail = new THREE.Mesh(new THREE.BoxGeometry(4, 0.15, 1), w); tail.position.z = 3;
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.6, 1.2), m); fin.position.set(0, 0.8, 3);
  const prop = new THREE.Mesh(new THREE.BoxGeometry(3, 0.2, 0.1), new THREE.MeshBasicMaterial({ color: 0x222222 }));
  prop.position.z = -5; prop.name = "prop";
  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.62, 10, 8), new THREE.MeshLambertMaterial({ color: 0x86d5ed }));
  cockpit.scale.set(0.8, 0.65, 1.5); cockpit.position.set(0, 0.52, -1.1); cockpit.name = "cockpit";
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(11.2, 0.17, 0.4), m); stripe.position.z = -0.1;
  g.add(body, nose, wing, tail, fin, prop, cockpit, stripe);
  if (model > 0) {
    const engineCount = model === 1 ? 2 : 4;
    for (let i = 0; i < engineCount; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const row = Math.floor(i / 2);
      const engine = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.52, 2.8, 10).rotateX(Math.PI / 2), dark);
      engine.position.set(side * (model === 1 ? 2.3 : 3.1 + row * 1.25), -0.12, 0.1 + row * 1.4);
      g.add(engine);
    }
    g.scale.setScalar(model === 1 ? 1.25 : 1.55);
  }
  return g;
}

export function makeLabel(text: string) {
  const c = document.createElement("canvas"); c.width = 256; c.height = 64;
  const x = c.getContext("2d")!; x.font = "bold 36px sans-serif"; x.textAlign = "center";
  x.fillStyle = "#fff"; x.strokeStyle = "#000"; x.lineWidth = 5;
  x.strokeText(text, 128, 44); x.fillText(text, 128, 44);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false }));
  s.scale.set(16, 4, 1); s.position.y = 5;
  return s;
}

const TRAIL_POINTS = 40, TRAIL_STEP = 0.04;
export class Trail {
  line: THREE.Line;
  private pts: THREE.Vector3[] = [];
  private acc = 0;
  private base: THREE.Color;
  private sky = new THREE.Color(0x87ceeb);
  private pos = new Float32Array(TRAIL_POINTS * 3);
  private col = new Float32Array(TRAIL_POINTS * 3);
  constructor(color: number) {
    this.base = new THREE.Color(color);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(this.col, 3));
    g.setDrawRange(0, 0);
    this.line = new THREE.Line(g, new THREE.LineBasicMaterial({ vertexColors: true }));
    this.line.frustumCulled = false;
  }
  setColor(color: number) { this.base.set(color); }
  reset() { this.pts.length = 0; this.line.geometry.setDrawRange(0, 0); }
  update(dt: number, source: THREE.Object3D, local: THREE.Vector3) {
    this.acc += dt;
    if (this.acc < TRAIL_STEP) return;
    this.acc = 0;
    const p = local.clone().multiply(source.scale).applyQuaternion(source.quaternion).add(source.position);
    const last = this.pts[0];
    if (last && last.distanceTo(p) > 300) this.pts.length = 0;
    this.pts.unshift(p);
    if (this.pts.length > TRAIL_POINTS) this.pts.pop();
    const n = this.pts.length, c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      this.pts[i].toArray(this.pos, i * 3);
      c.copy(this.base).lerp(this.sky, i / TRAIL_POINTS);
      c.toArray(this.col, i * 3);
    }
    const g = this.line.geometry;
    g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true;
    g.setDrawRange(0, n);
  }
  dispose() { this.line.removeFromParent(); this.line.geometry.dispose(); (this.line.material as THREE.Material).dispose(); }
}
