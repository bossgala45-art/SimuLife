export type DestinyErrorCode =
  /** Arbre, branche ou instantané introuvable. */
  | 'NOT_FOUND'
  /** La branche a été modifiée entre-temps (autre onglet, sauvegarde en retard). */
  | 'CONFLICT'
  /** Branche protégée contre la modification. */
  | 'LOCKED'
  /** La sauvegarde ferait reculer la branche dans le temps. */
  | 'TIME_TRAVEL'
  /** Empreinte ou contenu incohérent. */
  | 'INTEGRITY'
  /** Fichier d'import invalide. */
  | 'INVALID_IMPORT'
  /** Décision alternative impossible à ce moment de la vie. */
  | 'INVALID_DECISION'
  /** Opération interdite (supprimer la racine, une branche qui a des enfants…). */
  | 'FORBIDDEN'
  /** Espace de stockage plein. */
  | 'QUOTA'
  /** IndexedDB indisponible (navigation privée, stockage désactivé…). */
  | 'STORAGE_UNAVAILABLE'
  | 'STORAGE'

export class DestinyError extends Error {
  readonly code: DestinyErrorCode
  readonly detail: string

  constructor(code: DestinyErrorCode, detail: string, options?: { cause?: unknown }) {
    super(`[${code}] ${detail}`, options)
    this.name = 'DestinyError'
    this.code = code
    this.detail = detail
  }
}
