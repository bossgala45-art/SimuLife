# engine/

Moteur de simulation de SIMULIFE — **vide pour l'instant** (prévu dans une mission ultérieure).

Règle d'architecture : ce dossier contient uniquement du TypeScript pur.
Il ne doit importer ni React, ni `src/ui/`, ni `src/storage/`.
ESLint fait respecter cette règle (`no-restricted-imports` dans `eslint.config.js`),
ce qui permettra de tester et de faire évoluer le moteur indépendamment de l'interface.
