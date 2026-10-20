import { describe, expect, it } from 'vitest'
import { SimulationError } from './errors.ts'
import { parseState, serializeState } from './serialization.ts'
import { newLife } from './testing.ts'

describe('sauvegarde', () => {
  it('restitue exactement l’état, graine et générateur compris', () => {
    const s = newLife({ seed: 'sauvegarde' })
    expect(parseState(serializeState(s))).toEqual(s)
  })

  it('signale précisément une sauvegarde corrompue', () => {
    // Le test corrompt volontairement la structure : un typage strict l'empêcherait.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const corrupt = (mutate: (raw: Record<string, any>) => void) => {
      const raw = JSON.parse(serializeState(newLife()))
      mutate(raw)
      return () => parseState(JSON.stringify(raw))
    }
    expect(() => parseState('pas du json')).toThrow(/pas du JSON valide/)
    expect(corrupt((r) => (r.version = 3))).toThrow(/version 3 non prise en charge/)
    expect(corrupt((r) => (r.character.needs.hunger = 150))).toThrow(/character\.needs\.hunger/)
    expect(corrupt((r) => (r.clock = 1.5))).toThrow(/clock doit être un entier/)
    expect(corrupt((r) => (r.scheduled[0].event.type = 'meteorite'))).toThrow(/type inconnu \(meteorite\)/)
    expect(corrupt((r) => delete r.character.alive)).toThrow(SimulationError)
  })
})
