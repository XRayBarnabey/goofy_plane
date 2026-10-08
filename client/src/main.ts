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
let selectedModel = 0;
let me = makePlane(0xe53935); scene.add(me);
const vel = { speed: 55, throttle: 0.5 };
let hp = 100, kills = 0, deaths = 0, crashedUntil = 0;
interface Remote { mesh: THREE.Group; tp: THREE.Vector3; tq: THREE.Quaternion; name: string; label: THREE.Sprite; model: number }
const remotes = new Map<number, Remote>();
const names = new Map<number, string>();
const keys = new Set<string>();
const tracers: { m: THREE.Mesh; life: number; v: THREE.Vector3 }[] = [];
type Action = "pitchUp" | "pitchDown" | "rollLeft" | "rollRight" | "yawLeft" | "yawRight" | "throttleUp" | "throttleDown" | "fire";
const defaults: Record<Action, string> = {
  pitchUp: "KeyZ", pitchDown: "KeyS", rollLeft: "KeyQ", rollRight: "KeyD",
  yawLeft: "KeyA", yawRight: "KeyE", throttleUp: "ShiftLeft", throttleDown: "ControlLeft", fire: "Space",
};
const bindings: Record<Action, string> = { ...defaults };
try {
  const saved = JSON.parse(localStorage.getItem("goofy-plane-controls") ?? "{}");
  for (const action of Object.keys(defaults) as Action[]) {
    if (typeof saved[action] === "string") bindings[action] = saved[action];
  }
} catch { /* Ignore invalid local settings. */ }
let bindingAction: Action | null = null;
let weapon: "gun" | "rocket" = "gun";

function respawn() {
  const x = (Math.random() - 0.5) * 2000, z = (Math.random() - 0.5) * 2000;
  me.position.set(x, Math.max(terrain?.height(x, z) ?? 0, 0) + 250, z);
  me.quaternion.identity(); vel.speed = 55; vel.throttle = 0.5; hp = 100;
}
function feed(text: string) {
  const d = document.createElement("div"); d.textContent = text; $("feed").append(d);
  setTimeout(() => d.remove(), 8000);
}
function shoot(o: THREE.Vector3, d: THREE.Vector3, type: "gun" | "rocket" = "gun") {
  const rocket = type === "rocket";
  const m = new THREE.Mesh(new THREE.SphereGeometry(rocket ? 1.5 : 0.6), new THREE.MeshBasicMaterial({ color: rocket ? 0xff7138 : 0xffee55 }));
  m.position.copy(o); scene.add(m); tracers.push({ m, life: rocket ? 2 : 1.5, v: d.clone().multiplyScalar(rocket ? 240 : 400) });
}

function connect(name: string, roomCode?: string) {
  const room = roomCode ? `?room=${encodeURIComponent(roomCode)}` : "";
  ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws${room}`);
  ws.onopen = () => ws!.send(JSON.stringify({ t: "name", name, model: selectedModel }));
  ws.onclose = () => feed("Déconnecté du serveur");
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    switch (m.t) {
      case "welcome":
        myId = m.id; terrain = new Terrain(m.seed); tview = new TerrainView(terrain, scene); respawn();
        $("room-status").textContent = `Code de partie : ${m.room}`;
        feed(`Partie ${m.room} créée ou rejointe`);
        break;
      case "invalid-room":
        $("room-status").textContent = "Code de partie introuvable";
        feed("Code de partie introuvable");
        break;
      case "join": names.set(m.id, m.name); { const r = remotes.get(m.id); if (r) setName(r, m.name); } break;
      case "leave": { const r = remotes.get(m.id); if (r) { scene.remove(r.mesh); remotes.delete(m.id); } names.delete(m.id); } break;
      case "chat": feed(`${m.name}: ${m.text}`); break;
      case "shot": if (m.id !== myId) shoot(new THREE.Vector3(...(m.o as [number, number, number])), new THREE.Vector3(...(m.d as [number, number, number])), m.weapon); break;
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
            const mesh = makePlane(0x1e88e5, p.model ?? 0); scene.add(mesh);
            r = { mesh, tp: new THREE.Vector3(), tq: new THREE.Quaternion(), name: "", label: null as any, model: p.model ?? 0 };
            setName(r, names.get(p.id) ?? p.n); remotes.set(p.id, r);
            mesh.position.set(p.p[0], p.p[1], p.p[2]);
          } else if (r.model !== (p.model ?? 0)) {
            const mesh = makePlane(0x1e88e5, p.model ?? 0);
            mesh.position.copy(r.mesh.position); mesh.quaternion.copy(r.mesh.quaternion);
            scene.remove(r.mesh); r.mesh = mesh; r.model = p.model ?? 0; scene.add(mesh); setName(r, r.name);
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
const actionLabels: Record<Action, string> = {
  pitchUp: "Piquer / cabrer haut", pitchDown: "Cabrer bas", rollLeft: "Roulis gauche", rollRight: "Roulis droite",
  yawLeft: "Lacet gauche", yawRight: "Lacet droite", throttleUp: "Augmenter les gaz",
  throttleDown: "Réduire les gaz", fire: "Tirer",
};
const keybinds = $("keybinds");
function keyLabel(code: string) {
  return code.replace(/^Key/, "").replace(/^Digit/, "").replace("Left", " gauche").replace("Right", " droite");
}
function renderBindings() {
  keybinds.replaceChildren();
  for (const action of Object.keys(actionLabels) as Action[]) {
    const label = document.createElement("span"); label.textContent = actionLabels[action];
    const button = document.createElement("button");
    button.textContent = bindingAction === action ? "Appuyez sur une touche…" : keyLabel(bindings[action]);
    button.onclick = () => { bindingAction = action; renderBindings(); };
    keybinds.append(label, button);
  }
}
renderBindings();

addEventListener("keydown", (e) => {
  if (bindingAction) {
    if (e.code === "Escape") bindingAction = null;
    else {
      bindings[bindingAction] = e.code;
      localStorage.setItem("goofy-plane-controls", JSON.stringify(bindings));
      bindingAction = null;
    }
    renderBindings(); e.preventDefault(); return;
  }
  if (document.activeElement === chat) {
    if (e.key === "Enter") { if (chat.value) ws?.send(JSON.stringify({ t: "chat", text: chat.value })); chat.value = ""; chat.style.display = "none"; chat.blur(); }
    return;
  }
  if (e.key === "Enter" && terrain) { chat.style.display = "block"; chat.focus(); e.preventDefault(); return; }
  if (e.code === "Digit1" || e.code === "Digit2") {
    weapon = e.code === "Digit1" ? "gun" : "rocket";
    feed(weapon === "gun" ? "Arme : mitrailleuse" : "Arme : roquettes");
  }
  keys.add(e.code); if (e.code === "Space") e.preventDefault();
});
addEventListener("keyup", (e) => keys.delete(e.code));
const k = (action: Action) => keys.has(bindings[action]);

function startGame(roomCode?: string) {
  const name = $<HTMLInputElement>("name").value.trim() || "Pilote";
  selectedModel = Number($<HTMLSelectElement>("aircraft").value) || 0;
  scene.remove(me); me = makePlane(0xe53935, selectedModel); scene.add(me);
  $("menu").style.display = "none";
  connect(name, roomCode);
}
$("play").onclick = () => startGame();
$("join-room").onclick = () => {
  const code = $<HTMLInputElement>("room-code").value.trim();
  if (!/^\d{3}$/.test(code)) { $("room-status").textContent = "Saisissez un code à 3 chiffres"; return; }
  startGame(code);
};
$<HTMLInputElement>("room-code").addEventListener("input", (e) => {
  const input = e.currentTarget as HTMLInputElement;
  input.value = input.value.replace(/\D/g, "").slice(0, 3);
});

const clock = new THREE.Clock(); let sendT = 0, shootT = 0;
const fwd = new THREE.Vector3(), tmp = new THREE.Vector3(), camPos = new THREE.Vector3();
const qd = new THREE.Quaternion(), ax = new THREE.Vector3();
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.1), now = performance.now();
  if (terrain && tview) {
    const rot = (axis: [number, number, number], a: number) => { ax.set(...axis); me.quaternion.multiply(qd.setFromAxisAngle(ax, a)); };
    if (now > crashedUntil) {
      const pitch = k("pitchDown") ? 1 : k("pitchUp") ? -1 : 0;
      const roll = k("rollRight") ? -1 : k("rollLeft") ? 1 : 0;
      const yaw = k("yawLeft") ? 1 : k("yawRight") ? -1 : 0;
      rot([1, 0, 0], pitch * 1.1 * dt);
      rot([0, 0, 1], roll * 1.8 * dt);
      rot([0, 1, 0], yaw * 0.6 * dt);
      if (k("throttleUp")) vel.throttle = Math.min(1, vel.throttle + 0.5 * dt);
      if (k("throttleDown")) vel.throttle = Math.max(0, vel.throttle - 0.5 * dt);
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
      const fireDelay = weapon === "rocket" ? 700 : 100;
      if (k("fire") && now - shootT > fireDelay && ws?.readyState === 1) {
        shootT = now;
        const o = me.position.clone().addScaledVector(fwd, 6);
        ws.send(JSON.stringify({ t: "shoot", o: o.toArray(), d: fwd.toArray(), weapon }));
        shoot(o, fwd.clone(), weapon);
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
    $("hud").textContent = `Vitesse ${(vel.speed * 3.6) | 0} km/h\nAltitude ${me.position.y | 0} m\nGaz ${(vel.throttle * 100) | 0}%\nPV ${hp}\nArme ${weapon === "gun" ? "mitrailleuse" : "roquettes"}\nKills ${kills}  Morts ${deaths}`;
    const healthFill = $("health-fill");
    healthFill.style.width = `${Math.max(0, Math.min(100, hp))}%`;
    healthFill.style.background = hp <= 30 ? "#ef4444" : hp <= 60 ? "#f5c542" : "#42d66b";
  }
  for (const r of remotes.values()) { r.mesh.position.lerp(r.tp, Math.min(1, dt * 12)); r.mesh.quaternion.slerp(r.tq, Math.min(1, dt * 12)); }
  for (let i = tracers.length - 1; i >= 0; i--) {
    const t = tracers[i]; t.m.position.addScaledVector(t.v, dt);
    if ((t.life -= dt) <= 0) { scene.remove(t.m); tracers.splice(i, 1); }
  }
  renderer.render(scene, camera);
}
loop();
