import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer, WebSocket } from "ws";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATIC_DIR = path.resolve(__dirname, "../client");
const PORT = Number(process.env.PORT ?? 3000);
const SEED = Number(process.env.WORLD_SEED ?? 1337);
const MAX_PLAYERS = Number(process.env.MAX_PLAYERS ?? 32);
const MAX_SPEED = 120;
const HIT_RADIUS = 6;
const MIME: Record<string, string> = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".svg": "image/svg+xml", ".map": "application/json",
};

interface Player {
  id: number; name: string; ws: WebSocket;
  room: string; model: number;
  p: [number, number, number]; q: [number, number, number, number];
  hp: number; kills: number; deaths: number; lastShots: Record<string, number>; lastMsg: number; msgs: number;
}
const players = new Map<number, Player>();
const rooms = new Map<string, Set<number>>();
let nextId = 1;
let nextRoom = 0;

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  if (url.pathname === "/health") { res.writeHead(200); res.end("ok"); return; }
  let rel = path.normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
  if (rel === "/" || rel === "\\") rel = "/index.html";
  const file = path.join(STATIC_DIR, rel);
  if (!file.startsWith(STATIC_DIR)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end("Not found"); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] ?? "application/octet-stream" });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server, path: "/ws", maxPayload: 4096 });
const send = (ws: WebSocket, m: unknown) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m)); };
const broadcastRoom = (room: string, m: unknown) => {
  for (const id of rooms.get(room) ?? []) {
    const pl = players.get(id);
    if (pl) send(pl.ws, m);
  }
};
const createRoomCode = () => {
  for (let i = 0; i < 1000; i++) {
    const code = String(nextRoom).padStart(3, "0");
    nextRoom = (nextRoom + 1) % 1000;
    if (!rooms.has(code)) return code;
  }
  return null;
};
const finite = (a: unknown, n: number): a is number[] =>
  Array.isArray(a) && a.length === n && a.every((x) => typeof x === "number" && Number.isFinite(x) && Math.abs(x) < 1e5);
const cleanName = (s: unknown) =>
  (typeof s === "string" ? s : "").replace(/[^\w \-]/g, "").trim().slice(0, 16) || "Pilote";

wss.on("connection", (ws, request) => {
  const requestedRoom = new URL(request.url ?? "/ws", "http://x").searchParams.get("room");
  let room: string | null;
  if (requestedRoom === null) {
    room = createRoomCode();
    if (room) rooms.set(room, new Set());
  } else {
    room = /^\d{3}$/.test(requestedRoom) && rooms.has(requestedRoom) ? requestedRoom : null;
  }
  if (!room) { send(ws, { t: "invalid-room" }); ws.close(); return; }
  const members = rooms.get(room)!;
  if (players.size >= MAX_PLAYERS || members.size >= MAX_PLAYERS) { send(ws, { t: "full" }); ws.close(); return; }
  const pl: Player = {
    id: nextId++, name: "Pilote", ws, room, model: 0, p: [0, 300, 0], q: [0, 0, 0, 1],
    hp: 100, kills: 0, deaths: 0, lastShots: {}, lastMsg: 0, msgs: 0,
  };
  players.set(pl.id, pl);
  members.add(pl.id);
  send(ws, { t: "welcome", id: pl.id, seed: SEED, room });
  broadcastRoom(room, { t: "join", id: pl.id, name: pl.name, model: pl.model });

  ws.on("message", (raw) => {
    const now = Date.now();
    if (now - pl.lastMsg > 1000) { pl.lastMsg = now; pl.msgs = 0; }
    if (++pl.msgs > 120) return;
    let m: any;
    try { m = JSON.parse(raw.toString()); } catch { return; }
    switch (m?.t) {
      case "name":
        pl.name = cleanName(m.name);
        pl.model = Number.isInteger(m.model) ? Math.max(0, Math.min(2, m.model)) : 0;
        broadcastRoom(room, { t: "join", id: pl.id, name: pl.name, model: pl.model });
        break;
      case "state":
        if (finite(m.p, 3) && finite(m.q, 4)) { pl.p = m.p as Player["p"]; pl.q = m.q as Player["q"]; }
        break;
      case "chat": {
        const text = String(m.text ?? "").slice(0, 120).trim();
        if (text) broadcastRoom(room, { t: "chat", name: pl.name, text });
        break;
      }
      case "shoot": {
        const weapon = m.weapon === "rocket" ? "rocket" : "gun";
        const cooldown = weapon === "rocket" ? 700 : 100;
        if (now - (pl.lastShots[weapon] ?? 0) < cooldown || !finite(m.o, 3) || !finite(m.d, 3)) return;
        pl.lastShots[weapon] = now;
        const len = Math.hypot(m.d[0], m.d[1], m.d[2]) || 1;
        const d = m.d.map((x: number) => x / len);
        broadcastRoom(room, { t: "shot", id: pl.id, o: m.o, d, weapon });
        for (const id of members) {
          const o = players.get(id)!;
          if (o.id === pl.id) continue;
          const v = [o.p[0] - m.o[0], o.p[1] - m.o[1], o.p[2] - m.o[2]];
          const proj = v[0] * d[0] + v[1] * d[1] + v[2] * d[2];
          if (proj < 0 || proj > 600) continue;
          const dist = Math.hypot(v[0] - d[0] * proj, v[1] - d[1] * proj, v[2] - d[2] * proj);
          if (dist < (weapon === "rocket" ? HIT_RADIUS * 1.8 : HIT_RADIUS)) {
            o.hp -= weapon === "rocket" ? 35 : 10;
            if (o.hp <= 0) {
              o.hp = 100; o.deaths++; pl.kills++;
              broadcastRoom(room, { t: "kill", killer: pl.name, victim: o.name, victimId: o.id });
            } else send(o.ws, { t: "hit", hp: o.hp });
            break;
          }
        }
        break;
      }
      case "died":
        pl.deaths++; pl.hp = 100;
        break;
    }
  });
  ws.on("close", () => {
    players.delete(pl.id);
    members.delete(pl.id);
    broadcastRoom(room!, { t: "leave", id: pl.id });
    if (!members.size) rooms.delete(room!);
  });
  ws.on("error", () => ws.terminate());
});

setInterval(() => {
  for (const [room, ids] of rooms) {
    const list = [...ids].map((id) => players.get(id)!).filter(Boolean).map((p) => ({
      id: p.id, n: p.name, model: p.model, p: p.p, q: p.q, k: p.kills, d: p.deaths,
    }));
    if (list.length) broadcastRoom(room, { t: "snap", players: list });
  }
}, 66);

server.listen(PORT, () => console.log(`Goofy Plane server on :${PORT} (seed ${SEED}, max speed ${MAX_SPEED})`));
