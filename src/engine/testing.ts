/** Aides partagées par les tests du moteur (non utilisées par l'application). */
import { triggerEvent } from './events.ts'
import { createSimulation, type NewLifeOptions, type StepResult } from './simulation.ts'
import type { CalendarDateTime, GameEvent, Needs, SimulationState } from './types.ts'

export function newLife(
  options: { seed?: string; start?: CalendarDateTime; money?: number; needs?: Partial<Needs> } & Partial<
    Pick<NewLifeOptions, 'career' | 'entourage' | 'diplomas' | 'skills' | 'attributes'>
  > = {},
): SimulationState {
  const { needs, seed, ...rest } = options
  const state = createSimulation({
    seed: seed ?? 'test',
    name: 'Léa',
    birthDate: { year: 2000, month: 3, day: 15 },
    ...rest,
  })
  Object.assign(state.character.needs, needs)
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

export function ok(result: StepResult): SimulationState {
  if (!result.ok) throw new Error(`Refus inattendu : ${result.issues.map((i) => i.message).join(' / ')}`)
  return result.state
}

/** Applique un événement sur une copie de l'état (pour tester une règle isolément). */
export function withEvent(state: SimulationState, event: GameEvent): SimulationState {
  const draft = structuredClone(state)
  triggerEvent(draft, event)
  return draft
}

export const codesOf = (state: SimulationState) => state.log.map((e) => e.code)
