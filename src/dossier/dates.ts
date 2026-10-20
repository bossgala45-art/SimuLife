/**
 * Dates exactes ou approximatives.
 *
 * Toute date déclarée est convertie en intervalle de jours possibles :
 * « 2007 » = du 1er janvier au 31 décembre 2007 ; « vers 7 ans » dépend de la
 * date de naissance. Les contrôles de cohérence comparent ces intervalles :
 * deux dates floues qui se chevauchent ne sont jamais déclarées incohérentes.
 */
import { daysInMonth, isValidDate } from '../engine/time.ts'
import type { CalendarDate } from '../engine/types.ts'
import type { DayInterval, DayNumber, FuzzyDate } from './types.ts'

export const MIN_YEAR = 1900
export const MAX_YEAR = 2100
export const MAX_AGE = 120

const MONTHS = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
]

export function monthName(month: number): string {
  return MONTHS[month - 1]
}

export function toDay({ year, month, day }: CalendarDate): DayNumber {
  return Date.UTC(year, month - 1, day) / 86_400_000
}

export function fromDay(day: DayNumber): CalendarDate {
  const d = new Date(day * 86_400_000)
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() }
}

/** Ajoute des années ; un 29 février devient 28 février les années non bissextiles. */
export function addYears(date: CalendarDate, years: number): CalendarDate {
  const year = date.year + years
  return { year, month: date.month, day: Math.min(date.day, daysInMonth(year, date.month)) }
}

function addMonthsClamped(year: number, month: number, delta: number): { year: number; month: number } {
  const total = year * 12 + (month - 1) + delta
  return { year: Math.floor(total / 12), month: (((total % 12) + 12) % 12) + 1 }
}

/** Âge révolu à une date (même convention que le moteur pour le 29 février). */
export function ageOn(birth: CalendarDate, on: CalendarDate): number {
  const birthday = Math.min(birth.day, daysInMonth(on.year, birth.month))
  let age = on.year - birth.year
  if (on.month < birth.month || (on.month === birth.month && on.day < birthday)) age--
  return age
}

/** Message d'erreur si la date est mal formée, sinon `null`. */
export function validateFuzzyDate(date: FuzzyDate): string | null {
  if (date.kind === 'age') {
    if (!Number.isInteger(date.age) || date.age < 0 || date.age > MAX_AGE) {
      return `L’âge doit être un nombre entier entre 0 et ${MAX_AGE}.`
    }
    return null
  }
  if (!Number.isInteger(date.year) || date.year < MIN_YEAR || date.year > MAX_YEAR) {
    return `L’année doit être comprise entre ${MIN_YEAR} et ${MAX_YEAR}.`
  }
  if (date.month === undefined) {
    return date.day === undefined ? null : 'Un jour sans mois n’est pas une date valide.'
  }
  if (!Number.isInteger(date.month) || date.month < 1 || date.month > 12) return 'Le mois doit être compris entre 1 et 12.'
  if (date.day !== undefined && !isValidDate({ year: date.year, month: date.month, day: date.day })) {
    return `Le ${date.day} ${monthName(date.month)} ${date.year} n’existe pas.`
  }
  return null
}

/**
 * Intervalle des jours possibles.
 * Une date exprimée en âge nécessite l'intervalle de naissance ; sans lui, renvoie `null`.
 */
export function toInterval(date: FuzzyDate, birth: DayInterval | null): DayInterval | null {
  if (date.kind === 'age') {
    if (!birth) return null
    const spread = date.approximate ? 1 : 0
    const from = Math.max(0, date.age - spread)
    const to = date.age + spread
    // Âge révolu N : du N-ième anniversaire (au plus tôt) à la veille du (N+1)-ième (au plus tard).
    return {
      start: toDay(addYears(fromDay(birth.start), from)),
      end: toDay(addYears(fromDay(birth.end), to + 1)) - 1,
    }
  }
  const { year, month, day, approximate } = date
  if (month === undefined) {
    const spread = approximate ? 1 : 0
    return {
      start: toDay({ year: year - spread, month: 1, day: 1 }),
      end: toDay({ year: year + spread, month: 12, day: 31 }),
    }
  }
  if (day === undefined) {
    const spread = approximate ? 3 : 0
    const first = addMonthsClamped(year, month, -spread)
    const last = addMonthsClamped(year, month, spread)
    return {
      start: toDay({ ...first, day: 1 }),
      end: toDay({ ...last, day: daysInMonth(last.year, last.month) }),
    }
  }
  const center = toDay({ year, month, day })
  const spread = approximate ? 15 : 0
  return { start: center - spread, end: center + spread }
}

/** Âges possibles (révolus) pendant un intervalle, compte tenu d'une naissance imprécise. */
export function ageRange(event: DayInterval, birth: DayInterval): [number, number] {
  return [ageOn(fromDay(birth.end), fromDay(event.start)), ageOn(fromDay(birth.start), fromDay(event.end))]
}

/** Intervalle du jour où la personne atteint `age` ans. */
export function anniversaryInterval(birth: DayInterval, age: number): DayInterval {
  return { start: toDay(addYears(fromDay(birth.start), age)), end: toDay(addYears(fromDay(birth.end), age)) }
}

export function formatFuzzyDate(date: FuzzyDate): string {
  if (date.kind === 'age') return `${date.approximate ? 'vers' : 'à'} ${date.age} an${date.age > 1 ? 's' : ''}`
  const parts = [date.day === 1 ? '1er' : date.day, date.month && monthName(date.month), date.year].filter(
    (p) => p !== undefined && p !== '',
  )
  return `${date.approximate ? 'environ ' : ''}${parts.join(' ')}`
}

export function formatDay(day: DayNumber): string {
  const d = fromDay(day)
  return `${d.day === 1 ? '1er' : d.day} ${monthName(d.month)} ${d.year}`
}
