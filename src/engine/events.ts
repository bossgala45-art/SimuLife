/**
 * Événements.
 *
 * - Immédiats : déclenchés et appliqués tout de suite (`triggerEvent`).
 * - Différés : enregistrés dans `state.scheduled` avec une date (`scheduleEvent`),
 *   puis appliqués par l'horloge quand cette date est atteinte (`processDueEvents`).
 *
 * Les deux passent par le même registre de règles (`HANDLERS`).
 */
import { invariant } from './errors.ts'
import { writeLog } from './journal.ts'
import { clamp } from './needs.ts'
import { ageAt, MINUTES_PER_DAY, nextAnniversary, nextMonthlyOccurrence } from './time.ts'
import type { GameEvent, GameEventType, SimulationState } from './types.ts'

export const RENT_AMOUNT = 700
export const RENT_DAY = 1
export const RENT_HOUR = 8
export const BIRTHDAY_HOUR = 9
export const INJURY_RECOVERY_DAYS = 3

type Handler<T extends GameEventType> = (draft: SimulationState, event: Extract<GameEvent, { type: T }>) => void

const HANDLERS: { [T in GameEventType]: Handler<T> } = {
  rent_due(draft, event) {
    draft.character.money -= event.amount
    writeLog(draft, 'event', 'rent_due', `Loyer prélevé : −${event.amount} €.`, { amount: event.amount })
    if (draft.character.money < 0) {
      writeLog(draft, 'warning', 'debt', `Compte à découvert : ${draft.character.money} €.`, {
        money: draft.character.money,
      })
    }
    scheduleEvent(draft, nextMonthlyOccurrence(draft.clock, RENT_DAY, RENT_HOUR), event)
  },

  birthday(draft, event) {
    const age = ageAt(draft.character.birthDate, draft.clock)
    draft.character.needs.mood = clamp(draft.character.needs.mood + 15)
    writeLog(draft, 'event', 'birthday', `Joyeux anniversaire ! ${draft.character.name} a ${age} ans.`, { age })
    scheduleEvent(draft, nextAnniversary(draft.clock, draft.character.birthDate, BIRTHDAY_HOUR), event)
  },

  sport_injury(draft) {
    const c = draft.character
    c.attributes.health = clamp(c.attributes.health - 8)
    if (!c.statuses.includes('injured')) c.statuses.push('injured')
    writeLog(draft, 'event', 'sport_injury', `Blessure pendant le sport (santé −8). Repos sportif ${INJURY_RECOVERY_DAYS} jours.`)
    scheduleEvent(draft, draft.clock + INJURY_RECOVERY_DAYS * MINUTES_PER_DAY, { type: 'injury_recovered' })
  },

  injury_recovered(draft) {
    const c = draft.character
    c.statuses = c.statuses.filter((s) => s !== 'injured')
    writeLog(draft, 'event', 'injury_recovered', 'Blessure guérie : le sport est de nouveau possible.')
  },

  work_bonus(draft, event) {
    draft.character.money += event.amount
    writeLog(draft, 'event', 'work_bonus', `Prime reçue pour ton travail : +${event.amount} €.`, { amount: event.amount })
  },

  friend_call(draft) {
    draft.character.needs.mood = clamp(draft.character.needs.mood + 10)
    draft.character.needs.stress = clamp(draft.character.needs.stress - 5)
    writeLog(draft, 'event', 'friend_call', 'Un ami t’appelle pour prendre des nouvelles (humeur +10).')
  },
}

export const EVENT_TYPES = Object.keys(HANDLERS) as GameEventType[]

/** Applique un événement immédiatement. */
export function triggerEvent(draft: SimulationState, event: GameEvent): void {
  const handler = HANDLERS[event.type] as Handler<typeof event.type>
  handler(draft, event)
}

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

/** Applique, dans l'ordre, tous les événements dont la date est atteinte. */
export function processDueEvents(draft: SimulationState): void {
  while (draft.scheduled.length > 0 && draft.scheduled[0].at <= draft.clock) {
    const { event } = draft.scheduled.shift()!
    triggerEvent(draft, event)
  }
}
