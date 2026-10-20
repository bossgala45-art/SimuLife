import { describe, expect, it } from 'vitest'
import { dt, newLife } from '../engine/testing.ts'
import { applyDecision, decisionOptions, validateDecision } from './decisions.ts'
import { DestinyError } from './errors.ts'

describe('décisions alternatives', () => {
  it('donnent à chaque branche son propre hasard', () => {
    const s = newLife()
    const a = applyDecision(s, { kind: 'reroll' }, 'branche-a')
    const b = applyDecision(s, { kind: 'reroll' }, 'branche-b')
    expect(a.rngState).not.toBe(b.rngState)
    expect(applyDecision(s, { kind: 'reroll' }, 'branche-a')).toEqual(a)
    expect(a.log.at(-1)).toMatchObject({ code: 'divergence', message: 'Divergence : Mêmes choix, autre hasard.' })
  })

  it('n’altèrent jamais l’état d’origine', () => {
    const s = newLife()
    const snapshot = structuredClone(s)
    applyDecision(s, { kind: 'career', career: 'waiter' }, 'x')
    expect(s).toEqual(snapshot)
  })

  it('appliquent un choix de vie possible', () => {
    const s = newLife({ money: 5000 })
    expect(applyDecision(s, { kind: 'career', career: 'waiter' }, 'x').career.job!.career).toBe('waiter')
    expect(applyDecision(s, { kind: 'quit_job' }, 'x').career.job).toBeNull()
    const studying = applyDecision(s, { kind: 'study', program: 'titre_dev' }, 'x')
    expect(studying.education.enrollment!.program).toBe('titre_dev')
    expect(studying.character.money).toBe(1000)
    expect(studying.scheduled.some((e) => e.event.type === 'exam')).toBe(true)
    const near = applyDecision(s, { kind: 'move', near: true }, 'x')
    expect(near.people.filter((p) => p.role !== 'colleague').every((p) => !p.distant)).toBe(true)
    const mother = s.people.find((p) => p.relation === 'Mère')!
    const reconnected = applyDecision(s, { kind: 'reconnect', personId: mother.id }, 'x')
    expect(reconnected.relationships[mother.id].closeness).toBeGreaterThanOrEqual(60)
    expect(reconnected.relationships[mother.id].memories.at(-1)!.kind).toBe('reconnected')
  })

  it('refusent un choix impossible à ce moment, avec la raison', () => {
    const s = newLife({ start: dt(6, 10) })
    expect(validateDecision(s, { kind: 'career', career: 'cook' })).toBe('Poste inaccessible à ce moment : Diplôme requis : CAP Cuisine.')
    expect(validateDecision(s, { kind: 'career', career: 'cashier' })).toBe('Tu occupes déjà ce poste (Employé·e de caisse).')
    expect(validateDecision(s, { kind: 'study', program: 'titre_dev' })).toBe('Frais d’inscription (≈ 4000 €) hors de portée à ce moment.')
    expect(validateDecision(newLife({ career: null }), { kind: 'quit_job' })).toBe('Tu n’as pas d’emploi à quitter à ce moment.')
    expect(() => applyDecision(s, { kind: 'career', career: 'cook' }, 'x')).toThrow(DestinyError)
    const dead = newLife()
    dead.character.alive = false
    expect(validateDecision(dead, { kind: 'reroll' })).toMatch(/décédé/)
  })

  it('listent toutes les options, possibles ou non', () => {
    const options = decisionOptions(newLife())
    expect(options.find((o) => o.decision.kind === 'reroll')!.unavailable).toBeNull()
    expect(options.find((o) => o.decision.kind === 'career' && o.decision.career === 'cook')!.unavailable).toMatch(/CAP Cuisine/)
  })
})
