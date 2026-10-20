/** Aides partagées par les tests du dossier (non utilisées par l'application). */
import type { CalendarDate } from '../engine/types.ts'
import { answerQuestion, configure, emptyDossier, type Questionnaire } from './questionnaire.ts'
import type { AnswerValue, Dossier, FuzzyDate } from './types.ts'

export const TODAY: CalendarDate = { year: 2025, month: 6, day: 15 }

export const calendar = (year: number, month?: number, day?: number, approximate = false): FuzzyDate => ({
  kind: 'calendar',
  year,
  month,
  day,
  approximate,
})
export const age = (value: number, approximate = false): FuzzyDate => ({ kind: 'age', age: value, approximate })

/** Dossier configuré : naissance le 15 mars 2000 et départ à 25 ans par défaut. */
export function configured(options: { birth?: FuzzyDate; startAge?: number; seed?: string } = {}): Dossier {
  const r = configure(
    emptyDossier(options.seed ?? 'test'),
    { birth: options.birth ?? calendar(2000, 3, 15), startAge: options.startAge ?? 25 },
    TODAY,
  )
  if (!r.ok) throw new Error(r.error)
  return r.value
}

/** Répond ou échoue avec le message d'erreur. */
export function answer(q: Questionnaire, d: Dossier, id: string, value: AnswerValue): Dossier {
  const r = answerQuestion(q, d, id, value)
  if (!r.ok) throw new Error(`${id} : ${r.error}`)
  return r.value
}

export const text = (t: string): AnswerValue => ({ kind: 'text', text: t })
export const choice = (option: string): AnswerValue => ({ kind: 'choice', option })
export const choices = (...options: string[]): AnswerValue => ({ kind: 'choices', options })
export const num = (value: number): AnswerValue => ({ kind: 'number', value })
export const date = (d: FuzzyDate): AnswerValue => ({ kind: 'date', date: d })
export const UNKNOWN: AnswerValue = { kind: 'unknown' }
export const DECLINED: AnswerValue = { kind: 'declined' }
