# SIMULIFE

Application web (installable sur iPhone) simulant des vies alternatives réalistes.

**État actuel (mission 1) :** fondations uniquement — écran d'accueil, configuration
de l'outillage, structure modulaire. Aucune simulation n'est encore implémentée.

## Prérequis

- Node.js **20.19 ou plus** (testé avec Node 22.22.0 et npm 10.9.4)
- npm (fourni avec Node.js)

> Un iPhone seul ne peut pas exécuter ces commandes : elles s'exécutent dans une
> session Claude Code (cloud) ou sur un ordinateur.

## Commandes

Depuis la racine du projet :

```bash
npm install          # installe les dépendances (une seule fois)
npm run dev          # serveur de développement : http://localhost:5173
npm run lint         # vérification ESLint
npm run typecheck    # vérification TypeScript (tsc -b)
npm run test         # tests Vitest (une passe)
npm run test:watch   # tests Vitest en mode surveillance
npm run build        # build de production dans dist/
npm run preview      # sert le build de production : http://localhost:4173
npm run check        # lint + typecheck + test + build, dans cet ordre
```

`npm run dev` écoute aussi sur le réseau local (`--host`) : un iPhone connecté au
**même Wi-Fi** que l'ordinateur peut ouvrir l'adresse « Network » affichée.

## Installer sur iPhone

Une fois l'application hébergée à une adresse HTTPS :

1. Ouvrir l'adresse dans **Safari**.
2. Toucher **Partager**, puis **Sur l'écran d'accueil**.
3. L'application se lance alors en plein écran, sans barre Safari.

## Structure

```
.
├── index.html              # page d'entrée (méta iPhone, manifeste, icônes)
├── public/
│   ├── manifest.webmanifest
│   ├── favicon.svg         # logo
│   ├── apple-touch-icon.png  # icône écran d'accueil iPhone (180×180)
│   ├── icon-192.png
│   └── icon-512.png
├── src/
│   ├── main.tsx            # point d'entrée React
│   ├── app/App.tsx         # composition de l'application
│   ├── ui/                 # interface (React)
│   │   ├── platform.ts     # détection du mode « écran d'accueil »
│   │   └── screens/HomeScreen.{tsx,css,test.tsx}
│   ├── engine/             # moteur de simulation (TS pur, vide pour l'instant)
│   ├── storage/            # persistance locale (vide pour l'instant)
│   ├── styles/global.css   # styles globaux, zones sûres iPhone
│   └── test/setup.ts       # configuration Vitest
├── eslint.config.js
├── vite.config.ts          # config Vite + Vitest
└── tsconfig*.json
```

### Règle d'architecture

`src/engine/` ne doit dépendre ni de React, ni de `src/ui/`, ni de `src/storage/`.
ESLint le vérifie automatiquement (`no-restricted-imports`).

## Compatibilité iPhone

- Affichage portrait ; en paysage sur téléphone, un message demande de tourner l'appareil
  (iOS ne permet pas à une web app de verrouiller l'orientation).
- Respect des zones sûres (encoche, Dynamic Island, barre d'accueil) via `env(safe-area-inset-*)`.
- Hauteur `100dvh` pour suivre les barres dynamiques de Safari.
- Boutons d'au moins 52 px de haut (recommandation Apple : 44 pt minimum).
- Police de 16 px minimum pour éviter le zoom automatique de Safari.

## Données personnelles

Elles seront stockées localement sur l'appareil par défaut. Cette version n'enregistre
encore aucune donnée.
