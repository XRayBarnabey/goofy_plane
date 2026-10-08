# ✈ Goofy Plane

Jeu d'avion 3D multijoueur dans le navigateur (Three.js + TypeScript, serveur Node.js WebSocket, terrain procédural).

## Déploiement

```bash
git clone https://github.com/XRayBarnabey/goofy_plane.git
cd goofy_plane
docker compose up -d --build
```

Ouvrir `http://IP_DU_SERVEUR:8080`. Variables (optionnelles) : `HOST_PORT`, `WORLD_SEED`, `MAX_PLAYERS`.
Derrière un reverse proxy HTTPS, relayer aussi l'upgrade WebSocket sur `/ws`.

## Développement

```bash
npm install
npm run build && npm start      # serveur sur :3000
npm run dev:client              # Vite (proxy /ws vers :3000)
```

## Contrôles
Z/S ou ↑/↓ tangage · Q/D ou ←/→ roulis · A/E lacet · Shift/Ctrl gaz · Espace tir · Entrée chat.

Le monde est généré depuis une graine fournie par le serveur (identique pour tous). Les tirs sont validés côté serveur.
