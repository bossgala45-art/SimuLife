/**
 * Vieillissement du personnage, avec les mêmes règles que pour ses proches :
 * retraite à l'âge légal simplifié du jeu, puis risque de décès qui croît avec l'âge
 * (tiré au hasard, chaque jour, seulement à partir de 75 ans).
 */
import { DAILY } from './autonomy.ts'
import { retire } from './careers.ts'
import { writeLog } from './journal.ts'
import { RETIREMENT_AGE } from './people.ts'
import { chance } from './rng.ts'
import { ageAt } from './time.ts'
import type { SimulationState } from './types.ts'

/** Probabilité quotidienne de décès lié à l'âge (même loi que pour les proches). */
export function oldAgeDeathChance(state: SimulationState): number {
  const age = ageAt(state.character.birthDate, state.clock)
  if (age < 75) return 0
  return (age - 74) * DAILY.deathPerYearOver74 * (state.character.statuses.includes('sick') ? 3 : 1)
}

export function dailyAging(draft: SimulationState): void {
  const c = draft.character
  if (!c.alive) return
  const age = ageAt(c.birthDate, draft.clock)
  if (age >= RETIREMENT_AGE && draft.career.pension === null) retire(draft)
  const p = oldAgeDeathChance(draft)
  if (p > 0 && chance(draft, p)) {
    c.alive = false
    writeLog(draft, 'event', 'death', `${c.name} est décédé·e de vieillesse, à ${age} ans.`)
  }
}
