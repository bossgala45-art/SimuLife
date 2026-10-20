import { describe, expect, it } from 'vitest'
import { createSimulation } from '../engine/index.ts'
import { clearGame, loadGame, saveGame } from './savegame.ts'

function memoryStorage(): Storage {
  const data = new Map<string, string>()
  return {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, v),
  }
}

const state = () => createSimulation({ seed: 's', name: 'Léa', birthDate: { year: 2000, month: 3, day: 15 } })

describe('sauvegarde locale', () => {
  it('enregistre, relit et efface une partie', () => {
    const storage = memoryStorage()
    expect(loadGame(storage)).toEqual({ status: 'empty' })
    expect(saveGame(state(), storage)).toBeNull()
    expect(loadGame(storage)).toEqual({ status: 'loaded', state: state() })
    clearGame(storage)
    expect(loadGame(storage)).toEqual({ status: 'empty' })
  })

  it('signale une sauvegarde corrompue sans planter', () => {
    const storage = memoryStorage()
    storage.setItem('simulife.save.v1', '{"version":1}')
    const r = loadGame(storage)
    expect(r.status).toBe('error')
  })

  it('signale un stockage plein', () => {
    const storage = memoryStorage()
    storage.setItem = () => {
      throw new Error('QuotaExceededError')
    }
    expect(saveGame(state(), storage)).toMatch(/Sauvegarde impossible/)
  })
})
