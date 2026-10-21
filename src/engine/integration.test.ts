/**
 * Tests d'intégration : les modules interagissent à travers l'horloge réelle
 * (advance / performAction), sans appeler les règles isolément.
 */
import { describe, expect, it } from 'vitest'
import { ACTIONS, validateAction } from './actions.ts'
import { INCIDENTS } from './incidents.ts'
import { NEED_IDS } from './needs.ts'
import { nextRandom } from './rng.ts'
import { scheduleEvent } from './schedule.ts'
import { parseState, serializeState } from './serialization.ts'
import { advance, performAction } from './simulation.ts'
import { careerEligibility } from './requirements.ts'
import { findCareer } from './data/careers.ts'
import { ageAt, MINUTES_PER_DAY } from './time.ts'
import { dt, newLife, ok } from './testing.ts'
import type { ActionId, SimulationState } from './types.ts'

function rngWhere(test: (value: number) => boolean): number {
  for (let s = 1; ; s++) if (test(nextRandom(s).value)) return s
}
const count = (s: SimulationState, code: string) => s.log.filter((e) => e.code === code).length
const mother = (s: SimulationState) => s.people.find((p) => p.relation === 'Mère')!

/** Vit sans aller travailler : dort, mange, se lave, attend. */
function liveWithoutWorking(state: SimulationState, days: number): SimulationState {
  let s = state
  const end = s.clock + days * MINUTES_PER_DAY
  while (s.clock < end) {
    const next = (['sleep', 'cook_meal', 'shower', 'wait'] as ActionId[]).find((id) => validateAction(s, id).ok)!
    s = ok(performAction(s, next))
  }
  return s
}

describe('interactions entre systèmes', () => {
  it('formation → diplôme → accès au métier → embauche → salaire', () => {
    // Inscription à la rentrée, puis la routine étudie le soir pendant un an.
    let s = ok(performAction(newLife({ start: dt(1, 10, 9), seed: 'cuisine' }), 'enroll', { program: 'cap_cuisine' }))
    s = ok(advance(s, 'month', 11))
    expect(s.education.enrollment!.studyHours).toBeGreaterThanOrEqual(300)
    s = ok(advance(s, 'month', 2))
    // L'examen a eu lieu exactement une fois.
    expect(count(s, 'diploma') + count(s, 'exam_failed')).toBe(1)
    const graduated = s.education.diplomas.some((d) => d.id === 'cap_cuisine')
    expect(careerEligibility(s, findCareer('cook')!).ok).toBe(graduated || s.skills.cooking >= 400)

    if (graduated) {
      // Réponse positive programmée : le poste et la paie suivent.
      scheduleEvent(s, s.clock + 60, { type: 'job_application_result', career: 'cook', probability: 1 })
      s = ok(advance(s, 'month'))
      expect(s.career.job!.career).toBe('cook')
      const salary = s.log.filter((e) => e.code === 'salary').at(-1)!
      expect(salary.data!.amount).toBe(Math.round((s.career.job!.salary * (salary.data!.days as number)) / 21))
    }
  })

  it('absences répétées → appréciation en baisse → risque de licenciement accru', () => {
    let s = newLife({ start: dt(6, 7) })
    s = liveWithoutWorking(s, 7)
    // Lundi est le jour d'embauche : mardi à vendredi comptent comme absences.
    expect(count(s, 'absence')).toBe(4)
    expect(s.career.job!.performance).toBe(28)
    expect(INCIDENTS.find((i) => i.id === 'layoff')!.probability(s)).toBe(0.01)
  })

  it('maladie → absences justifiées → moins de jours payés, sans sanction', () => {
    const healthy = ok(advance(newLife({ start: dt(6, 7), seed: 'grippe' }), 'week'))
    const base = newLife({ start: dt(6, 7), seed: 'grippe' })
    INCIDENTS.find((i) => i.id === 'illness')!.apply(base)
    const sick = ok(advance(base, 'week'))
    expect(count(sick, 'absence')).toBe(0)
    expect(sick.career.job!.daysWorked).toBeLessThan(healthy.career.job!.daysWorked)
    expect(sick.character.statuses).not.toContain('sick')
  })

  it('proche malade → la routine prend des nouvelles → souvenir de soutien à la guérison', () => {
    const s = newLife({ start: dt(6, 7) })
    mother(s).sickSince = s.clock
    scheduleEvent(s, s.clock + 5 * MINUTES_PER_DAY, { type: 'npc_recovered', personId: mother(s).id })
    const after = ok(advance(s, 'week'))
    expect(after.log.some((e) => e.code === 'call' && e.message.includes(mother(after).name))).toBe(true)
    expect(after.relationships[mother(after).id].memories.some((m) => m.kind === 'support')).toBe(true)
  })

  it('découvert → agios prélevés au relevé du mois suivant', () => {
    const s = ok(advance(newLife({ money: -250 }), 'month'))
    expect(count(s, 'overdraft_fees')).toBe(1)
  })

  it('sans argent → prêt d’un proche ou aide alimentaire : le personnage survit jusqu’à la paie', () => {
    for (const seed of ['fauché-1', 'fauché-2', 'fauché-3']) {
      const s = ok(advance(newLife({ seed, money: -295 }), 'month'))
      expect(s.character.alive, seed).toBe(true)
      expect(count(s, 'loan_granted') + count(s, 'loan_refused') + count(s, 'food_aid'), seed).toBeGreaterThan(0)
      expect(count(s, 'salary'), seed).toBe(1)
    }
  })

  it('prêt bancaire → mensualités prélevées chaque 10 du mois', () => {
    const s = newLife({ start: dt(6, 10) })
    s.career.job!.since -= 120 * MINUTES_PER_DAY
    s.rngState = rngWhere((v) => v < 0.85)
    let after = ok(performAction(s, 'bank_loan', { amount: 1000 }))
    expect(after.finances.debts).toHaveLength(1)
    after = ok(advance(after, 'month', 3))
    expect(count(after, 'debt_paid')).toBe(3)
    expect(after.finances.debts[0].remaining).toBeLessThan(1000)
  })

  it('l’âge et le temps font évoluer les proches sans le joueur', () => {
    const s = newLife({ start: dt(6, 7) })
    mother(s).birthDate = { year: 1961, month: 3, day: 1 }
    mother(s).occupation = 'accountant'
    const after = ok(advance(s, 'month', 3))
    expect(ageAt(mother(after).birthDate, after.clock)).toBe(64)
    expect(mother(after).occupation).toBe('retired')
    expect(after.log.some((e) => e.code === 'npc_retired')).toBe(true)
  })

  it('le diplôme rend les parents fiers (souvenir durable)', () => {
    let s = ok(performAction(newLife({ start: dt(1, 10, 9), seed: 'cuisine' }), 'enroll', { program: 'cap_cuisine' }))
    s.education.enrollment!.studyHours = 300
    s.character.attributes.intelligence = 100
    s.rngState = rngWhere((v) => v < 0.05)
    s.scheduled = s.scheduled.map((e) => (e.event.type === 'exam' ? { ...e, at: s.clock + 120 } : e))
    s = ok(advance(s, 'day'))
    expect(s.education.diplomas.map((d) => d.id)).toEqual(['cap_cuisine'])
    for (const parent of s.people.filter((p) => p.role === 'parent')) {
      expect(s.relationships[parent.id].memories.some((m) => m.kind === 'diploma')).toBe(true)
    }
  })
})

describe('règles transversales', () => {
  it('toute action dont l’issue dépend du hasard annonce ses probabilités', () => {
    const random: ActionId[] = ['work', 'sport', 'visit', 'ask_loan', 'apply_job', 'bank_loan']
    for (const id of random) expect(ACTIONS[id].outcomes, id).toBeDefined()
  })

  it('conserve les conséquences différées à travers une sauvegarde', () => {
    let s = newLife({ start: dt(1, 10, 9), career: null })
    s = ok(performAction(s, 'enroll', { program: 'cap_cuisine' }))
    s = ok(performAction(s, 'apply_job', { career: 'waiter' }))
    mother(s).sickSince = s.clock
    scheduleEvent(s, s.clock + 6 * MINUTES_PER_DAY, { type: 'npc_recovered', personId: mother(s).id })
    const pending = s.scheduled.map((e) => e.event.type)
    expect(pending).toEqual(expect.arrayContaining(['exam', 'job_application_result', 'npc_recovered', 'payday', 'bills_due']))

    const restored = parseState(serializeState(s))
    expect(restored).toEqual(s)
    expect(ok(advance(restored, 'month'))).toEqual(ok(advance(s, 'month')))
  })

  it('migre une sauvegarde de version 1 et continue la partie', () => {
    const v2 = newLife()
    const v1 = {
      version: 1,
      seed: v2.seed,
      rngState: v2.rngState,
      clock: v2.clock,
      character: { ...v2.character },
      scheduled: v2.scheduled.filter((e) => e.event.type === 'rent_due' || e.event.type === 'birthday'),
      nextEventId: v2.nextEventId,
      log: v2.log,
      nextLogSeq: v2.nextLogSeq,
    }
    const migrated = parseState(JSON.stringify(v1))
    expect(migrated.version).toBe(3)
    expect(migrated.career.job!.career).toBe('cashier')
    expect(migrated.people.length).toBeGreaterThan(0)
    expect(ok(advance(migrated, 'month')).character.alive).toBe(true)
  })

  it('reste cohérent sur deux ans de vie (trois graines)', () => {
    for (const seed of ['un', 'deux', 'trois']) {
      const s = ok(advance(newLife({ seed }), 'month', 24))
      expect(s.character.alive, seed).toBe(true)
      expect(Number.isSafeInteger(s.character.money)).toBe(true)
      for (const id of NEED_IDS) expect(s.character.needs[id]).toBeGreaterThanOrEqual(0)
      for (const p of s.people) {
        const r = s.relationships[p.id]
        expect(r, p.id).toBeDefined()
        for (const v of [r.closeness, r.trust, r.tension]) {
          expect(v).toBeGreaterThanOrEqual(0)
          expect(v).toBeLessThanOrEqual(100)
        }
      }
      // Chaque dette a exactement une échéance programmée.
      for (const d of s.finances.debts) {
        expect(s.scheduled.filter((e) => e.event.type === 'debt_payment' && e.event.debtId === d.id)).toHaveLength(1)
      }
      expect(s.scheduled.every((e) => e.at >= s.clock)).toBe(true)
      // Les échéances mensuelles sont toujours programmées.
      for (const type of ['payday', 'bills_due', 'rent_due', 'birthday']) {
        expect(s.scheduled.filter((e) => e.event.type === type), type).toHaveLength(1)
      }
    }
  })
})
