import * as THREE from "three";

export const GIANT_HEIGHT = 90;

export interface GiantParts {
  hips: THREE.Group; legL: THREE.Group; legR: THREE.Group; kneeL: THREE.Group; kneeR: THREE.Group;
  armL: THREE.Group; armR: THREE.Group; elbowL: THREE.Group; elbowR: THREE.Group; head: THREE.Group; jaw: THREE.Group;
  launcher: THREE.Group; swatter: THREE.Group; tail: THREE.Group;
}

const mesh = (g: THREE.BufferGeometry, m: THREE.Material) => { const o = new THREE.Mesh(g, m); return o; };

/** Monstre géant (≈ 90 m). L'origine du groupe est située aux pieds, il regarde vers -Z. */
export function makeGiant(color: number) {
  const root = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color, flatShading: true });
  const skinDark = new THREE.MeshLambertMaterial({ color: new THREE.Color(color).multiplyScalar(0.55), flatShading: true });
  const belly = new THREE.MeshLambertMaterial({ color: new THREE.Color(color).lerp(new THREE.Color(0xffe9b8), 0.55), flatShading: true });
  const bone = new THREE.MeshLambertMaterial({ color: 0xece3c9, flatShading: true });
  const metal = new THREE.MeshLambertMaterial({ color: 0x59636d, flatShading: true });
  const metalDark = new THREE.MeshLambertMaterial({ color: 0x2c3238, flatShading: true });
  const red = new THREE.MeshLambertMaterial({ color: 0xc9302c, flatShading: true });
  const eye = new THREE.MeshBasicMaterial({ color: 0xffe14a });
  const mouth = new THREE.MeshLambertMaterial({ color: 0x5a1620, flatShading: true });
  const at = <T extends THREE.Object3D>(o: T, x: number, y: number, z: number) => { o.position.set(x, y, z); return o; };

  const hips = new THREE.Group(); hips.position.y = 42; root.add(hips);
  hips.add(at(mesh(new THREE.BoxGeometry(18, 9, 12), skinDark), 0, 0, 0));

  // jambes : cuisse -> genou -> mollet -> pied à 3 orteils
  const makeLeg = (side: number) => {
    const leg = new THREE.Group(); leg.position.set(side * 7, -2, 0); hips.add(leg);
    leg.add(at(mesh(new THREE.CylinderGeometry(5.2, 3.8, 20, 8).translate(0, -10, 0), skin), 0, 0, 0));
    leg.add(at(mesh(new THREE.SphereGeometry(5.6, 8, 6), skin), 0, 0, 0));
    const knee = new THREE.Group(); knee.position.set(0, -20, 0); leg.add(knee);
    knee.add(mesh(new THREE.SphereGeometry(4.2, 8, 6), skinDark));
    knee.add(at(mesh(new THREE.CylinderGeometry(3.6, 2.6, 18, 8).translate(0, -9, 0), skin), 0, 0, 1.5));
    const foot = new THREE.Group(); foot.position.set(0, -18, 1.5); knee.add(foot);
    foot.add(at(mesh(new THREE.BoxGeometry(7, 3.2, 10), skinDark), 0, -0.6, -2));
    for (let t = -1; t <= 1; t++) {
      foot.add(at(mesh(new THREE.BoxGeometry(2.2, 2.2, 5), skin), t * 2.4, -0.8, -8.5));
      foot.add(at(mesh(new THREE.ConeGeometry(0.9, 2.6, 5).rotateX(-Math.PI / 2), bone), t * 2.4, -0.8, -12));
    }
    return { leg, knee };
  };
  const L = makeLeg(-1), R = makeLeg(1);

  // buste
  const torso = new THREE.Group(); torso.position.y = 5; hips.add(torso);
  torso.add(at(mesh(new THREE.CylinderGeometry(15, 11, 22, 10).translate(0, 11, 0), skin), 0, 0, 0));
  torso.add(at(mesh(new THREE.BoxGeometry(18, 20, 4), belly), 0, 11, -9.5)); // ventre clair
  for (let i = 0; i < 4; i++) torso.add(at(mesh(new THREE.BoxGeometry(17 - i, 1.2, 4.4), skinDark), 0, 4 + i * 5, -9.7)); // sillons
  torso.add(at(mesh(new THREE.CylinderGeometry(19, 15, 12, 10).translate(0, 6, 0), skin), 0, 20, 0)); // poitrail
  for (let i = 0; i < 6; i++) { // crête dorsale
    const spike = mesh(new THREE.ConeGeometry(2.8 - i * 0.2, 9 - i * 0.6, 5), bone);
    spike.position.set(0, 4 + i * 5.3, 11 - i * 0.4); spike.rotation.x = Math.PI / 2 + 0.5; torso.add(spike);
  }
  // queue
  const tail = new THREE.Group(); tail.position.set(0, -2, 5); hips.add(tail);
  for (let i = 0; i < 5; i++) {
    const seg = mesh(new THREE.CylinderGeometry(4.2 - i * 0.7, 4.8 - i * 0.7, 9, 7).rotateX(Math.PI / 2), i % 2 ? skin : skinDark);
    seg.position.set(0, -i * 0.9, 6 + i * 8); tail.add(seg);
    tail.add(at(mesh(new THREE.ConeGeometry(1.6 - i * 0.2, 5, 5), bone), 0, 3.4 - i * 0.8, 6 + i * 8));
  }

  // tête
  const neck = new THREE.Group(); neck.position.set(0, 30, -1); torso.add(neck);
  neck.add(at(mesh(new THREE.CylinderGeometry(5, 7, 7, 8).translate(0, 2, 0), skin), 0, 0, 0));
  const head = new THREE.Group(); head.position.set(0, 7, -2); neck.add(head);
  head.add(at(mesh(new THREE.BoxGeometry(13, 10, 14), skin), 0, 2, -3));
  head.add(at(mesh(new THREE.BoxGeometry(11, 5, 9), skinDark), 0, 0, -12)); // museau
  head.add(at(mesh(new THREE.SphereGeometry(0.9, 6, 4), metalDark), -2.5, 1.5, -16.6));
  head.add(at(mesh(new THREE.SphereGeometry(0.9, 6, 4), metalDark), 2.5, 1.5, -16.6));
  const jaw = new THREE.Group(); jaw.position.set(0, -2.5, -6); head.add(jaw);
  jaw.add(at(mesh(new THREE.BoxGeometry(11, 3, 11), skinDark), 0, -1, -5));
  jaw.add(at(mesh(new THREE.BoxGeometry(9.4, 1, 9), mouth), 0, 0.7, -5));
  for (let i = 0; i < 5; i++) {
    const x = -4.4 + i * 2.2;
    jaw.add(at(mesh(new THREE.ConeGeometry(0.7, 2.6, 5), bone), x, 2, -9.8));
    head.add(at(mesh(new THREE.ConeGeometry(0.7, 2.6, 5).rotateX(Math.PI), bone), x, -2.4, -16.4 + 0));
  }
  for (const s of [-1, 1]) {
    head.add(at(mesh(new THREE.SphereGeometry(2.1, 8, 6), eye), s * 4.6, 5.2, -9));
    head.add(at(mesh(new THREE.BoxGeometry(5, 1, 2), skinDark), s * 4.6, 7.4, -9.6)); // arcade sourcilière
    const horn = mesh(new THREE.ConeGeometry(2, 14, 6), bone); horn.position.set(s * 6.5, 11, -1); horn.rotation.set(-0.3, 0, -s * 0.6); head.add(horn);
    head.add(at(mesh(new THREE.ConeGeometry(1.4, 8, 5).rotateZ(s * Math.PI / 2), bone), s * 7.5, 0, -2));
  }

  // bras : épaule (pointes) -> coude -> main à 3 doigts
  const makeArm = (side: number) => {
    const arm = new THREE.Group(); arm.position.set(side * 20, 24, 0); torso.add(arm);
    arm.add(at(mesh(new THREE.SphereGeometry(7, 8, 6), skinDark), 0, 0, 0));
    arm.add(at(mesh(new THREE.ConeGeometry(2.2, 8, 5), bone), side * 3, 6, 0));
    arm.add(at(mesh(new THREE.CylinderGeometry(4.4, 3.4, 17, 8).translate(0, -8.5, 0), skin), 0, 0, 0));
    const elbow = new THREE.Group(); elbow.position.set(0, -17, 0); arm.add(elbow);
    elbow.add(mesh(new THREE.SphereGeometry(3.7, 8, 6), skinDark));
    elbow.add(at(mesh(new THREE.CylinderGeometry(3.4, 2.7, 16, 8).translate(0, -8, 0), skin), 0, 0, 0));
    const hand = new THREE.Group(); hand.position.set(0, -17, 0); elbow.add(hand);
    hand.add(mesh(new THREE.BoxGeometry(6, 5, 5), skinDark));
    for (let f = -1; f <= 1; f++) {
      hand.add(at(mesh(new THREE.BoxGeometry(1.6, 4.4, 1.8), skin), f * 2, -4.6, -1));
      hand.add(at(mesh(new THREE.ConeGeometry(0.8, 2.2, 4).rotateX(Math.PI), bone), f * 2, -7.6, -1));
    }
    return { arm, elbow, hand };
  };
  const AL = makeArm(-1), AR = makeArm(1);
  AL.arm.rotation.x = 2.3; AR.arm.rotation.x = 1.35;

  // lance-roquettes (main droite) : tube, évasement, viseur, ailerons, ogive
  const launcher = new THREE.Group(); launcher.name = "launcher";
  launcher.add(at(mesh(new THREE.CylinderGeometry(3, 3, 30, 12).rotateX(Math.PI / 2), metal), 0, 0, -6));
  launcher.add(at(mesh(new THREE.CylinderGeometry(3.9, 3, 5, 12).rotateX(Math.PI / 2), metalDark), 0, 0, -22));
  launcher.add(at(mesh(new THREE.CylinderGeometry(3.8, 3, 4, 12).rotateX(Math.PI / 2), metalDark), 0, 0, 10));
  launcher.add(at(mesh(new THREE.BoxGeometry(1, 2.5, 8), metalDark), 0, 4.4, -6)); // viseur
  launcher.add(at(mesh(new THREE.BoxGeometry(1.4, 5, 4), metalDark), 0, -4.6, -2)); // poignée
  for (let i = 0; i < 4; i++) { // roquette visible dans le tube
    const fin = mesh(new THREE.BoxGeometry(0.4, 3, 2), red); fin.rotation.z = (i * Math.PI) / 2; fin.position.set(0, 0, 8); launcher.add(fin);
  }
  launcher.add(at(mesh(new THREE.ConeGeometry(2.4, 5, 10).rotateX(-Math.PI / 2), red), 0, 0, -26));
    AR.elbow.add(launcher); launcher.position.set(0, -17, 0);
  launcher.rotation.set(-Math.PI / 2, 0, 0); // le tube prolonge l'avant-bras

  // tapette à mouches géante (main gauche) : long manche, cadre et grille en plastique
  const swatter = new THREE.Group(); swatter.name = "swatter";
  swatter.add(at(mesh(new THREE.CylinderGeometry(1.1, 1.3, 46, 8), red), 0, 22, 0));
  swatter.add(at(mesh(new THREE.CylinderGeometry(1.6, 1.6, 8, 8), metalDark), 0, 0, 0));
  const frame = new THREE.MeshLambertMaterial({ color: 0xf0c419, flatShading: true });
  const netMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, side: THREE.DoubleSide });
  const W = 30, H = 36, HY = 66;
  swatter.add(at(mesh(new THREE.BoxGeometry(W, H, 1.2), netMat), 0, HY, 0));
  for (const s of [-1, 1]) {
    swatter.add(at(mesh(new THREE.BoxGeometry(2.2, H + 2, 2.6), frame), s * (W / 2), HY, 0));
    swatter.add(at(mesh(new THREE.BoxGeometry(W + 2, 2.2, 2.6), frame), 0, HY + s * (H / 2), 0));
  }
  for (let i = -3; i <= 3; i++) {
    swatter.add(at(mesh(new THREE.BoxGeometry(0.7, H, 1.6), frame), (i * W) / 8, HY, 0));
    swatter.add(at(mesh(new THREE.BoxGeometry(W, 0.7, 1.6), frame), 0, HY + (i * H) / 8, 0));
  }
  AL.elbow.add(swatter); swatter.position.set(0, -17, 0);
  swatter.rotation.x = Math.PI; // le manche prolonge l'avant-bras

  swatter.visible = false;
  root.userData.parts = { hips, legL: L.leg, legR: R.leg, kneeL: L.knee, kneeR: R.knee, armL: AL.arm, armR: AR.arm, elbowL: AL.elbow, elbowR: AR.elbow, head, jaw, launcher, swatter, tail } as GiantParts;
  root.userData.phase = 0; root.userData.swing = 0; root.userData.recoil = 0;
  return root;
}

export function giantParts(g: THREE.Object3D) { return g.userData.parts as GiantParts; }
export function giantUsesWeapon(g: THREE.Object3D, weapon: "grocket" | "swat") {
  const p = giantParts(g); p.launcher.visible = weapon === "grocket"; p.swatter.visible = weapon === "swat";
}
export function giantStartSwing(g: THREE.Object3D) { g.userData.swing = 0.0001; }
export function giantRecoil(g: THREE.Object3D) { g.userData.recoil = 1; }

/** Animation procédurale : marche selon la vitesse au sol, balancement de la tapette, recul du lance-roquettes. */
export function animateGiant(g: THREE.Object3D, dt: number, groundSpeed: number, airborne: boolean) {
  const p = giantParts(g), u = g.userData;
  const walk = airborne ? 0 : Math.min(1, groundSpeed / 40);
  u.phase += dt * (3 + groundSpeed * 0.12) * (walk > 0.02 ? 1 : 0);
  const s = Math.sin(u.phase) * walk, c = Math.cos(u.phase) * walk;
  const k = Math.min(1, dt * 12);
  const ease = (o: THREE.Object3D, x: number) => { o.rotation.x += (x - o.rotation.x) * k; };
  ease(p.legL, airborne ? -0.5 : s * 0.7); ease(p.legR, airborne ? 0.3 : -s * 0.7);
  ease(p.kneeL, airborne ? 0.9 : Math.max(0, -c) * 0.8); ease(p.kneeR, airborne ? 0.4 : Math.max(0, c) * 0.8);
  p.hips.position.y = 42 + (airborne ? 0 : Math.abs(s) * 1.6);
  p.tail.rotation.y = s * 0.25;
  p.jaw.rotation.x = airborne ? 0.35 : Math.max(0, Math.sin(u.phase * 0.5) * 0.12 * walk);
  let swingA = 0;
  if (u.swing > 0) { u.swing += dt / 0.45; if (u.swing >= 1) u.swing = 0; else swingA = u.swing; }
  u.recoil = Math.max(0, u.recoil - dt * 5);
  ease(p.armR, 1.35 + u.recoil * 0.3 + (airborne ? 0.15 : 0)); ease(p.elbowR, 0);
  // la tapette se lève derrière la tête puis s'abat vers l'avant
  if (swingA > 0) p.armL.rotation.x = swingA < 0.4 ? 2.3 + (swingA / 0.4) * 0.7 : 3 - ((swingA - 0.4) / 0.6) * 2;
  else ease(p.armL, 2.3 + (airborne ? 0.2 : s * 0.1));
  ease(p.elbowL, 0);
  p.launcher.position.y = -17 + u.recoil * 2.5;
}
