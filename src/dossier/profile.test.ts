import { describe, expect, it } from 'vitest'
import { createSimulation } from '../engine/simulation.ts'
import { ageAt } from '../engine/time.ts'
import { QUESTIONNAIRE as Q } from './index.ts'
import { buildProfile, type LifeProfile } from './profile.ts'
import { answer, calendar, choice, choices, configured, DECLINED, num, text, UNKNOWN } from './testing.ts'

const fact = (p: LifeProfile | null, key: string) => p!.facts.find((f) => f.key === key)!

describe('faits déclarés et hypothèses simulées', () => {
  it('reprend tels quels les faits déclarés', () => {
    let d = answer(Q, configured(), 'identity.first_name', text('Inès'))
    d = answer(Q, d, 'family.siblings_count', num(2))
    d = answer(Q, d, 'relationships.social_ease', choice('hard'))
    const p = buildProfile(Q, d)!
    expect(p.name).toBe('Inès')
    expect(fact(p, 'name')).toMatchObject({ origin: 'declared', display: 'Inès' })
    expect(fact(p, 'siblings')).toMatchObject({ origin: 'declared', display: '2' })
    expect(p.attributes.sociability).toBe(30)
    expect(fact(p, 'sociability')).toMatchObject({ origin: 'declared', display: '30/100' })
    expect(fact(p, 'birthDate')).toMatchObject({ origin: 'declared', display: '15 mars 2000' })
    expect(p.startDate).toEqual({ year: 2025, month: 3, day: 15 })
  })

  it('complète les manques par des hypothèses marquées et justifiées', () => {
    let d = answer(Q, configured({ birth: calendar(1995) }), 'identity.first_name', UNKNOWN)
    d = answer(Q, d, 'family.siblings_count', DECLINED)
    const p = buildProfile(Q, d)!
    expect(fact(p, 'name')).toMatchObject({ origin: 'simulated', reason: 'unknown' })
    expect(fact(p, 'siblings')).toMatchObject({ origin: 'simulated', reason: 'declined' })
    expect(fact(p, 'birthPlace')).toMatchObject({ origin: 'simulated', reason: 'unanswered' })
    expect(fact(p, 'birthDate')).toMatchObject({ origin: 'simulated', reason: 'approximate' })
    expect(fact(p, 'intelligence')).toMatchObject({ origin: 'simulated', reason: 'not_asked' })
    // La date simulée reste dans l'intervalle déclaré.
    expect(p.birthDate.year).toBe(1995)
  })

  it('ne remplace jamais un fait déclaré, quelle que soit la graine', () => {
    for (const seed of ['a', 'b', 'c', 'd', 'e']) {
      const d = answer(Q, configured({ seed }), 'health.general', choice('fragile'))
      const p = buildProfile(Q, d)!
      expect(p.attributes.health).toBe(68)
      expect(fact(p, 'health').origin).toBe('declared')
    }
  })

  it('produit des hypothèses reproductibles et indépendantes les unes des autres', () => {
    const p1 = buildProfile(Q, configured({ seed: 'graine' }))!
    expect(buildProfile(Q, configured({ seed: 'graine' }))).toEqual(p1)
    expect(buildProfile(Q, configured({ seed: 'autre' }))!.facts).not.toEqual(p1.facts)
    // Déclarer la fratrie ne change pas le prénom ni les caractéristiques simulées.
    const p2 = buildProfile(Q, answer(Q, configured({ seed: 'graine' }), 'family.siblings_count', num(4)))!
    expect(p2.name).toBe(p1.name)
    expect(p2.attributes).toEqual(p1.attributes)
  })

  it('transmet à la simulation l’entourage, les diplômes, la situation et les compétences déclarés', () => {
    let d = configured({ birth: calendar(1995, 6, 1), startAge: 28 })
    d = answer(Q, d, 'family.household', choices('mother', 'grandparents'))
    d = answer(Q, d, 'family.siblings_count', num(2))
    d = answer(Q, d, 'family.atmosphere', choice('tense'))
    d = answer(Q, d, 'relationships.group_size', choice('large'))
    d = answer(Q, d, 'school.highest_level', choice('bac5'))
    d = answer(Q, d, 'leisure.hobbies', choices('cooking', 'drawing'))
    d = answer(Q, d, 'economy.situation', choice('searching'))
    const p = buildProfile(Q, d)!
    expect(p.setup).toEqual({
      entourage: { parents: ['mother'], siblings: 2, familyCloseness: 35, familyTension: 45, friends: 4 },
      career: null,
      diplomas: ['bac', 'licence', 'master'],
      skills: { cooking: 2, creativity: 2 },
    })
    for (const key of ['parents', 'familyClimate', 'friends', 'diplomas', 'situation', 'skills']) {
      expect(fact(p, key).origin, key).toBe('declared')
    }

    const sim = createSimulation({ seed: d.seed, name: p.name, birthDate: p.birthDate, start: { ...p.startDate, hour: 7, minute: 0 }, ...p.setup })
    expect(sim.people.filter((x) => x.role === 'parent').map((x) => x.relation)).toEqual(['Mère'])
    expect(sim.people.filter((x) => x.role === 'sibling')).toHaveLength(2)
    expect(sim.people.filter((x) => x.role === 'friend')).toHaveLength(4)
    expect(sim.relationships[sim.people[0].id]).toMatchObject({ closeness: 35, tension: 45 })
    expect(sim.education.diplomas.map((x) => x.id)).toEqual(['bac', 'licence', 'master'])
    expect(sim.career.job).toBeNull()
  })

  it('sans réponse, l’entourage et l’emploi restent des hypothèses marquées', () => {
    const p = buildProfile(Q, configured())!
    expect(p.setup).toEqual({ entourage: {}, career: 'auto', diplomas: [], skills: {} })
    for (const key of ['parents', 'familyClimate', 'friends', 'diplomas', 'situation', 'skills']) {
      expect(fact(p, key)).toMatchObject({ origin: 'simulated', reason: 'unanswered' })
    }
    const sim = createSimulation({ seed: 'x', name: p.name, birthDate: p.birthDate, start: { ...p.startDate, hour: 7, minute: 0 }, ...p.setup })
    expect(sim.career.job).not.toBeNull()
  })

  it('permet de démarrer la simulation à l’âge choisi', () => {
    const d = answer(Q, configured({ birth: calendar(2000, 2, 29), startAge: 21 }), 'health.activity_level', choice('very_active'))
    const p = buildProfile(Q, d)!
    expect(p.startDate).toEqual({ year: 2021, month: 2, day: 28 })
    const sim = createSimulation({
      seed: d.seed,
      name: p.name,
      birthDate: p.birthDate,
      start: { ...p.startDate, hour: 7, minute: 0 },
      attributes: p.attributes,
    })
    expect(ageAt(sim.character.birthDate, sim.clock)).toBe(21)
    expect(sim.character.attributes).toEqual(p.attributes)
    expect(sim.character.attributes.fitness).toBe(70)
  })
})
