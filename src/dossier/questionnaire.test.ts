import { describe, expect, it } from 'vitest'
import { inCategory, YES_NO } from './catalog/helpers.ts'
import { DossierError } from './errors.ts'
import {
  activeAnswer,
  answerQuestion,
  clearAnswer,
  configure,
  createQuestionnaire,
  emptyDossier,
  isVisible,
  nextQuestion,
  progress,
} from './questionnaire.ts'
import { age, answer, calendar, choice, choices, configured, date, DECLINED, num, text, TODAY, UNKNOWN } from './testing.ts'
import type { AnswerValue, Question } from './types.ts'

// Petit questionnaire de test couvrant chaque type et chaque forme de condition.
const Q = createQuestionnaire(
  inCategory('family', [
    { id: 'family.pets', type: 'single', prompt: 'Animal ?', options: YES_NO },
    {
      id: 'family.pet_kinds',
      type: 'multi',
      prompt: 'Lesquels ?',
      maxChoices: 2,
      condition: { is: 'family.pets', options: ['yes'] },
      options: [
        { id: 'dog', label: 'Chien' },
        { id: 'cat', label: 'Chat' },
        { id: 'bird', label: 'Oiseau' },
        { id: 'none', label: 'Aucun', exclusive: true },
      ],
    },
    { id: 'family.count', type: 'number', prompt: 'Combien ?', min: 0, max: 5 },
    {
      id: 'family.detail',
      type: 'text',
      prompt: 'Détail ?',
      maxLength: 10,
      condition: { greaterThan: 'family.count', value: 1 },
    },
    { id: 'family.nested', type: 'text', prompt: 'Imbriquée ?', maxLength: 10, condition: { answered: 'family.detail' } },
    { id: 'family.older', type: 'text', prompt: 'Plus tard ?', maxLength: 10, condition: { startAgeAtLeast: 30 } },
    { id: 'family.when', type: 'date', prompt: 'Quand ?' },
  ]),
)

const invalidAnswer = (id: string, value: AnswerValue) => {
  const r = answerQuestion(Q, configured(), id, value)
  return r.ok ? null : r.error
}

describe('construction du questionnaire', () => {
  const build = (questions: Question[]) => () => createQuestionnaire(questions)
  const base = { prompt: 'Q ?', type: 'single', options: YES_NO } as const

  it('refuse un catalogue mal construit avec un message précis', () => {
    expect(build(inCategory('family', [{ ...base, id: 'family.a' }, { ...base, id: 'family.a' }]))).toThrow(/double/)
    expect(build(inCategory('family', [{ ...base, id: 'school.a' }]))).toThrow(/doit commencer par « family. »/)
    expect(
      build(inCategory('family', [{ ...base, id: 'family.a', condition: { is: 'family.b', options: ['yes'] } }, { ...base, id: 'family.b' }])),
    ).toThrow(/inconnue ou placée après/)
    expect(
      build(inCategory('family', [{ ...base, id: 'family.a' }, { ...base, id: 'family.b', condition: { is: 'family.a', options: ['peut-être'] } }])),
    ).toThrow(/option « peut-être » absente/)
    expect(
      build(inCategory('family', [{ ...base, id: 'family.a' }, { ...base, id: 'family.b', condition: { includes: 'family.a', options: ['yes'] } }])),
    ).toThrow(/incompatible/)
    expect(build(inCategory('family', [{ ...base, id: 'family.a', options: [{ id: 'x', label: 'X' }] }]))).toThrow(/au moins 2 options/)
    expect(build([])).not.toThrow()
    expect(build(inCategory('family', [{ ...base, id: 'x' }]))).toThrow(DossierError)
  })
})

describe('configuration : naissance et âge de départ', () => {
  const setup = (birth = calendar(2000, 3, 15), startAge = 25) => configure(emptyDossier('s'), { birth, startAge }, TODAY)

  it('accepte une année de naissance seule', () => {
    expect(setup(calendar(1990), 30).ok).toBe(true)
  })

  it('refuse les configurations impossibles', () => {
    expect(setup(calendar(2030))).toEqual({ ok: false, error: 'La date de naissance est dans le futur.' })
    expect(setup(calendar(2000, 3, 15), 17)).toEqual({ ok: false, error: 'L’âge de départ doit être un nombre entier d’au moins 18 ans.' })
    // Le 15 juin 2025, une personne née le 15 mars 2000 a 25 ans.
    expect(setup(calendar(2000, 3, 15), 26)).toEqual({
      ok: false,
      error: 'L’âge de départ (26 ans) dépasse ton âge actuel (25 ans au plus).',
    })
    expect(setup(calendar(2010), 18)).toEqual({ ok: false, error: 'Il faut avoir au moins 18 ans pour commencer une vie alternative.' })
    expect(setup(age(20) as never).ok).toBe(false)
  })

  it('exige la configuration avant toute réponse', () => {
    expect(answerQuestion(Q, emptyDossier('s'), 'family.pets', choice('yes'))).toEqual({
      ok: false,
      error: 'Indique d’abord ta date de naissance et l’âge de départ.',
    })
  })
})

describe('questions conditionnelles', () => {
  it('affiche une question seulement si sa condition est remplie', () => {
    let d = configured()
    expect(isVisible(Q, d, 'family.pet_kinds')).toBe(false)
    expect(answerQuestion(Q, d, 'family.pet_kinds', choices('dog'))).toEqual({
      ok: false,
      error: 'Cette question ne s’applique pas à ton parcours.',
    })
    d = answer(Q, d, 'family.pets', choice('yes'))
    expect(isVisible(Q, d, 'family.pet_kinds')).toBe(true)
  })

  it('compare des nombres et tient compte de l’âge de départ', () => {
    let d = answer(Q, configured(), 'family.count', num(1))
    expect(isVisible(Q, d, 'family.detail')).toBe(false)
    d = answer(Q, d, 'family.count', num(2))
    expect(isVisible(Q, d, 'family.detail')).toBe(true)
    expect(isVisible(Q, configured({ startAge: 25 }), 'family.older')).toBe(false)
    expect(isVisible(Q, configured({ birth: calendar(1980), startAge: 30 }), 'family.older')).toBe(true)
  })

  it('ne considère pas « je ne sais pas » comme une réponse pour une condition', () => {
    let d = answer(Q, configured(), 'family.count', num(3))
    d = answer(Q, d, 'family.detail', UNKNOWN)
    expect(isVisible(Q, d, 'family.nested')).toBe(false)
    d = answer(Q, d, 'family.detail', text('ok'))
    expect(isVisible(Q, d, 'family.nested')).toBe(true)
  })

  it('masque les questions en cascade et conserve les réponses masquées', () => {
    let d = answer(Q, configured(), 'family.count', num(3))
    d = answer(Q, d, 'family.detail', text('ok'))
    d = answer(Q, d, 'family.nested', text('gardé'))
    d = answer(Q, d, 'family.count', num(0))
    expect(isVisible(Q, d, 'family.detail')).toBe(false)
    expect(isVisible(Q, d, 'family.nested')).toBe(false)
    expect(activeAnswer(Q, d, 'family.nested')).toBeUndefined()
    expect(d.answers['family.nested']).toBeDefined()
    d = answer(Q, d, 'family.count', num(4))
    expect(activeAnswer(Q, d, 'family.nested')?.value).toEqual(text('gardé'))
  })
})

describe('validation des réponses', () => {
  it('accepte « je ne sais pas » et « je préfère ne pas répondre » pour toute question', () => {
    for (const q of Q.questions.filter((x) => !x.condition)) {
      expect(invalidAnswer(q.id, UNKNOWN)).toBeNull()
      expect(invalidAnswer(q.id, DECLINED)).toBeNull()
    }
  })

  it('vérifie les réponses libres', () => {
    expect(invalidAnswer('family.when', text('hier'))).toMatch(/incompatible/)
    const d = answer(Q, answer(Q, configured(), 'family.count', num(2)), 'family.detail', text('  court  '))
    expect(d.answers['family.detail'].value).toEqual(text('court'))
    expect(answerQuestion(Q, d, 'family.detail', text('   ')).ok).toBe(false)
    expect(answerQuestion(Q, d, 'family.detail', text('beaucoup trop long'))).toEqual({
      ok: false,
      error: 'La réponse dépasse 10 caractères.',
    })
  })

  it('vérifie les choix uniques et multiples', () => {
    expect(invalidAnswer('family.pets', choice('maybe'))).toBe('Option inconnue : « maybe ».')
    const d = answer(Q, configured(), 'family.pets', choice('yes'))
    const multi = (...ids: string[]) => {
      const r = answerQuestion(Q, d, 'family.pet_kinds', choices(...ids))
      return r.ok ? null : r.error
    }
    expect(multi('dog', 'cat')).toBeNull()
    expect(multi()).toBe('Choisis au moins une option.')
    expect(multi('dog', 'dog')).toBe('Une option est choisie deux fois.')
    expect(multi('dog', 'cat', 'bird')).toBe('Choisis au plus 2 options.')
    expect(multi('none', 'dog')).toBe('« Aucun » ne peut pas être combiné avec d’autres choix.')
    expect(multi('none')).toBeNull()
  })

  it('vérifie les nombres et les dates', () => {
    expect(invalidAnswer('family.count', num(6))).toBe('La réponse doit être comprise entre 0 et 5.')
    expect(invalidAnswer('family.count', num(1.5))).toBe('La réponse doit être un nombre entier.')
    expect(invalidAnswer('family.when', date(calendar(2010, 2, 30)))).toBe('Le 30 février 2010 n’existe pas.')
    expect(invalidAnswer('family.when', date(age(8, true)))).toBeNull()
    expect(invalidAnswer('family.inconnue', num(1))).toBe('Question inconnue : « family.inconnue ».')
  })
})

describe('progression et modification', () => {
  it('compte les questions visibles, réponses inconnues et refusées comprises', () => {
    let d = configured()
    // Visibles : animal, nombre, date (les autres dépendent de conditions).
    expect(progress(Q, d)).toEqual({ done: 0, total: 3 })
    expect(nextQuestion(Q, d)?.id).toBe('family.pets')
    d = answer(Q, d, 'family.pets', choice('yes'))
    expect(progress(Q, d)).toEqual({ done: 1, total: 4 })
    expect(nextQuestion(Q, d)?.id).toBe('family.pet_kinds')
    d = answer(Q, d, 'family.pet_kinds', DECLINED)
    d = answer(Q, d, 'family.count', UNKNOWN)
    d = answer(Q, d, 'family.when', date(calendar(2010)))
    expect(progress(Q, d)).toEqual({ done: 4, total: 4 })
    expect(nextQuestion(Q, d)).toBeNull()
  })

  it('permet de modifier ou d’effacer une réponse sans toucher au dossier d’origine', () => {
    const d1 = answer(Q, configured(), 'family.pets', choice('yes'))
    const snapshot = structuredClone(d1)
    const d2 = answer(Q, d1, 'family.pets', choice('no'))
    expect(d2.answers['family.pets']).toEqual({ value: choice('no'), revision: 1 })
    expect(answer(Q, d2, 'family.pets', choice('yes')).answers['family.pets'].revision).toBe(2)
    expect(d1).toEqual(snapshot)
    expect(clearAnswer(d2, 'family.pets').answers['family.pets']).toBeUndefined()
  })
})
