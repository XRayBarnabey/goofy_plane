import * as THREE from "three";
import { Terrain, TerrainView } from "./terrain";
import { makePlane, makeLabel, Trail } from "./plane";

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
let myColor = 0xe53935;
try { const c = localStorage.getItem("goofy-plane-color"); if (c && /^#[0-9a-f]{6}$/i.test(c)) { $<HTMLInputElement>("color").value = c; myColor = parseInt(c.slice(1), 16); } } catch { /* ignore */ }
let me = makePlane(myColor); scene.add(me);
let firstPerson = false;
const touchMode = { on: false, tilt: { lr: 0, fb: 0 }, neutral: null as null | { b: number; g: number }, throttleDir: 0, fire: false };
const vel = { speed: 55, throttle: 0.5, vy: 0 };
const GRAVITY = 9.8;
let stallMsg = 0, buildingCrashMsg = 0;
const upv = new THREE.Vector3(), rightv = new THREE.Vector3(), yAxis = new THREE.Vector3(0, 1, 0);
let hp = 100, kills = 0, deaths = 0, crashedUntil = 0;
interface Remote { mesh: THREE.Group; tp: THREE.Vector3; tq: THREE.Quaternion; name: string; label: THREE.Sprite; model: number; color: number; pointer: HTMLDivElement; trail: Trail; engine: OscillatorNode | null; engineGain: GainNode | null }
const remotes = new Map<number, Remote>();
const names = new Map<number, string>();
const minimap = $<HTMLCanvasElement>("minimap");
let showMinimap = true;
minimap.style.display = "none";
let audio: AudioContext | null = null;
let engine: OscillatorNode | null = null;
let engineGain: GainNode | null = null;
let master: GainNode | null = null;
let volume = 0.8;
try { const v = localStorage.getItem("goofy-plane-volume"); if (v !== null && !isNaN(Number(v))) volume = Math.max(0, Math.min(1, Number(v))); } catch { /* ignore */ }
let paused = false;
const myTrail = new Trail(myColor); scene.add(myTrail.line);
const TAIL = new THREE.Vector3(0, 0, 3.4);
const HEAR_RANGE = 1200;
function engineType(model: number): OscillatorType { return model === 0 ? "triangle" : model === 1 ? "sawtooth" : "square"; }
function engineFreq(model: number, throttle: number, speed: number) { return (model === 1 ? 52 : model === 2 ? 34 : 42) + throttle * 30 + speed * 0.12; }
function proximity(pos: THREE.Vector3) { const d = pos.distanceTo(me.position); return d >= HEAR_RANGE ? 0 : (1 - d / HEAR_RANGE) ** 2; }
function startRemoteEngine(r: Remote) {
  if (!audio || !master || r.engine) return;
  r.engine = audio.createOscillator(); r.engine.type = engineType(r.model);
  r.engineGain = audio.createGain(); r.engineGain.gain.value = 0;
  r.engine.connect(r.engineGain).connect(master); r.engine.start();
}
function stopRemoteEngine(r: Remote) {
  try { r.engine?.stop(); } catch { /* ignore */ }
  r.engine?.disconnect(); r.engineGain?.disconnect(); r.engine = null; r.engineGain = null;
}
const keys = new Set<string>();
const tracers: { m: THREE.Mesh; life: number; v: THREE.Vector3 }[] = [];
type Action = "toggleView" | "pitchUp" | "pitchDown" | "rollLeft" | "rollRight" | "yawLeft" | "yawRight" | "throttleUp" | "throttleDown" | "fire";
const defaults: Record<Action, string> = {
  toggleView: "KeyV",
  // AZERTY : KeyW = Z, KeyA = Q, KeyQ = A (codes physiques)
  pitchUp: "KeyW", pitchDown: "KeyS", rollLeft: "KeyA", rollRight: "KeyD",
  yawLeft: "KeyQ", yawRight: "KeyE", throttleUp: "ShiftLeft", throttleDown: "ControlLeft", fire: "Space",
};
const bindings: Record<Action, string> = { ...defaults };
try {
  const saved = JSON.parse(localStorage.getItem("goofy-plane-controls-azerty") ?? "{}");
  for (const action of Object.keys(defaults) as Action[]) {
    if (typeof saved[action] === "string") bindings[action] = saved[action];
  }
} catch { /* Ignore invalid local settings. */ }
let bindingAction: Action | null = null;
let weapon: "gun" | "rocket" = "gun";

function startAudio() {
  if (audio) { void audio.resume(); for (const r of remotes.values()) startRemoteEngine(r); return; }
  const AudioCtor = window.AudioContext ?? (window as any).webkitAudioContext;
  if (!AudioCtor) return;
  audio = new AudioCtor();
  engine = audio.createOscillator();
  engine.type = engineType(selectedModel);
  master = audio.createGain(); master.gain.value = volume; master.connect(audio.destination);
  engineGain = audio.createGain();
  engineGain.gain.value = 0.06;
  engine.connect(engineGain).connect(master);
  engine.start();
}
function playShotSound(type: "gun" | "rocket", at?: THREE.Vector3) {
  if (!audio || !master) return;
  const prox = at ? proximity(at) : 1;
  if (prox <= 0.001) return;
  const oscillator = audio.createOscillator(), gain = audio.createGain(), now = audio.currentTime;
  oscillator.type = type === "gun" ? "square" : "sawtooth";
  oscillator.frequency.setValueAtTime(type === "gun" ? 520 : 180, now);
  oscillator.frequency.exponentialRampToValueAtTime(type === "gun" ? 110 : 45, now + (type === "gun" ? 0.09 : 0.42));
  gain.gain.setValueAtTime((type === "gun" ? 0.12 : 0.2) * prox, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + (type === "gun" ? 0.1 : 0.45));
  oscillator.connect(gain).connect(master);
  oscillator.start(now); oscillator.stop(now + (type === "gun" ? 0.11 : 0.46));
}

function respawn() {
  const x = (Math.random() - 0.5) * 2000, z = (Math.random() - 0.5) * 2000;
  me.position.set(x, Math.max(terrain?.height(x, z) ?? 0, 0) + 250, z);
  me.quaternion.identity(); myTrail.reset(); vel.speed = 70; vel.throttle = 0.5; vel.vy = 0; hp = 100;
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
  ws.onopen = () => ws!.send(JSON.stringify({ t: "name", name, model: selectedModel, color: myColor }));
  ws.onclose = () => feed("Déconnecté du serveur");
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    switch (m.t) {
      case "welcome":
        myId = m.id; terrain = new Terrain(m.seed); tview = new TerrainView(terrain, scene); respawn();
        minimap.style.display = showMinimap ? "block" : "none";
        $("room-status").textContent = `Code de partie : ${m.room}`;
        $("room-display").textContent = `Partie : ${m.room}`;
        feed(`Partie ${m.room} créée ou rejointe`);
        break;
      case "invalid-room":
        $("room-status").textContent = "Code de partie introuvable";
        $("menu").style.display = "flex";
        feed("Code de partie introuvable");
        break;
      case "join": names.set(m.id, m.name); { const r = remotes.get(m.id); if (r) setName(r, m.name); } break;
      case "leave": { const r = remotes.get(m.id); if (r) { scene.remove(r.mesh); r.pointer.remove(); r.trail.dispose(); stopRemoteEngine(r); remotes.delete(m.id); } names.delete(m.id); } break;
      case "chat": feed(`${m.name}: ${m.text}`); break;
      case "shot": if (m.id !== myId) { const o = new THREE.Vector3(...(m.o as [number, number, number])); shoot(o, new THREE.Vector3(...(m.d as [number, number, number])), m.weapon); playShotSound(m.weapon, o); } break;
      case "hit": hp = m.hp; break;
      case "kill":
        feed(`💥 ${m.killer} a abattu ${m.victim}`);
        if (m.victimId === myId) { deaths++; respawn(); }
        break;
      case "full": $("room-status").textContent = "Serveur plein"; $("menu").style.display = "flex"; break;
      case "snap": {
        const rows: string[] = [];
        for (const p of m.players) {
          if (p.id === myId) { kills = p.k; deaths = p.d; }
          rows.push(`${p.n} ${p.k}/${p.d}`);
          if (p.id === myId) continue;
          let r = remotes.get(p.id);
          if (!r) {
            const mesh = makePlane(p.c ?? 0x1e88e5, p.model ?? 0); scene.add(mesh);
            const pointer = document.createElement("div"); pointer.className = "player-pointer";
            pointer.append(document.createElement("i"), document.createElement("span")); document.body.append(pointer);
            r = { mesh, tp: new THREE.Vector3(), tq: new THREE.Quaternion(), name: "", label: null as any, model: p.model ?? 0, color: p.c ?? 0x1e88e5, pointer, trail: new Trail(p.c ?? 0x1e88e5), engine: null, engineGain: null };
            scene.add(r.trail.line); startRemoteEngine(r);
            setName(r, names.get(p.id) ?? p.n); remotes.set(p.id, r);
            mesh.position.set(p.p[0], p.p[1], p.p[2]);
          } else if (r.model !== (p.model ?? 0) || r.color !== (p.c ?? 0x1e88e5)) {
            const mesh = makePlane(p.c ?? 0x1e88e5, p.model ?? 0); r.color = p.c ?? 0x1e88e5; r.trail.setColor(r.color);
            if (r.engine) r.engine.type = engineType(p.model ?? 0);
            mesh.position.copy(r.mesh.position); mesh.quaternion.copy(r.mesh.quaternion);
            scene.remove(r.mesh); r.mesh = mesh; r.model = p.model ?? 0; scene.add(mesh); setName(r, r.name);
          }
          r.pointer.style.setProperty("--player-color", `#${(p.c ?? 0x1e88e5).toString(16).padStart(6, "0")}`);
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
  const caption = r.pointer.querySelector("span"); if (caption) caption.textContent = name;
}

const chat = $<HTMLInputElement>("chat");
const actionLabels: Record<Action, string> = {
  pitchUp: "Piquer / cabrer haut", pitchDown: "Cabrer bas", rollLeft: "Roulis gauche", rollRight: "Roulis droite",
  yawLeft: "Lacet gauche", yawRight: "Lacet droite", throttleUp: "Augmenter les gaz",
  throttleDown: "Réduire les gaz", fire: "Tirer", toggleView: "Changer de vue (1ère/3ème)",
};
const keybinds = $("keybinds");
function keyLabel(code: string) {
  const azerty: Record<string, string> = { KeyW: "Z", KeyZ: "W", KeyQ: "A", KeyA: "Q", Semicolon: "M", KeyM: ",", Digit1: "&", Digit2: "é" };
  if (azerty[code]) return azerty[code];
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
      localStorage.setItem("goofy-plane-controls-azerty", JSON.stringify(bindings));
      bindingAction = null;
    }
    renderBindings(); e.preventDefault(); return;
  }
  if (document.activeElement === chat) {
    if (e.key === "Enter") { if (chat.value) ws?.send(JSON.stringify({ t: "chat", text: chat.value })); chat.value = ""; chat.style.display = "none"; chat.blur(); }
    return;
  }
  if (e.key === "Enter" && terrain) { chat.style.display = "block"; chat.focus(); e.preventDefault(); return; }
  if (e.code === bindings.toggleView && !e.repeat) toggleView();
  if (e.code === "KeyP" && !e.repeat) setPaused(!paused);
  if (e.code === "KeyR" && !e.repeat && terrain) respawn();
  if (e.code === "Digit1" || e.code === "Digit2") {
    weapon = e.code === "Digit1" ? "gun" : "rocket";
    feed(weapon === "gun" ? "Arme : mitrailleuse" : "Arme : roquettes");
  }
  keys.add(e.code); if (e.code === "Space") e.preventDefault();
});
addEventListener("keyup", (e) => keys.delete(e.code));
addEventListener("contextmenu", (e) => e.preventDefault());
const fullscreenButton = $<HTMLButtonElement>("fullscreen");
fullscreenButton.onclick = async () => {
  const doc = document as Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => Promise<void> };
  const root = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };
  try {
    if (document.fullscreenElement || doc.webkitFullscreenElement) {
      if (document.exitFullscreen) await document.exitFullscreen();
      else await doc.webkitExitFullscreen?.();
    } else if (root.requestFullscreen || root.webkitRequestFullscreen) {
      if (root.requestFullscreen) await root.requestFullscreen();
      else await root.webkitRequestFullscreen?.();
      try { await screen.orientation?.lock("landscape"); } catch { /* Orientation lock is optional. */ }
    } else { feed("Le plein écran n’est pas pris en charge par ce navigateur"); return; }
  } catch { feed("Impossible d’activer le plein écran"); }
};
document.addEventListener("fullscreenchange", () => { fullscreenButton.textContent = document.fullscreenElement ? "Quitter plein écran" : "Plein écran"; });
document.addEventListener("webkitfullscreenchange", () => {
  const doc = document as Document & { webkitFullscreenElement?: Element };
  fullscreenButton.textContent = doc.webkitFullscreenElement ? "Quitter plein écran" : "Plein écran";
});
$<HTMLButtonElement>("minimap-toggle").onclick = () => {
  showMinimap = !showMinimap; minimap.style.display = showMinimap ? "block" : "none";
  $("minimap-toggle").textContent = `Minimap : ${showMinimap ? "oui" : "non"}`;
};
function toggleView() { firstPerson = !firstPerson; feed(firstPerson ? "Vue : 1ère personne" : "Vue : 3ème personne"); }
function recenterGyro() {
  touchMode.neutral = null; touchMode.tilt.lr = 0; touchMode.tilt.fb = 0;
  fwd.set(0, 0, -1).applyQuaternion(me.quaternion);
  const yaw = Math.atan2(-fwd.x, -fwd.z);
  me.quaternion.setFromAxisAngle(yAxis, yaw);
  feed("Gyroscope recentré, avion remis droit");
}
function setPaused(p: boolean) {
  if (!terrain) return;
  paused = p; $("pause-menu").style.display = p ? "flex" : "none";
  if (!p) clock.getDelta();
}
$("pause").onclick = () => setPaused(!paused);
$("resume").onclick = () => setPaused(false);
$("respawn-btn").onclick = () => { if (terrain) respawn(); };
$("respawn-menu").onclick = () => { respawn(); setPaused(false); };
$("recenter").onclick = () => { recenterGyro(); setPaused(false); };
$<HTMLInputElement>("volume").value = String(Math.round(volume * 100));
$<HTMLInputElement>("volume").addEventListener("input", (e) => {
  volume = Number((e.currentTarget as HTMLInputElement).value) / 100;
  if (master) master.gain.value = volume;
  try { localStorage.setItem("goofy-plane-volume", String(volume)); } catch { /* ignore */ }
});
function enableTouch() {
  $("touch").style.display = "block";
  const hold = (id: string, on: () => void, off: () => void) => {
    const b = $(id); b.addEventListener("pointerdown", (e) => { e.preventDefault(); on(); });
    for (const t of ["pointerup", "pointercancel", "pointerleave"]) b.addEventListener(t, off);
  };
  hold("t-fire", () => (touchMode.fire = true), () => (touchMode.fire = false));
  hold("t-up", () => (touchMode.throttleDir = 1), () => (touchMode.throttleDir = 0));
  hold("t-down", () => (touchMode.throttleDir = -1), () => (touchMode.throttleDir = 0));
  $("t-weapon").addEventListener("click", () => { weapon = weapon === "gun" ? "rocket" : "gun"; feed(weapon === "gun" ? "Arme : mitrailleuse" : "Arme : roquettes"); });
  $("t-cam").addEventListener("click", toggleView);
  const start = () => addEventListener("deviceorientation", (e) => {
    if (e.beta == null || e.gamma == null) return;
    const ang = (screen.orientation?.angle ?? (window as any).orientation ?? 0) as number;
    // Normalise selon l'orientation de l'écran : lr = inclinaison gauche/droite, fb = avant/arrière
    let lr = e.gamma, fb = e.beta;
    if (ang === 90) { lr = -e.beta; fb = e.gamma; } else if (ang === 270 || ang === -90) { lr = e.beta; fb = -e.gamma; } else if (ang === 180) { lr = -e.gamma; fb = -e.beta; }
    if (!touchMode.neutral) touchMode.neutral = { b: lr, g: fb };
    touchMode.tilt.lr = lr - touchMode.neutral.b; touchMode.tilt.fb = fb - touchMode.neutral.g;
  });
  const DOE = (window as any).DeviceOrientationEvent;
  if (DOE && typeof DOE.requestPermission === "function") DOE.requestPermission().then((r: string) => { if (r === "granted") start(); }).catch(() => feed("Gyroscope refusé"));
  else start();
  $("t-cam").addEventListener("dblclick", recenterGyro);
  $("t-recenter").addEventListener("click", recenterGyro);
  $("recenter").style.display = "block";
  feed("Gyroscope : inclinez le téléphone (double-tap Vue pour recalibrer)");
}
const k = (action: Action) => keys.has(bindings[action]);

function startGame(roomCode?: string) {
  const name = $<HTMLInputElement>("name").value.trim() || "Pilote";
  selectedModel = Number($<HTMLSelectElement>("aircraft").value) || 0;
  myColor = parseInt($<HTMLInputElement>("color").value.slice(1), 16) || 0xe53935;
  try { localStorage.setItem("goofy-plane-color", $<HTMLInputElement>("color").value); } catch { /* ignore */ }
  firstPerson = $<HTMLSelectElement>("view").value === "1";
  touchMode.on = $<HTMLSelectElement>("ctrl").value === "touch";
  document.body.classList.toggle("touch-controls-active", touchMode.on);
  startAudio();
  if (touchMode.on) enableTouch();
  scene.remove(me); me = makePlane(myColor, selectedModel); scene.add(me); myTrail.setColor(myColor); myTrail.reset();
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
const previousPosition = new THREE.Vector3();
const mapContext = minimap.getContext("2d");
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.1), now = performance.now();
  if (terrain && tview && !paused) {
    const rot = (axis: [number, number, number], a: number) => { ax.set(...axis); me.quaternion.multiply(qd.setFromAxisAngle(ax, a)); };
    if (now > crashedUntil) {
      const dz = (v: number) => Math.abs(v) < 4 ? 0 : Math.max(-1, Math.min(1, (v - Math.sign(v) * 4) / 25));
      let pitch = k("pitchDown") ? 1 : k("pitchUp") ? -1 : 0;
      let roll = k("rollRight") ? -1 : k("rollLeft") ? 1 : 0;
      const yaw = k("yawLeft") ? 1 : k("yawRight") ? -1 : 0;
      let thr = (k("throttleUp") ? 1 : 0) - (k("throttleDown") ? 1 : 0);
      if (touchMode.on) { roll = roll || -dz(touchMode.tilt.lr); pitch = pitch || dz(touchMode.tilt.fb); thr = thr || touchMode.throttleDir; }
      // les gouvernes sont moins efficaces à basse vitesse
      const authority = Math.max(0.35, Math.min(1.1, vel.speed / 70));
      rot([1, 0, 0], pitch * 1.1 * authority * dt);
      rot([0, 0, 1], roll * 1.8 * authority * dt);
      rot([0, 1, 0], yaw * 0.6 * authority * dt);
      vel.throttle = Math.max(0, Math.min(1, vel.throttle + thr * 0.5 * dt));
      fwd.set(0, 0, -1).applyQuaternion(me.quaternion);
      upv.set(0, 1, 0).applyQuaternion(me.quaternion);
      rightv.set(1, 0, 0).applyQuaternion(me.quaternion);
      // virage naturel en inclinant les ailes
      me.quaternion.premultiply(qd.setFromAxisAngle(yAxis, rightv.y * 0.9 * authority * dt));
      // poussée - traînée - composante de la gravité le long de l'axe de l'avion
      vel.speed += (vel.throttle * 42 - 0.0036 * vel.speed * vel.speed - 16 * fwd.y) * dt;
      vel.speed = Math.max(8, vel.speed);
      // portance ~ v², orientée selon le haut de l'avion ; gravité constante ; amortissement vertical
      const lift = Math.min(1.25, (vel.speed / 62) ** 2) * Math.max(0, upv.y);
      vel.vy += (-GRAVITY + GRAVITY * lift) * dt;
      vel.vy -= vel.vy * 0.6 * dt;
      // décrochage : le nez plonge quand la vitesse est trop faible
      if (vel.speed < 40) {
        const s = (40 - vel.speed) / 40;
        me.quaternion.multiply(qd.setFromAxisAngle(ax.set(1, 0, 0), -s * 0.9 * dt));
        if (s > 0.25 && now - stallMsg > 3000) { stallMsg = now; feed("⚠ Décrochage !"); }
      }
      previousPosition.copy(me.position);
      me.position.addScaledVector(fwd, vel.speed * dt);
      me.position.y += vel.vy * dt;
      me.position.y = Math.min(me.position.y, 1800);
      if (terrain.collidesWithBuilding(me.position, 6 * me.scale.x)) {
        me.position.copy(previousPosition); vel.speed = Math.max(8, vel.speed * 0.55); vel.vy = Math.min(vel.vy, 0);
        crashedUntil = now + 250;
        if (now - buildingCrashMsg > 2000) { buildingCrashMsg = now; feed("💥 Collision avec un bâtiment !"); }
      }
      const ground = Math.max(terrain.height(me.position.x, me.position.z), 0);
      if (me.position.y < ground + 3) {
        feed("💥 Crash !"); ws?.send(JSON.stringify({ t: "died" })); deaths++; respawn(); crashedUntil = now + 500;
      }
      const fire = k("fire") || touchMode.fire;
      const fireDelay = weapon === "rocket" ? 700 : 100;
      if (fire && now - shootT > fireDelay && ws?.readyState === 1) {
        shootT = now;
        const o = me.position.clone().addScaledVector(fwd, 6);
        ws.send(JSON.stringify({ t: "shoot", o: o.toArray(), d: fwd.toArray(), weapon }));
        shoot(o, fwd.clone(), weapon);
        playShotSound(weapon);
      }
    }
    for (const r of remotes.values()) {
      tmp.subVectors(me.position, r.mesh.position);
      const minimum = (12 * me.scale.x) + (12 * r.mesh.scale.x);
      const distance = tmp.length();
      if (distance < minimum) {
        if (tmp.lengthSq() < 0.001) tmp.set(1, 0, 0);
        me.position.add(tmp.normalize().multiplyScalar(minimum - distance));
        vel.speed = Math.max(8, vel.speed * 0.8);
      }
    }
    myTrail.update(dt, me, TAIL);
    (me.getObjectByName("prop") as THREE.Object3D).rotation.z += dt * 40;
    tview.update(me.position.x, me.position.z);
    me.visible = !firstPerson;
    if (firstPerson) {
      const sc = me.scale.x;
      camera.position.copy(tmp.set(0, 0.95 * sc, -1.6 * sc).applyQuaternion(me.quaternion).add(me.position));
      camera.up.set(0, 1, 0).applyQuaternion(me.quaternion);
      camera.lookAt(camera.position.clone().add(fwd.clone().multiplyScalar(20)));
      camPos.copy(camera.position);
    } else {
      tmp.set(0, 4, 16).applyQuaternion(me.quaternion).add(me.position);
      camPos.lerp(tmp, Math.min(1, dt * 6)); camera.position.copy(camPos);
      camera.up.set(0, 1, 0).applyQuaternion(me.quaternion); camera.lookAt(me.position.clone().addScaledVector(fwd, 20));
    }
    if (now - sendT > 50 && ws?.readyState === 1) {
      sendT = now;
      ws.send(JSON.stringify({ t: "state", p: me.position.toArray(), q: me.quaternion.toArray() }));
    }
    $("hud").textContent = `Vitesse ${(vel.speed * 3.6) | 0} km/h\nAltitude ${me.position.y | 0} m\nGaz ${(vel.throttle * 100) | 0}%\nPV ${hp}\nArme ${weapon === "gun" ? "mitrailleuse" : "roquettes"}\nKills ${kills}  Morts ${deaths}`;
    const healthFill = $("health-fill");
    healthFill.style.width = `${Math.max(0, Math.min(100, hp))}%`;
    healthFill.style.background = hp <= 30 ? "#ef4444" : hp <= 60 ? "#f5c542" : "#42d66b";
  }
  camera.updateMatrixWorld();
  for (const r of remotes.values()) {
    r.mesh.position.lerp(r.tp, Math.min(1, dt * 12)); r.mesh.quaternion.slerp(r.tq, Math.min(1, dt * 12));
    if (!paused) r.trail.update(dt, r.mesh, TAIL);
    if (r.engineGain && r.engine && audio) {
      r.engineGain.gain.setTargetAtTime(0.06 * proximity(r.mesh.position), audio.currentTime, 0.1);
      r.engine.frequency.setTargetAtTime(engineFreq(r.model, 0.6, 60), audio.currentTime, 0.1);
    }
    const projected = r.mesh.position.clone().project(camera);
    const local = r.mesh.position.clone().sub(camera.position).applyQuaternion(camera.quaternion.clone().invert());
    if (local.z > 0) { projected.x = -projected.x; projected.y = -projected.y; }
    const x = Math.max(24, Math.min(innerWidth - 24, (projected.x * 0.5 + 0.5) * innerWidth));
    const y = Math.max(24, Math.min(innerHeight - 24, (-projected.y * 0.5 + 0.5) * innerHeight));
    const angle = Math.atan2(y - innerHeight / 2, x - innerWidth / 2);
    r.pointer.style.display = "block"; r.pointer.style.left = `${x - 7}px`; r.pointer.style.top = `${y - 9}px`;
    const arrow = r.pointer.querySelector("i"); if (arrow) arrow.style.transform = `rotate(${angle}rad)`;
  }
  if (mapContext && terrain && showMinimap) {
    const dpr = Math.min(devicePixelRatio, 2), size = 170;
    if (minimap.width !== Math.round(size * dpr) || minimap.height !== Math.round(size * dpr)) { minimap.width = Math.round(size * dpr); minimap.height = Math.round(size * dpr); }
    mapContext.setTransform(dpr, 0, 0, dpr, 0, 0);
    mapContext.clearRect(0, 0, size, size);
    mapContext.fillStyle = "rgba(4, 14, 24, .34)"; mapContext.beginPath(); mapContext.arc(85, 85, 84, 0, Math.PI * 2); mapContext.fill();
    mapContext.strokeStyle = "rgba(255,255,255,.25)"; mapContext.lineWidth = 1;
    mapContext.beginPath(); mapContext.moveTo(85, 4); mapContext.lineTo(85, 166); mapContext.moveTo(4, 85); mapContext.lineTo(166, 85); mapContext.stroke();
    const scale = 80 / 1500;
    for (const r of remotes.values()) {
      const x = 85 + (r.mesh.position.x - me.position.x) * scale, y = 85 + (r.mesh.position.z - me.position.z) * scale;
      mapContext.fillStyle = `#${r.color.toString(16).padStart(6, "0")}`; mapContext.beginPath(); mapContext.arc(x, y, 4, 0, Math.PI * 2); mapContext.fill();
    }
    fwd.set(0, 0, -1).applyQuaternion(me.quaternion);
    mapContext.save(); mapContext.translate(85, 85); mapContext.rotate(Math.atan2(fwd.x, -fwd.z));
    mapContext.fillStyle = `#${myColor.toString(16).padStart(6, "0")}`;
    mapContext.beginPath(); mapContext.moveTo(0, -8); mapContext.lineTo(6, 7); mapContext.lineTo(0, 4); mapContext.lineTo(-6, 7); mapContext.closePath(); mapContext.fill(); mapContext.restore();
  }
  if (engine && audio) engine.frequency.setTargetAtTime(engineFreq(selectedModel, vel.throttle, vel.speed), audio.currentTime, 0.08);
  for (let i = tracers.length - 1; i >= 0; i--) {
    const t = tracers[i]; t.m.position.addScaledVector(t.v, dt);
    if ((t.life -= dt) <= 0) { scene.remove(t.m); tracers.splice(i, 1); }
  }
  renderer.render(scene, camera);
}
loop();
