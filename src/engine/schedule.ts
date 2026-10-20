/**
 * File des événements différés. Séparée de `events.ts` pour que les modules
 * de règles puissent programmer des événements sans dépendre du registre.
 */
import { invariant } from './errors.ts'
import type { GameEvent, SimulationState } from './types.ts'

/** Programme un événement à une date future (ou présente). */
export function scheduleEvent(draft: SimulationState, at: number, event: GameEvent): void {
  invariant(Number.isSafeInteger(at) && at >= draft.clock, `Événement « ${event.type} » programmé dans le passé.`)
  draft.scheduled.push({ id: draft.nextEventId++, at, event })
  // Ordre stable et reproductible : par date, puis par ordre de programmation.
  draft.scheduled.sort((a, b) => a.at - b.at || a.id - b.id)
}

export function nextDueTime(draft: SimulationState): number | undefined {
  return draft.scheduled[0]?.at
}

/** Retire les événements différés qui répondent au critère (ex. : un remboursement soldé). */
export function cancelEvents(draft: SimulationState, match: (event: GameEvent) => boolean): void {
  draft.scheduled = draft.scheduled.filter((s) => !match(s.event))
}
