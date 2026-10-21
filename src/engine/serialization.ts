/**
 * Sauvegarde : l'état complet (dont la graine et l'état du générateur) est
 * converti en JSON. Le chargement vérifie chaque champ et signale précisément
 * la première anomalie rencontrée. Une sauvegarde de version 1 (avant les
 * systèmes sociaux et économiques) est migrée vers la version 2, puis toute
 * sauvegarde de version 2 vers la version 3 (narration, messages, lieu).
 */
import { emptyCareer, PAYDAY, PAYDAY_HOUR, startJob } from './careers.ts'
import { findCareer, findDiploma, findProgram, SKILLS } from './data/careers.ts'
import { emptyEducation } from './education.ts'
import { SimulationError } from './errors.ts'
import { EVENT_TYPES } from './events.ts'
import { BILLS_DAY, BILLS_HOUR, initialFinances } from './finances.ts'
import { NEED_IDS } from './needs.ts'
import { createEntourage } from './people.ts'
import { scheduleEvent } from './schedule.ts'
import { DEFAULT_CAREER } from './simulation.ts'
import { emptySkills } from './skills.ts'
import { emptyNarrative, emptyWorld, recordFromLog } from './story.ts'
import { isValidDate, nextMonthlyOccurrence } from './time.ts'
import type { AttributeId, Channel, GameEvent, LogKind, MemoryKind, PersonRole, SimulationState, StoryTone } from './types.ts'

const ATTRIBUTE_IDS: AttributeId[] = ['health', 'fitness', 'intelligence', 'sociability']
const LOG_KINDS: LogKind[] = ['action', 'event', 'warning', 'day', 'system', 'social', 'money']
const ROLES: PersonRole[] = ['parent', 'sibling', 'friend', 'colleague']
const MEMORY_KINDS: MemoryKind[] = [
  'help',
  'support',
  'absent_when_sick',
  'gift',
  'argument',
  'birthday_wished',
  'birthday_forgotten',
  'loan_granted',
  'loan_refused',
  'loan_repaid',
  'loan_unpaid',
  'diploma',
  'reconnected',
]

export function serializeState(state: SimulationState): string {
  return JSON.stringify(state)
}

export function parseState(json: string): SimulationState {
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    throw invalid('le contenu n’est pas du JSON valide')
  }
  assertState(raw)
  const version = (raw as { version: number }).version
  const state = version === 3 ? raw : migrateV2(version === 1 ? migrateV1(raw) : raw)
  // Champ ajouté après la version 3 initiale : pas encore à la retraite.
  state.career.pension ??= null
  return state
}

/** Version 2 → 3 : narration (souvenirs reconstitués depuis le journal, messages vides) et lieu inconnu. */
function migrateV2(state: SimulationState): SimulationState {
  const s = state as SimulationState & { version: number }
  s.version = 3
  s.narrative = emptyNarrative()
  s.world = emptyWorld()
  recordFromLog(s, s.log)
  return s
}

/** Version 1 → 2 : entourage, emploi de départ, finances et échéances mensuelles. */
function migrateV1(state: SimulationState): SimulationState {
  const s = state
  ;(s as { version: number }).version = 2
  s.people = []
  s.relationships = {}
  s.nextPersonId = 1
  s.skills = emptySkills()
  s.education = emptyEducation()
  s.career = emptyCareer()
  s.finances = initialFinances()
  s.cooldowns = {}
  createEntourage(s)
  if (s.character.alive) startJob(s, DEFAULT_CAREER)
  scheduleEvent(s, nextMonthlyOccurrence(s.clock, PAYDAY, PAYDAY_HOUR), { type: 'payday' })
  scheduleEvent(s, nextMonthlyOccurrence(s.clock, BILLS_DAY, BILLS_HOUR), { type: 'bills_due' })
  return s
}

function invalid(detail: string): SimulationError {
  return new SimulationError('INVALID_SAVE', `Sauvegarde invalide : ${detail}.`)
}

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)

function int(v: unknown, path: string): void {
  if (!Number.isSafeInteger(v)) throw invalid(`${path} doit être un entier`)
}
function num(v: unknown, path: string, min = -Infinity, max = Infinity): void {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) {
    throw invalid(`${path} doit être un nombre entre ${min} et ${max}`)
  }
}
function obj(v: unknown, path: string): Obj {
  if (!isObj(v)) throw invalid(`${path} doit être un objet`)
  return v
}

function assertEvent(v: unknown, path: string): asserts v is GameEvent {
  const e = obj(v, path)
  if (!EVENT_TYPES.includes(e.type as GameEvent['type'])) throw invalid(`${path}.type inconnu (${String(e.type)})`)
  if (e.type === 'rent_due' || e.type === 'work_bonus') int(e.amount, `${path}.amount`)
  if (e.type === 'debt_payment') int(e.debtId, `${path}.debtId`)
  if (e.type === 'job_application_result') {
    if (typeof e.career !== 'string' || !findCareer(e.career)) throw invalid(`${path}.career inconnu`)
    num(e.probability, `${path}.probability`, 0, 1)
  }
  if (e.type === 'exam' && (typeof e.program !== 'string' || !findProgram(e.program))) throw invalid(`${path}.program inconnu`)
  if (e.type === 'npc_recovered' && typeof e.personId !== 'string') throw invalid(`${path}.personId manquant`)
  if (e.type === 'npc_message' && (typeof e.personId !== 'string' || typeof e.text !== 'string')) throw invalid(`${path} : personId et text attendus`)
}

const nullableInt = (v: unknown, path: string) => {
  if (v !== null) int(v, path)
}
const str = (v: unknown, path: string) => {
  if (typeof v !== 'string' || v.length === 0) throw invalid(`${path} doit être un texte`)
}
function list(v: unknown, path: string): unknown[] {
  if (!Array.isArray(v)) throw invalid(`${path} doit être une liste`)
  return v
}

/** Champs ajoutés en version 2. */
function assertV2(s: Obj): void {
  const ids = new Set<string>()
  list(s.people, 'people').forEach((item, i) => {
    const p = obj(item, `people[${i}]`)
    const path = `people[${i}]`
    str(p.id, `${path}.id`)
    ids.add(p.id as string)
    str(p.name, `${path}.name`)
    str(p.relation, `${path}.relation`)
    str(p.occupation, `${path}.occupation`)
    if (!ROLES.includes(p.role as PersonRole)) throw invalid(`${path}.role inconnu`)
    if (!isObj(p.birthDate) || !isValidDate(p.birthDate as never)) throw invalid(`${path}.birthDate invalide`)
    if (typeof p.alive !== 'boolean' || typeof p.distant !== 'boolean') throw invalid(`${path} : alive et distant doivent être des booléens`)
    num(p.health, `${path}.health`, 0, 100)
    num(p.generosity, `${path}.generosity`, 0, 100)
    nullableInt(p.sickSince, `${path}.sickSince`)
  })
  int(s.nextPersonId, 'nextPersonId')
  for (const [id, item] of Object.entries(obj(s.relationships, 'relationships'))) {
    const r = obj(item, `relationships.${id}`)
    if (!ids.has(id)) throw invalid(`relationships.${id} ne correspond à aucune personne`)
    for (const key of ['closeness', 'trust', 'tension']) num(r[key], `relationships.${id}.${key}`, 0, 100)
    nullableInt(r.lastContact, `relationships.${id}.lastContact`)
    list(r.memories, `relationships.${id}.memories`).forEach((m, j) => {
      const mem = obj(m, `relationships.${id}.memories[${j}]`)
      int(mem.at, `relationships.${id}.memories[${j}].at`)
      if (!MEMORY_KINDS.includes(mem.kind as MemoryKind)) throw invalid(`relationships.${id}.memories[${j}].kind inconnu`)
      num(mem.weight, `relationships.${id}.memories[${j}].weight`, -10, 10)
      str(mem.text, `relationships.${id}.memories[${j}].text`)
    })
  }

  const skills = obj(s.skills, 'skills')
  for (const { id } of SKILLS) num(skills[id], `skills.${id}`, 0)

  const education = obj(s.education, 'education')
  list(education.diplomas, 'education.diplomas').forEach((d, i) => {
    const dip = obj(d, `education.diplomas[${i}]`)
    if (typeof dip.id !== 'string' || !findDiploma(dip.id)) throw invalid(`education.diplomas[${i}].id inconnu`)
    nullableInt(dip.at, `education.diplomas[${i}].at`)
  })
  if (education.enrollment !== null) {
    const e = obj(education.enrollment, 'education.enrollment')
    if (typeof e.program !== 'string' || !findProgram(e.program)) throw invalid('education.enrollment.program inconnu')
    int(e.since, 'education.enrollment.since')
    int(e.endsAt, 'education.enrollment.endsAt')
    num(e.studyHours, 'education.enrollment.studyHours', 0)
  }

  const career = obj(s.career, 'career')
  if (career.job !== null) {
    const j = obj(career.job, 'career.job')
    if (typeof j.career !== 'string' || !findCareer(j.career)) throw invalid('career.job.career inconnu')
    int(j.since, 'career.job.since')
    int(j.salary, 'career.job.salary')
    num(j.performance, 'career.job.performance', 0, 100)
    int(j.daysWorked, 'career.job.daysWorked')
  }
  for (const [sector, days] of Object.entries(obj(career.experience, 'career.experience'))) int(days, `career.experience.${sector}`)
  if (career.pension !== undefined && career.pension !== null) int(career.pension, 'career.pension')
  if (career.benefit !== null) {
    const b = obj(career.benefit, 'career.benefit')
    int(b.amount, 'career.benefit.amount')
    int(b.remaining, 'career.benefit.remaining')
  }

  const f = obj(s.finances, 'finances')
  int(f.savings, 'finances.savings')
  int(f.overdraftLimit, 'finances.overdraftLimit')
  num(f.interestCarry, 'finances.interestCarry', 0)
  num(f.overdraftCarry, 'finances.overdraftCarry', 0)
  int(f.nextDebtId, 'finances.nextDebtId')
  list(f.debts, 'finances.debts').forEach((d, i) => {
    const debt = obj(d, `finances.debts[${i}]`)
    for (const key of ['id', 'remaining', 'monthlyPayment', 'missedPayments']) int(debt[key], `finances.debts[${i}].${key}`)
    str(debt.lender, `finances.debts[${i}].lender`)
    num(debt.annualRate, `finances.debts[${i}].annualRate`, 0, 1)
  })
  list(f.ledger, 'finances.ledger').forEach((t, i) => {
    const txn = obj(t, `finances.ledger[${i}]`)
    int(txn.at, `finances.ledger[${i}].at`)
    int(txn.amount, `finances.ledger[${i}].amount`)
    str(txn.label, `finances.ledger[${i}].label`)
  })
  for (const key of ['month', 'lastMonth']) {
    if (key === 'lastMonth' && f.lastMonth === null) continue
    const m = obj(f[key], `finances.${key}`)
    int(m.income, `finances.${key}.income`)
    int(m.expenses, `finances.${key}.expenses`)
  }
  for (const [id, until] of Object.entries(obj(s.cooldowns, 'cooldowns'))) int(until, `cooldowns.${id}`)
}

const CHANNELS: Channel[] = ['message', 'person']
const TONES: StoryTone[] = ['good', 'bad', 'neutral']

/** Champs ajoutés en version 3 : narration et lieu. */
function assertV3(s: Obj): void {
  const people = new Set(list(s.people, 'people').map((p) => (p as Obj).id as string))
  const n = obj(s.narrative, 'narrative')
  int(n.nextMessageId, 'narrative.nextMessageId')
  int(n.nextMemoryId, 'narrative.nextMemoryId')
  for (const [id, thread] of Object.entries(obj(n.threads, 'narrative.threads'))) {
    if (!people.has(id)) throw invalid(`narrative.threads.${id} ne correspond à aucune personne`)
    list(thread, `narrative.threads.${id}`).forEach((item, i) => {
      const m = obj(item, `narrative.threads.${id}[${i}]`)
      const path = `narrative.threads.${id}[${i}]`
      int(m.id, `${path}.id`)
      int(m.at, `${path}.at`)
      if (m.from !== 'player' && m.from !== id) throw invalid(`${path}.from invalide`)
      if (!CHANNELS.includes(m.channel as Channel)) throw invalid(`${path}.channel inconnu`)
      if (typeof m.text !== 'string' || m.text.length > 1000) throw invalid(`${path}.text invalide`)
      if (typeof m.read !== 'boolean') throw invalid(`${path}.read doit être un booléen`)
    })
  }
  list(n.memories, 'narrative.memories').forEach((item, i) => {
    const m = obj(item, `narrative.memories[${i}]`)
    const path = `narrative.memories[${i}]`
    int(m.id, `${path}.id`)
    int(m.at, `${path}.at`)
    str(m.kind, `${path}.kind`)
    str(m.text, `${path}.text`)
    if (!TONES.includes(m.tone as StoryTone)) throw invalid(`${path}.tone inconnu`)
    if (m.importance !== 1 && m.importance !== 2 && m.importance !== 3) throw invalid(`${path}.importance invalide`)
    if (!list(m.people, `${path}.people`).every((p) => typeof p === 'string')) throw invalid(`${path}.people invalide`)
  })
  for (const [id, items] of Object.entries(obj(n.shared, 'narrative.shared'))) {
    if (!list(items, `narrative.shared.${id}`).every((x) => typeof x === 'string')) throw invalid(`narrative.shared.${id} invalide`)
  }
  if (n.session !== null) {
    const c = obj(n.session, 'narrative.session')
    if (typeof c.personId !== 'string' || !people.has(c.personId)) throw invalid('narrative.session.personId inconnu')
    if (!CHANNELS.includes(c.channel as Channel)) throw invalid('narrative.session.channel inconnu')
    int(c.startedAt, 'narrative.session.startedAt')
    int(c.lastAt, 'narrative.session.lastAt')
    if (!list(c.topics, 'narrative.session.topics').every((x) => typeof x === 'string')) throw invalid('narrative.session.topics invalide')
  }
  const w = obj(s.world, 'world')
  if (w.home !== null) {
    const h = obj(w.home, 'world.home')
    str(h.label, 'world.home.label')
    num(h.lat, 'world.home.lat', -90, 90)
    num(h.lon, 'world.home.lon', -180, 180)
    str(h.source, 'world.home.source')
    str(h.licence, 'world.home.licence')
  }
}

function assertState(v: unknown): asserts v is SimulationState {
  const s = obj(v, 'état')
  if (s.version !== 1 && s.version !== 2 && s.version !== 3) throw invalid(`version ${String(s.version)} non prise en charge`)
  if (typeof s.seed !== 'string' || s.seed.length === 0) throw invalid('seed manquante')
  int(s.rngState, 'rngState')
  num(s.rngState, 'rngState', 0, 0xffffffff)
  int(s.clock, 'clock')
  int(s.nextEventId, 'nextEventId')
  int(s.nextLogSeq, 'nextLogSeq')

  const c = obj(s.character, 'character')
  if (typeof c.name !== 'string' || c.name.length === 0) throw invalid('character.name manquant')
  if (!isObj(c.birthDate) || !isValidDate(c.birthDate as never)) throw invalid('character.birthDate invalide')
  int(c.money, 'character.money')
  const needs = obj(c.needs, 'character.needs')
  for (const id of NEED_IDS) num(needs[id], `character.needs.${id}`, 0, 100)
  const attributes = obj(c.attributes, 'character.attributes')
  for (const id of ATTRIBUTE_IDS) num(attributes[id], `character.attributes.${id}`, 0, 100)
  if (!Array.isArray(c.statuses) || !c.statuses.every((x) => x === 'injured' || x === 'sick')) {
    throw invalid('character.statuses invalide')
  }
  if (typeof c.alive !== 'boolean') throw invalid('character.alive doit être un booléen')
  if (c.lastWorkDay !== null) int(c.lastWorkDay, 'character.lastWorkDay')

  if (!Array.isArray(s.scheduled)) throw invalid('scheduled doit être une liste')
  s.scheduled.forEach((item, i) => {
    const e = obj(item, `scheduled[${i}]`)
    int(e.id, `scheduled[${i}].id`)
    int(e.at, `scheduled[${i}].at`)
    assertEvent(e.event, `scheduled[${i}].event`)
  })

  if (!Array.isArray(s.log)) throw invalid('log doit être une liste')
  s.log.forEach((item, i) => {
    const e = obj(item, `log[${i}]`)
    int(e.seq, `log[${i}].seq`)
    int(e.at, `log[${i}].at`)
    if (!LOG_KINDS.includes(e.kind as LogKind)) throw invalid(`log[${i}].kind inconnu`)
    if (typeof e.code !== 'string' || typeof e.message !== 'string') throw invalid(`log[${i}] incomplet`)
  })
  if (s.version !== 1) assertV2(s)
  if (s.version === 3) assertV3(s)
}
