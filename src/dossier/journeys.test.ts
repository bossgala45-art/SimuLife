/**
 * Parcours complets d'un joueur sur le vrai catalogue.
 */
import { describe, expect, it } from 'vitest'
import { checkCoherence } from './coherence.ts'
import { CATALOG, CATEGORIES, QUESTIONNAIRE as Q } from './index.ts'
import { buildProfile } from './profile.ts'
import { configure, nextQuestion, progress, visibleQuestions } from './questionnaire.ts'
import { parseDossier, serializeDossier } from './serialization.ts'
import { age, answer, calendar, choice, choices, configured, DECLINED, num, text, TODAY, UNKNOWN } from './testing.ts'
import { buildTimeline } from './timeline.ts'
import type { AnswerValue, Dossier, Question } from './types.ts'

/** Réponses qui ouvrent un maximum de branches conditionnelles. */
const PREFERRED: Record<string, AnswerValue> = {
  'school.highest_level': choice('bac5'),
  'leisure.hobbies': choices('music', 'reading'),
}

/** Réponse valide et chronologiquement cohérente pour n'importe quelle question. */
function autoAnswer(question: Question, d: Dossier): AnswerValue {
  if (PREFERRED[question.id]) return PREFERRED[question.id]
  switch (question.type) {
    case 'text':
      return text(`Réponse ${question.id}`.slice(0, question.maxLength))
    case 'single':
      return choice(question.options[0].id)
    case 'multi':
      return choices(question.options[0].id)
    case 'number':
      return num(Math.min(question.max, question.min + 1))
    case 'date': {
      const [min, max] = question.plausibleAge ?? [10, 14]
      return { kind: 'date', date: age(Math.max(min, Math.min(Math.floor((min + max) / 2), d.startAge! - 1))) }
    }
  }
}

/** Répond à toutes les questions dans l'ordre du parcours. */
function play(d: Dossier, strategy: (q: Question, d: Dossier) => AnswerValue): { dossier: Dossier; steps: number } {
  let steps = 0
  for (let next = nextQuestion(Q, d); next; next = nextQuestion(Q, d)) {
    d = answer(Q, d, next.id, strategy(next, d))
    if (++steps > CATALOG.length) throw new Error('Le parcours ne se termine pas.')
  }
  return { dossier: d, steps }
}

describe('parcours complets', () => {
  it('parcours détaillé : toutes les branches ouvertes, aucune incohérence', () => {
    const { dossier, steps } = play(configured({ birth: calendar(1990, 5, 20), startAge: 30 }), autoAnswer)
    for (const { id } of CATEGORIES) {
      const p = progress(Q, dossier, id)
      expect(p.done, id).toBe(p.total)
    }
    expect(steps).toBe(visibleQuestions(Q, dossier).length)
    expect(steps).toBeGreaterThan(90)
    expect(checkCoherence(Q, dossier, TODAY)).toEqual([])

    const timeline = buildTimeline(Q, dossier)
    const datedWithTimeline = visibleQuestions(Q, dossier).filter((q) => q.type === 'date' && q.timeline)
    expect(timeline).toHaveLength(datedWithTimeline.length + 2)
    for (let i = 1; i < timeline.length; i++) {
      const mid = (e: (typeof timeline)[number]) => e.interval.start + e.interval.end
      expect(mid(timeline[i])).toBeGreaterThanOrEqual(mid(timeline[i - 1]))
    }
    expect(timeline.at(-1)?.kind).toBe('start')
  })

  it('parcours discret : tout refuser reste possible et donne une vie entièrement simulée', () => {
    const { dossier, steps } = play(configured(), () => DECLINED)
    expect(steps).toBeLessThan(CATALOG.length)
    expect(Object.values(dossier.answers).every((a) => a.value.kind === 'declined')).toBe(true)
    expect(buildTimeline(Q, dossier).map((e) => e.kind)).toEqual(['birth', 'start'])
    const profile = buildProfile(Q, dossier)!
    const questionFacts = profile.facts.filter((f) => f.questionId)
    expect(questionFacts.every((f) => f.origin === 'simulated' && f.reason === 'declined')).toBe(true)
  })

  it('parcours incertain : « je ne sais pas » partout', () => {
    const { dossier } = play(configured(), () => UNKNOWN)
    expect(checkCoherence(Q, dossier, TODAY)).toEqual([])
    expect(buildProfile(Q, dossier)!.facts.filter((f) => f.reason === 'unknown').length).toBeGreaterThan(0)
  })

  it('modification : changer une réponse ouvre ou ferme les questions liées sans rien perdre', () => {
    let d = play(configured(), (q, dd) => (q.id === 'decisions.regret' ? choice('no') : autoAnswer(q, dd))).dossier
    const before = progress(Q, d).total
    d = answer(Q, d, 'decisions.regret', choice('yes'))
    expect(progress(Q, d).total).toBe(before + 4)
    expect(nextQuestion(Q, d)?.id).toBe('decisions.regret_text')
    d = play(d, autoAnswer).dossier
    expect(buildTimeline(Q, d).some((e) => e.label === 'Choix regretté')).toBe(true)

    d = answer(Q, d, 'decisions.regret', choice('no'))
    expect(progress(Q, d)).toEqual({ done: before, total: before })
    expect(buildTimeline(Q, d).some((e) => e.label === 'Choix regretté')).toBe(false)

    d = answer(Q, d, 'decisions.regret', choice('yes'))
    expect(nextQuestion(Q, d)).toBeNull() // les réponses précédentes sont retrouvées
  })

  it('choix exclusif : « Aucun » sport ferme les questions sur le club', () => {
    let d = answer(Q, configured(), 'leisure.sports', choices('none'))
    expect(visibleQuestions(Q, d, 'leisure').map((q) => q.id)).not.toContain('leisure.club')
    d = answer(Q, d, 'leisure.sports', choices('swimming', 'dance'))
    expect(visibleQuestions(Q, d, 'leisure').map((q) => q.id)).toContain('leisure.club')
  })

  it('sauvegarde en cours de route puis reprise à l’identique', () => {
    const start = configured({ birth: calendar(1990, 5, 20), startAge: 30 })
    const direct = play(start, autoAnswer).dossier

    let partial = start
    for (let i = 0; i < 40; i++) partial = answer(Q, partial, nextQuestion(Q, partial)!.id, autoAnswer(nextQuestion(Q, partial)!, partial))
    const resumed = parseDossier(serializeDossier(partial))
    expect(nextQuestion(Q, resumed)).toEqual(nextQuestion(Q, partial))
    expect(play(resumed, autoAnswer).dossier).toEqual(direct)
  })

  it('âge de départ : le modifier conserve les réponses et met à jour chronologie et cohérence', () => {
    const at30 = play(configured({ birth: calendar(1990, 5, 20), startAge: 30 }), autoAnswer).dossier
    const r = configure(at30, { birth: at30.birth!, startAge: 20 }, TODAY)
    if (!r.ok) throw new Error(r.error)
    const at20 = r.value
    expect(at20.answers).toEqual(at30.answers)
    const timeline = buildTimeline(Q, at20)
    const startIndex = timeline.findIndex((e) => e.kind === 'start')
    expect(timeline[startIndex].label).toBe('Début de la vie alternative (20 ans)')
    // Les faits postérieurs à 20 ans se placent après le début de la vie alternative.
    expect(timeline.slice(startIndex + 1).length).toBeGreaterThan(0)
    const late = checkCoherence(Q, at20, TODAY).filter((i) => i.code === 'AFTER_START')
    expect(late.length).toBeGreaterThan(0)
    expect(late.every((i) => i.severity === 'warning')).toBe(true)
    expect(buildProfile(Q, at20)!.startDate).toEqual({ year: 2010, month: 5, day: 20 })
  })
})
