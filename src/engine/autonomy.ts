/**
 * Autonomie simplifiée des proches, évaluée chaque nuit, sans intervention du joueur :
 * vieillissement, retraite, fin d'études, maladie et guérison, changement d'emploi,
 * déménagement, appels spontanés, anniversaires, dérive des relations.
 * Les conséquences sont gardées en mémoire (souvenirs relationnels).
 */
import { CAREERS } from './data/careers.ts'
import { writeLog } from './journal.ts'
import { clamp } from './needs.ts'
import { isBirthday, RETIREMENT_AGE } from './people.ts'
import { occupationLabel } from './careers.ts'
import { addMemory, adjustRelationship, BASELINE, daysSinceContact, findPerson, memoryScore } from './relationships.ts'
import { chance, drawRandom } from './rng.ts'
import { scheduleEvent } from './schedule.ts'
import { ageAt, dayNumber, MINUTES_PER_DAY, toCalendar } from './time.ts'
import type { GameEvent, Person, SimulationState } from './types.ts'

/** Probabilités quotidiennes (simplifiées). */
export const DAILY = {
  sicknessBase: 0.002,
  sicknessPerYearOver60: 0.0004,
  deathPerYearOver74: 0.00004,
  jobChange: 0.0004,
  move: 0.0002,
}

function sicknessChance(age: number): number {
  return DAILY.sicknessBase + Math.max(0, age - 60) * DAILY.sicknessPerYearOver60
}

function startSickness(draft: SimulationState, person: Person): void {
  person.sickSince = draft.clock
  person.health = clamp(person.health - 10)
  const days = 5 + Math.floor(drawRandom(draft) * 10)
  scheduleEvent(draft, draft.clock + days * MINUTES_PER_DAY + 10 * 60, { type: 'npc_recovered', personId: person.id })
  writeLog(draft, 'social', 'npc_sick', `${person.name} (${person.relation.toLowerCase()}) est malade. Un appel ou un coup de main lui ferait plaisir.`, {
    personId: person.id,
  })
}

function updatePerson(draft: SimulationState, person: Person): void {
  const age = ageAt(person.birthDate, draft.clock)
  const rel = draft.relationships[person.id]

  if (age >= RETIREMENT_AGE && person.occupation !== 'retired' && person.occupation !== 'student') {
    writeLog(draft, 'social', 'npc_retired', `${person.name} part à la retraite.`)
    person.occupation = 'retired'
  }
  if (person.occupation === 'student' && age >= 23) {
    person.occupation = CAREERS[Math.floor(drawRandom(draft) * CAREERS.length)].id
    writeLog(draft, 'social', 'npc_first_job', `${person.name} a terminé ses études et travaille comme ${occupationLabel(person.occupation)}.`)
  }

  if (person.sickSince === null) {
    if (chance(draft, sicknessChance(age))) startSickness(draft, person)
  } else {
    person.health = clamp(person.health - 0.3)
  }

  if (age >= 75 && chance(draft, (age - 74) * DAILY.deathPerYearOver74 * (person.sickSince !== null ? 3 : 1))) {
    person.alive = false
    draft.character.needs.mood = clamp(draft.character.needs.mood - 30)
    draft.character.needs.stress = clamp(draft.character.needs.stress + 30)
    writeLog(draft, 'social', 'npc_death', `${person.name} est décédé·e à ${age} ans.`, { personId: person.id })
    return
  }

  if (person.occupation !== 'retired' && person.occupation !== 'student' && chance(draft, DAILY.jobChange)) {
    person.occupation = CAREERS[Math.floor(drawRandom(draft) * CAREERS.length)].id
    writeLog(draft, 'social', 'npc_job_change', `${person.name} change de travail : ${occupationLabel(person.occupation)}.`)
  }
  if (person.role !== 'colleague' && chance(draft, DAILY.move)) {
    person.distant = !person.distant
    writeLog(draft, 'social', 'npc_moved', `${person.name} déménage ${person.distant ? 'loin de chez toi' : 'près de chez toi'}.`)
  }

  if (!rel) return
  // Une relation s'use doucement, et plus vite sans contact depuis deux semaines (jamais sous son niveau de base).
  const days = daysSinceContact(draft, person.id)
  const erosion = days === null || days > 14 ? 0.25 : 0.05
  rel.closeness = Math.max(Math.min(rel.closeness, BASELINE[person.role]), rel.closeness - erosion)
  rel.tension = Math.max(0, rel.tension - 0.5)

  // Appel spontané d'un proche attaché, plus probable avec de bons souvenirs.
  if (rel.closeness >= 50 && (days === null || days >= 7)) {
    const p = clamp((rel.closeness / 100) * 0.08 + memoryScore(draft, person.id) / 400, 0, 0.2)
    if (chance(draft, p)) {
      rel.lastContact = draft.clock
      adjustRelationship(draft, person.id, { closeness: 1 })
      draft.character.needs.mood = clamp(draft.character.needs.mood + 5)
      writeLog(draft, 'social', 'npc_called', `${person.name} t’appelle pour prendre des nouvelles.`)
    }
  }
}

/** Anniversaires : annoncés le jour même, souhaités ou oubliés constatés le lendemain. */
function birthdays(draft: SimulationState): void {
  const today = toCalendar(draft.clock)
  const yesterdayStart = (dayNumber(draft.clock) - 1) * MINUTES_PER_DAY
  const yesterday = toCalendar(yesterdayStart)
  for (const person of draft.people) {
    if (!person.alive) continue
    const rel = draft.relationships[person.id]
    if (isBirthday(person, today)) {
      writeLog(draft, 'social', 'npc_birthday', `C’est l’anniversaire de ${person.name} aujourd’hui (${ageAt(person.birthDate, draft.clock)} ans).`)
    }
    if (rel && isBirthday(person, yesterday) && person.role !== 'colleague') {
      if (rel.lastContact !== null && rel.lastContact >= yesterdayStart) {
        adjustRelationship(draft, person.id, { closeness: 2 })
        addMemory(draft, person.id, 'birthday_wished', 3, 'Tu as pensé à son anniversaire.')
      } else if (rel.closeness >= 30) {
        adjustRelationship(draft, person.id, { closeness: -4, tension: 3 })
        addMemory(draft, person.id, 'birthday_forgotten', -4, 'Tu as oublié son anniversaire.')
        writeLog(draft, 'social', 'birthday_forgotten', `Tu as oublié l’anniversaire de ${person.name}.`)
      }
    }
  }
}

export function npcDailyUpdate(draft: SimulationState): void {
  for (const person of draft.people) if (person.alive) updatePerson(draft, person)
  birthdays(draft)
}

export const AUTONOMY_HANDLERS = {
  npc_recovered(draft: SimulationState, event: Extract<GameEvent, { type: 'npc_recovered' }>) {
    const person = findPerson(draft, event.personId)
    if (!person || !person.alive || person.sickSince === null) return
    const rel = draft.relationships[person.id]
    const supported = rel?.lastContact !== null && rel?.lastContact !== undefined && rel.lastContact >= person.sickSince
    if (supported) {
      adjustRelationship(draft, person.id, { closeness: 3 })
      addMemory(draft, person.id, 'support', 5, 'Tu as pris de ses nouvelles pendant sa maladie.')
    } else if (rel && rel.closeness >= 40) {
      adjustRelationship(draft, person.id, { closeness: -5, tension: 4 })
      addMemory(draft, person.id, 'absent_when_sick', -5, 'Pas de nouvelles de toi pendant sa maladie.')
    }
    person.sickSince = null
    person.health = clamp(person.health + 10)
    writeLog(
      draft,
      'social',
      'npc_recovered',
      `${person.name} est rétabli·e${supported ? ' et te remercie de ton soutien' : rel && rel.closeness >= 40 ? ' et regrette de ne pas avoir eu de tes nouvelles' : ''}.`,
    )
  },
}
