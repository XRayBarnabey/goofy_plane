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

Les commandes de vol sont configurables depuis le menu et conservées dans le navigateur. Par défaut : Z/S tangage · Q/D roulis · A/E lacet · Shift/Ctrl gaz · Espace tir. Touches 1/2 pour passer de la mitrailleuse aux roquettes · Entrée chat.

Créer une partie génère un code à 3 chiffres ; saisissez le code d'un hôte pour rejoindre sa partie. Le monde comprend une zone urbaine avec des bâtiments ainsi que deux avions supplémentaires sélectionnables.

Le monde est généré depuis une graine fournie par le serveur (identique pour tous). Les tirs et dégâts sont validés côté serveur ; la barre de vie affiche les PV restants.

Sur smartphone, choisissez « Smartphone (gyroscope) » puis autorisez l’accès aux capteurs ; le bouton « Plein écran » permet de jouer sans l’interface du navigateur. Le bouton « Minimap » affiche ou masque la carte transparente. Les avions ont des bruitages distincts selon le modèle et l’arme, des repères colorés indiquent les autres pilotes, et les collisions avec les avions et les bâtiments sont prises en compte.


## Piste, forêt et monstre géant

- Une piste (x=0, z de 1200 à 2400) permet de décoller (≥ 52 m/s puis cabrer) et d'atterrir (train à plat, descente < 10 m/s). Pause → « Respawn sur la piste » pour y démarrer.
- Une forêt d'arbres géants (conifères et feuillus) se trouve à l'ouest de la ville ; les troncs sont solides.
- Smartphone : gyroscope corrigé (les deux axes étaient inversés) et deux boutons tactiles « Trim » pour le trim de dérive.
- Le « Monstre géant » est jouable (menu Avion). Arme 1 : lance-roquettes (rocket jump : l'explosion le propulse sans dégâts). Arme 2 : tapette à mouches géante pour abattre les avions. Touches (Z/Q/S/D, A/E, ↑/↓, Espace, F, &/é par défaut) modifiables dans « Touches ».
