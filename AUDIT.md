# SIMULIFE — Audit final (mission 8)

Audit réalisé le 21 octobre 2026 sur la branche `mission-8-finalisation`, dans un conteneur Linux
(Node 22.22.0) avec Chromium en émulation d'iPhone. **Aucun test n'a été fait sur un véritable
iPhone** : les points qui en dépendent sont signalés comme non vérifiés.

## Résultats réels des tests

| Vérification | Commande | Résultat |
| --- | --- | --- |
| Lint (ESLint) | `npm run lint` | aucune erreur |
| Typage (TypeScript strict) | `npm run typecheck` | aucune erreur |
| Tests unitaires, d'intégration et de parcours | `npm run test` | **313 réussis sur 313** (45 fichiers) |
| Simulations longues et audits | `npm run audit` | **15 réussis sur 15** (3 fichiers, 198 s) |
| Construction de production | `npm run build` | réussie (`dist/`, service worker généré) |
| Contrôle navigateur (Chromium, iPhone SE et 15) | script Playwright | voir ci-dessous |

Répartition des 313 tests : moteur 139, dossier de vie 53, interface (parcours d'écrans) 43,
interface (modules) 33, stockage 20, arbre des destins 9, IA et autorisations 6, confidentialité 5,
audits courts 5.

`npm run audit` (version longue) :

- **12 vies × 40 ans** simulées mois par mois, avec un joueur qui tente au hasard 4 actions par mois
  (≈ 10 500 actions exécutées, ≈ 12 500 refusées par la validation) : **0 anomalie d'invariant**,
  sauvegarde vérifiée chaque année ; environ 15 à 17 s par vie de 40 ans ; état final ≈ 600 Ko.
- Une vie commencée à 85 ans : retraite, puis décès de vieillesse à 88 ans, état sain jusqu'au bout.
- **300 dossiers de vie aléatoires** (réponses valides, inconnues, refusées, dates parfois incohérentes) :
  300 vies créées, 0 erreur ; 1 347 incohérences de dates signalées par le contrôle de cohérence
  (comportement attendu, rien ne plante).
- **10 ans sauvegardés mois par mois** dans IndexedDB (simulé) : points de reprise bornés (≤ 12),
  intégrité vérifiée, reprise à l'octet près après fermeture, branche depuis le passé vécue un an,
  export (3,5 Mo) puis import identiques ; ≈ 31 ms par sauvegarde (Node, pas un iPhone).

Contrôle navigateur (Chromium, version de production) :

- **Accessibilité** : axe-core 4.10.3 (règles WCAG 2.0/2.1 A et AA) sur 24 écrans × 2 thèmes :
  **0 violation** après corrections.
- **Portrait** : 24 écrans sur iPhone SE (375 × 667) et iPhone 15 (393 × 852) : aucun débordement
  horizontal ; message « tourne ton iPhone » en paysage.
- **Erreurs console** : aucune.
- **Hors ligne** : service worker actif, 10 fichiers en cache ; après coupure du réseau, l'accueil,
  la création d'une vie et l'avatar 3D fonctionnent ; la carte indique qu'elle n'est pas disponible.
- **Publication sous `/SimuLife/`** (chemin GitHub Pages) : application, service worker,
  configuration et licences servis correctement.

## Les 15 points vérifiés

### 1. Cohérence du moteur — vérifié, 2 défauts corrigés
Vérificateur d'invariants (`src/engine/invariants.ts`) : bornes des besoins et caractéristiques,
argent entier, file d'événements triée et sans échéance oubliée, échéances récurrentes uniques,
cohérence maladie/blessure/guérison, dettes et remboursements, relations, journal, messages,
souvenirs, sauvegarde fidèle. Un test prouve qu'il détecte réellement les anomalies.
- **Corrigé** : un personnage à découvert mourait de faim en quelques mois (il ne mangeait à l'aide
  alimentaire qu'en fin de matinée). La routine prend désormais la dernière distribution du jour.
- **Corrigé** : le personnage ne vieillissait pas (il pouvait travailler à 120 ans). Il part
  maintenant à la retraite à 64 ans (pension approximative, marquée comme telle) et le risque de
  décès croît à partir de 75 ans, avec la même loi que pour ses proches.

### 2. Événements différés — vérifié
Aucun événement échu non traité, aucune échéance récurrente en double ou manquante, dettes et
remboursements toujours liés, au plus un examen et une réponse par candidature, sur 480 mois × 12 vies.
Après un décès, plus aucun événement n'est appliqué.

### 3. Relations entre personnages — vérifié
Jauges toujours entre 0 et 100, pas de relation orpheline ni de prêteur inconnu, souvenirs limités,
guérisons programmées cohérentes avec les maladies, messages jamais datés du futur.

### 4. Sauvegardes et branches — vérifié
Voir l'audit de stockage ci-dessus. Migrations v1 → v2 → v3 testées ; une sauvegarde v3 antérieure
à la pension se charge sans perte.

### 5. Questionnaire de vie — vérifié
300 dossiers aléatoires, dossier sérialisé à l'identique, chronologie et profil construits, vie valide.
Il compte toujours **109 questions** (l'objectif de 500 n'est pas atteint).

### 6. Performances de la 3D — partiellement vérifié
Avatar : ≈ 2 400 triangles, 7 objets, aucune texture, chargé à la demande (242 Ko compressés).
Mesure dans Chromium : 60 images/s, 95e centile 17 ms, y compris avec le processeur ralenti ×4.
**Mais** le rendu y est logiciel (SwiftShader) : ces chiffres ne disent rien d'un GPU d'iPhone.
Non vérifié : fluidité, chauffe et batterie sur un vrai iPhone.

### 7. Interface en portrait sur iPhone — vérifié en émulation
Aucun débordement sur deux tailles d'écran ; zones sûres gérées en CSS. Non vérifié : encoche et
Dynamic Island réelles, clavier de Safari, mode « écran d'accueil » réel.

### 8. Accessibilité — vérifié automatiquement, corrigé
Défauts trouvés et corrigés : contrastes insuffisants (vert d'eau en thème clair, texte blanc sur
violet, boutons dégradés, pastilles rouges, avertissements orange en thème clair). Les fonds sous
texte blanc ont désormais un contraste ≥ 4,5:1. Restent à vérifier par une personne : VoiceOver sur
iPhone, taille de texte dynamique d'iOS, navigation au clavier complète.

### 9. Licences des ressources — vérifié
18 bibliothèques embarquées : MIT (16), Apache-2.0 (1), BSD-3-Clause (1), toutes compatibles.
Textes complets publiés avec l'application (`licences-tiers.txt`, lien dans « À propos »).
Icônes, avatar et sons sont créés pour le projet ; carte et citations attribuées
(détail : `LICENCES-TIERS.md`). La licence du code de SIMULIFE n'est pas encore choisie.

### 10. Confidentialité et suppression des données — ajouté et vérifié
Nouveau : « Effacer toutes mes données » (accueil → Confidentialité et données, ou Paramètres)
supprime la base IndexedDB et toutes les clés `simulife.*`, sans toucher aux autres sites.
Aucune donnée n'est envoyée sans autorisation explicite (carte, IA).

### 11. Verrouillage par code — ajouté et vérifié
Code de 4 à 8 chiffres ; seule une empreinte PBKDF2-SHA-256 salée est stockée ; attente imposée
après 5 erreurs ; nouveau verrouillage après une minute en arrière-plan ; « code oublié » ne propose
que l'effacement. **Limite** : c'est un écran de confidentialité, il ne chiffre pas les données
enregistrées sur l'iPhone.

### 12. Chiffrement des exports — ajouté et vérifié
Export chiffré par phrase de passe (≥ 8 caractères) : PBKDF2-SHA-256 (310 000 itérations) et
AES-256-GCM, via le chiffrement intégré au navigateur. Phrase fausse ou fichier modifié : refusé
avec un message clair. L'export non chiffré reste possible, avec un avertissement.

### 13. Permissions des dialogues IA — vérifié
L'IA externe est désactivée. Si elle était branchée : autorisation obligatoire avant tout envoi,
données minimisées (ni prénom, ni date, ni argent), réponses filtrées et validées par le moteur,
jamais appliquées sans le choix du joueur. Les autorisations se retirent dans Paramètres.

### 14. Erreurs réseau — vérifié, amélioré
Messages clairs pour : pas de connexion, service limité (429), réponse illisible, délai dépassé
(IA), images de carte indisponibles. Le jeu lui-même n'a besoin d'aucun réseau.

### 15. Installation PWA — ajouté et vérifié en émulation
Nouveau : service worker généré au build. L'application installée s'ouvre hors ligne ; une nouvelle
version s'active quand toutes ses fenêtres sont fermées ; les cartes OpenStreetMap ne sont jamais
stockées (règle d'usage). Manifeste : plein écran, portrait, icônes 192 et 512 px.
Non vérifié : ajout réel à l'écran d'accueil d'un iPhone et comportement de Safari iOS.

## Fonctionnalités terminées

- Moteur de simulation déterministe : besoins, actions avec durée, coût, conditions et probabilités,
  routine automatique, temps qui passe (heure, jour, semaine, mois), retraite et vieillissement.
- Proches autonomes : maladies, déménagements, changements d'emploi, retraite, décès, souvenirs,
  appels spontanés, anniversaires.
- Études, métiers, candidatures, compétences, salaires, chômage, finances (épargne, découvert,
  prêts de la banque et des proches, charges, imprévus) — montants marqués approximatifs.
- Dossier de vie : 109 questions, dates approximatives, cohérence, chronologie, profil de départ.
- Arbre des destins : branches, retour dans le passé, protection, intégrité, export/import
  (chiffré ou non).
- Interface de jeu mobile : 5 onglets, 9 pages, cartes du jour, scènes, agenda, thèmes clair et
  sombre, animations réductibles, musique et effets synthétisés.
- Avatar 3D léger avec repli 2D automatique.
- Narration sans IA : 11 sujets de conversation, messages, conversations en personne, actions
  libres en français, souvenirs.
- Repères historiques sourcés (11 événements, 1969-2024).
- Confidentialité : code de verrouillage, exports chiffrés, effacement complet, autorisations
  révocables.
- Application installable, fonctionnant hors ligne.

## Fonctionnalités partielles

- **Dossier de vie** : 109 questions sur l'objectif de 500.
- **Carte** : seulement le lieu de vie choisi par le joueur ; pas de déplacement de la carte au
  doigt (zoom par boutons) ; dépend des services gratuits d'OpenStreetMap, sans garantie.
- **Base historique** : 11 événements, France et monde ; rien après août 2024.
- **Avatar** : volontairement simple (tête et corps, pas de bras ni de jambes, pas de vêtements
  détaillés).
- **IA externe** : adaptateur prêt mais désactivé (aucune solution gratuite, sécurisée et durable).
- **Accessibilité** : contrôle automatique sans défaut, mais pas d'essai avec VoiceOver.

## Limitations restantes

- Aucun essai sur un véritable iPhone (performances 3D, son, clavier, zones sûres, installation,
  stockage de Safari sur la durée).
- Le verrouillage par code ne chiffre pas les données sur l'appareil.
- Safari peut effacer les données d'un site qu'on n'ouvre plus pendant un certain temps (le risque
  est moindre une fois l'application ajoutée à l'écran d'accueil) : il faut exporter régulièrement
  ses vies (l'application le rappelle dans Paramètres).
- Sauvegardes volumineuses : ≈ 400 à 600 Ko par état, un export de 10 ans avec une branche ≈ 3,5 Mo.
- Économie, salaires, pensions : ordres de grandeur non vérifiés, marqués comme approximatifs.
- Le fichier JavaScript principal dépasse 500 Ko avant compression (184 Ko compressé).
- Licence du code de SIMULIFE à choisir par son propriétaire.
- Rien n'a été publié : la publication attend l'accord du propriétaire.
