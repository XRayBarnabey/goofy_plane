import * as THREE from "three";

export function makePlane(color: number) {
  const g = new THREE.Group();
  const m = new THREE.MeshLambertMaterial({ color, flatShading: true });
  const w = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.4, 7, 8).rotateX(Math.PI / 2), m);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.7, 1.5, 8).rotateX(-Math.PI / 2), w);
  nose.position.z = -4.2;
  const wing = new THREE.Mesh(new THREE.BoxGeometry(11, 0.15, 1.8), w); wing.position.z = -0.5;
  const tail = new THREE.Mesh(new THREE.BoxGeometry(4, 0.15, 1), w); tail.position.z = 3;
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.6, 1.2), m); fin.position.set(0, 0.8, 3);
  const prop = new THREE.Mesh(new THREE.BoxGeometry(3, 0.2, 0.1), new THREE.MeshBasicMaterial({ color: 0x222222 }));
  prop.position.z = -5; prop.name = "prop";
  g.add(body, nose, wing, tail, fin, prop);
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
