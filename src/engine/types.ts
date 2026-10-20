/**
 * Types de l'état de simulation.
 *
 * L'état est un objet JSON pur (aucune fonction, aucune classe, aucune Date) :
 * il peut être cloné, sérialisé et comparé tel quel.
 */

export type NeedId = 'sleep' | 'hunger' | 'hygiene' | 'fatigue' | 'stress' | 'mood'
export type Needs = Record<NeedId, number>

export type AttributeId = 'health' | 'fitness' | 'intelligence' | 'sociability'
export type Attributes = Record<AttributeId, number>

export type StatusId = 'injured'

export type ActionId =
  | 'sleep'
  | 'cook_meal'
  | 'restaurant'
  | 'shower'
  | 'work'
  | 'sport'
  | 'study'
  | 'friends'
  | 'relax'
  | 'wait'

export interface CalendarDate {
  year: number
  /** 1 = janvier … 12 = décembre */
  month: number
  day: number
}

export interface CalendarDateTime extends CalendarDate {
  hour: number
  minute: number
}

export interface Character {
  name: string
  birthDate: CalendarDate
  /** Euros (entiers). Peut devenir négatif uniquement à cause d'une dépense imposée (loyer). */
  money: number
  needs: Needs
  attributes: Attributes
  statuses: StatusId[]
  alive: boolean
  /** Numéro du dernier jour travaillé (voir `dayNumber`), pour limiter à un service par jour. */
  lastWorkDay: number | null
}

export type GameEvent =
  | { type: 'rent_due'; amount: number }
  | { type: 'birthday' }
  | { type: 'injury_recovered' }
  | { type: 'work_bonus'; amount: number }
  | { type: 'sport_injury' }
  | { type: 'friend_call' }

export type GameEventType = GameEvent['type']

export interface ScheduledEvent {
  id: number
  /** Instant de déclenchement, en minutes de simulation (voir `time.ts`). */
  at: number
  event: GameEvent
}

export type LogKind = 'action' | 'event' | 'warning' | 'day' | 'system'

export interface LogEntry {
  seq: number
  /** Instant, en minutes de simulation. */
  at: number
  kind: LogKind
  code: string
  message: string
  data?: Record<string, string | number | boolean>
}

export interface SimulationState {
  version: 1
  /** Graine d'origine, telle que saisie. */
  seed: string
  /** État courant du générateur pseudo-aléatoire (entier 32 bits non signé). */
  rngState: number
  /** Horloge : minutes écoulées depuis le 1er janvier 1970 à 00:00 (calendrier grégorien, sans fuseau). */
  clock: number
  character: Character
  scheduled: ScheduledEvent[]
  nextEventId: number
  log: LogEntry[]
  nextLogSeq: number
}

export interface ValidationIssue {
  code: ValidationCode
  message: string
}

export type ValidationCode =
  | 'UNKNOWN_ACTION'
  | 'CHARACTER_DEAD'
  | 'INSUFFICIENT_MONEY'
  | 'NOT_SLEEPY'
  | 'NOT_HUNGRY'
  | 'TOO_HUNGRY'
  | 'ALREADY_CLEAN'
  | 'TOO_DIRTY'
  | 'TOO_TIRED'
  | 'TOO_SLEEPY'
  | 'INJURED'
  | 'CLOSED'
  | 'NOT_A_WORKDAY'
  | 'OUTSIDE_WORK_HOURS'
  | 'ALREADY_WORKED_TODAY'
