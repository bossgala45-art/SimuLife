/** Aides partagées par les tests du moteur (non utilisées par l'application). */
import { createSimulation } from './simulation.ts'
import type { CalendarDateTime, Needs, SimulationState } from './types.ts'

export function newLife(
  options: { seed?: string; start?: CalendarDateTime; money?: number; needs?: Partial<Needs> } = {},
): SimulationState {
  const state = createSimulation({
    seed: options.seed ?? 'test',
    name: 'Léa',
    birthDate: { year: 2000, month: 3, day: 15 },
    start: options.start,
    money: options.money,
  })
  Object.assign(state.character.needs, options.needs)
  return state
}

/** Date de simulation, 2025 par défaut. 6 janvier 2025 = lundi. */
export const dt = (day: number, hour: number, month = 1, year = 2025, minute = 0): CalendarDateTime => ({
  year,
  month,
  day,
  hour,
  minute,
})
