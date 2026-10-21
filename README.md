# SIMULIFE

Application web (installable sur iPhone) simulant des vies alternatives réalistes.

**État actuel (mission 8 — finalisation) :** application complète et auditée. Liste des
fonctionnalités terminées et partielles, limitations, résultats réels des tests : voir
[AUDIT.md](AUDIT.md). Licences : [LICENCES-TIERS.md](LICENCES-TIERS.md).
**Aucun essai n'a été fait sur un véritable iPhone** (émulation Chromium uniquement).

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
npm run audit        # simulations longues et audits (≈ 3 min) : 12 vies × 40 ans, 300 dossiers…
```

`npm run dev` écoute aussi sur le réseau local (`--host`) : un iPhone connecté au
**même Wi-Fi** que l'ordinateur peut ouvrir l'adresse « Network » affichée.

## Déploiement sur un hébergement compatible

L'application est un site statique (dossier `dist/`) : tout hébergeur HTTPS de fichiers statiques
convient (GitHub Pages, Netlify, Cloudflare Pages, un serveur web classique…). HTTPS est
indispensable pour l'installation sur iPhone, le service worker et le chiffrement.

1. Construire : `npm ci && npm run check` (produit `dist/`).
2. Si l'application n'est pas à la racine du domaine, indiquer son chemin :
   `SIMULIFE_BASE=/mon-chemin/ npm run build`.
3. Publier **tout** le contenu de `dist/` (dont `sw.js`, `services.json`, `manifest.webmanifest`,
   `licences-tiers.txt`).
4. Recommandé : servir `sw.js` et `index.html` sans cache long (les autres fichiers ont des noms
   uniques et peuvent être mis en cache longtemps).

**GitHub Pages** (en ligne : https://bossgala45-art.github.io/SimuLife/) : le fichier
`.github/workflows/deploy-pages.yml` publie l'application **automatiquement à chaque modification de
la branche `main`**, après lint, typage, tests et construction avec le bon chemin (`/SimuLife/`).
Si une vérification échoue, rien n'est publié et la version en ligne reste la précédente.
On peut aussi relancer la publication à la main : Actions → « Publier sur GitHub Pages » → Run
workflow. Prérequis (déjà fait) : Settings → Pages → Source : « GitHub Actions ».

**Mise à jour sur l'iPhone** : l'application installée cherche une nouvelle version à chaque
ouverture et à chaque retour au premier plan. À l'accueil, elle s'installe d'elle-même ; pendant
une partie, un bandeau propose « Mettre à jour » (les sauvegardes en cours sont terminées avant le
rechargement, rien n'est perdu). La version installée est indiquée dans « À propos ».

Pour couper la carte sans republier le code : mettre `"enabled": false` dans `services.json` sur
l'hébergement.

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

## Systèmes sociaux et économiques (`src/engine/`)

| Fichier | Rôle |
|---|---|
| `people.ts` | Entourage (parents, frères et sœurs, amis, collègues), tiré de la graine ou du dossier |
| `relationships.ts` | Proximité, confiance, tension ; souvenirs relationnels dont le poids s'estompe |
| `autonomy.ts` | Vie des proches chaque nuit, sans le joueur : âge, retraite, maladie, déménagement, appels, anniversaires |
| `social.ts` | Appeler, rendre visite, offrir, aider, demander un prêt |
| `skills.ts` | 6 compétences, niveaux 0 à 10 |
| `education.ts` | Inscription (rentrée, prérequis, frais), heures d'étude, examen différé, diplômes |
| `careers.ts` / `requirements.ts` | Candidatures (réponse différée), paie au prorata, appréciation, absences, licenciement, chômage |
| `finances.ts` | Compte, découvert, épargne, charges fixes, prêts (banque ou proches), relevé |
| `incidents.ts` | Imprévus selon le contexte, avec délai avant répétition |
| `data/careers.ts` | **Catalogues extensibles** : diplômes, formations, métiers (ajouter une entrée suffit) |
| `data/economy.ts` | Valeurs économiques, toutes marquées **approximatives** |

Règles vérifiées par les tests :

- **Le hasard n'est jamais présenté comme certain** : toute action à issue aléatoire annonce ses
  probabilités avant d'être choisie (« Embauche : ≈ 45 % ») ; le tirage n'a lieu qu'au moment du résultat.
- **Les conséquences différées sont conservées** dans l'état (réponse de candidature, examen,
  échéances de prêt, guérison d'un proche) et survivent à la sauvegarde.
- **Âge, temps et contexte** : rentrée en septembre, banque en semaine, visites le jour,
  âge minimal des métiers, retraite des proches à 64 ans.
- **Données approximatives** : salaires, loyers, taux et allocations sont des ordres de grandeur
  non vérifiés, signalés par « ≈ » dans l'interface.
- Une sauvegarde de la version précédente (v1) est migrée automatiquement.

## Arbre des destins (`src/destiny/`, `src/storage/destiny.ts`)

Une vie est un arbre de branches. La racine part du passé déclaré (dossier de vie) ou d'une
nouvelle vie ; chaque branche naît d'un **instantané daté** de sa branche parent et d'une
**décision alternative** (accepter un poste, reprendre des études, quitter son emploi,
déménager, renouer avec un proche, ou simplement « autre hasard »).

| Fichier | Rôle |
|---|---|
| `destiny/types.ts` | Vie, branche (identifiant unique, parent, divergence datée), instantané, historique |
| `destiny/decisions.ts` | Décisions alternatives, validées à l'instant choisi ; hasard propre à chaque branche |
| `destiny/tree.ts` | Construction de l'arbre, ascendance, contrôle de structure (racine, parents, cycles) |
| `destiny/exchange.ts` | Export / import versionné (`simulife-destiny`, version 1), validation complète |
| `storage/destiny.ts` | Stockage IndexedDB avec **Dexie** : création, reprise, sauvegarde, bifurcation, instantanés |

Garanties (testées) :

- **Indépendance** : chaque branche a son propre état, son journal et son hasard ;
  jouer une branche ne modifie aucune autre.
- **Protection** : une sauvegarde vise une seule branche et est refusée si la branche est
  protégée, si elle a été modifiée ailleurs (numéro de révision), ou si elle reculerait dans le temps.
- **Intégrité** : chaque instantané porte une empreinte SHA-256 vérifiée à la lecture ;
  restauration possible depuis le dernier instantané intact.
- **Instantanés** : un tous les 30 jours simulés, 12 au plus par branche (le journal y est
  allégé aux 300 dernières entrées) ; un point de divergence n'est jamais supprimé.
- **Import** : tout est vérifié avant écriture (format, version, empreintes, états, structure) ;
  les identifiants sont renouvelés, rien n'est jamais écrasé.
- L'ancienne sauvegarde unique (`localStorage`) est importée comme une vie au premier lancement.

## Dossier de vie (`src/dossier/`)

TypeScript pur, comme le moteur (même règle ESLint d'isolation). API publique : `src/dossier/index.ts`.

| Fichier | Rôle |
|---|---|
| `catalog/*.ts` | Questions, un fichier par catégorie (12 catégories) |
| `questionnaire.ts` | Conditions, visibilité, validation et modification des réponses, progression, naissance et âge de départ |
| `dates.ts` | Dates exactes ou approximatives (année, mois, jour, âge, « environ ») converties en intervalles |
| `coherence.ts` | Contrôle chronologique : erreurs (impossible) et avertissements (inhabituel) |
| `timeline.ts` | Chronologie personnelle construite à partir des faits déclarés |
| `profile.ts` | Profil de départ : faits déclarés séparés des hypothèses simulées |
| `setup.ts` | Passage à la simulation : entourage, diplômes, situation pro, compétences |
| `serialization.ts` | Sauvegarde du dossier, vérifiée au chargement |

Principes :

- Chaque question accepte « Je ne sais pas » et « Je préfère ne pas répondre ».
- Une réponse masquée par une condition est conservée mais ignorée ; elle revient si la condition redevient vraie.
- Deux dates floues qui peuvent se chevaucher ne sont jamais déclarées incohérentes.
- Une hypothèse simulée ne remplace jamais un fait déclaré ; chacune indique sa raison.
- Aucune question sur la religion, la politique, l'orientation sexuelle, l'origine, les montants
  d'argent, les diagnostics médicaux ou les coordonnées (vérifié par un test).
- Le nombre de questions est vérifié par un test : il n'est annoncé que s'il est réel.

## Narration et monde (mission 7)

- **Dialogues sans IA** (`src/engine/dialogue.ts`) : onze sujets (prendre des nouvelles, raconter
  une nouvelle, soutenir un proche malade, féliciter, souhaiter un anniversaire, remercier,
  évoquer un souvenir, s'excuser, se confier, demander conseil, bavarder). Chaque sujet n'est
  proposé que si le contexte réel le permet ; sinon sa raison est affichée. Les effets sur la
  relation sont bornés ; une issue incertaine (excuses acceptées ou non) est annoncée avec sa
  probabilité. Les réponses des proches ne citent que des faits de la simulation.
- **Deux canaux**, deux actions du moteur : `talk` (en personne, 15 min, mêmes contraintes qu'une
  rencontre : horaires, proche éloigné le week-end, collègue en semaine) et `write` (message,
  5 min ; la réponse arrive 10 min à 2 h 30 plus tard, jamais la nuit).
- **Messages des proches** (`src/engine/story.ts`) : ils annoncent eux-mêmes leurs nouvelles
  (maladie, déménagement, travail, retraite), souhaitent l'anniversaire du personnage et écrivent
  quand le contact se perd. Ces règles ne tirent pas le générateur aléatoire de la simulation
  (variantes choisies par hachage) : le reste de la vie se déroule exactement comme avant.
- **Actions libres** (`src/engine/intent.ts`) : une phrase (« appeler maman », « mettre 100 € de
  côté », « postuler comme serveur ») est interprétée par des règles en actions proposées, avec
  leur validation. Rien n'est exécuté sans confirmation ; un montant impossible est ajusté et
  expliqué ; une phrase incomprise ne propose rien.
- **Mémoire narrative** : diplômes, embauches, deuils, disputes, anniversaires « ronds »…
  deviennent des souvenirs durables (page Souvenirs), réutilisés dans les dialogues.
- **Sauvegarde v3** : messages, souvenirs et lieu ; les sauvegardes v2 (et v1) sont migrées,
  les souvenirs étant reconstitués depuis le journal.
- **Repères historiques** (`src/engine/data/history.ts`) : 11 événements datés, chacun avec sa
  source (Wikipédia en français), une citation exacte et sa date de vérification (21/10/2026).
  `validateHistory` refuse tout ajout non sourcé ou mal daté. Aucun événement n'est inventé
  pour les années simulées au-delà d'août 2024.
- **Carte** (`src/ui/map/osm.ts`) : aucune donnée géographique n'existe dans une vie par défaut
  (le dossier ne demande pas de ville), donc rien n'est affiché. Le joueur peut choisir un lieu :
  recherche Nominatim et tuiles OpenStreetMap, après autorisation. Règles d'usage de la
  Fondation OSM appliquées : recherche seulement sur validation (pas d'autocomplétion), une
  requête par seconde au plus, cache des résultats, seulement les tuiles affichées (ni
  préchargement ni hors-ligne), attribution toujours visible, adresses des services dans
  `public/services.json` (coupure possible sans mise à jour du code). Politiques :
  https://operations.osmfoundation.org/policies/nominatim/ et
  https://operations.osmfoundation.org/policies/tiles/ — ces services sont gratuits mais
  limités et sans garantie ; un usage intensif demanderait un fournisseur dédié.
- **Autorisations** (`src/ai/consent.ts`) : avant tout envoi, une fenêtre indique le
  destinataire, les données exactes et la finalité ; accord pour une fois ou durable, révocable
  dans Paramètres.
- **IA externe facultative** (`src/ai/narrativeAi.ts`) : **désactivée**. Aucun service d'IA
  gratuit, sécurisé et durable n'a été retenu : une clé d'API ne peut pas être placée dans
  l'application sans être exposée, il faudrait un serveur intermédiaire (hébergement, coût,
  maintenance), et les offres gratuites changent sans préavis. L'adaptateur est prêt : contexte
  minimisé (ni prénom, ni date, ni montant), autorisation obligatoire, réponses filtrées
  (texte nettoyé, actions sur liste blanche, cible forcée, validation par le moteur) et jamais
  appliquées sans le choix du joueur. Le jeu fonctionne entièrement sans IA.

Vérifié dans Chromium (émulation iPhone 15) : action libre, conversation écrite et en personne,
réponse différée et badge « non lu », souvenirs, repères historiques, autorisation puis carte,
aucune requête vers OpenStreetMap avant l'accord, aucune erreur console, pas de débordement.
Non vérifié : les vrais serveurs Nominatim et de tuiles n'ont pas été contactés (réponses
simulées dans le test, pour ne pas leur envoyer de requêtes automatisées) ; clavier et saisie
de texte dans Safari iOS ; comportement réel sur iPhone.

## Interface de jeu (`src/ui/game/`, `src/ui/avatar/`, `src/ui/audio/`)

- **Coque** (`GameShell.tsx`) : en-tête (nom, âge, date, heure, compte), barre inférieure
  Vie / Temps / Social / Monde / Destins, menu en feuille Santé / Études / Carrière / Finances /
  Compétences / Journal / Paramètres. Chaque écran lit l'état du moteur et n'agit que par
  `performAction` ou `advance` ; aucun bouton ne simule une fonction absente.
- **Avatar** : formes simples générées par le code (React Three Fiber, Three.js), sans modèle ni
  texture externes, chargé à la demande. Son apparence vient du moteur (humeur → expression,
  sommeil → yeux, fatigue → posture, maladie → teint, âge → cheveux gris, métier → tenue).
  Sans WebGL, si la 3D est désactivée ou si le rendu échoue, un avatar 2D (SVG) prend le relais ;
  le mode réel est affiché dans les Paramètres.
- **Cartes du jour** (`cards.ts`) : faits marquants d'hier et d'aujourd'hui tirés du journal ;
  certaines proposent une vraie action (appeler un proche malade, offrir un cadeau). Les cartes
  lues sont mémorisées par branche (`localStorage`, `simulife.cards.<branche>`).
- **Scènes** (`scenes.ts`) : plein écran pour le début d'une vie ou d'une branche, un diplôme,
  une embauche, un anniversaire, une augmentation, un licenciement, un deuil, un décès.
- **Agenda** (`agenda.ts`) : échéances réellement programmées (salaire, loyer, charges,
  mensualités, examens, réponses de candidature, anniversaires des proches). Une échéance dont
  l'issue dépend du hasard est marquée « Issue incertaine ».
- **Son** (`audio/sound.ts`) : musique et effets synthétisés par la Web Audio API (aucun fichier,
  donc aucune question de licence). Musique désactivée par défaut, volumes réglables, démarrage
  après le premier toucher (exigence de Safari).
- **Réglages** (`settings.ts`, `localStorage`, `simulife.settings.v1`) : thème automatique / clair
  / sombre, animations selon l'iPhone / réduites / complètes, avatar 3D, musique, effets.

### Vérifié dans Chromium (émulation iPhone 15, portrait)

Rendu WebGL de l'avatar (via SwiftShader), repli 2D quand WebGL est désactivé, thèmes clair et
sombre (conservés après rechargement), menu, cinq onglets et sept pages sans débordement
horizontal, scène « Joyeux anniversaire » déclenchée par le moteur, message en paysage, aucune
erreur dans la console.

### Impossible à vérifier sans iPhone réel

- Performances et chauffe de la 3D dans Safari iOS (fréquence d'images réelle, batterie).
- Comportement du son : déverrouillage au premier toucher, interrupteur silencieux, coupure en
  arrière-plan.
- Zones sûres réelles (encoche, Dynamic Island, barre d'accueil) et mode « écran d'accueil ».
- Ressenti tactile (défilement, appuis, flou d'arrière-plan des barres).
- Quotas de stockage et nettoyage automatique de Safari sur la durée.
- Perte du contexte WebGL en conditions réelles (mise en veille, changement d'application).

## Structure

```
.
├── index.html                # page d'entrée (méta iPhone, manifeste, icônes)
├── public/                   # manifeste et icônes
├── src/
│   ├── main.tsx              # point d'entrée React
│   ├── app/App.tsx           # navigation entre écrans, sauvegarde automatique
│   ├── engine/               # moteur de simulation (TS pur) + tests *.test.ts
│   ├── dossier/              # dossier de vie (TS pur) : catalogue, questionnaire, chronologie
│   ├── destiny/              # arbre des destins (TS pur) : branches, décisions, import/export
│   ├── ai/                   # autorisations d'envoi, adaptateur d'IA facultatif (désactivé)
│   ├── privacy/              # code de verrouillage, chiffrement des exports, effacement (+ tests)
│   ├── pwa/                  # service worker (modèle) et son enregistrement
│   ├── audit/                # simulations longues, dossiers aléatoires, stockage (npm run audit)
│   ├── storage/              # IndexedDB (Dexie) pour les vies, localStorage pour le dossier
│   ├── ui/
│   │   ├── platform.ts       # détection du mode « écran d'accueil »
│   │   ├── seed.ts           # graine aléatoire proposée par défaut
│   │   ├── dossier/          # écrans du dossier de vie (+ tests)
│   │   ├── game/             # coque du jeu, onglets, pages, cartes, scènes, agenda (+ tests)
│   │   ├── avatar/           # avatar 3D (React Three Fiber) et repli 2D (+ tests)
│   │   ├── audio/            # musique et effets synthétisés (+ tests)
│   │   ├── narrative/        # conversations, messagerie, souvenirs, histoire, carte (+ tests)
│   │   ├── map/              # OpenStreetMap : configuration, recherche, tuiles (+ tests)
│   │   ├── life/             # sections réutilisées : proches, emploi, études, argent
│   │   ├── destiny/          # écran de l'arbre, création de branche
│   │   ├── settings.ts       # réglages de l'interface (+ tests)
│   │   └── screens/          # Accueil, Nouvelle vie (+ tests)
│   ├── styles/global.css     # styles globaux, zones sûres iPhone
│   └── test/setup.ts         # configuration Vitest
├── scripts/licences.mjs      # inventaire des licences (LICENCES-TIERS.md, public/licences-tiers.txt)
├── .github/workflows/        # publication GitHub Pages, à lancer manuellement
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

- **Code de verrouillage** (accueil → Confidentialité et données, ou Paramètres) : 4 à 8 chiffres,
  seule une empreinte salée est stockée. Il protège l'accès à l'écran mais ne chiffre pas les
  données enregistrées sur l'appareil.
- **Exports chiffrés** (onglet Destins) : AES-256-GCM avec une clé dérivée de la phrase de passe
  (PBKDF2-SHA-256, 310 000 itérations). La phrase de passe n'est enregistrée nulle part.
- **Effacement complet** : supprime vies, branches, dossier, réglages, autorisations et code.
- **Envois externes** : uniquement la carte OpenStreetMap, après autorisation explicite et
  révocable ; l'IA externe est désactivée.

Les vies et leurs branches (IndexedDB, base `simulife`) et le dossier de vie
(`localStorage`, `simulife.dossier.v1`) sont enregistrés uniquement sur l'appareil, après
chaque action ou réponse. Rien n'est envoyé à un serveur sans autorisation explicite. L'export produit un fichier que
seul l'utilisateur partage s'il le souhaite.

## Licence

Copyright (c) 2026 bossgala45-art. **Tous droits réservés** : le code est visible mais aucune
licence de réutilisation n'est accordée (voir [LICENSE](LICENSE)). Les bibliothèques tierces
restent sous leurs propres licences ([LICENCES-TIERS.md](LICENCES-TIERS.md)).
