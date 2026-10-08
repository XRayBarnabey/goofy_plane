import * as THREE from "three";
import { Terrain, TerrainView } from "./terrain";
import { makePlane, makeLabel } from "./plane";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.Fog(0x87ceeb, 1500, 6000);
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 1, 12000);
scene.add(new THREE.HemisphereLight(0xffffff, 0x445522, 1.0));
const sun = new THREE.DirectionalLight(0xffffff, 1.5); sun.position.set(1, 2, 1); scene.add(sun);
addEventListener("resize", () => {
  renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
});

let terrain: Terrain | null = null, tview: TerrainView | null = null;
let ws: WebSocket | null = null, myId = -1;
const me = makePlane(0xe53935); scene.add(me);
const vel = { speed: 55, throttle: 0.5 };
let hp = 100, kills = 0, deaths = 0, crashedUntil = 0;
interface Remote { mesh: THREE.Group; tp: THREE.Vector3; tq: THREE.Quaternion; name: string; label: THREE.Sprite }
const remotes = new Map<number, Remote>();
const names = new Map<number, string>();
const keys = new Set<string>();
const tracers: { m: THREE.Mesh; life: number; v: THREE.Vector3 }[] = [];

function respawn() {
  const x = (Math.random() - 0.5) * 2000, z = (Math.random() - 0.5) * 2000;
  me.position.set(x, Math.max(terrain?.height(x, z) ?? 0, 0) + 250, z);
  me.quaternion.identity(); vel.speed = 55; vel.throttle = 0.5; hp = 100;
}
function feed(text: string) {
  const d = document.createElement("div"); d.textContent = text; $("feed").append(d);
  setTimeout(() => d.remove(), 8000);
}
function shoot(o: THREE.Vector3, d: THREE.Vector3) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.6), new THREE.MeshBasicMaterial({ color: 0xffee55 }));
  m.position.copy(o); scene.add(m); tracers.push({ m, life: 1.5, v: d.clone().multiplyScalar(400) });
}

function connect(name: string) {
  ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`);
  ws.onopen = () => ws!.send(JSON.stringify({ t: "name", name }));
  ws.onclose = () => feed("Déconnecté du serveur");
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    switch (m.t) {
      case "welcome":
        myId = m.id; terrain = new Terrain(m.seed); tview = new TerrainView(terrain, scene); respawn(); break;
      case "join": names.set(m.id, m.name); { const r = remotes.get(m.id); if (r) setName(r, m.name); } break;
      case "leave": { const r = remotes.get(m.id); if (r) { scene.remove(r.mesh); remotes.delete(m.id); } names.delete(m.id); } break;
      case "chat": feed(`${m.name}: ${m.text}`); break;
      case "shot": if (m.id !== myId) shoot(new THREE.Vector3(...(m.o as [number, number, number])), new THREE.Vector3(...(m.d as [number, number, number]))); break;
      case "hit": hp = m.hp; break;
      case "kill":
        feed(`💥 ${m.killer} a abattu ${m.victim}`);
        if (m.victimId === myId) { deaths++; respawn(); }
        break;
      case "full": alert("Serveur plein"); break;
      case "snap": {
        const rows: string[] = [];
        for (const p of m.players) {
          if (p.id === myId) { kills = p.k; deaths = p.d; }
          rows.push(`${p.n} ${p.k}/${p.d}`);
          if (p.id === myId) continue;
          let r = remotes.get(p.id);
          if (!r) {
            const mesh = makePlane(0x1e88e5); scene.add(mesh);
            r = { mesh, tp: new THREE.Vector3(), tq: new THREE.Quaternion(), name: "", label: null as any };
            setName(r, names.get(p.id) ?? p.n); remotes.set(p.id, r);
            mesh.position.set(p.p[0], p.p[1], p.p[2]);
          }
          r.tp.set(p.p[0], p.p[1], p.p[2]); r.tq.set(p.q[0], p.q[1], p.q[2], p.q[3]);
        }
        $("board").textContent = "Joueurs (K/D)\n" + rows.join("\n");
        break;
      }
    }
  };
}
function setName(r: Remote, name: string) {
  if (r.label) r.mesh.remove(r.label);
  r.name = name; r.label = makeLabel(name); r.mesh.add(r.label);
}

const chat = $<HTMLInputElement>("chat");
addEventListener("keydown", (e) => {
  if (document.activeElement === chat) {
    if (e.key === "Enter") { if (chat.value) ws?.send(JSON.stringify({ t: "chat", text: chat.value })); chat.value = ""; chat.style.display = "none"; chat.blur(); }
    return;
  }
  if (e.key === "Enter" && terrain) { chat.style.display = "block"; chat.focus(); e.preventDefault(); return; }
  keys.add(e.code); if (e.code === "Space") e.preventDefault();
});
addEventListener("keyup", (e) => keys.delete(e.code));
const k = (...c: string[]) => c.some((x) => keys.has(x));

$("play").onclick = () => {
  const name = $<HTMLInputElement>("name").value.trim() || "Pilote";
  $("menu").style.display = "none"; connect(name);
};

const clock = new THREE.Clock(); let sendT = 0, shootT = 0;
const fwd = new THREE.Vector3(), tmp = new THREE.Vector3(), camPos = new THREE.Vector3();
const qd = new THREE.Quaternion(), ax = new THREE.Vector3();
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.1), now = performance.now();
  if (terrain && tview) {
    const rot = (axis: [number, number, number], a: number) => { ax.set(...axis); me.quaternion.multiply(qd.setFromAxisAngle(ax, a)); };
    if (now > crashedUntil) {
      const pitch = k("KeyS", "ArrowDown") ? 1 : k("KeyW", "KeyZ", "ArrowUp") ? -1 : 0;
      const roll = k("KeyD", "ArrowRight") ? -1 : k("KeyQ", "ArrowLeft") ? 1 : 0;
      const yaw = k("KeyA") ? 1 : k("KeyE") ? -1 : 0;
      rot([1, 0, 0], pitch * 1.1 * dt);
      rot([0, 0, 1], roll * 1.8 * dt);
      rot([0, 1, 0], yaw * 0.6 * dt);
      if (k("ShiftLeft", "ShiftRight")) vel.throttle = Math.min(1, vel.throttle + 0.5 * dt);
      if (k("ControlLeft", "ControlRight")) vel.throttle = Math.max(0, vel.throttle - 0.5 * dt);
      fwd.set(0, 0, -1).applyQuaternion(me.quaternion);
      const target = 30 + vel.throttle * 90 - fwd.y * 40;
      vel.speed += (target - vel.speed) * dt * 0.8;
      me.position.addScaledVector(fwd, vel.speed * dt);
      // stall / gravity pull when slow
      if (vel.speed < 38) me.position.y -= (38 - vel.speed) * dt * 1.5;
      me.position.y = Math.min(me.position.y, 1800);
      const ground = Math.max(terrain.height(me.position.x, me.position.z), 0);
      if (me.position.y < ground + 3) {
        feed("💥 Crash !"); ws?.send(JSON.stringify({ t: "died" })); deaths++; respawn(); crashedUntil = now + 500;
      }
      if (k("Space") && now - shootT > 100 && ws?.readyState === 1) {
        shootT = now;
        const o = me.position.clone().addScaledVector(fwd, 6);
        ws.send(JSON.stringify({ t: "shoot", o: o.toArray(), d: fwd.toArray() }));
        shoot(o, fwd.clone());
      }
    }
    (me.getObjectByName("prop") as THREE.Object3D).rotation.z += dt * 40;
    tview.update(me.position.x, me.position.z);
    tmp.set(0, 4, 16).applyQuaternion(me.quaternion).add(me.position);
    camPos.lerp(tmp, Math.min(1, dt * 6)); camera.position.copy(camPos);
    camera.up.set(0, 1, 0).applyQuaternion(me.quaternion); camera.lookAt(me.position.clone().addScaledVector(fwd, 20));
    if (now - sendT > 50 && ws?.readyState === 1) {
      sendT = now;
      ws.send(JSON.stringify({ t: "state", p: me.position.toArray(), q: me.quaternion.toArray() }));
    }
    $("hud").textContent = `Vitesse ${(vel.speed * 3.6) | 0} km/h\nAltitude ${me.position.y | 0} m\nGaz ${(vel.throttle * 100) | 0}%\nPV ${hp}\nKills ${kills}  Morts ${deaths}`;
  }
  for (const r of remotes.values()) { r.mesh.position.lerp(r.tp, Math.min(1, dt * 12)); r.mesh.quaternion.slerp(r.tq, Math.min(1, dt * 12)); }
  for (let i = tracers.length - 1; i >= 0; i--) {
    const t = tracers[i]; t.m.position.addScaledVector(t.v, dt);
    if ((t.life -= dt) <= 0) { scene.remove(t.m); tracers.splice(i, 1); }
  }
  renderer.render(scene, camera);
}
loop();
