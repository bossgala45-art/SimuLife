import { occupationLabel } from '../engine/careers.ts'
import { ageAt } from '../engine/time.ts'
import type { SimulationState } from '../engine/types.ts'
import type { BranchSummary } from './types.ts'

/** Résumé d'un état, gardé dans la branche pour afficher l'arbre sans relire chaque instantané. */
export function summarize(state: SimulationState): BranchSummary {
  const c = state.character
  return {
    clock: state.clock,
    characterName: c.name,
    age: ageAt(c.birthDate, state.clock),
    money: c.money,
    occupation: state.career.job ? occupationLabel(state.career.job.career) : state.education.enrollment ? 'En formation' : 'Sans emploi',
    alive: c.alive,
  }
}

/** « Vie de Léa », « Vie d’Alex » (élision devant une voyelle). */
export function lifeTitle(name: string): string {
  return /^[aeiouyàâäéèêëîïôöûüù]/i.test(name) ? `Vie d’${name}` : `Vie de ${name}`
}
