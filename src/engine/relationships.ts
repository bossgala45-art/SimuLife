/**
 * Relations avec les proches et mémoire des événements relationnels.
 *
 * Chaque relation a trois jauges (0 à 100) : proximité, confiance, tension.
 * Les souvenirs marquants sont conservés et pèsent sur les décisions des
 * proches (prêter de l'argent, appeler) ; leur poids diminue avec le temps.
 */
import { clamp } from './needs.ts'
import { MINUTES_PER_DAY } from './time.ts'
import type { MemoryKind, Person, PersonRole, Relationship, SimulationState } from './types.ts'

/** Proximité minimale vers laquelle une relation retombe sans contact. */
export const BASELINE: Record<PersonRole, number> = { parent: 30, sibling: 25, friend: 5, colleague: 0 }
export const MEMORY_LIMIT = 15
/** Au-delà de deux ans, un souvenir ne garde que 20 % de son poids. */
const MEMORY_FADE_DAYS = 730

export function newRelationship(closeness: number, trust = 50, tension = 0): Relationship {
  return { closeness: clamp(closeness), trust: clamp(trust), tension: clamp(tension), lastContact: null, memories: [] }
}

export function findPerson(state: SimulationState, id: string): Person | undefined {
  return state.people.find((p) => p.id === id)
}

export function personName(state: SimulationState, id: string): string {
  return findPerson(state, id)?.name ?? 'un proche'
}

export function adjustRelationship(
  draft: SimulationState,
  id: string,
  delta: Partial<Record<'closeness' | 'trust' | 'tension', number>>,
): void {
  const rel = draft.relationships[id]
  if (!rel) return
  for (const key of ['closeness', 'trust', 'tension'] as const) {
    if (delta[key]) rel[key] = clamp(rel[key] + delta[key])
  }
}

export function touch(draft: SimulationState, id: string): void {
  const rel = draft.relationships[id]
  if (rel) rel.lastContact = draft.clock
}

export function daysSinceContact(state: SimulationState, id: string): number | null {
  const last = state.relationships[id]?.lastContact
  return last === null || last === undefined ? null : Math.floor((state.clock - last) / MINUTES_PER_DAY)
}

/**
 * Ajoute un souvenir. Au-delà de la limite, on oublie d'abord le plus ancien
 * des souvenirs légers (poids ≤ 3), sinon le plus ancien.
 */
export function addMemory(draft: SimulationState, id: string, kind: MemoryKind, weight: number, text: string): void {
  const rel = draft.relationships[id]
  if (!rel) return
  rel.memories.push({ at: draft.clock, kind, weight, text })
  if (rel.memories.length > MEMORY_LIMIT) {
    const light = rel.memories.findIndex((m) => Math.abs(m.weight) <= 3)
    rel.memories.splice(light >= 0 ? light : 0, 1)
  }
}

/** Somme des souvenirs pondérée par leur ancienneté (positif = bons souvenirs). */
export function memoryScore(state: SimulationState, id: string): number {
  const rel = state.relationships[id]
  if (!rel) return 0
  return rel.memories.reduce((sum, m) => {
    const ageDays = (state.clock - m.at) / MINUTES_PER_DAY
    return sum + m.weight * Math.max(0.2, 1 - ageDays / MEMORY_FADE_DAYS)
  }, 0)
}

export function hasMemory(state: SimulationState, id: string, kind: MemoryKind): boolean {
  return state.relationships[id]?.memories.some((m) => m.kind === kind) ?? false
}
