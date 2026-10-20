export type DossierErrorCode = 'INVALID_CATALOG' | 'INVALID_SAVE'

/** Erreur de programmation (catalogue mal construit) ou de données (sauvegarde corrompue). */
export class DossierError extends Error {
  readonly code: DossierErrorCode
  readonly detail: string

  constructor(code: DossierErrorCode, detail: string) {
    super(`[${code}] ${detail}`)
    this.name = 'DossierError'
    this.code = code
    this.detail = detail
  }
}
