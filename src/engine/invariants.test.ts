import { describe, expect, it } from 'vitest'
import { checkInvariants } from './invariants.ts'
import { createSimulation, performAction } from './simulation.ts'
import type { SimulationState } from './types.ts'

const life = () =>
  createSimulation({ seed: 'invariants', name: 'Léa', birthDate: { year: 2000, month: 3, day: 15 }, start: { year: 2025, month: 1, day: 6, hour: 10, minute: 0 } })

const broken = (mutate: (s: SimulationState) => void) => {
  const s = structuredClone(life())
  mutate(s)
  return checkInvariants(s)
}

describe('vérificateur d’invariants', () => {
  it('un état neuf est sain, sauvegarde comprise', () => {
    expect(checkInvariants(life(), { roundTrip: true })).toEqual([])
  })

  it('détecte réellement les anomalies (sinon un audit vert ne prouverait rien)', () => {
    expect(broken((s) => s.scheduled.push({ ...s.scheduled[0], id: s.nextEventId++ }))[0]).toMatch(/au lieu d'une|mal triée/)
    expect(broken((s) => (s.scheduled[0].at = s.clock - 1))).toContain(`événement ${life().scheduled[0].event.type} échu non traité (${life().clock - 1} ≤ ${life().clock})`)
    expect(broken((s) => (s.character.needs.hunger = 140))).toContain('besoin hunger hors bornes : 140')
    expect(broken((s) => (s.character.money = 10.5))).toContain('argent non entier : 10.5')
    expect(broken((s) => s.character.statuses.push('sick'))).toContain('maladie et guérison programmée incohérentes')
    expect(broken((s) => delete s.relationships[s.people[0].id])).toContain(`${life().people[0].name} sans relation`)
    expect(broken((s) => (s.relationships[s.people[0].id].tension = -3))[0]).toMatch(/tension hors bornes/)
  })

  it('dette et remboursements programmés restent liés', () => {
    const r = performAction(life(), 'bank_loan', { amount: 1000 })
    if (!r.ok) throw new Error(r.issues[0].message)
    expect(checkInvariants(r.state)).toEqual([])
    const s = structuredClone(r.state)
    s.scheduled = s.scheduled.filter((e) => e.event.type !== 'debt_payment')
    expect(checkInvariants(s).some((i) => i.includes('échéance(s) de remboursement'))).toBe(true)
  })
})
