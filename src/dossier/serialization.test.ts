import { describe, expect, it } from 'vitest'
import { DossierError } from './errors.ts'
import { QUESTIONNAIRE as Q } from './index.ts'
import { parseDossier, serializeDossier } from './serialization.ts'
import { age, answer, calendar, choices, configured, date, DECLINED, num, text } from './testing.ts'

describe('sauvegarde du dossier', () => {
  it('restitue exactement toutes les sortes de réponses', () => {
    let d = answer(Q, configured({ birth: calendar(1990, 5) }), 'identity.first_name', text('Léo'))
    d = answer(Q, d, 'family.siblings_count', num(2))
    d = answer(Q, d, 'family.household', choices('mother', 'grandparents'))
    d = answer(Q, d, 'school.primary_start', date(age(6, true)))
    d = answer(Q, d, 'identity.birth_story', DECLINED)
    expect(parseDossier(serializeDossier(d))).toEqual(d)
  })

  it('signale précisément un dossier corrompu', () => {
    const corrupt = (mutate: (raw: Record<string, unknown> & { answers: Record<string, { value: Record<string, unknown> }> }) => void) => {
      const raw = JSON.parse(serializeDossier(answer(Q, configured(), 'family.siblings_count', num(1))))
      mutate(raw)
      return () => parseDossier(JSON.stringify(raw))
    }
    expect(() => parseDossier('{')).toThrow(DossierError)
    expect(corrupt((r) => (r.version = 9))).toThrow(/version 9/)
    expect(corrupt((r) => (r.birth = { kind: 'calendar', year: 2001, month: 2, day: 30, approximate: false }))).toThrow(
      /30 février 2001 n’existe pas/,
    )
    expect(corrupt((r) => (r.answers['family.siblings_count'].value.kind = 'magic'))).toThrow(/kind inconnu \(magic\)/)
    expect(corrupt((r) => (r.startAge = 'vingt'))).toThrow(/startAge/)
  })
})
