import { describe, expect, it } from 'vitest'
import { HISTORICAL_EVENTS, type HistoricalEvent } from './data/history.ts'
import { createHistoryBase, extendHistory, HISTORY, historyCoverageEnd, livedEvents, validateHistory } from './history.ts'
import { createSimulation } from './simulation.ts'

const sample: HistoricalEvent = {
  id: 'exemple',
  date: { year: 2010, month: 6, day: 1 },
  title: 'Exemple',
  category: 'société',
  scope: 'France',
  source: { label: 'Source', url: 'https://exemple.org', quote: 'citation' },
  checkedOn: '2026-10-21',
}

describe('repères historiques', () => {
  it('la base fournie est valide : chaque événement est daté, sourcé et vérifié', () => {
    expect(validateHistory(HISTORICAL_EVENTS)).toEqual([])
    for (const e of HISTORY.events) {
      expect(e.source.url.startsWith('https://')).toBe(true)
      expect(e.source.quote.length).toBeGreaterThan(10)
    }
  })

  it('refuse un événement non sourcé, mal daté ou en double', () => {
    expect(validateHistory([{ ...sample, source: { label: '', url: 'https://x.org', quote: '' } }])).toHaveLength(1)
    expect(validateHistory([{ ...sample, source: { ...sample.source, url: 'http://x.org' } }])[0]).toMatch(/https/)
    expect(validateHistory([{ ...sample, date: { year: 2010, month: 2, day: 30 } }])[0]).toMatch(/date invalide/)
    expect(validateHistory([{ ...sample, end: { year: 2009, month: 1, day: 1 } }])[0]).toMatch(/fin invalide/)
    expect(validateHistory([sample, sample])[0]).toMatch(/double/)
    expect(() => createHistoryBase([{ ...sample, checkedOn: '' }])).toThrow(/vérification/)
  })

  it('est extensible et reste triée par date', () => {
    const base = extendHistory(HISTORY, [sample])
    expect(base.events).toHaveLength(HISTORY.events.length + 1)
    const years = base.events.map((e) => e.date.year)
    expect(years).toEqual([...years].sort((a, b) => a - b))
  })

  it('événements vécus, avec l’âge du personnage ; rien après la fin de la base', () => {
    const state = createSimulation({ seed: 'histoire', name: 'Léa', birthDate: { year: 2000, month: 3, day: 15 } })
    const lived = livedEvents(state)
    expect(lived[0]).toMatchObject({ event: { id: '11-septembre' }, age: 1 })
    expect(lived.at(-1)).toMatchObject({ event: { id: 'jo-paris-2024' }, age: 24 })
    expect(lived.some((l) => l.event.id === 'mondial-1998')).toBe(false)
    expect(historyCoverageEnd()).toEqual({ year: 2024, month: 8, day: 11 })
  })
})
