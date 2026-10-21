/**
 * Cœur du moteur : création d'une vie, exécution d'actions, passage du temps.
 *
 * Les fonctions publiques ne modifient jamais l'état reçu : elles travaillent
 * sur une copie et renvoient le nouvel état. Même état + même action = même résultat.
 */
import { actionCost, ACTIONS, validateAction, type ActionDefinition } from './actions.ts'
import { npcDailyUpdate } from './autonomy.ts'
import { checkAbsence, emptyCareer, PAYDAY, PAYDAY_HOUR, startJob } from './careers.ts'
import { findCareer, findDiploma } from './data/careers.ts'
import { emptyEducation } from './education.ts'
import { invariant, SimulationError } from './errors.ts'
import {
  BIRTHDAY_HOUR,
  nextDueTime,
  processDueEvents,
  RENT_AMOUNT,
  RENT_DAY,
  RENT_HOUR,
  scheduleEvent,
} from './events.ts'
import { accrueOverdraft, addMoney, BILLS_DAY, BILLS_HOUR, initialFinances } from './finances.ts'
import { dailyIncidents } from './incidents.ts'
import { createEntourage, type Entourage } from './people.ts'
import { eligibleCareers } from './requirements.ts'
import { emptySkills, isSkillId, MAX_LEVEL, xpForLevel } from './skills.ts'
import { writeLog } from './journal.ts'
import { dailyCheckIns, emptyNarrative, emptyWorld } from './story.ts'
import { applyTimeToNeeds, clamp, isCritical, NEED_IDS, NEEDS, type Activity } from './needs.ts'
import { drawRandom, hashSeed } from './rng.ts'
import { chooseRoutineAction } from './routine.ts'
import {
  addDuration,
  ageAt,
  formatDate,
  formatDuration,
  fromCalendar,
  isValidDate,
  MINUTES_PER_DAY,
  minuteOfDay,
  nextAnniversary,
  nextMonthlyOccurrence,
  type TimeUnit,
} from './time.ts'
import type {
  ActionParams,
  Attributes,
  CalendarDate,
  CalendarDateTime,
  LogEntry,
  SimulationState,
  SkillId,
  ValidationIssue,
} from './types.ts'

export const DEFAULT_START: CalendarDateTime = { year: 2025, month: 1, day: 6, hour: 7, minute: 0 }
export const DEFAULT_MONEY = 1000
export const ADULT_AGE = 18
/** Pas de simulation maximal : les besoins sont recalculés au moins tous les quarts d'heure. */
export const TICK_MINUTES = 15
/** Emploi de départ d'une vie créée sans dossier. */
export const DEFAULT_CAREER = 'cashier'

export interface NewLifeOptions {
  seed: string
  name: string
  birthDate: CalendarDate
  start?: CalendarDateTime
  money?: number
  /** Caractéristiques imposées (par exemple issues du dossier de vie) ; les autres sont tirées au hasard. */
  attributes?: Partial<Attributes>
  /** Composition de l'entourage (famille, amis) ; tirée au hasard si absente. */
  entourage?: Entourage
  /** Emploi au départ : identifiant, 'auto' (le mieux payé parmi les métiers accessibles) ou `null`. */
  career?: string | null
  diplomas?: string[]
  /** Niveaux de compétence de départ. */
  skills?: Partial<Record<SkillId, number>>
}

export type StepResult = { ok: true; state: SimulationState; entries: LogEntry[] } | { ok: false; issues: ValidationIssue[] }

export function createSimulation(options: NewLifeOptions): SimulationState {
  const seed = options.seed.trim()
  const name = options.name.trim()
  if (seed.length === 0 || seed.length > 64) {
    throw new SimulationError('INVALID_ARGUMENT', 'La graine doit contenir entre 1 et 64 caractères.')
  }
  if (name.length === 0 || name.length > 40) {
    throw new SimulationError('INVALID_ARGUMENT', 'Le prénom doit contenir entre 1 et 40 caractères.')
  }
  if (!isValidDate(options.birthDate)) {
    throw new SimulationError('INVALID_ARGUMENT', `Date de naissance invalide : ${JSON.stringify(options.birthDate)}.`)
  }
  const clock = fromCalendar(options.start ?? DEFAULT_START)
  if (ageAt(options.birthDate, clock) < ADULT_AGE) {
    throw new SimulationError('INVALID_ARGUMENT', `Le personnage doit avoir au moins ${ADULT_AGE} ans au début de la simulation.`)
  }
  const money = options.money ?? DEFAULT_MONEY
  if (!Number.isSafeInteger(money)) {
    throw new SimulationError('INVALID_ARGUMENT', `Somme de départ invalide : ${money}.`)
  }

  const state: SimulationState = {
    version: 3,
    seed,
    rngState: hashSeed(seed),
    clock,
    character: {
      name,
      birthDate: { ...options.birthDate },
      money,
      needs: { sleep: 10, hunger: 20, hygiene: 80, fatigue: 10, stress: 20, mood: 60 },
      attributes: { health: 0, fitness: 0, intelligence: 0, sociability: 0 },
      statuses: [],
      alive: true,
      lastWorkDay: null,
    },
    scheduled: [],
    nextEventId: 1,
    log: [],
    nextLogSeq: 1,
    people: [],
    relationships: {},
    nextPersonId: 1,
    skills: emptySkills(),
    education: emptyEducation(),
    career: emptyCareer(),
    finances: initialFinances(),
    cooldowns: {},
    narrative: emptyNarrative(),
    world: emptyWorld(),
  }

  // Caractéristiques de départ tirées à partir de la graine.
  const roll = (min: number, max: number) => min + Math.floor(drawRandom(state) * (max - min + 1))
  state.character.attributes = {
    health: roll(85, 100),
    fitness: roll(30, 70),
    intelligence: roll(30, 70),
    sociability: roll(30, 70),
  }
  for (const [id, value] of Object.entries(options.attributes ?? {})) {
    const known = Object.hasOwn(state.character.attributes, id)
    if (!known || typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) {
      throw new SimulationError('INVALID_ARGUMENT', `Caractéristique « ${id} » invalide : ${value} (0 à 100 attendu).`)
    }
    state.character.attributes[id as keyof Attributes] = value
  }

  for (const id of options.diplomas ?? []) {
    if (!findDiploma(id)) throw new SimulationError('INVALID_ARGUMENT', `Diplôme inconnu : « ${id} ».`)
    state.education.diplomas.push({ id, at: null })
  }
  for (const [skill, level] of Object.entries(options.skills ?? {})) {
    if (!isSkillId(skill) || !Number.isInteger(level) || level < 0 || level > MAX_LEVEL) {
      throw new SimulationError('INVALID_ARGUMENT', `Compétence « ${skill} » invalide : niveau ${level}.`)
    }
    state.skills[skill] = xpForLevel(level)
  }
  createEntourage(state, options.entourage)
  let career = options.career === undefined ? DEFAULT_CAREER : options.career
  if (career === 'auto') {
    career = [...eligibleCareers(state)].sort((a, b) => b.salary.max - a.salary.max)[0]?.id ?? DEFAULT_CAREER
  }
  if (career !== null) {
    if (!findCareer(career)) throw new SimulationError('INVALID_ARGUMENT', `Métier inconnu : « ${career} ».`)
    startJob(state, career)
  }

  scheduleEvent(state, nextMonthlyOccurrence(clock, RENT_DAY, RENT_HOUR), { type: 'rent_due', amount: RENT_AMOUNT })
  scheduleEvent(state, nextAnniversary(clock, options.birthDate, BIRTHDAY_HOUR), { type: 'birthday' })
  scheduleEvent(state, nextMonthlyOccurrence(clock, PAYDAY, PAYDAY_HOUR), { type: 'payday' })
  scheduleEvent(state, nextMonthlyOccurrence(clock, BILLS_DAY, BILLS_HOUR), { type: 'bills_due' })
  writeLog(state, 'system', 'life_started', `Début de la vie de ${name}, ${ageAt(options.birthDate, clock)} ans (graine « ${seed} »).`)
  return state
}

/** Exécute une action du catalogue après validation. Une action refusée ne modifie rien. */
export function performAction(state: SimulationState, actionId: string, params: ActionParams = {}): StepResult {
  const validation = validateAction(state, actionId, params)
  if (!validation.ok) return validation
  const draft = structuredClone(state)
  const firstSeq = draft.nextLogSeq
  executeAction(draft, ACTIONS[actionId as keyof typeof ACTIONS], params)
  return { ok: true, state: draft, entries: draft.log.filter((e) => e.seq >= firstSeq) }
}

/**
 * Fait avancer la vie d'un jour, d'une semaine ou d'un mois.
 * Le personnage suit sa routine (voir `routine.ts`) : chaque action choisie
 * passe par la même validation qu'une action du joueur.
 * L'horloge s'arrête exactement à la date visée (sauf décès en cours de route).
 */
export function advance(state: SimulationState, unit: TimeUnit, amount = 1): StepResult {
  const target = addDuration(state.clock, unit, amount)
  if (!state.character.alive) {
    return { ok: false, issues: [{ code: 'CHARACTER_DEAD', message: `${state.character.name} est décédé·e.` }] }
  }
  const draft = structuredClone(state)
  const firstSeq = draft.nextLogSeq
  while (draft.clock < target && draft.character.alive) {
    const previous = draft.clock
    const { def, params } = chooseRoutineAction(draft, target)
    executeAction(draft, def, params, target)
    invariant(draft.clock > previous || !draft.character.alive, 'La routine n’a pas fait avancer le temps.')
  }
  invariant(draft.clock <= target, 'La routine a dépassé la date visée.')
  return { ok: true, state: draft, entries: draft.log.filter((e) => e.seq >= firstSeq) }
}

/**
 * Exécute une action déjà validée sur le brouillon.
 * Si `limit` est fourni, une action interruptible s'arrête à cette date.
 */
function executeAction(draft: SimulationState, def: ActionDefinition, params: ActionParams, limit?: number): void {
  invariant(validateAction(draft, def.id, params).ok, `Action « ${def.id} » exécutée sans être valide.`)
  let duration = def.durationMinutes
  if (limit !== undefined && draft.clock + duration > limit) {
    invariant(def.interruptible, `Action « ${def.id} » non interruptible lancée trop tard.`)
    duration = limit - draft.clock
  }
  const interrupted = duration < def.durationMinutes

  const cost = actionCost(draft, def, params)
  addMoney(draft, -cost, def.label)
  const target = params.personId ? draft.people.find((p) => p.id === params.personId)?.name : undefined
  writeLog(
    draft,
    'action',
    def.id,
    `${def.label}${target ? ` — ${target}` : ''} (${formatDuration(duration)}${cost > 0 ? `, −${cost} €` : ''})`,
    { action: def.id, duration, cost, interrupted },
  )

  simulateSpan(draft, duration, { sleeping: def.sleeping, rates: def.ratesPerHour })
  if (!draft.character.alive || interrupted) return

  const c = draft.character
  for (const [id, delta] of Object.entries(def.effects.needs ?? {})) {
    c.needs[id as keyof typeof c.needs] = clamp(c.needs[id as keyof typeof c.needs] + delta)
  }
  for (const [id, delta] of Object.entries(def.effects.attributes ?? {})) {
    c.attributes[id as keyof typeof c.attributes] = clamp(c.attributes[id as keyof typeof c.attributes] + delta)
  }
  addMoney(draft, def.effects.money ?? 0, def.label)
  def.onComplete?.(draft, params)
}

/**
 * Fait passer `minutes` minutes, par pas d'au plus `TICK_MINUTES`.
 * Les pas s'arrêtent aussi pile à minuit et à la date de chaque événement différé,
 * pour que chaque événement s'applique à l'heure exacte prévue.
 */
function simulateSpan(draft: SimulationState, minutes: number, activity: Activity): void {
  let remaining = minutes
  while (remaining > 0 && draft.character.alive) {
    let step = Math.min(remaining, TICK_MINUTES, MINUTES_PER_DAY - minuteOfDay(draft.clock))
    const due = nextDueTime(draft)
    if (due !== undefined && due > draft.clock) step = Math.min(step, due - draft.clock)

    const c = draft.character
    const wasCritical = NEED_IDS.map((id) => isCritical(id, c.needs[id]))
    applyTimeToNeeds(c.needs, c.attributes, step, activity)
    draft.clock += step
    remaining -= step

    NEED_IDS.forEach((id, i) => {
      if (!wasCritical[i] && isCritical(id, c.needs[id])) {
        writeLog(draft, 'warning', `critical_${id}`, `${NEEDS[id].label} critique (${Math.round(c.needs[id])}).`, {
          need: id,
        })
      }
    })
    if (c.attributes.health <= 0) {
      c.alive = false
      writeLog(draft, 'event', 'death', `${c.name} est décédé·e, à ${ageAt(c.birthDate, draft.clock)} ans.`)
      return
    }

    if (minuteOfDay(draft.clock) === 0) startNewDay(draft)
    processDueEvents(draft)
  }
}

function startNewDay(draft: SimulationState): void {
  writeLog(draft, 'day', 'new_day', `Nouvelle journée : ${formatDate(draft.clock)}.`)
  // Systèmes qui évoluent sans le joueur.
  checkAbsence(draft)
  accrueOverdraft(draft)
  npcDailyUpdate(draft)
  dailyCheckIns(draft)
  dailyIncidents(draft)
}
