import { describe, expect, it } from 'vitest'
import { applyTimeToNeeds, isCritical, NEED_IDS } from './needs.ts'
import type { Attributes, Needs } from './types.ts'

const needs = (overrides: Partial<Needs> = {}): Needs => ({
  sleep: 20,
  hunger: 20,
  hygiene: 80,
  fatigue: 20,
  stress: 20,
  mood: 60,
  ...overrides,
})
const attributes = (): Attributes => ({ health: 90, fitness: 50, intelligence: 50, sociability: 50 })

describe('besoins', () => {
  it('évoluent avec le temps quand le personnage est éveillé', () => {
    const n = needs()
    applyTimeToNeeds(n, attributes(), 60, { sleeping: false, rates: {} })
    expect(n.sleep).toBe(24)
    expect(n.hunger).toBe(25)
    expect(n.hygiene).toBe(77.5)
    expect(n.fatigue).toBe(21.5)
    expect(n.stress).toBe(19)
  })

  it('se rétablissent pendant le sommeil', () => {
    const n = needs({ sleep: 80, fatigue: 60 })
    applyTimeToNeeds(n, attributes(), 120, { sleeping: true, rates: {} })
    expect(n.sleep).toBe(58)
    expect(n.fatigue).toBe(44)
  })

  it('ajoutent les variations propres à l’activité', () => {
    const n = needs()
    applyTimeToNeeds(n, attributes(), 60, { sleeping: false, rates: { stress: 3 } })
    expect(n.stress).toBe(22)
  })

  it('restent toujours entre 0 et 100', () => {
    const n = needs()
    applyTimeToNeeds(n, attributes(), 100 * 60, { sleeping: false, rates: {} })
    for (const id of NEED_IDS) {
      expect(n[id]).toBeGreaterThanOrEqual(0)
      expect(n[id]).toBeLessThanOrEqual(100)
    }
    expect(n.hunger).toBe(100)
    expect(n.hygiene).toBe(0)
  })

  it('font baisser la santé quand la faim est extrême', () => {
    const a = attributes()
    applyTimeToNeeds(needs({ hunger: 99 }), a, 60, { sleeping: false, rates: {} })
    expect(a.health).toBe(88.5)
  })

  it('distinguent le sens « bon » de chaque besoin', () => {
    expect(isCritical('hunger', 80)).toBe(true)
    expect(isCritical('hunger', 79)).toBe(false)
    expect(isCritical('hygiene', 20)).toBe(true)
    expect(isCritical('hygiene', 90)).toBe(false)
    expect(isCritical('mood', 10)).toBe(true)
  })
})
