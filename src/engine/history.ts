/**
 * Base extensible de repères historiques : validation stricte, puis lecture
 * des événements vécus par le personnage (avec son âge à ce moment-là).
 */
import { HISTORICAL_EVENTS, type HistoricalEvent } from './data/history.ts'
import { ageAt, fromCalendar, isValidDate } from './time.ts'
import type { CalendarDate, SimulationState } from './types.ts'

export type { HistoricalEvent, HistoryCategory } from './data/history.ts'

const toMinutes = (d: CalendarDate) => fromCalendar({ ...d, hour: 0, minute: 0 })

/** Raisons de refus (liste vide : base valide). */
export function validateHistory(events: readonly HistoricalEvent[]): string[] {
  const errors: string[] = []
  const ids = new Set<string>()
  for (const e of events) {
    const name = `« ${e.id || '?'} »`
    if (!e.id || ids.has(e.id)) errors.push(`${name} : identifiant manquant ou en double.`)
    ids.add(e.id)
    if (!isValidDate(e.date)) errors.push(`${name} : date invalide.`)
    if (e.end && (!isValidDate(e.end) || toMinutes(e.end) < toMinutes(e.date))) errors.push(`${name} : date de fin invalide.`)
    if (!e.title?.trim()) errors.push(`${name} : titre manquant.`)
    if (!e.source?.label?.trim() || !e.source.quote?.trim()) errors.push(`${name} : source ou citation manquante.`)
    try {
      if (new URL(e.source?.url ?? '').protocol !== 'https:') errors.push(`${name} : la source doit être une adresse https.`)
    } catch {
      errors.push(`${name} : adresse de la source invalide.`)
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.checkedOn ?? '')) errors.push(`${name} : date de vérification manquante.`)
  }
  return errors
}

export interface HistoryBase {
  readonly events: readonly HistoricalEvent[]
}

/** Crée une base (triée par date) ; refuse un événement non sourcé ou mal daté. */
export function createHistoryBase(events: readonly HistoricalEvent[]): HistoryBase {
  const errors = validateHistory(events)
  if (errors.length > 0) throw new Error(`Base historique invalide : ${errors.join(' ')}`)
  return { events: [...events].sort((a, b) => toMinutes(a.date) - toMinutes(b.date)) }
}

/** Ajoute des événements à une base existante (mêmes règles). */
export const extendHistory = (base: HistoryBase, more: readonly HistoricalEvent[]) => createHistoryBase([...base.events, ...more])

export const HISTORY = createHistoryBase(HISTORICAL_EVENTS)

/** Événements survenus entre la naissance du personnage et la date simulée, avec son âge. */
export function livedEvents(state: SimulationState, base: HistoryBase = HISTORY): { event: HistoricalEvent; age: number }[] {
  const birth = toMinutes(state.character.birthDate)
  return base.events
    .filter((e) => toMinutes(e.date) >= birth && toMinutes(e.date) <= state.clock)
    .map((event) => ({ event, age: ageAt(state.character.birthDate, toMinutes(event.date)) }))
}

/** Dernière date couverte par la base : au-delà, aucun repère n'est affiché (rien n'est inventé). */
export const historyCoverageEnd = (base: HistoryBase = HISTORY) => base.events.at(-1)?.end ?? base.events.at(-1)?.date
