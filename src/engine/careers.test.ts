import { describe, expect, it } from 'vitest'
import { actionOutcomes, validateAction } from './actions.ts'
import { checkAbsence, hireProbability, layOff } from './careers.ts'
import { CAREERS, findCareer } from './data/careers.ts'
import { careerEligibility } from './requirements.ts'
import { performAction } from './simulation.ts'
import { MINUTES_PER_DAY } from './time.ts'
import { dt, newLife, ok, withEvent } from './testing.ts'

const issues = (r: ReturnType<typeof validateAction>) => (r.ok ? [] : r.issues)

describe('catalogue des métiers', () => {
  it('est extensible et cohérent : identifiants uniques, salaires approximatifs et ordonnés', () => {
    expect(new Set(CAREERS.map((c) => c.id)).size).toBe(CAREERS.length)
    for (const c of CAREERS) {
      expect(c.salary.approximate).toBe(true)
      expect(c.salary.min).toBeLessThanOrEqual(c.salary.max)
      expect(c.minAge).toBeGreaterThanOrEqual(16)
    }
  })

  it('explique précisément les conditions d’accès manquantes', () => {
    const s = newLife()
    expect(careerEligibility(s, findCareer('cook')!)).toEqual({ ok: false, reasons: ['Diplôme requis : CAP Cuisine'] })
    expect(careerEligibility(newLife({ skills: { cooking: 4 } }), findCareer('cook')!).ok).toBe(true)
    expect(careerEligibility(newLife({ diplomas: ['cap_cuisine'] }), findCareer('cook')!).ok).toBe(true)
    expect(careerEligibility(s, findCareer('teacher')!).reasons).toEqual([
      'Niveau d’études requis : master (bac +5) ou plus',
      'Communication : niveau 3 requis (actuel 0)',
    ])
    const young = newLife({ start: dt(6, 10, 1, 2019) }) // 18 ans
    expect(careerEligibility(young, findCareer('nurse')!).reasons).toContain('Âge minimal : 20 ans')
  })
})

describe('candidatures', () => {
  it('annonce la probabilité et ne tire le résultat qu’à la réponse', () => {
    const s = newLife({ start: dt(6, 10), career: null })
    const p = hireProbability(s, 'waiter')
    expect(actionOutcomes(s, 'apply_job', { career: 'waiter' })).toEqual([{ label: 'Embauche', probability: p }])
    const after = ok(performAction(s, 'apply_job', { career: 'waiter' }))
    const pending = after.scheduled.find((e) => e.event.type === 'job_application_result')!
    expect(pending.event).toEqual({ type: 'job_application_result', career: 'waiter', probability: p })
    const days = (pending.at - after.clock) / MINUTES_PER_DAY
    expect(days).toBeGreaterThanOrEqual(3)
    expect(days).toBeLessThanOrEqual(10)
    expect(after.log.at(-1)!.message).toMatch(/réponse attendue sous 3 à 10 jours, chance estimée ≈ \d+ %/)
    expect(after.career.job).toBeNull()
    expect(issues(validateAction(after, 'apply_job', { career: 'waiter' }))[0].code).toBe('ALREADY_APPLIED')
  })

  it('refuse une candidature hors horaires ou sans les conditions requises', () => {
    expect(issues(validateAction(newLife({ start: dt(11, 10) }), 'apply_job', { career: 'waiter' }))[0].code).toBe('CLOSED')
    expect(issues(validateAction(newLife({ start: dt(6, 10) }), 'apply_job', { career: 'cook' }))).toEqual([
      { code: 'REQUIREMENTS_NOT_MET', message: 'Diplôme requis : CAP Cuisine' },
    ])
  })

  it('embauche, refuse, ou décline une offre moins bien payée', () => {
    const unemployed = newLife({ career: null })
    const hired = withEvent(unemployed, { type: 'job_application_result', career: 'waiter', probability: 1 })
    expect(hired.career.job).toMatchObject({ career: 'waiter', daysWorked: 0, performance: 60 })
    expect(hired.people.filter((p) => p.role === 'colleague' && p.occupation === 'waiter')).toHaveLength(2)

    const refused = withEvent(unemployed, { type: 'job_application_result', career: 'waiter', probability: 0 })
    expect(refused.career.job).toBeNull()

    const employed = newLife({ career: 'waiter' })
    const declined = withEvent(employed, { type: 'job_application_result', career: 'cashier', probability: 1 })
    expect(declined.career.job!.career).toBe('waiter')
    expect(declined.log.at(-1)!.code).toBe('offer_declined')
  })
})

describe('travail et paie', () => {
  it('ne permet de travailler qu’avec un emploi et en bonne santé', () => {
    expect(issues(validateAction(newLife({ start: dt(6, 8), career: null }), 'work'))[0].code).toBe('NO_JOB')
    const sick = newLife({ start: dt(6, 8) })
    sick.character.statuses.push('sick')
    expect(issues(validateAction(sick, 'work'))[0].code).toBe('SICK')
  })

  it('verse le salaire du mois au prorata des jours travaillés', () => {
    const s = newLife()
    s.career.job!.daysWorked = 10
    const salary = s.career.job!.salary
    const after = withEvent(s, { type: 'payday' })
    expect(after.character.money).toBe(1000 + Math.round((salary * 10) / 21))
    expect(after.career.job!.daysWorked).toBe(0)
    expect(after.finances.ledger.at(-1)).toMatchObject({ label: 'Salaire' })
  })

  it('une absence non justifiée fait baisser l’appréciation, pas une maladie', () => {
    const base = newLife({ start: dt(7, 0) }) // mardi minuit : lundi non travaillé
    base.career.job!.since -= 3 * MINUTES_PER_DAY
    const absent = structuredClone(base)
    checkAbsence(absent)
    expect(absent.career.job!.performance).toBe(52)
    const sick = structuredClone(base)
    sick.character.statuses.push('sick')
    checkAbsence(sick)
    expect(sick.career.job!.performance).toBe(60)
  })

  it('après un licenciement, verse une allocation chômage approximative', () => {
    const s = newLife()
    s.career.job!.since -= 150 * MINUTES_PER_DAY
    const salary = s.career.job!.salary
    layOff(s)
    expect(s.career.job).toBeNull()
    expect(s.career.benefit).toEqual({ amount: Math.round(salary * 0.57), remaining: 6 })
    const after = withEvent(s, { type: 'payday' })
    expect(after.character.money).toBe(1000 + Math.round(salary * 0.57))
    expect(after.career.benefit!.remaining).toBe(5)
  })
})

describe('relevé mensuel', () => {
  it('compte le salaire du 1er dans le nouveau mois', () => {
    const s = newLife()
    s.career.job!.daysWorked = 21
    s.finances.month = { income: 0, expenses: 400 }
    const after = withEvent(s, { type: 'payday' })
    expect(after.finances.lastMonth).toEqual({ income: 0, expenses: 400 })
    expect(after.finances.month.income).toBe(s.career.job!.salary)
  })
})
