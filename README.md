# SIMULIFE

Application web (installable sur iPhone) simulant des vies alternatives réalistes.

**État actuel (mission 2) :** moteur de simulation (temps, besoins, actions,
événements, hasard reproductible) et démonstration jouable sur plusieurs journées.

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

## Moteur de simulation (`src/engine/`)

TypeScript pur, sans React ni accès au navigateur. API publique : `src/engine/index.ts`.

| Fichier | Rôle |
|---|---|
| `types.ts` | État de simulation : objet JSON pur, sérialisable tel quel |
| `time.ts` | Horloge en minutes entières, calendrier grégorien sans fuseau, avance par jour / semaine / mois |
| `rng.ts` | Générateur pseudo-aléatoire à graine (mulberry32), état sur 32 bits enregistré dans la partie |
| `needs.ts` | Besoins (sommeil, faim, hygiène, fatigue, stress, humeur) et leur évolution horaire |
| `actions.ts` | Catalogue d'actions : préconditions, durée, coût, effets ; validation |
| `events.ts` | Événements immédiats et différés (loyer, anniversaire, blessure, prime…) |
| `journal.ts` | Journal structuré (numéro, date, type, code, message, données) |
| `routine.ts` | Routine automatique utilisée pour avancer d'un jour, d'une semaine, d'un mois |
| `simulation.ts` | Création d'une vie, exécution d'actions, passage du temps |
| `serialization.ts` | Sauvegarde / chargement avec vérification de chaque champ |

Garanties, couvertes par les tests :

- **Aucune action impossible** : toute action (du joueur ou de la routine) passe par
  `validateAction`, qui renvoie la liste complète des raisons de refus. Une action refusée
  ne modifie pas l'état.
- **Temps cohérent** : l'horloge est un entier de minutes ; avancer d'un jour ajoute
  exactement 1 440 minutes, d'un mois un mois calendaire (31 janv. → 28 févr.).
  Les événements différés s'appliquent à la minute prévue.
- **Reproductible** : même graine + même état + mêmes choix = même résultat, y compris
  après sauvegarde et rechargement. Le moteur n'utilise ni `Math.random`, ni l'heure
  réelle, ni de fonction mathématique dont le résultat varie d'un navigateur à l'autre.
- **Erreurs explicites** : refus de règle → `ValidationIssue { code, message }` ;
  argument ou sauvegarde invalide → `SimulationError` avec code et message en français.
- **Fonctions pures** : `performAction` et `advance` renvoient un nouvel état et les
  entrées de journal produites, sans modifier l'état reçu.

## Structure

```
.
├── index.html                # page d'entrée (méta iPhone, manifeste, icônes)
├── public/                   # manifeste et icônes
├── src/
│   ├── main.tsx              # point d'entrée React
│   ├── app/App.tsx           # navigation entre écrans, sauvegarde automatique
│   ├── engine/               # moteur de simulation (TS pur) + tests *.test.ts
│   ├── storage/savegame.ts   # sauvegarde locale (localStorage)
│   ├── ui/
│   │   ├── platform.ts       # détection du mode « écran d'accueil »
│   │   ├── seed.ts           # graine aléatoire proposée par défaut
│   │   └── screens/          # Accueil, Nouvelle vie, Vie (+ tests)
│   ├── styles/global.css     # styles globaux, zones sûres iPhone
│   └── test/setup.ts         # configuration Vitest
├── eslint.config.js
├── vite.config.ts            # config Vite + Vitest
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

La partie est enregistrée uniquement sur l'appareil (`localStorage`, clé
`simulife.save.v1`), après chaque action. Rien n'est envoyé à un serveur.
