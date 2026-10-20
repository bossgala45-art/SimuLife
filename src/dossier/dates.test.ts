import { describe, expect, it } from 'vitest'
import { addYears, ageRange, formatFuzzyDate, fromDay, toDay, toInterval, validateFuzzyDate } from './dates.ts'
import { age, calendar } from './testing.ts'
import type { DayInterval } from './types.ts'

const day = (year: number, month: number, d: number) => toDay({ year, month, day: d })
const span = (i: DayInterval | null) => i && [fromDay(i.start), fromDay(i.end)]

describe('dates exactes ou approximatives', () => {
  it('refusent les dates impossibles avec un message clair', () => {
    expect(validateFuzzyDate(calendar(2023, 2, 29))).toBe('Le 29 février 2023 n’existe pas.')
    expect(validateFuzzyDate(calendar(2024, 2, 29))).toBeNull()
    expect(validateFuzzyDate({ kind: 'calendar', year: 2020, day: 3, approximate: false })).toMatch(/jour sans mois/)
    expect(validateFuzzyDate(calendar(1850))).toMatch(/entre 1900 et 2100/)
    expect(validateFuzzyDate(calendar(2020, 13))).toMatch(/mois/)
    expect(validateFuzzyDate(age(-1))).toMatch(/âge/)
    expect(validateFuzzyDate(age(2.5))).toMatch(/entier/)
  })

  it('convertissent une année, un mois ou un jour en intervalle', () => {
    expect(toInterval(calendar(2007), null)).toEqual({ start: day(2007, 1, 1), end: day(2007, 12, 31) })
    expect(toInterval(calendar(2008, 2), null)).toEqual({ start: day(2008, 2, 1), end: day(2008, 2, 29) })
    expect(toInterval(calendar(2007, 3, 15), null)).toEqual({ start: day(2007, 3, 15), end: day(2007, 3, 15) })
  })

  it('élargissent l’intervalle quand la date est approximative', () => {
    expect(span(toInterval(calendar(2007, undefined, undefined, true), null))).toEqual([
      { year: 2006, month: 1, day: 1 },
      { year: 2008, month: 12, day: 31 },
    ])
    expect(span(toInterval(calendar(2010, 1, undefined, true), null))).toEqual([
      { year: 2009, month: 10, day: 1 },
      { year: 2010, month: 4, day: 30 },
    ])
    expect(toInterval(calendar(2007, 3, 15, true), null)).toEqual({ start: day(2007, 2, 28), end: day(2007, 3, 30) })
  })

  it('placent un âge grâce à la date de naissance', () => {
    const exactBirth = toInterval(calendar(2000, 3, 15), null)
    expect(span(toInterval(age(7), exactBirth))).toEqual([
      { year: 2007, month: 3, day: 15 },
      { year: 2008, month: 3, day: 14 },
    ])
    expect(span(toInterval(age(7, true), exactBirth))).toEqual([
      { year: 2006, month: 3, day: 15 },
      { year: 2009, month: 3, day: 14 },
    ])
    // Naissance connue à l'année près : l'intervalle s'élargit d'autant.
    expect(span(toInterval(age(7), toInterval(calendar(2000), null)))).toEqual([
      { year: 2007, month: 1, day: 1 },
      { year: 2008, month: 12, day: 30 },
    ])
    expect(toInterval(age(7), null)).toBeNull()
  })

  it('calcule les âges possibles d’un événement', () => {
    const birth = toInterval(calendar(2000, 3, 15), null)!
    expect(ageRange(toInterval(calendar(2007), null)!, birth)).toEqual([6, 7])
    expect(ageRange(toInterval(calendar(2007, 6, 1), null)!, birth)).toEqual([7, 7])
  })

  it('gère le 29 février', () => {
    expect(addYears({ year: 2000, month: 2, day: 29 }, 1)).toEqual({ year: 2001, month: 2, day: 28 })
    expect(addYears({ year: 2000, month: 2, day: 29 }, 4)).toEqual({ year: 2004, month: 2, day: 29 })
  })

  it('s’affichent en français', () => {
    expect(formatFuzzyDate(calendar(2007, 3, 15))).toBe('15 mars 2007')
    expect(formatFuzzyDate(calendar(2007, 3, 1))).toBe('1er mars 2007')
    expect(formatFuzzyDate(calendar(2007, 8))).toBe('août 2007')
    expect(formatFuzzyDate(calendar(2007, undefined, undefined, true))).toBe('environ 2007')
    expect(formatFuzzyDate(age(7, true))).toBe('vers 7 ans')
    expect(formatFuzzyDate(age(1))).toBe('à 1 an')
  })
})
