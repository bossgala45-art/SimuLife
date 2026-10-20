/**
 * Erreurs de programmation ou de données (argument invalide, sauvegarde corrompue…).
 *
 * Le refus d'une action par les règles du jeu n'est PAS une exception :
 * il est renvoyé sous forme de `ValidationIssue` (voir `actions.ts`).
 */
export type SimulationErrorCode = 'INVALID_ARGUMENT' | 'INVALID_SAVE' | 'INTERNAL'

export class SimulationError extends Error {
  readonly code: SimulationErrorCode
  /** Message sans le code, prêt à être affiché. */
  readonly detail: string

  constructor(code: SimulationErrorCode, detail: string) {
    super(`[${code}] ${detail}`)
    this.name = 'SimulationError'
    this.code = code
    this.detail = detail
  }
}

export function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new SimulationError('INTERNAL', message)
}
