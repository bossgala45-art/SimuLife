import { describe, expect, it } from 'vitest'
import { SimulationError } from './errors.ts'
import {
  addDuration,
  ageAt,
  formatDateTime,
  fromCalendar,
  MINUTES_PER_DAY,
  MINUTES_PER_WEEK,
  nextAnniversary,
  nextMonthlyOccurrence,
  toCalendar,
} from './time.ts'

const at = (year: number, month: number, day: number, hour = 0, minute = 0) => fromCalendar({ year, month, day, hour, minute })

describe('horloge', () => {
  it('convertit dans les deux sens et connaît le jour de la semaine', () => {
    const t = at(2025, 1, 6, 7, 30)
    expect(toCalendar(t)).toEqual({ year: 2025, month: 1, day: 6, hour: 7, minute: 30, weekday: 0 })
    expect(toCalendar(at(2025, 1, 12)).weekday).toBe(6) // dimanche
    expect(formatDateTime(t)).toBe('lundi 6 janvier 2025, 07:30')
  })

  it('avance d’un jour et d’une semaine en minutes exactes', () => {
    const t = at(2025, 3, 29, 7)
    expect(addDuration(t, 'day', 1) - t).toBe(MINUTES_PER_DAY)
    expect(addDuration(t, 'week', 2) - t).toBe(2 * MINUTES_PER_WEEK)
    // Pas de fuseau : aucun saut d'heure d'été fin mars.
    expect(toCalendar(addDuration(t, 'day', 1)).hour).toBe(7)
  })

  it('avance d’un mois calendaire en bornant le jour', () => {
    expect(toCalendar(addDuration(at(2025, 1, 31, 7), 'month', 1))).toMatchObject({ year: 2025, month: 2, day: 28, hour: 7 })
    expect(toCalendar(addDuration(at(2024, 1, 31), 'month', 1))).toMatchObject({ month: 2, day: 29 })
    expect(toCalendar(addDuration(at(2025, 12, 15), 'month', 1))).toMatchObject({ year: 2026, month: 1, day: 15 })
    expect(toCalendar(addDuration(at(2025, 1, 15), 'month', 14))).toMatchObject({ year: 2026, month: 3, day: 15 })
  })

  it('refuse les dates et durées invalides avec une erreur explicite', () => {
    expect(() => fromCalendar({ year: 2025, month: 2, day: 30, hour: 0, minute: 0 })).toThrow(SimulationError)
    expect(() => fromCalendar({ year: 2025, month: 1, day: 1, hour: 24, minute: 0 })).toThrow(/Date invalide/)
    expect(() => addDuration(0, 'day', 0)).toThrow(/Durée invalide/)
    expect(() => addDuration(0, 'day', 1.5)).toThrow(/Durée invalide/)
    expect(() => toCalendar(1.5)).toThrow(/Horloge invalide/)
  })

  it('calcule l’âge à la date près', () => {
    const birth = { year: 2000, month: 3, day: 15 }
    expect(ageAt(birth, at(2025, 3, 14, 23, 59))).toBe(24)
    expect(ageAt(birth, at(2025, 3, 15))).toBe(25)
    // Né un 29 février : un an de plus le 28 février des années non bissextiles.
    const leap = { year: 2000, month: 2, day: 29 }
    expect(ageAt(leap, at(2021, 2, 27))).toBe(20)
    expect(ageAt(leap, at(2021, 2, 28))).toBe(21)
    expect(ageAt(leap, at(2024, 2, 28))).toBe(23)
    expect(ageAt(leap, at(2024, 2, 29))).toBe(24)
  })

  it('trouve la prochaine échéance strictement après une date', () => {
    expect(nextMonthlyOccurrence(at(2025, 1, 6), 1, 8)).toBe(at(2025, 2, 1, 8))
    expect(nextMonthlyOccurrence(at(2025, 2, 1, 8), 1, 8)).toBe(at(2025, 3, 1, 8))
    expect(nextAnniversary(at(2025, 1, 6), { year: 2000, month: 3, day: 15 }, 9)).toBe(at(2025, 3, 15, 9))
    expect(nextAnniversary(at(2025, 1, 6), { year: 2000, month: 2, day: 29 }, 9)).toBe(at(2025, 2, 28, 9))
  })
})
