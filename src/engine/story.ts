/**
 * Mémoire narrative et messagerie.
 *
 * - Les faits importants du journal (diplôme, embauche, deuil…) deviennent des
 *   souvenirs durables (`narrative.memories`), que le journal, lui, finit par oublier.
 * - Les proches écrivent d'eux-mêmes : nouvelles (maladie, déménagement, travail),
 *   vœux d'anniversaire, prise de nouvelles quand le contact se perd.
 *
 * Ces règles ne tirent JAMAIS le générateur aléatoire de la simulation : les variantes
 * de texte et les messages spontanés sont choisis par hachage (graine + date), pour
 * ne rien changer au déroulement du reste de la vie.
 */
import { occupationLabel } from './careers.ts'
import { writeLog } from './journal.ts'
import { daysSinceContact, findPerson } from './relationships.ts'
import { hashSeed } from './rng.ts'
import { scheduleEvent } from './schedule.ts'
import { ageAt, dayNumber, MINUTES_PER_DAY, minuteOfDay } from './time.ts'
import type { Channel, GameEvent, LogEntry, Message, Narrative, Place, SimulationState, StoryMemory, StoryTone, World } from './types.ts'

export const THREAD_LIMIT = 60
export const STORY_LIMIT = 400
export const SHARED_LIMIT = 80
export const MESSAGE_MAX_LENGTH = 280

export const emptyNarrative = (): Narrative => ({ threads: {}, nextMessageId: 1, memories: [], nextMemoryId: 1, shared: {}, session: null })
export const emptyWorld = (): World => ({ home: null })

/** Variante de texte reproductible, sans toucher au générateur de la simulation. */
export function variant<T>(state: SimulationState, key: string, options: readonly T[]): T {
  return options[hashSeed(`${state.seed}:${key}`) % options.length]
}

/** Nombre pseudo-aléatoire reproductible dans [0, 1[ (même règle que `variant`). */
export const hashChance = (state: SimulationState, key: string) => hashSeed(`${state.seed}:${key}`) / 0x100000000

// ——— Souvenirs ———

type StoryRule = { tone: StoryTone; importance: 1 | 2 | 3; when?: (entry: LogEntry) => boolean }

/** Entrées du journal qui deviennent des souvenirs, et leur poids dans la vie. */
export const STORY_RULES: Record<string, StoryRule> = {
  life_started: { tone: 'neutral', importance: 3 },
  divergence: { tone: 'neutral', importance: 3 },
  diploma: { tone: 'good', importance: 3 },
  exam_failed: { tone: 'bad', importance: 2 },
  enrolled: { tone: 'neutral', importance: 2 },
  dropped_out: { tone: 'bad', importance: 2 },
  hired: { tone: 'good', importance: 3 },
  layoff: { tone: 'bad', importance: 3 },
  quit: { tone: 'neutral', importance: 2 },
  raise: { tone: 'good', importance: 2 },
  bank_loan_granted: { tone: 'neutral', importance: 1 },
  debt_closed: { tone: 'good', importance: 2 },
  loan_granted: { tone: 'good', importance: 2 },
  loan_refused: { tone: 'bad', importance: 1 },
  argument: { tone: 'bad', importance: 2 },
  helped: { tone: 'good', importance: 1 },
  sport_injury: { tone: 'bad', importance: 1 },
  illness: { tone: 'bad', importance: 1 },
  // Seuls les anniversaires « ronds » restent comme souvenirs.
  birthday: { tone: 'good', importance: 2, when: (e) => typeof e.data?.age === 'number' && e.data.age % 10 === 0 },
  npc_death: { tone: 'bad', importance: 3 },
  npc_first_job: { tone: 'good', importance: 2 },
  npc_retired: { tone: 'neutral', importance: 2 },
  npc_job_change: { tone: 'neutral', importance: 1 },
  npc_moved: { tone: 'neutral', importance: 1 },
  death: { tone: 'bad', importance: 3 },
}

function recordMemory(draft: SimulationState, entry: LogEntry, rule: StoryRule): void {
  const personId = typeof entry.data?.personId === 'string' ? entry.data.personId : undefined
  const memory: StoryMemory = {
    id: draft.narrative.nextMemoryId++,
    at: entry.at,
    kind: entry.code,
    text: entry.message,
    tone: rule.tone,
    importance: rule.importance,
    people: personId ? [personId] : [],
  }
  const memories = draft.narrative.memories
  memories.push(memory)
  if (memories.length > STORY_LIMIT) {
    // On oublie d'abord le plus ancien des souvenirs les moins importants.
    const least = Math.min(...memories.map((m) => m.importance))
    memories.splice(
      memories.findIndex((m) => m.importance === least),
      1,
    )
  }
}

/** Reconstitue les souvenirs à partir d'un journal existant (migration des anciennes sauvegardes). */
export function recordFromLog(draft: SimulationState, entries: readonly LogEntry[]): void {
  for (const entry of entries) {
    const rule = STORY_RULES[entry.code]
    if (rule && (!rule.when || rule.when(entry))) recordMemory(draft, entry, rule)
  }
}

// ——— Messages ———

export function addMessage(draft: SimulationState, personId: string, from: string, channel: Channel, text: string): Message {
  const thread = (draft.narrative.threads[personId] ??= [])
  const message: Message = { id: draft.narrative.nextMessageId++, at: draft.clock, from, channel, text, read: from === 'player' }
  thread.push(message)
  if (thread.length > THREAD_LIMIT) thread.splice(0, thread.length - THREAD_LIMIT)
  return message
}

/** Message d'un proche reçu maintenant (et signalé dans le journal). */
export function receiveMessage(draft: SimulationState, personId: string, text: string): void {
  const person = findPerson(draft, personId)
  if (!person?.alive) return
  addMessage(draft, personId, personId, 'message', text)
  writeLog(draft, 'social', 'message_received', `Message de ${person.name} : « ${text} »`, { personId })
}

export function unreadCount(state: SimulationState, personId?: string): number {
  const threads = personId ? [state.narrative.threads[personId] ?? []] : Object.values(state.narrative.threads)
  return threads.reduce((n, t) => n + t.filter((m) => !m.read).length, 0)
}

/** Marque un fil comme lu (sans faire passer de temps). */
export function markThreadRead(state: SimulationState, personId: string): SimulationState {
  const thread = state.narrative.threads[personId]
  if (!thread?.some((m) => !m.read)) return state
  return {
    ...state,
    narrative: { ...state.narrative, threads: { ...state.narrative.threads, [personId]: thread.map((m) => (m.read ? m : { ...m, read: true })) } },
  }
}

/** Heure de livraison d'une réponse : jamais entre 23 h et 8 h. */
export function deliveryTime(clock: number, delayMinutes: number): number {
  const at = clock + delayMinutes
  const minute = minuteOfDay(at)
  if (minute >= 23 * 60) return (dayNumber(at) + 1) * MINUTES_PER_DAY + 8 * 60 + (at % 30)
  if (minute < 8 * 60) return dayNumber(at) * MINUTES_PER_DAY + 8 * 60 + (at % 30)
  return at
}

/** Programme la réponse écrite d'un proche (délai reproductible de 10 min à 2 h 30). */
export function scheduleReply(draft: SimulationState, personId: string, text: string): void {
  const delay = 10 + Math.floor(hashChance(draft, `reply:${personId}:${draft.clock}`) * 140)
  scheduleEvent(draft, deliveryTime(draft.clock, delay), { type: 'npc_message', personId, text })
}

/** Nouvelles qu'un proche annonce lui-même par message. */
function newsMessage(draft: SimulationState, entry: LogEntry): { personId: string; text: string } | null {
  const personId = typeof entry.data?.personId === 'string' ? entry.data.personId : undefined
  const person = personId ? findPerson(draft, personId) : undefined
  const rel = personId ? draft.relationships[personId] : undefined
  if (!person || !rel || person.role === 'colleague' || rel.closeness < 25) return null
  const key = `${entry.code}:${entry.seq}`
  switch (entry.code) {
    case 'npc_sick':
      return {
        personId: person.id,
        text: variant(draft, key, [
          'Je suis malade, je reste au lit quelques jours… 🤒',
          'Petit coup dur : je suis malade. Rien de grave, j’espère.',
          'Je suis tombé·e malade, je vais me reposer.',
        ]),
      }
    case 'npc_moved':
      return {
        personId: person.id,
        text: person.distant
          ? 'Ça y est, j’ai déménagé ! C’est plus loin de chez toi, on se verra moins facilement…'
          : 'J’ai déménagé : je suis maintenant tout près de chez toi !',
      }
    case 'npc_job_change':
      return { personId: person.id, text: `J’ai changé de travail : je suis ${occupationLabel(person.occupation)} maintenant.` }
    case 'npc_first_job':
      return { personId: person.id, text: `J’ai fini mes études, je commence comme ${occupationLabel(person.occupation)} !` }
    case 'npc_retired':
      return { personId: person.id, text: 'Ça y est, je suis à la retraite ! 🎉' }
    default:
      return null
  }
}

/** Vœux des proches attachés le jour de l'anniversaire du personnage. */
function birthdayWishes(draft: SimulationState, entry: LogEntry): void {
  for (const person of draft.people) {
    const rel = draft.relationships[person.id]
    if (!person.alive || person.role === 'colleague' || !rel || rel.closeness < 45) continue
    const text = variant(draft, `wish:${person.id}:${entry.seq}`, [
      'Joyeux anniversaire ! 🎂',
      `Bon anniversaire ! ${String(entry.data?.age)} ans, ça se fête !`,
      'Joyeux anniversaire, je pense fort à toi aujourd’hui.',
    ])
    receiveMessage(draft, person.id, text)
  }
}

/**
 * Appelé pour chaque entrée écrite dans le journal : souvenirs et messages des proches.
 * Ne fait rien sur un état antérieur à la narration (pendant une migration).
 */
export function narrateEntry(draft: SimulationState, entry: LogEntry): void {
  if (!draft.narrative) return
  const rule = STORY_RULES[entry.code]
  if (rule && (!rule.when || rule.when(entry))) recordMemory(draft, entry, rule)
  const news = newsMessage(draft, entry)
  if (news) receiveMessage(draft, news.personId, news.text)
  if (entry.code === 'birthday') birthdayWishes(draft, entry)
}

/** Probabilité quotidienne qu'un proche attaché, sans nouvelles depuis 3 semaines, écrive. */
export const CHECK_IN_CHANCE = 0.04

/** Chaque jour : un proche attaché peut écrire quand le contact se perd. */
export function dailyCheckIns(draft: SimulationState): void {
  const day = dayNumber(draft.clock)
  for (const person of draft.people) {
    const rel = draft.relationships[person.id]
    if (!person.alive || person.role === 'colleague' || !rel || rel.closeness < 40) continue
    const days = daysSinceContact(draft, person.id)
    if (days !== null && days < 21) continue
    const last = draft.narrative.threads[person.id]?.findLast((m) => m.from === person.id)
    if (last && draft.clock - last.at < 14 * MINUTES_PER_DAY) continue
    if (hashChance(draft, `checkin:${person.id}:${day}`) >= CHECK_IN_CHANCE) continue
    const text = variant(draft, `checkin-text:${person.id}:${day}`, [
      'Ça fait longtemps ! Tu deviens quoi ?',
      'Coucou, je pensais à toi. Donne-moi des nouvelles !',
      'Hé ! On ne s’est pas parlé depuis un moment. Tout va bien ?',
    ])
    receiveMessage(draft, person.id, text)
  }
}

export const STORY_HANDLERS = {
  npc_message(draft: SimulationState, event: Extract<GameEvent, { type: 'npc_message' }>) {
    receiveMessage(draft, event.personId, event.text)
  },
}

// ——— Lieu ———

/** Enregistre (ou retire) le lieu de vie géocodé choisi par le joueur, après vérification. */
export function setHome(state: SimulationState, place: Place | null): { ok: true; state: SimulationState } | { ok: false; message: string } {
  if (place !== null) {
    const valid =
      typeof place.label === 'string' &&
      place.label.trim().length > 0 &&
      place.label.length <= 200 &&
      Number.isFinite(place.lat) &&
      Math.abs(place.lat) <= 90 &&
      Number.isFinite(place.lon) &&
      Math.abs(place.lon) <= 180 &&
      typeof place.source === 'string' &&
      place.source.length > 0 &&
      typeof place.licence === 'string' &&
      place.licence.length > 0
    if (!valid) return { ok: false, message: 'Lieu invalide : nom, coordonnées, source et licence sont obligatoires.' }
  }
  return { ok: true, state: { ...state, world: { ...state.world, home: place && { ...place, label: place.label.trim() } } } }
}

/** Âge du personnage à la date d'un souvenir (pour l'affichage). */
export const ageAtMemory = (state: SimulationState, memory: StoryMemory) => ageAt(state.character.birthDate, memory.at)
