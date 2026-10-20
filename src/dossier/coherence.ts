/**
 * Vérification de cohérence chronologique.
 *
 * - erreur : impossible (avant la naissance, dans le futur, ordre inversé) ;
 * - avertissement : surprenant mais possible (âge inhabituel, après l'âge de départ).
 *
 * Les dates floues sont comparées par intervalles : une incohérence n'est
 * signalée que si elle est certaine pour toutes les dates possibles.
 */
import type { CalendarDate } from '../engine/types.ts'
import { ageRange, anniversaryInterval, formatDay, toDay, toInterval } from './dates.ts'
import { activeAnswer, isConfigured, visibleQuestions, type Questionnaire } from './questionnaire.ts'
import type { DateQuestion, DayInterval, Dossier, QuestionId } from './types.ts'

export type CoherenceCode = 'BEFORE_BIRTH' | 'IN_FUTURE' | 'ORDER' | 'AFTER_START' | 'IMPLAUSIBLE_AGE'

export interface CoherenceIssue {
  questionId: QuestionId
  severity: 'error' | 'warning'
  code: CoherenceCode
  message: string
}

/** Intervalle d'une réponse de date active, ou `null`. */
export function answerInterval(q: Questionnaire, d: Dossier, id: QuestionId): DayInterval | null {
  const value = activeAnswer(q, d, id)?.value
  if (value?.kind !== 'date' || !d.birth) return null
  return toInterval(value.date, toInterval(d.birth, null))
}

export function checkCoherence(q: Questionnaire, d: Dossier, today: CalendarDate): CoherenceIssue[] {
  if (!isConfigured(d)) return []
  const birth = toInterval(d.birth, null)!
  const start = anniversaryInterval(birth, d.startAge)
  const todayDay = toDay(today)
  const issues: CoherenceIssue[] = []

  for (const question of visibleQuestions(q, d)) {
    if (question.type !== 'date') continue
    const when = answerInterval(q, d, question.id)
    if (!when) continue
    const add = (severity: CoherenceIssue['severity'], code: CoherenceCode, message: string) =>
      issues.push({ questionId: question.id, severity, code, message })

    if (when.end < birth.start) add('error', 'BEFORE_BIRTH', 'Cette date est antérieure à ta naissance.')
    if (when.start > todayDay) add('error', 'IN_FUTURE', 'Cette date est dans le futur.')

    for (const ref of question.after ?? []) {
      const other = answerInterval(q, d, ref)
      if (other && when.end < other.start) {
        add('error', 'ORDER', `Cette date devrait suivre : « ${label(q, ref)} » (${formatDay(other.start)} au plus tôt).`)
      }
    }

    if (when.start > start.end && when.start <= todayDay) {
      add('warning', 'AFTER_START', `Cette date est après tes ${d.startAge} ans : la vie alternative commence avant.`)
    }

    if (question.plausibleAge && when.end >= birth.start) {
      const [min, max] = question.plausibleAge
      const [youngest, oldest] = ageRange(when, birth)
      if (oldest < min || youngest > max) {
        add('warning', 'IMPLAUSIBLE_AGE', `Âge inhabituel pour cet événement (attendu entre ${min} et ${max} ans).`)
      }
    }
  }
  return issues
}

function label(q: Questionnaire, id: QuestionId): string {
  const question = q.byId.get(id) as DateQuestion
  return question.timeline?.label ?? question.prompt
}
