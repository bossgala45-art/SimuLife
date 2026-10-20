/**
 * Arbre des destins : une « vie » est un arbre de branches.
 *
 * - La racine part du passé déclaré (dossier de vie) ou d'une nouvelle vie.
 * - Chaque branche a son propre état de simulation et son propre journal.
 * - Une branche enfant naît d'un instantané de sa branche parent (point de
 *   divergence daté) et d'une décision alternative.
 * - Les instantanés sont immuables ; seul l'instantané « head » d'une branche
 *   avance quand on la joue.
 */

/** Fait déclaré du passé réel, conservé tel quel jusqu'à la divergence. */
export interface DeclaredEvent {
  label: string
  /** Date telle que déclarée (« vers 7 ans », « environ 2010 »…). */
  when: string
  detail?: string
}

export interface TreeRecord {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  rootBranchId: string
  /** Dernière branche jouée, reprise par « Continuer ». */
  currentBranchId: string
  declaredPast: DeclaredEvent[]
}

export interface Divergence {
  /** Instant de simulation (minutes) où la branche se sépare de son parent. */
  at: number
  /** Instantané du parent dont la branche est issue. */
  fromSnapshotId: string
  decision: Decision
  /** Résumé lisible : « Inscription : CAP Cuisine ». */
  label: string
}

export interface BranchRecord {
  id: string
  treeId: string
  parentId: string | null
  name: string
  createdAt: number
  updatedAt: number
  /** `null` pour la racine. */
  divergence: Divergence | null
  headSnapshotId: string
  /** Incrémentée à chaque sauvegarde : protège contre les écritures concurrentes. */
  revision: number
  /** Branche protégée : aucune sauvegarde possible tant qu'elle l'est. */
  locked: boolean
  /** Résumé de l'état courant (affichage de l'arbre). */
  summary: BranchSummary
}

export interface BranchSummary {
  clock: number
  characterName: string
  age: number
  money: number
  occupation: string
  alive: boolean
}

export type SnapshotKind = 'origin' | 'checkpoint' | 'head'

export interface SnapshotRecord {
  id: string
  treeId: string
  branchId: string
  kind: SnapshotKind
  /** Horloge de simulation de l'état enregistré. */
  clock: number
  createdAt: number
  /** État de simulation sérialisé (JSON). */
  data: string
  /** Empreinte SHA-256 de `data`, vérifiée à chaque lecture. */
  checksum: string
}

export type HistoryType = 'tree_created' | 'branch_created' | 'resumed' | 'saved' | 'renamed' | 'locked' | 'unlocked' | 'deleted' | 'imported'

export interface HistoryRecord {
  id?: number
  treeId: string
  branchId: string | null
  at: number
  type: HistoryType
  message: string
}

/** Décision alternative appliquée au point de divergence. */
export type Decision =
  /** Même situation, autre hasard. */
  | { kind: 'reroll' }
  /** Accepter un poste (offre reçue). */
  | { kind: 'career'; career: string }
  | { kind: 'quit_job' }
  /** S'inscrire à une formation (hors calendrier habituel : c'est un choix de vie). */
  | { kind: 'study'; program: string }
  /** Se rapprocher de sa famille ou s'en éloigner. */
  | { kind: 'move'; near: boolean }
  /** Renouer avec un proche. */
  | { kind: 'reconnect'; personId: string }
