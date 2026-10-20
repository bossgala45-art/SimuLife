import { describe, expect, it } from 'vitest'
import { hashSeed, nextRandom } from './rng.ts'

function sequence(state: number, count: number): { values: number[]; state: number } {
  const values: number[] = []
  for (let i = 0; i < count; i++) {
    const r = nextRandom(state)
    values.push(r.value)
    state = r.state
  }
  return { values, state }
}

describe('générateur pseudo-aléatoire', () => {
  it('transforme une graine texte en entier 32 bits stable', () => {
    expect(hashSeed('simulife')).toBe(hashSeed('simulife'))
    expect(hashSeed('simulife')).not.toBe(hashSeed('simulife2'))
    const h = hashSeed('é🙂')
    expect(Number.isInteger(h) && h >= 0 && h <= 0xffffffff).toBe(true)
  })

  it('produit la même suite pour la même graine', () => {
    const a = sequence(hashSeed('graine'), 50)
    const b = sequence(hashSeed('graine'), 50)
    expect(a).toEqual(b)
    expect(sequence(hashSeed('autre'), 50).values).not.toEqual(a.values)
  })

  it('reprend exactement la suite à partir d’un état enregistré', () => {
    const full = sequence(hashSeed('reprise'), 20).values
    const firstHalf = sequence(hashSeed('reprise'), 10)
    const saved = JSON.parse(JSON.stringify(firstHalf.state)) as number
    expect([...firstHalf.values, ...sequence(saved, 10).values]).toEqual(full)
  })

  it('reste dans [0, 1) avec une moyenne proche de 0,5', () => {
    const { values } = sequence(hashSeed('distribution'), 10_000)
    expect(values.every((v) => v >= 0 && v < 1)).toBe(true)
    const mean = values.reduce((s, v) => s + v, 0) / values.length
    expect(mean).toBeGreaterThan(0.48)
    expect(mean).toBeLessThan(0.52)
  })
})
