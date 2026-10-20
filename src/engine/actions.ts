/**
 * Catalogue d'actions et validation.
 *
 * Chaque action déclare sa durée, son coût, ses préconditions et ses effets.
 * `validateAction` vérifie TOUTES les préconditions et renvoie la liste
 * complète des raisons de refus : une action refusée n'est jamais exécutée.
 * Les actions des modules sociaux et économiques sont ajoutées au même catalogue.
 */
import { BASE, notSick, notTooTired, opensBetween, type ActionDefinition, type Outcome } from './actionKit.ts'
import { CAREER_ACTIONS, workDay } from './careers.ts'
import { findCareer, findProgram } from './data/careers.ts'
import { EDUCATION_ACTIONS, studySession } from './education.ts'
import { triggerEvent } from './events.ts'
import { available, FINANCE_ACTIONS } from './finances.ts'
import { findPerson } from './relationships.ts'
import { chance } from './rng.ts'
import { gainXp, isSkillId } from './skills.ts'
import { SOCIAL_ACTIONS } from './social.ts'
import { dayNumber, toCalendar } from './time.ts'
import type { ActionId, ActionParams, SimulationState, ValidationIssue } from './types.ts'

export type { ActionDefinition, ActionEffects, Outcome, ParamKind, Precondition } from './actionKit.ts'

export const WORK_BONUS = 80
export const WORK_BONUS_CHANCE = 0.05
export const SPORT_INJURY_CHANCE = 0.04

const hourOf = (s: SimulationState) => toCalendar(s.clock).hour
const needs = (s: SimulationState) => s.character.needs

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
    onComplete: (draft) => gainXp(draft, 'cooking', 1),
  },
  {
    ...BASE,
    id: 'food_aid',
    label: 'Repas d’une aide alimentaire',
    description: 'Repas gratuit auprès d’une association, quand il n’y a plus de quoi payer.',
    durationMinutes: 90,
    effects: { needs: { hunger: -45, mood: -3 } },
    preconditions: [
      { code: 'NOT_HUNGRY', test: (s) => needs(s).hunger >= 25, message: 'Pas faim (faim < 25).' },
      {
        code: 'NOT_NEEDED',
        test: (s) => available(s) < ACTIONS.cook_meal.cost.money,
        message: 'Réservé aux personnes qui ne peuvent plus payer un repas.',
      },
      opensBetween(11, 19, 'Distribution entre 11 h et 19 h.'),
    ],
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
    description: 'Une journée de travail de 8 h, comptée pour le salaire du mois.',
    durationMinutes: 8 * 60,
    cost: { money: 0 },
    interruptible: false,
    sleeping: false,
    ratesPerHour: { fatigue: 2, stress: 3, hygiene: -1 },
    effects: {},
    preconditions: [
      { code: 'NO_JOB', test: (s) => s.career.job !== null, message: 'Tu n’as pas d’emploi : postule à un métier.' },
      notSick,
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
    outcomes: () => [{ label: 'Prime', probability: WORK_BONUS_CHANCE }],
    onComplete(draft) {
      workDay(draft)
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
      notSick,
      notTooTired(70),
      { code: 'TOO_HUNGRY', test: (s) => needs(s).hunger < 85, message: 'Trop faim pour faire du sport (faim 85 ou plus).' },
    ],
    outcomes: () => [{ label: 'Blessure', probability: SPORT_INJURY_CHANCE }],
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
    onComplete: studySession,
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
  {
    ...BASE,
    id: 'practice',
    label: 'S’entraîner',
    description: 'Une heure d’entraînement pour progresser dans une compétence.',
    durationMinutes: 60,
    params: ['skill'],
    extraCost: (_s, p) => (p.skill === 'cooking' ? 5 : 0),
    effects: { needs: { fatigue: 4 } },
    preconditions: [opensBetween(7, 23, 'Entraînement entre 7 h et 23 h.'), notTooTired(85), notSick],
    onComplete: (draft, p) => gainXp(draft, p.skill!, 10),
  },
  ...SOCIAL_ACTIONS,
  ...CAREER_ACTIONS,
  ...EDUCATION_ACTIONS,
  ...FINANCE_ACTIONS,
]

export const ACTIONS: Readonly<Record<ActionId, ActionDefinition>> = Object.fromEntries(
  ACTION_LIST.map((a) => [a.id, a]),
) as Record<ActionId, ActionDefinition>

export const ACTION_IDS = ACTION_LIST.map((a) => a.id)

export function isActionId(value: unknown): value is ActionId {
  return typeof value === 'string' && Object.hasOwn(ACTIONS, value)
}

export type ValidationResult = { ok: true } | { ok: false; issues: ValidationIssue[] }

/** Coût total d'une action (prix fixe + frais selon les paramètres). */
export function actionCost(state: SimulationState, def: ActionDefinition, params: ActionParams = {}): number {
  return def.cost.money + (def.extraCost?.(state, params) ?? 0)
}

/** Paramètre manquant ou invalide : raison précise, sinon `null`. */
function paramIssue(state: SimulationState, def: ActionDefinition, params: ActionParams): ValidationIssue | null {
  for (const kind of def.params ?? []) {
    switch (kind) {
      case 'person': {
        if (!params.personId) return { code: 'MISSING_PARAM', message: 'Choisis une personne.' }
        const person = findPerson(state, params.personId)
        if (!person) return { code: 'UNKNOWN_PERSON', message: `Personne inconnue : « ${params.personId} ».` }
        if (!person.alive) return { code: 'PERSON_UNAVAILABLE', message: `${person.name} est décédé·e.` }
        break
      }
      case 'career':
        if (!params.career) return { code: 'MISSING_PARAM', message: 'Choisis un métier.' }
        if (!findCareer(params.career)) return { code: 'UNKNOWN_CAREER', message: `Métier inconnu : « ${params.career} ».` }
        break
      case 'program':
        if (!params.program) return { code: 'MISSING_PARAM', message: 'Choisis une formation.' }
        if (!findProgram(params.program)) return { code: 'UNKNOWN_PROGRAM', message: `Formation inconnue : « ${params.program} ».` }
        break
      case 'skill':
        if (!isSkillId(params.skill)) return { code: 'UNKNOWN_SKILL', message: `Compétence inconnue : « ${String(params.skill)} ».` }
        break
      case 'amount':
        if (params.amount === undefined || !def.amounts?.includes(params.amount)) {
          return { code: 'INVALID_AMOUNT', message: `Montants possibles : ${def.amounts?.join(' €, ')} €.` }
        }
        break
    }
  }
  return null
}

export function validateAction(state: SimulationState, actionId: string, params: ActionParams = {}): ValidationResult {
  if (!isActionId(actionId)) {
    return { ok: false, issues: [{ code: 'UNKNOWN_ACTION', message: `Action inconnue : « ${actionId} ».` }] }
  }
  if (!state.character.alive) {
    return { ok: false, issues: [{ code: 'CHARACTER_DEAD', message: `${state.character.name} est décédé·e.` }] }
  }
  const def = ACTIONS[actionId]
  const invalidParam = paramIssue(state, def, params)
  if (invalidParam) return { ok: false, issues: [invalidParam] }

  const issues: ValidationIssue[] = []
  const cost = actionCost(state, def, params)
  // Une action gratuite reste possible même à découvert ; une dépense doit tenir dans le découvert autorisé.
  if (cost > 0 && available(state) < cost) {
    issues.push({
      code: 'INSUFFICIENT_MONEY',
      message: `Pas assez d’argent : ${cost} € nécessaires, ${Math.max(0, available(state))} € disponibles (découvert autorisé compris).`,
    })
  }
  for (const p of def.preconditions) {
    if (!p.test(state, params)) {
      issues.push({ code: p.code, message: typeof p.message === 'string' ? p.message : p.message(state, params) })
    }
  }
  return issues.length === 0 ? { ok: true } : { ok: false, issues }
}

/** Issues incertaines annoncées avant l'action (vide si l'issue est certaine). */
export function actionOutcomes(state: SimulationState, actionId: ActionId, params: ActionParams = {}): Outcome[] {
  const def = ACTIONS[actionId]
  return def.outcomes && !paramIssue(state, def, params) ? def.outcomes(state, params) : []
}
