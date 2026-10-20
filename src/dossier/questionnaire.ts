/**
 * Moteur du questionnaire : visibilité conditionnelle, validation et
 * enregistrement des réponses, progression.
 *
 * Toutes les fonctions sont pures : elles renvoient un nouveau dossier.
 * Une réponse dont la question devient invisible (condition qui ne tient plus)
 * est conservée mais ignorée ; elle redevient active si la condition revient.
 */
import { ADULT_AGE } from '../engine/simulation.ts'
import type { CalendarDate } from '../engine/types.ts'
import { ageOn, fromDay, toDay, toInterval, validateFuzzyDate } from './dates.ts'
import { DossierError } from './errors.ts'
import type { AnswerRecord, AnswerValue, CategoryId, Condition, Dossier, FuzzyDate, Question, QuestionId } from './types.ts'

/** La simulation ne gère pour l'instant que des personnages adultes. */
export const MIN_START_AGE = ADULT_AGE

export interface Questionnaire {
  questions: readonly Question[]
  byId: ReadonlyMap<QuestionId, Question>
  index: ReadonlyMap<QuestionId, number>
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: string }

/** Construit un questionnaire après avoir vérifié la structure du catalogue. */
export function createQuestionnaire(questions: readonly Question[]): Questionnaire {
  const byId = new Map<QuestionId, Question>()
  const index = new Map<QuestionId, number>()
  const fail = (msg: string): never => {
    throw new DossierError('INVALID_CATALOG', msg)
  }

  questions.forEach((q, i) => {
    if (!q.id.startsWith(`${q.category}.`)) fail(`L’identifiant « ${q.id} » doit commencer par « ${q.category}. ».`)
    if (byId.has(q.id)) fail(`Identifiant en double : « ${q.id} ».`)
    if ((q.type === 'single' || q.type === 'multi') && new Set(q.options.map((o) => o.id)).size !== q.options.length) {
      fail(`Options en double dans « ${q.id} ».`)
    }
    if ((q.type === 'single' || q.type === 'multi') && q.options.length < 2) fail(`« ${q.id} » doit proposer au moins 2 options.`)

    // Une condition ne peut viser qu'une question PRÉCÉDENTE : pas de cycle possible.
    const checkRef = (ref: QuestionId, what: string): Question => {
      const target = byId.get(ref)
      if (!target) return fail(`« ${q.id} » : ${what} « ${ref} » inconnue ou placée après.`)
      return target
    }
    const checkCondition = (c: Condition): void => {
      if ('all' in c) return c.all.forEach(checkCondition)
      if ('any' in c) return c.any.forEach(checkCondition)
      if ('not' in c) return checkCondition(c.not)
      if ('startAgeAtLeast' in c) return
      if ('answered' in c) return void checkRef(c.answered, 'condition sur la question')
      if ('greaterThan' in c) {
        if (checkRef(c.greaterThan, 'condition sur la question').type !== 'number') fail(`« ${q.id} » : greaterThan vise un nombre.`)
        return
      }
      const ref = 'is' in c ? c.is : c.includes
      const target = checkRef(ref, 'condition sur la question')
      const expected = 'is' in c ? 'single' : 'multi'
      if (target.type !== expected) fail(`« ${q.id} » : condition incompatible avec « ${ref} » (${target.type}).`)
      if (target.type === 'single' || target.type === 'multi') {
        for (const o of c.options) {
          if (!target.options.some((t) => t.id === o)) fail(`« ${q.id} » : option « ${o} » absente de « ${ref} ».`)
        }
      }
    }
    if (q.condition) checkCondition(q.condition)
    if (q.type === 'date') {
      for (const ref of q.after ?? []) {
        if (checkRef(ref, 'date de référence').type !== 'date') fail(`« ${q.id} » : « ${ref} » n’est pas une date.`)
      }
      const detail = q.timeline?.detailFrom
      if (detail && checkRef(detail, 'précision').type !== 'text') fail(`« ${q.id} » : « ${detail} » n’est pas un texte.`)
    }
    byId.set(q.id, q)
    index.set(q.id, i)
  })
  return { questions, byId, index }
}

export function emptyDossier(seed: string): Dossier {
  return { version: 1, seed, birth: null, startAge: null, answers: {} }
}

export function isConfigured(d: Dossier): d is Dossier & { birth: NonNullable<Dossier['birth']>; startAge: number } {
  return d.birth !== null && d.startAge !== null
}

/**
 * Enregistre la date de naissance et l'âge de départ.
 * L'année de naissance suffit ; l'âge de départ ne peut pas dépasser l'âge actuel.
 */
export function configure(
  d: Dossier,
  setup: { birth: FuzzyDate; startAge: number },
  today: CalendarDate,
): Result<Dossier> {
  const { birth, startAge } = setup
  if (birth.kind !== 'calendar') return { ok: false, error: 'La naissance doit être une date (l’année suffit).' }
  const invalid = validateFuzzyDate(birth)
  if (invalid) return { ok: false, error: invalid }
  const interval = toInterval(birth, null)!
  const todayDay = toDay(today)
  if (interval.start > todayDay) return { ok: false, error: 'La date de naissance est dans le futur.' }
  const maxAge = ageOn(fromDay(interval.start), today)
  if (!Number.isInteger(startAge) || startAge < MIN_START_AGE) {
    return { ok: false, error: `L’âge de départ doit être un nombre entier d’au moins ${MIN_START_AGE} ans.` }
  }
  if (startAge > maxAge) {
    return {
      ok: false,
      error:
        maxAge < MIN_START_AGE
          ? `Il faut avoir au moins ${MIN_START_AGE} ans pour commencer une vie alternative.`
          : `L’âge de départ (${startAge} ans) dépasse ton âge actuel (${maxAge} ans au plus).`,
    }
  }
  return { ok: true, value: { ...d, birth: { ...birth }, startAge } }
}

/** Réponse prise en compte : la question doit être visible. */
export function activeAnswer(q: Questionnaire, d: Dossier, id: QuestionId): AnswerRecord | undefined {
  return isVisible(q, d, id) ? d.answers[id] : undefined
}

export function isVisible(q: Questionnaire, d: Dossier, id: QuestionId): boolean {
  const question = q.byId.get(id)
  if (!question) return false
  return question.condition ? evaluate(q, d, question.condition) : true
}

function evaluate(q: Questionnaire, d: Dossier, c: Condition): boolean {
  if ('all' in c) return c.all.every((x) => evaluate(q, d, x))
  if ('any' in c) return c.any.some((x) => evaluate(q, d, x))
  if ('not' in c) return !evaluate(q, d, c.not)
  if ('startAgeAtLeast' in c) return d.startAge !== null && d.startAge >= c.startAgeAtLeast
  if ('answered' in c) {
    const kind = activeAnswer(q, d, c.answered)?.value.kind
    return kind !== undefined && kind !== 'unknown' && kind !== 'declined'
  }
  if ('greaterThan' in c) {
    const v = activeAnswer(q, d, c.greaterThan)?.value
    return v?.kind === 'number' && v.value > c.value
  }
  if ('is' in c) {
    const v = activeAnswer(q, d, c.is)?.value
    return v?.kind === 'choice' && c.options.includes(v.option)
  }
  const v = activeAnswer(q, d, c.includes)?.value
  return v?.kind === 'choices' && v.options.some((o) => c.options.includes(o))
}

export function visibleQuestions(q: Questionnaire, d: Dossier, category?: CategoryId): Question[] {
  return q.questions.filter((x) => (!category || x.category === category) && isVisible(q, d, x.id))
}

/** Une question compte comme traitée dès qu'elle a une réponse, même « je ne sais pas » ou « refus ». */
export function progress(q: Questionnaire, d: Dossier, category?: CategoryId): { done: number; total: number } {
  const visible = visibleQuestions(q, d, category)
  return { done: visible.filter((x) => d.answers[x.id]).length, total: visible.length }
}

/** Prochaine question visible sans réponse (dans la catégorie si elle est précisée). */
export function nextQuestion(q: Questionnaire, d: Dossier, category?: CategoryId): Question | null {
  return visibleQuestions(q, d, category).find((x) => !d.answers[x.id]) ?? null
}

/** Message d'erreur si la réponse ne convient pas à la question, sinon `null`. */
export function validateAnswer(question: Question, value: AnswerValue): string | null {
  if (value.kind === 'unknown' || value.kind === 'declined') return null
  switch (question.type) {
    case 'text': {
      if (value.kind !== 'text') break
      const text = value.text.trim()
      if (text.length === 0) return 'La réponse est vide.'
      if (text.length > question.maxLength) return `La réponse dépasse ${question.maxLength} caractères.`
      return null
    }
    case 'single':
      if (value.kind !== 'choice') break
      return question.options.some((o) => o.id === value.option) ? null : `Option inconnue : « ${value.option} ».`
    case 'multi': {
      if (value.kind !== 'choices') break
      const chosen = value.options
      if (chosen.length === 0) return 'Choisis au moins une option.'
      if (new Set(chosen).size !== chosen.length) return 'Une option est choisie deux fois.'
      const unknown = chosen.find((id) => !question.options.some((o) => o.id === id))
      if (unknown) return `Option inconnue : « ${unknown} ».`
      if (question.maxChoices && chosen.length > question.maxChoices) return `Choisis au plus ${question.maxChoices} options.`
      const exclusive = question.options.find((o) => o.exclusive && chosen.includes(o.id))
      if (exclusive && chosen.length > 1) return `« ${exclusive.label} » ne peut pas être combiné avec d’autres choix.`
      return null
    }
    case 'number':
      if (value.kind !== 'number') break
      if (!Number.isInteger(value.value)) return 'La réponse doit être un nombre entier.'
      if (value.value < question.min || value.value > question.max) {
        return `La réponse doit être comprise entre ${question.min} et ${question.max}.`
      }
      return null
    case 'date':
      if (value.kind !== 'date') break
      return validateFuzzyDate(value.date)
  }
  return `Type de réponse « ${value.kind} » incompatible avec une question de type « ${question.type} ».`
}

/** Enregistre (ou modifie) une réponse après validation. */
export function answerQuestion(q: Questionnaire, d: Dossier, id: QuestionId, value: AnswerValue): Result<Dossier> {
  const question = q.byId.get(id)
  if (!question) return { ok: false, error: `Question inconnue : « ${id} ».` }
  if (!isConfigured(d)) return { ok: false, error: 'Indique d’abord ta date de naissance et l’âge de départ.' }
  if (!isVisible(q, d, id)) return { ok: false, error: 'Cette question ne s’applique pas à ton parcours.' }
  const error = validateAnswer(question, value)
  if (error) return { ok: false, error }

  const stored: AnswerValue = value.kind === 'text' ? { kind: 'text', text: value.text.trim() } : structuredClone(value)
  const previous = d.answers[id]
  const record: AnswerRecord = { value: stored, revision: previous ? previous.revision + 1 : 0 }
  return { ok: true, value: { ...d, answers: { ...d.answers, [id]: record } } }
}

export function clearAnswer(d: Dossier, id: QuestionId): Dossier {
  const answers = { ...d.answers }
  delete answers[id]
  return { ...d, answers }
}
