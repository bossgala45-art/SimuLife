/**
 * Types et briques communes aux catalogues d'actions (`actions.ts` et modules de règles).
 */
import type { NeedRates } from './needs.ts'
import { toCalendar } from './time.ts'
import type { ActionId, ActionParams, Attributes, Needs, SimulationState, ValidationCode } from './types.ts'

export interface ActionEffects {
  needs?: Partial<Needs>
  attributes?: Partial<Attributes>
  money?: number
}

export interface Precondition {
  code: ValidationCode
  /** Vrai si la précondition est remplie. */
  test: (state: SimulationState, params: ActionParams) => boolean
  message: string | ((state: SimulationState, params: ActionParams) => string)
}

export type ParamKind = 'person' | 'career' | 'program' | 'skill' | 'amount'

/** Issue incertaine d'une action, affichée AVANT de la choisir. */
export interface Outcome {
  label: string
  probability: number
}

export interface ActionDefinition {
  id: ActionId
  label: string
  description: string
  durationMinutes: number
  cost: { money: number }
  /** Peut être écourtée (par exemple quand on avance jusqu'à une heure précise). */
  interruptible: boolean
  sleeping: boolean
  /** Variations par heure pendant l'action, en plus de l'évolution normale. */
  ratesPerHour: NeedRates
  /** Effets appliqués à la fin de l'action. */
  effects: ActionEffects
  preconditions: Precondition[]
  /** Paramètres obligatoires (cible, métier, formation…). */
  params?: ParamKind[]
  /** Montants proposés quand l'action attend un montant. */
  amounts?: number[]
  /** Coût supplémentaire selon les paramètres (frais d'inscription, trajet…). */
  extraCost?: (state: SimulationState, params: ActionParams) => number
  /** Issues aléatoires et leur probabilité, pour l'affichage. */
  outcomes?: (state: SimulationState, params: ActionParams) => Outcome[]
  /** Règles complémentaires en fin d'action (tirages aléatoires, bonus liés aux caractéristiques…). */
  onComplete?: (draft: SimulationState, params: ActionParams) => void
}

export const hourOf = (s: SimulationState) => toCalendar(s.clock).hour
export const weekdayOf = (s: SimulationState) => toCalendar(s.clock).weekday

/** Heure de début comprise dans [from, to[ */
export const opensBetween = (from: number, to: number, message: string): Precondition => ({
  code: 'CLOSED',
  test: (s) => hourOf(s) >= from && hourOf(s) < to,
  message,
})

export const notTooTired = (max: number): Precondition => ({
  code: 'TOO_TIRED',
  test: (s) => s.character.needs.fatigue < max,
  message: `Trop fatigué (fatigue ${max} ou plus).`,
})

export const notSick: Precondition = {
  code: 'SICK',
  test: (s) => !s.character.statuses.includes('sick'),
  message: 'Malade : repos nécessaire.',
}

/** Valeurs par défaut d'une action sans effet de besoin particulier. */
export const BASE = {
  cost: { money: 0 },
  interruptible: false,
  sleeping: false,
  ratesPerHour: {},
  effects: {},
} as const

/** Pourcentage arrondi pour l'affichage d'une probabilité (« ≈ 45 % »). */
export const percent = (p: number) => `≈ ${Math.round(p * 100)} %`
