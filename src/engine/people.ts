/**
 * Personnages non joueurs : création de l'entourage (famille, amis, collègues).
 * Tout est tiré à partir de la graine : même graine, même entourage.
 */
import { CAREERS } from './data/careers.ts'
import { newRelationship } from './relationships.ts'
import { drawRandom } from './rng.ts'
import { ageAt, daysInMonth, toCalendar } from './time.ts'
import type { CalendarDate, Person, PersonRole, SimulationState } from './types.ts'

const FEMALE = ['Nadia', 'Claire', 'Sophie', 'Fatima', 'Isabelle', 'Sandrine', 'Laura', 'Inès', 'Julie', 'Amina', 'Léa', 'Chloé']
const MALE = ['Karim', 'Thomas', 'Laurent', 'Pierre', 'Nicolas', 'Mehdi', 'Julien', 'Antoine', 'David', 'Hugo', 'Yanis', 'Lucas']

export const RETIREMENT_AGE = 64

/** Composition de l'entourage ; les valeurs absentes sont tirées au hasard. */
export interface Entourage {
  parents?: ('mother' | 'father')[]
  siblings?: number
  /** Proximité de départ avec la famille (0 à 100). */
  familyCloseness?: number
  familyTension?: number
  friends?: number
  bestFriendCloseness?: number
}

const randInt = (draft: SimulationState, min: number, max: number) => min + Math.floor(drawRandom(draft) * (max - min + 1))
const pick = <T>(draft: SimulationState, list: readonly T[]) => list[Math.floor(drawRandom(draft) * list.length)]

/** Prénom pas encore porté dans l'entourage (sauf si la liste est épuisée). */
function pickName(draft: SimulationState, female: boolean): string {
  const list = female ? FEMALE : MALE
  const used = new Set(draft.people.map((p) => p.name))
  const free = list.filter((n) => !used.has(n))
  return pick(draft, free.length > 0 ? free : list)
}

function randomBirth(draft: SimulationState, year: number): CalendarDate {
  const month = randInt(draft, 1, 12)
  return { year, month, day: randInt(draft, 1, daysInMonth(year, month)) }
}

/** Métier ou situation plausible pour l'âge. */
export function occupationFor(draft: SimulationState, age: number): string {
  if (age >= RETIREMENT_AGE) return 'retired'
  if (age < 23) return 'student'
  return pick(draft, CAREERS).id
}

export function addPerson(
  draft: SimulationState,
  p: { role: PersonRole; relation: string; name: string; birthDate: CalendarDate; closeness: number; trust?: number; tension?: number },
): Person {
  const age = ageAt(p.birthDate, draft.clock)
  const person: Person = {
    id: `p${draft.nextPersonId++}`,
    name: p.name,
    role: p.role,
    relation: p.relation,
    birthDate: p.birthDate,
    alive: true,
    occupation: occupationFor(draft, age),
    health: randInt(draft, 70, 100),
    sickSince: null,
    distant: drawRandom(draft) < (p.role === 'colleague' ? 0 : 0.25),
    generosity: randInt(draft, 20, 90),
  }
  draft.people.push(person)
  draft.relationships[person.id] = newRelationship(p.closeness, p.trust ?? 50, p.tension ?? 0)
  return person
}

export function createEntourage(draft: SimulationState, setup: Entourage = {}): void {
  const year = toCalendar(draft.clock).year
  const playerYear = draft.character.birthDate.year
  const familyCloseness = setup.familyCloseness ?? randInt(draft, 45, 80)
  const familyTension = setup.familyTension ?? randInt(draft, 0, 25)

  const parents = setup.parents ?? (['mother', 'father'] as const)
  for (const parent of parents) {
    const female = parent === 'mother'
    addPerson(draft, {
      role: 'parent',
      relation: female ? 'Mère' : 'Père',
      name: pickName(draft, female),
      birthDate: randomBirth(draft, playerYear - randInt(draft, 22, 38)),
      closeness: familyCloseness,
      trust: 60,
      tension: familyTension,
    })
  }

  const siblings = Math.min(4, setup.siblings ?? randInt(draft, 0, 2))
  for (let i = 0; i < siblings; i++) {
    const female = drawRandom(draft) < 0.5
    const birthYear = Math.min(year - 1, playerYear + randInt(draft, -8, 8))
    addPerson(draft, {
      role: 'sibling',
      relation: female ? 'Sœur' : 'Frère',
      name: pickName(draft, female),
      birthDate: randomBirth(draft, birthYear),
      closeness: Math.max(10, familyCloseness - randInt(draft, 0, 20)),
      tension: familyTension,
    })
  }

  const friends = setup.friends ?? 2
  for (let i = 0; i < friends; i++) {
    const female = drawRandom(draft) < 0.5
    addPerson(draft, {
      role: 'friend',
      relation: 'Ami·e',
      name: pickName(draft, female),
      birthDate: randomBirth(draft, playerYear + randInt(draft, -3, 3)),
      closeness: i === 0 && setup.bestFriendCloseness !== undefined ? setup.bestFriendCloseness : randInt(draft, 35, 65),
    })
  }
}

/** Nouveaux collègues à l'arrivée dans un emploi (ils exercent le même métier). */
export function addColleagues(draft: SimulationState, careerId: string, count = 2): void {
  const playerYear = draft.character.birthDate.year
  for (let i = 0; i < count; i++) {
    const female = drawRandom(draft) < 0.5
    addPerson(draft, {
      role: 'colleague',
      relation: 'Collègue',
      name: pickName(draft, female),
      birthDate: randomBirth(draft, playerYear + randInt(draft, -12, 12)),
      closeness: randInt(draft, 10, 25),
    }).occupation = careerId
  }
}

/** Le personnage fête-t-il son anniversaire ce jour-là ? (29 février → 28 février hors années bissextiles) */
export function isBirthday(person: Person, on: CalendarDate): boolean {
  return on.month === person.birthDate.month && on.day === Math.min(person.birthDate.day, daysInMonth(on.year, on.month))
}
