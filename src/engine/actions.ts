/**
 * Catalogue d'actions et validation.
 *
 * Chaque action déclare sa durée, son coût, ses préconditions et ses effets.
 * `validateAction` vérifie TOUTES les préconditions et renvoie la liste
 * complète des raisons de refus : une action refusée n'est jamais exécutée.
 */
import { triggerEvent } from './events.ts'
import { chance } from './rng.ts'
import type { NeedRates } from './needs.ts'
import { dayNumber, toCalendar } from './time.ts'
import type { ActionId, Attributes, Needs, SimulationState, ValidationCode, ValidationIssue } from './types.ts'

export interface ActionEffects {
  needs?: Partial<Needs>
  attributes?: Partial<Attributes>
  money?: number
}

export interface Precondition {
  code: ValidationCode
  /** Vrai si la précondition est remplie. */
  test: (state: SimulationState) => boolean
  message: string
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
  /** Règles complémentaires en fin d'action (tirages aléatoires, bonus liés aux caractéristiques…). */
  onComplete?: (draft: SimulationState) => void
}

export const WORK_PAY = 120
export const WORK_BONUS = 80
export const WORK_BONUS_CHANCE = 0.05
export const SPORT_INJURY_CHANCE = 0.04

const hourOf = (s: SimulationState) => toCalendar(s.clock).hour
const needs = (s: SimulationState) => s.character.needs

/** Heure de début comprise dans [from, to[ */
const opensBetween = (from: number, to: number, message: string): Precondition => ({
  code: 'CLOSED',
  test: (s) => hourOf(s) >= from && hourOf(s) < to,
  message,
})

const notTooTired = (max: number): Precondition => ({
  code: 'TOO_TIRED',
  test: (s) => needs(s).fatigue < max,
  message: `Trop fatigué (fatigue ${max} ou plus).`,
})

const ACTION_LIST: ActionDefinition[] = [
  {
    id: 'sleep',
    label: 'Dormir',
    description: 'Une nuit de sommeil de 8 h.',
    durationMinutes: 8 * 60,
    cost: { money: 0 },
    interruptible: true,
    sleeping: true,
    ratesPerHour: {},
    effects: {},
    preconditions: [{ code: 'NOT_SLEEPY', test: (s) => needs(s).sleep >= 30, message: 'Pas sommeil (sommeil < 30).' }],
  },
  {
    id: 'cook_meal',
    label: 'Cuisiner un repas',
    description: 'Préparer et manger un repas à la maison.',
    durationMinutes: 45,
    cost: { money: 6 },
    interruptible: false,
    sleeping: false,
    ratesPerHour: {},
    effects: { needs: { hunger: -55, mood: 2 } },
    preconditions: [{ code: 'NOT_HUNGRY', test: (s) => needs(s).hunger >= 25, message: 'Pas faim (faim < 25).' }],
  },
  {
    id: 'restaurant',
    label: 'Manger au restaurant',
    description: 'Un bon repas à l’extérieur.',
    durationMinutes: 90,
    cost: { money: 25 },
    interruptible: false,
    sleeping: false,
    ratesPerHour: {},
    effects: { needs: { hunger: -60, mood: 8, stress: -5 } },
    preconditions: [
      { code: 'NOT_HUNGRY', test: (s) => needs(s).hunger >= 25, message: 'Pas faim (faim < 25).' },
      opensBetween(11, 22, 'Restaurant fermé (ouvert de 11 h à 22 h).'),
    ],
  },
  {
    id: 'shower',
    label: 'Prendre une douche',
    description: 'Se laver.',
    durationMinutes: 20,
    cost: { money: 0 },
    interruptible: false,
    sleeping: false,
    ratesPerHour: {},
    effects: { needs: { hygiene: 70, stress: -3 } },
    preconditions: [{ code: 'ALREADY_CLEAN', test: (s) => needs(s).hygiene <= 85, message: 'Déjà propre (hygiène > 85).' }],
  },
  {
    id: 'work',
    label: 'Travailler',
    description: `Une journée de travail de 8 h, payée ${WORK_PAY} €.`,
    durationMinutes: 8 * 60,
    cost: { money: 0 },
    interruptible: false,
    sleeping: false,
    ratesPerHour: { fatigue: 2, stress: 3, hygiene: -1 },
    effects: { money: WORK_PAY },
    preconditions: [
      { code: 'NOT_A_WORKDAY', test: (s) => toCalendar(s.clock).weekday < 5, message: 'Pas de travail le week-end.' },
      {
        code: 'OUTSIDE_WORK_HOURS',
        test: (s) => hourOf(s) >= 7 && hourOf(s) < 11,
        message: 'On ne commence le travail qu’entre 7 h et 11 h.',
      },
      {
        code: 'ALREADY_WORKED_TODAY',
        test: (s) => s.character.lastWorkDay !== dayNumber(s.clock),
        message: 'Déjà travaillé aujourd’hui.',
      },
      notTooTired(85),
      { code: 'TOO_SLEEPY', test: (s) => needs(s).sleep < 85, message: 'Trop sommeil pour travailler (sommeil 85 ou plus).' },
      { code: 'TOO_DIRTY', test: (s) => needs(s).hygiene >= 15, message: 'Trop sale pour aller travailler (hygiène < 15).' },
    ],
    onComplete(draft) {
      draft.character.lastWorkDay = dayNumber(draft.clock)
      if (chance(draft, WORK_BONUS_CHANCE)) triggerEvent(draft, { type: 'work_bonus', amount: WORK_BONUS })
    },
  },
  {
    id: 'sport',
    label: 'Faire du sport',
    description: 'Une heure d’exercice.',
    durationMinutes: 60,
    cost: { money: 0 },
    interruptible: false,
    sleeping: false,
    ratesPerHour: {},
    effects: { needs: { fatigue: 18, stress: -15, hygiene: -25, mood: 6 }, attributes: { fitness: 0.4 } },
    preconditions: [
      { code: 'INJURED', test: (s) => !s.character.statuses.includes('injured'), message: 'Blessé : sport impossible.' },
      notTooTired(70),
      { code: 'TOO_HUNGRY', test: (s) => needs(s).hunger < 85, message: 'Trop faim pour faire du sport (faim 85 ou plus).' },
    ],
    onComplete(draft) {
      if (chance(draft, SPORT_INJURY_CHANCE)) triggerEvent(draft, { type: 'sport_injury' })
    },
  },
  {
    id: 'study',
    label: 'Étudier',
    description: 'Deux heures d’apprentissage.',
    durationMinutes: 120,
    cost: { money: 0 },
    interruptible: false,
    sleeping: false,
    ratesPerHour: {},
    effects: { needs: { fatigue: 8, stress: 5 }, attributes: { intelligence: 0.5 } },
    preconditions: [
      notTooTired(80),
      { code: 'TOO_SLEEPY', test: (s) => needs(s).sleep < 80, message: 'Trop sommeil pour étudier (sommeil 80 ou plus).' },
    ],
  },
  {
    id: 'friends',
    label: 'Voir des amis',
    description: 'Une soirée entre amis.',
    durationMinutes: 180,
    cost: { money: 20 },
    interruptible: false,
    sleeping: false,
    ratesPerHour: {},
    effects: { needs: { mood: 12, stress: -15 }, attributes: { sociability: 0.3 } },
    preconditions: [opensBetween(17, 22, 'Les amis sont disponibles le soir (début entre 17 h et 22 h).'), notTooTired(90)],
    onComplete(draft) {
      // Plus on est sociable, plus la soirée fait du bien.
      const bonus = draft.character.attributes.sociability / 10
      draft.character.needs.mood = Math.min(100, draft.character.needs.mood + bonus)
    },
  },
  {
    id: 'relax',
    label: 'Se détendre',
    description: 'Une heure de repos.',
    durationMinutes: 60,
    cost: { money: 0 },
    interruptible: true,
    sleeping: false,
    ratesPerHour: { fatigue: -5, stress: -6 },
    effects: {},
    preconditions: [],
  },
  {
    id: 'wait',
    label: 'Attendre',
    description: 'Laisser passer une heure.',
    durationMinutes: 60,
    cost: { money: 0 },
    interruptible: true,
    sleeping: false,
    ratesPerHour: {},
    effects: {},
    preconditions: [],
  },
]

export const ACTIONS: Readonly<Record<ActionId, ActionDefinition>> = Object.fromEntries(
  ACTION_LIST.map((a) => [a.id, a]),
) as Record<ActionId, ActionDefinition>

export const ACTION_IDS = ACTION_LIST.map((a) => a.id)

export function isActionId(value: unknown): value is ActionId {
  return typeof value === 'string' && Object.hasOwn(ACTIONS, value)
}

export type ValidationResult = { ok: true } | { ok: false; issues: ValidationIssue[] }

export function validateAction(state: SimulationState, actionId: string): ValidationResult {
  if (!isActionId(actionId)) {
    return { ok: false, issues: [{ code: 'UNKNOWN_ACTION', message: `Action inconnue : « ${actionId} ».` }] }
  }
  if (!state.character.alive) {
    return { ok: false, issues: [{ code: 'CHARACTER_DEAD', message: `${state.character.name} est décédé·e.` }] }
  }
  const def = ACTIONS[actionId]
  const issues: ValidationIssue[] = []
  // Une action gratuite reste possible même avec un compte à découvert.
  if (def.cost.money > 0 && state.character.money < def.cost.money) {
    issues.push({
      code: 'INSUFFICIENT_MONEY',
      message: `Pas assez d’argent : ${def.cost.money} € nécessaires, ${state.character.money} € disponibles.`,
    })
  }
  for (const p of def.preconditions) {
    if (!p.test(state)) issues.push({ code: p.code, message: p.message })
  }
  return issues.length === 0 ? { ok: true } : { ok: false, issues }
}
