/**
 * Décisions alternatives appliquées au point de divergence d'une nouvelle branche.
 *
 * Une décision est un CHOIX (accepter un poste, s'inscrire, déménager…),
 * jamais un résultat garanti : la suite de la vie reste simulée, avec son hasard.
 * Chaque branche reçoit son propre flux pseudo-aléatoire, dérivé de son identifiant :
 * deux branches nées du même instant n'ont pas le même avenir.
 */
import { startJob } from '../engine/careers.ts'
import { CAREERS, findCareer, findProgram, PROGRAMS } from '../engine/data/careers.ts'
import { enrollmentReasons, startEnrollment } from '../engine/education.ts'
import { addMoney, available } from '../engine/finances.ts'
import { writeLog } from '../engine/journal.ts'
import { addMemory, adjustRelationship, findPerson, touch } from '../engine/relationships.ts'
import { careerEligibility } from '../engine/requirements.ts'
import { hashSeed } from '../engine/rng.ts'
import type { SimulationState } from '../engine/types.ts'
import { DestinyError } from './errors.ts'
import type { Decision } from './types.ts'

export function decisionLabel(state: SimulationState, d: Decision): string {
  switch (d.kind) {
    case 'reroll':
      return 'Mêmes choix, autre hasard'
    case 'career':
      return `Accepter un poste : ${findCareer(d.career)?.label ?? d.career}`
    case 'quit_job':
      return 'Quitter son emploi'
    case 'study':
      return `Reprendre des études : ${findProgram(d.program)?.label ?? d.program}`
    case 'move':
      return d.near ? 'Se rapprocher de sa famille' : 'Partir vivre loin'
    case 'reconnect':
      return `Renouer avec ${findPerson(state, d.personId)?.name ?? 'un proche'}`
  }
}

/** Raison pour laquelle la décision est impossible à ce moment de la vie, sinon `null`. */
export function validateDecision(state: SimulationState, d: Decision): string | null {
  if (!state.character.alive) return `${state.character.name} est décédé·e : impossible de bifurquer à ce moment.`
  switch (d.kind) {
    case 'reroll':
      return null
    case 'career': {
      const career = findCareer(d.career)
      if (!career) return `Métier inconnu : « ${d.career} ».`
      if (state.career.job?.career === career.id) return `Tu occupes déjà ce poste (${career.label}).`
      const eligibility = careerEligibility(state, career)
      return eligibility.ok ? null : `Poste inaccessible à ce moment : ${eligibility.reasons.join(' ; ')}.`
    }
    case 'quit_job':
      return state.career.job ? null : 'Tu n’as pas d’emploi à quitter à ce moment.'
    case 'study': {
      const program = findProgram(d.program)
      if (!program) return `Formation inconnue : « ${d.program} ».`
      if (state.education.enrollment) return 'Une formation est déjà en cours à ce moment.'
      const reasons = enrollmentReasons(state, program)
      if (reasons.length > 0) return `Formation inaccessible : ${reasons.join(' ; ')}.`
      if (available(state) < program.tuition.value) return `Frais d’inscription (≈ ${program.tuition.value} €) hors de portée à ce moment.`
      return null
    }
    case 'move':
      return state.people.some((p) => p.alive && p.role !== 'colleague') ? null : 'Aucun proche dont se rapprocher ou s’éloigner.'
    case 'reconnect': {
      const person = findPerson(state, d.personId)
      if (!person) return 'Proche inconnu à ce moment de la vie.'
      if (!person.alive) return `${person.name} est décédé·e à ce moment.`
      if (person.role === 'colleague') return 'Choisis un membre de la famille ou un ami.'
      return null
    }
  }
}

/**
 * Applique la décision sur une copie de l'état et donne à la branche son propre hasard.
 * Lève une `DestinyError('INVALID_DECISION')` si la décision est impossible.
 */
export function applyDecision(state: SimulationState, d: Decision, branchId: string): SimulationState {
  const invalid = validateDecision(state, d)
  if (invalid) throw new DestinyError('INVALID_DECISION', invalid)
  const draft = structuredClone(state)
  draft.rngState = hashSeed(`${state.seed}:${branchId}`)

  switch (d.kind) {
    case 'reroll':
      break
    case 'career':
      startJob(draft, d.career)
      break
    case 'quit_job':
      draft.career.job = null
      break
    case 'study': {
      const program = findProgram(d.program)!
      addMoney(draft, -program.tuition.value, 'Frais d’inscription')
      startEnrollment(draft, program.id)
      break
    }
    case 'move':
      for (const p of draft.people) if (p.role !== 'colleague') p.distant = !d.near
      break
    case 'reconnect': {
      const rel = draft.relationships[d.personId]
      rel.closeness = Math.max(rel.closeness, 60)
      adjustRelationship(draft, d.personId, { tension: -20, trust: 5 })
      touch(draft, d.personId)
      addMemory(draft, d.personId, 'reconnected', 6, 'Vous avez renoué.')
      break
    }
  }
  writeLog(draft, 'system', 'divergence', `Divergence : ${decisionLabel(state, d)}.`)
  return draft
}

export interface DecisionOption {
  decision: Decision
  label: string
  /** Raison d'indisponibilité, ou `null` si la décision est possible. */
  unavailable: string | null
}

/** Toutes les décisions envisageables à cet instant, possibles ou non (avec la raison). */
export function decisionOptions(state: SimulationState): DecisionOption[] {
  const decisions: Decision[] = [
    { kind: 'reroll' },
    ...CAREERS.map((c) => ({ kind: 'career' as const, career: c.id })),
    { kind: 'quit_job' },
    ...PROGRAMS.map((p) => ({ kind: 'study' as const, program: p.id })),
    { kind: 'move', near: true },
    { kind: 'move', near: false },
    ...state.people.filter((p) => p.role !== 'colleague').map((p) => ({ kind: 'reconnect' as const, personId: p.id })),
  ]
  return decisions.map((decision) => ({
    decision,
    label: decisionLabel(state, decision),
    unavailable: validateDecision(state, decision),
  }))
}
