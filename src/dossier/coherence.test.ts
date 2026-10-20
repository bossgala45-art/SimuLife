import { describe, expect, it } from 'vitest'
import { inCategory, LONG, YES_NO } from './catalog/helpers.ts'
import { checkCoherence } from './coherence.ts'
import { createQuestionnaire } from './questionnaire.ts'
import { buildTimeline } from './timeline.ts'
import { age, answer, calendar, choice, configured, date, DECLINED, text, TODAY, UNKNOWN } from './testing.ts'

const Q = createQuestionnaire(
  inCategory('school', [
    { id: 'school.start', type: 'date', prompt: 'Début ?', plausibleAge: [4, 9], timeline: { label: 'Entrée à l’école' } },
    { id: 'school.field', type: 'text', prompt: 'Domaine ?', maxLength: LONG },
    {
      id: 'school.end',
      type: 'date',
      prompt: 'Fin ?',
      after: ['school.start'],
      timeline: { label: 'Fin des études', detailFrom: 'school.field' },
    },
    { id: 'school.moved', type: 'single', prompt: 'Déménagé ?', options: YES_NO },
    {
      id: 'school.moved_date',
      type: 'date',
      prompt: 'Quand ?',
      condition: { is: 'school.moved', options: ['yes'] },
      timeline: { label: 'Déménagement' },
    },
  ]),
)

const codes = (d: Parameters<typeof checkCoherence>[1]) => checkCoherence(Q, d, TODAY).map((i) => `${i.questionId}:${i.code}`)

describe('cohérence chronologique', () => {
  it('ne signale rien pour un parcours cohérent', () => {
    let d = answer(Q, configured(), 'school.start', date(age(6)))
    d = answer(Q, d, 'school.end', date(calendar(2018, 6)))
    expect(checkCoherence(Q, d, TODAY)).toEqual([])
  })

  it('refuse un événement avant la naissance ou dans le futur', () => {
    expect(codes(answer(Q, configured(), 'school.end', date(calendar(1999))))).toEqual(['school.end:BEFORE_BIRTH'])
    const future = checkCoherence(Q, answer(Q, configured(), 'school.end', date(calendar(2030))), TODAY)
    expect(future).toEqual([
      { questionId: 'school.end', severity: 'error', code: 'IN_FUTURE', message: 'Cette date est dans le futur.' },
    ])
  })

  it('détecte un ordre impossible entre deux dates', () => {
    let d = answer(Q, configured(), 'school.start', date(calendar(2010)))
    d = answer(Q, d, 'school.end', date(calendar(2009)))
    const issue = checkCoherence(Q, d, TODAY).find((i) => i.code === 'ORDER')
    expect(issue).toEqual({
      questionId: 'school.end',
      severity: 'error',
      code: 'ORDER',
      message: 'Cette date devrait suivre : « Entrée à l’école » (1er janvier 2010 au plus tôt).',
    })
  })

  it('ne déclare pas incohérentes deux dates floues qui peuvent se chevaucher', () => {
    let d = answer(Q, configured(), 'school.start', date(calendar(2010, undefined, undefined, true)))
    d = answer(Q, d, 'school.end', date(calendar(2009)))
    expect(codes(d)).not.toContain('school.end:ORDER')
  })

  it('avertit pour un âge inhabituel ou une date après l’âge de départ', () => {
    expect(checkCoherence(Q, answer(Q, configured(), 'school.start', date(age(15))), TODAY)).toEqual([
      {
        questionId: 'school.start',
        severity: 'warning',
        code: 'IMPLAUSIBLE_AGE',
        message: 'Âge inhabituel pour cet événement (attendu entre 4 et 9 ans).',
      },
    ])
    const late = answer(Q, configured({ startAge: 20 }), 'school.end', date(calendar(2023)))
    expect(codes(late)).toEqual(['school.end:AFTER_START'])
  })

  it('ignore les dates inconnues, refusées ou de questions masquées', () => {
    let d = answer(Q, configured(), 'school.start', date(calendar(2010)))
    d = answer(Q, d, 'school.end', UNKNOWN)
    d = answer(Q, d, 'school.moved', choice('yes'))
    d = answer(Q, d, 'school.moved_date', date(calendar(1990)))
    expect(codes(d)).toEqual(['school.moved_date:BEFORE_BIRTH'])
    d = answer(Q, d, 'school.moved', choice('no'))
    expect(codes(d)).toEqual([])
  })
})

describe('chronologie personnelle', () => {
  it('trie les événements par date, quel que soit l’ordre des réponses', () => {
    let d = answer(Q, configured(), 'school.field', text('Biologie'))
    d = answer(Q, d, 'school.end', date(calendar(2022, 6)))
    d = answer(Q, d, 'school.moved', choice('yes'))
    d = answer(Q, d, 'school.moved_date', date(age(12, true)))
    d = answer(Q, d, 'school.start', date(age(6)))
    const timeline = buildTimeline(Q, d)
    expect(timeline.map((e) => e.label)).toEqual([
      'Naissance',
      'Entrée à l’école',
      'Déménagement',
      'Fin des études',
      'Début de la vie alternative (25 ans)',
    ])
    expect(timeline[1]).toMatchObject({ when: 'à 6 ans', approximate: true, questionId: 'school.start' })
    expect(timeline[2].when).toBe('vers 12 ans')
    expect(timeline[3]).toMatchObject({ detail: 'Biologie', when: 'juin 2022' })
    expect(timeline[0]).toMatchObject({ kind: 'birth', when: '15 mars 2000', approximate: false })
  })

  it('n’inclut que les faits déclarés et actifs', () => {
    let d = answer(Q, configured(), 'school.start', DECLINED)
    d = answer(Q, d, 'school.end', UNKNOWN)
    d = answer(Q, d, 'school.moved', choice('yes'))
    d = answer(Q, d, 'school.moved_date', date(calendar(2008)))
    d = answer(Q, d, 'school.moved', choice('no'))
    expect(buildTimeline(Q, d).map((e) => e.kind)).toEqual(['birth', 'start'])
  })

  it('est vide tant que le dossier n’est pas configuré', () => {
    expect(buildTimeline(Q, { version: 1, seed: 's', birth: null, startAge: null, answers: {} })).toEqual([])
  })
})
