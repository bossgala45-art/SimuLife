/**
 * Compétences : l'expérience s'accumule, le niveau (0 à 10) s'en déduit.
 * Plus le niveau est élevé, plus il faut d'expérience pour progresser :
 * niveau n atteint à 25 × n² points (25, 100, 225, 400…).
 */
import { writeLog } from './journal.ts'
import type { SimulationState, SkillId } from './types.ts'
import { SKILLS } from './data/careers.ts'

export const MAX_LEVEL = 10

export function emptySkills(): Record<SkillId, number> {
  return { cooking: 0, communication: 0, logic: 0, manual: 0, creativity: 0, organization: 0 }
}

export function levelOf(xp: number): number {
  let level = 0
  while (level < MAX_LEVEL && xp >= 25 * (level + 1) * (level + 1)) level++
  return level
}

export const xpForLevel = (level: number) => 25 * level * level

export const skillLevel = (state: SimulationState, skill: SkillId) => levelOf(state.skills[skill])

/** Progression vers le niveau suivant, de 0 à 1. */
export function levelProgress(xp: number): number {
  const level = levelOf(xp)
  if (level >= MAX_LEVEL) return 1
  return (xp - xpForLevel(level)) / (xpForLevel(level + 1) - xpForLevel(level))
}

/** Facteur d'apprentissage selon l'intelligence (0,75 à 1,25). */
export const learningFactor = (state: SimulationState) => 0.75 + state.character.attributes.intelligence / 200

/** Ajoute de l'expérience et journalise un passage de niveau. */
export function gainXp(draft: SimulationState, skill: SkillId, amount: number): void {
  const before = levelOf(draft.skills[skill])
  draft.skills[skill] += amount * learningFactor(draft)
  const after = levelOf(draft.skills[skill])
  if (after > before) {
    const label = SKILLS.find((s) => s.id === skill)!.label
    writeLog(draft, 'event', 'skill_level', `${label} : niveau ${after} atteint.`, { skill, level: after })
  }
}

export const isSkillId = (value: unknown): value is SkillId => SKILLS.some((s) => s.id === value)
