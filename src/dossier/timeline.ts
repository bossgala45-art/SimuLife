/**
 * Chronologie personnelle construite à partir des faits déclarés.
 * Seules les réponses actives avec une date y figurent ; les réponses
 * « je ne sais pas » ou refusées n'y apparaissent pas.
 */
import { anniversaryInterval, formatFuzzyDate, toInterval } from './dates.ts'
import { answerInterval } from './coherence.ts'
import { activeAnswer, isConfigured, visibleQuestions, type Questionnaire } from './questionnaire.ts'
import type { DayInterval, Dossier, QuestionId } from './types.ts'

export interface TimelineEntry {
  key: string
  kind: 'birth' | 'event' | 'start'
  label: string
  detail?: string
  /** Date telle que déclarée (« vers 7 ans », « environ 2010 »…). */
  when: string
  interval: DayInterval
  approximate: boolean
  questionId?: QuestionId
}

export function buildTimeline(q: Questionnaire, d: Dossier): TimelineEntry[] {
  if (!isConfigured(d)) return []
  const birth = toInterval(d.birth, null)!
  const entries: (TimelineEntry & { order: number })[] = [
    {
      key: 'birth',
      kind: 'birth',
      label: 'Naissance',
      when: formatFuzzyDate(d.birth),
      interval: birth,
      approximate: birth.start !== birth.end,
      order: -1,
    },
  ]

  for (const question of visibleQuestions(q, d)) {
    if (question.type !== 'date' || !question.timeline) continue
    const value = activeAnswer(q, d, question.id)?.value
    const interval = answerInterval(q, d, question.id)
    if (value?.kind !== 'date' || !interval) continue
    const detailFrom = question.timeline.detailFrom
    const detail = detailFrom ? activeAnswer(q, d, detailFrom)?.value : undefined
    entries.push({
      key: question.id,
      kind: 'event',
      label: question.timeline.label,
      detail: detail?.kind === 'text' ? detail.text : undefined,
      when: formatFuzzyDate(value.date),
      interval,
      approximate: interval.start !== interval.end,
      questionId: question.id,
      order: q.index.get(question.id)!,
    })
  }

  const start = anniversaryInterval(birth, d.startAge)
  entries.push({
    key: 'start',
    kind: 'start',
    label: `Début de la vie alternative (${d.startAge} ans)`,
    when: `à ${d.startAge} ans`,
    interval: start,
    approximate: start.start !== start.end,
    order: Number.MAX_SAFE_INTEGER,
  })

  // Tri par milieu d'intervalle, puis par ordre du catalogue (stable et reproductible).
  const mid = (e: TimelineEntry) => e.interval.start + e.interval.end
  entries.sort((a, b) => mid(a) - mid(b) || a.order - b.order)
  return entries.map((e) => {
    const entry: TimelineEntry & { order?: number } = { ...e }
    delete entry.order
    return entry
  })
}
