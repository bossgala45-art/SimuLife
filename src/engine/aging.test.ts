import { describe, expect, it } from 'vitest'
import { oldAgeDeathChance } from './aging.ts'
import { validateAction } from './actions.ts'
import { checkInvariants } from './invariants.ts'
import { advance, createSimulation } from './simulation.ts'
import type { SimulationState } from './types.ts'

const life = (birthYear: number, month = 1): SimulationState =>
  createSimulation({ seed: 'age', name: 'Léa', birthDate: { year: birthYear, month, day: 20 }, start: { year: 2025, month: 1, day: 6, hour: 10, minute: 0 } })

describe('vieillissement du personnage', () => {
  it('part à la retraite à 64 ans : fin de l’emploi, pension versée (montant approximatif)', () => {
    const state = life(1961) // 64 ans le 20 janvier 2025
    expect(state.career.job).not.toBeNull()
    expect(state.career.pension).toBeNull()
    const r = advance(state, 'month')
    if (!r.ok) throw new Error()
    const s = r.state
    expect(s.career.job).toBeNull()
    expect(s.career.pension).toBeGreaterThanOrEqual(900)
    expect(s.log.some((e) => e.code === 'retired')).toBe(true)
    expect(s.log.some((e) => e.code === 'pension' && e.message.includes('approximatif'))).toBe(true)
    expect(s.narrative.memories.some((m) => m.kind === 'retired')).toBe(true)
    expect(validateAction(s, 'apply_job', { career: 'cashier' })).toMatchObject({ ok: false, issues: [{ code: 'RETIRED' }] })
    expect(checkInvariants(s, { roundTrip: true })).toEqual([])
  })

  it('une vie commencée après 64 ans est déjà à la retraite', () => {
    const s = life(1950)
    expect(s.career.job).toBeNull()
    expect(s.career.pension).not.toBeNull()
  })

  it('le risque de décès lié à l’âge n’existe qu’à partir de 75 ans et croît ensuite', () => {
    expect(oldAgeDeathChance(life(1980))).toBe(0)
    const at80 = oldAgeDeathChance(life(1944))
    const at90 = oldAgeDeathChance(life(1934))
    expect(at80).toBeGreaterThan(0)
    expect(at90).toBeGreaterThan(at80)
  })

  it('une sauvegarde v3 antérieure (sans pension) se charge : pas encore à la retraite', async () => {
    const { parseState, serializeState } = await import('./serialization.ts')
    const raw = JSON.parse(serializeState(life(1990)))
    delete raw.career.pension
    expect(parseState(JSON.stringify(raw)).career.pension).toBeNull()
  })
})
