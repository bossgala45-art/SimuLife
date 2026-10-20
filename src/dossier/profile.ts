/**
 * Profil de départ de la simulation : faits déclarés et hypothèses simulées.
 *
 * Règle : une hypothèse ne remplace JAMAIS un fait déclaré. Chaque valeur
 * indique son origine ; les hypothèses indiquent pourquoi elles existent
 * (pas de réponse, « je ne sais pas », refus, date approximative, non demandé).
 *
 * Chaque hypothèse a son propre flux pseudo-aléatoire (graine du dossier + clé) :
 * modifier une réponse ne change pas les autres hypothèses.
 */
import { hashSeed, nextRandom } from '../engine/rng.ts'
import type { Attributes, CalendarDate } from '../engine/types.ts'
import { addYears, formatDay, fromDay, toDay, toInterval } from './dates.ts'
import { activeAnswer, isConfigured, type Questionnaire } from './questionnaire.ts'
import type { AnswerValue, Dossier, QuestionId, SingleQuestion } from './types.ts'

export type HypothesisReason = 'unanswered' | 'unknown' | 'declined' | 'approximate' | 'not_asked'

export const REASON_LABELS: Record<HypothesisReason, string> = {
  unanswered: 'pas encore de réponse',
  unknown: 'réponse « je ne sais pas »',
  declined: 'réponse refusée',
  approximate: 'date approximative',
  not_asked: 'non demandé',
}

export interface ProfileFact {
  key: string
  label: string
  display: string
  origin: 'declared' | 'simulated'
  reason?: HypothesisReason
  questionId?: QuestionId
}

export interface LifeProfile {
  facts: ProfileFact[]
  name: string
  birthDate: CalendarDate
  /** Date à laquelle commence la vie alternative. */
  startDate: CalendarDate
  attributes: Attributes
}

const NAMES = ['Alex', 'Camille', 'Charlie', 'Sacha', 'Noa', 'Eden', 'Lou', 'Maël', 'Andréa', 'Robin']

function randomFor(seed: string, key: string): () => number {
  let state = hashSeed(`${seed}:${key}`)
  return () => {
    const r = nextRandom(state)
    state = r.state
    return r.value
  }
}

const intBetween = (rand: () => number, min: number, max: number) => min + Math.floor(rand() * (max - min + 1))

function reasonOf(value: AnswerValue | undefined): HypothesisReason {
  if (!value) return 'unanswered'
  if (value.kind === 'unknown') return 'unknown'
  if (value.kind === 'declined') return 'declined'
  return 'unanswered'
}

/** Échelle déclarée → caractéristique de la simulation (0 à 100). */
const ATTRIBUTE_SOURCES: {
  key: keyof Attributes
  label: string
  questionId?: QuestionId
  scale?: Record<string, number>
  simulated: [number, number]
}[] = [
  {
    key: 'health',
    label: 'Santé',
    questionId: 'health.general',
    scale: { very_good: 95, good: 88, average: 78, fragile: 68 },
    simulated: [85, 100],
  },
  {
    key: 'fitness',
    label: 'Forme physique',
    questionId: 'health.activity_level',
    scale: { very_active: 70, active: 58, low: 42, sedentary: 30 },
    simulated: [30, 70],
  },
  {
    key: 'sociability',
    label: 'Sociabilité',
    questionId: 'relationships.social_ease',
    scale: { easy: 70, rather_easy: 58, rather_hard: 42, hard: 30 },
    simulated: [30, 70],
  },
  // Le questionnaire ne mesure pas l'intelligence : c'est toujours une hypothèse.
  { key: 'intelligence', label: 'Intelligence', simulated: [30, 70] },
]

/** Faits de choix unique repris tels quels dans le profil. */
const CHOICE_FACTS: { key: string; label: string; questionId: QuestionId }[] = [
  { key: 'birthPlace', label: 'Lieu de naissance', questionId: 'identity.birth_place_type' },
  { key: 'education', label: 'Niveau d’études', questionId: 'school.highest_level' },
  { key: 'chronotype', label: 'Rythme', questionId: 'personality.morning_evening' },
]

export function buildProfile(q: Questionnaire, d: Dossier): LifeProfile | null {
  if (!isConfigured(d)) return null
  const facts: ProfileFact[] = []
  const answer = (id: QuestionId) => activeAnswer(q, d, id)?.value

  // Prénom du personnage
  const nameAnswer = answer('identity.first_name')
  let name: string
  if (nameAnswer?.kind === 'text') {
    name = nameAnswer.text
    facts.push({ key: 'name', label: 'Prénom', display: name, origin: 'declared', questionId: 'identity.first_name' })
  } else {
    const rand = randomFor(d.seed, 'name')
    name = NAMES[Math.floor(rand() * NAMES.length)]
    facts.push({
      key: 'name',
      label: 'Prénom',
      display: name,
      origin: 'simulated',
      reason: reasonOf(nameAnswer),
      questionId: 'identity.first_name',
    })
  }

  // Date de naissance : exacte = fait ; sinon un jour est tiré dans l'intervalle déclaré.
  const birthInterval = toInterval(d.birth, null)!
  const exact = birthInterval.start === birthInterval.end
  const rand = randomFor(d.seed, 'birthDate')
  const birthDate = fromDay(exact ? birthInterval.start : intBetween(rand, birthInterval.start, birthInterval.end))
  facts.push({
    key: 'birthDate',
    label: 'Date de naissance',
    display: formatDay(toDay(birthDate)),
    origin: exact ? 'declared' : 'simulated',
    reason: exact ? undefined : 'approximate',
  })
  const startDate = addYears(birthDate, d.startAge)
  facts.push({
    key: 'startDate',
    label: `Début de la vie alternative (${d.startAge} ans)`,
    display: formatDay(toDay(startDate)),
    origin: exact ? 'declared' : 'simulated',
    reason: exact ? undefined : 'approximate',
  })

  // Fratrie
  const siblings = answer('family.siblings_count')
  if (siblings?.kind === 'number') {
    facts.push({ key: 'siblings', label: 'Frères et sœurs', display: String(siblings.value), origin: 'declared', questionId: 'family.siblings_count' })
  } else {
    const r = randomFor(d.seed, 'siblings')()
    const value = r < 0.2 ? 0 : r < 0.6 ? 1 : r < 0.85 ? 2 : 3
    facts.push({
      key: 'siblings',
      label: 'Frères et sœurs',
      display: String(value),
      origin: 'simulated',
      reason: reasonOf(siblings),
      questionId: 'family.siblings_count',
    })
  }

  for (const { key, label, questionId } of CHOICE_FACTS) {
    const question = q.byId.get(questionId) as SingleQuestion | undefined
    if (!question) continue
    const value = answer(questionId)
    if (value?.kind === 'choice') {
      const option = question.options.find((o) => o.id === value.option)!
      facts.push({ key, label, display: option.label, origin: 'declared', questionId })
    } else {
      const options = question.options
      const option = options[Math.floor(randomFor(d.seed, key)() * options.length)]
      facts.push({ key, label, display: option.label, origin: 'simulated', reason: reasonOf(value), questionId })
    }
  }

  const attributes = {} as Attributes
  for (const source of ATTRIBUTE_SOURCES) {
    const value = source.questionId ? answer(source.questionId) : undefined
    const declared = value?.kind === 'choice' ? source.scale?.[value.option] : undefined
    if (declared !== undefined) {
      attributes[source.key] = declared
      facts.push({
        key: source.key,
        label: source.label,
        display: `${declared}/100`,
        origin: 'declared',
        questionId: source.questionId,
      })
    } else {
      const [min, max] = source.simulated
      const simulated = intBetween(randomFor(d.seed, source.key), min, max)
      attributes[source.key] = simulated
      facts.push({
        key: source.key,
        label: source.label,
        display: `${simulated}/100`,
        origin: 'simulated',
        reason: source.questionId ? reasonOf(value) : 'not_asked',
        questionId: source.questionId,
      })
    }
  }

  return { facts, name, birthDate, startDate, attributes }
}
