/**
 * Horloge interne.
 *
 * Le temps est un entier : le nombre de minutes écoulées depuis le
 * 1er janvier 1970 à 00:00. Le calendrier est grégorien et sans fuseau horaire
 * (calculs en UTC) : aucune heure d'été, aucune dépendance au réglage de l'appareil.
 */
import { SimulationError } from './errors.ts'
import type { CalendarDate, CalendarDateTime } from './types.ts'

export const MINUTES_PER_HOUR = 60
export const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR
export const MINUTES_PER_WEEK = 7 * MINUTES_PER_DAY

export type TimeUnit = 'day' | 'week' | 'month'

const MIN_YEAR = 1900
const MAX_YEAR = 9999

const WEEKDAYS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']
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

export function assertClock(minutes: number): void {
  if (!Number.isSafeInteger(minutes)) {
    throw new SimulationError('INVALID_ARGUMENT', `Horloge invalide : ${minutes} n'est pas un nombre entier de minutes.`)
  }
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

export function isValidDate({ year, month, day }: CalendarDate): boolean {
  return (
    Number.isInteger(year) &&
    Number.isInteger(month) &&
    Number.isInteger(day) &&
    year >= MIN_YEAR &&
    year <= MAX_YEAR &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysInMonth(year, month)
  )
}

export function fromCalendar(dt: CalendarDateTime): number {
  const { hour, minute } = dt
  if (
    !isValidDate(dt) ||
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    throw new SimulationError('INVALID_ARGUMENT', `Date invalide : ${JSON.stringify(dt)}.`)
  }
  return Date.UTC(dt.year, dt.month - 1, dt.day, hour, minute) / 60000
}

export function toCalendar(minutes: number): CalendarDateTime & { weekday: number } {
  assertClock(minutes)
  const d = new Date(minutes * 60000)
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    /** 0 = lundi … 6 = dimanche */
    weekday: (d.getUTCDay() + 6) % 7,
  }
}

/** Numéro du jour (change à minuit). */
export function dayNumber(minutes: number): number {
  return Math.floor(minutes / MINUTES_PER_DAY)
}

export function minuteOfDay(minutes: number): number {
  return minutes - dayNumber(minutes) * MINUTES_PER_DAY
}

/** Ajoute des mois calendaires ; le jour est ramené au dernier jour du mois si besoin (31 janv. + 1 mois = 28/29 févr.). */
export function addMonths(minutes: number, months: number): number {
  const c = toCalendar(minutes)
  const total = c.year * 12 + (c.month - 1) + months
  const year = Math.floor(total / 12)
  const month = (total % 12) + 1
  const day = Math.min(c.day, daysInMonth(year, month))
  return fromCalendar({ year, month, day, hour: c.hour, minute: c.minute })
}

export function addDuration(minutes: number, unit: TimeUnit, amount: number): number {
  if (!Number.isInteger(amount) || amount < 1) {
    throw new SimulationError('INVALID_ARGUMENT', `Durée invalide : ${amount} (entier ≥ 1 attendu).`)
  }
  switch (unit) {
    case 'day':
      return minutes + amount * MINUTES_PER_DAY
    case 'week':
      return minutes + amount * MINUTES_PER_WEEK
    case 'month':
      return addMonths(minutes, amount)
    default:
      throw new SimulationError('INVALID_ARGUMENT', `Unité de temps inconnue : ${String(unit)}.`)
  }
}

/** Prochaine occurrence (strictement après `after`) du jour donné à l'heure donnée, chaque mois. */
export function nextMonthlyOccurrence(after: number, day: number, hour: number): number {
  const c = toCalendar(after)
  for (let offset = 0; ; offset++) {
    const total = c.year * 12 + (c.month - 1) + offset
    const year = Math.floor(total / 12)
    const month = (total % 12) + 1
    const at = fromCalendar({ year, month, day: Math.min(day, daysInMonth(year, month)), hour, minute: 0 })
    if (at > after) return at
  }
}

/** Prochain anniversaire (strictement après `after`) ; un 29 février est fêté le 28 les années non bissextiles. */
export function nextAnniversary(after: number, date: CalendarDate, hour: number): number {
  const c = toCalendar(after)
  for (let year = c.year; ; year++) {
    const day = Math.min(date.day, daysInMonth(year, date.month))
    const at = fromCalendar({ year, month: date.month, day, hour, minute: 0 })
    if (at > after) return at
  }
}

export function ageAt(birth: CalendarDate, minutes: number): number {
  const c = toCalendar(minutes)
  let age = c.year - birth.year
  if (c.month < birth.month || (c.month === birth.month && c.day < birth.day)) age--
  return age
}

const pad = (n: number) => String(n).padStart(2, '0')

export function formatTime(minutes: number): string {
  const c = toCalendar(minutes)
  return `${pad(c.hour)}:${pad(c.minute)}`
}

export function formatDate(minutes: number): string {
  const c = toCalendar(minutes)
  return `${WEEKDAYS[c.weekday]} ${c.day} ${MONTHS[c.month - 1]} ${c.year}`
}

export function formatDateTime(minutes: number): string {
  return `${formatDate(minutes)}, ${formatTime(minutes)}`
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / MINUTES_PER_HOUR)
  const m = minutes % MINUTES_PER_HOUR
  if (h === 0) return `${m} min`
  return m === 0 ? `${h} h` : `${h} h ${pad(m)}`
}
