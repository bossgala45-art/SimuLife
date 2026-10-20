/**
 * Conditions d'accès aux métiers et aux formations, avec les raisons précises
 * d'un refus (« CAP Cuisine requis », « Cuisine : niveau 4 requis (actuel 1) »).
 */
import { CAREERS, DIPLOMAS, findDiploma, SKILLS, type CareerDefinition, type Requirement } from './data/careers.ts'
import { skillLevel } from './skills.ts'
import { ageAt } from './time.ts'
import type { SimulationState, SkillId } from './types.ts'

export const LEVEL_LABELS: Record<number, string> = {
  3: 'CAP',
  4: 'bac',
  5: 'bac +2',
  6: 'licence (bac +3)',
  7: 'master (bac +5)',
}

export function diplomaLevel(state: SimulationState): number {
  return state.education.diplomas.reduce((max, d) => Math.max(max, findDiploma(d.id)?.level ?? 0), 0)
}

export const hasDiploma = (state: SimulationState, id: string) => state.education.diplomas.some((d) => d.id === id)

/** Raisons pour lesquelles l'exigence n'est pas remplie (liste vide = remplie). */
export function unmetReasons(state: SimulationState, req: Requirement): string[] {
  const reasons: string[] = []
  if (req.minLevel !== undefined && diplomaLevel(state) < req.minLevel) {
    reasons.push(`Niveau d’études requis : ${LEVEL_LABELS[req.minLevel] ?? req.minLevel} ou plus`)
  }
  if (req.diplomas && !req.diplomas.some((id) => hasDiploma(state, id))) {
    reasons.push(`Diplôme requis : ${req.diplomas.map((id) => DIPLOMAS.find((d) => d.id === id)?.label ?? id).join(' ou ')}`)
  }
  for (const [skill, level] of Object.entries(req.skills ?? {}) as [SkillId, number][]) {
    const current = skillLevel(state, skill)
    if (current < level) {
      reasons.push(`${SKILLS.find((s) => s.id === skill)!.label} : niveau ${level} requis (actuel ${current})`)
    }
  }
  if (req.experience) {
    const days = state.career.experience[req.experience.sector] ?? 0
    if (days < req.experience.days) {
      reasons.push(`Expérience : ${req.experience.days} jours en ${req.experience.sector} (actuel ${days})`)
    }
  }
  return reasons
}

export interface Eligibility {
  ok: boolean
  reasons: string[]
}

/** Admissible si l'une des exigences est remplie ; sinon, raisons de l'exigence la plus proche. */
export function careerEligibility(state: SimulationState, career: CareerDefinition): Eligibility {
  const reasons: string[] = []
  const age = ageAt(state.character.birthDate, state.clock)
  if (age < career.minAge) reasons.push(`Âge minimal : ${career.minAge} ans`)
  if (career.anyOf.length > 0) {
    const options = career.anyOf.map((req) => unmetReasons(state, req))
    if (!options.some((o) => o.length === 0)) {
      const closest = options.reduce((best, o) => (o.length < best.length ? o : best))
      reasons.push(...closest)
    }
  }
  return { ok: reasons.length === 0, reasons }
}

export const eligibleCareers = (state: SimulationState) => CAREERS.filter((c) => careerEligibility(state, c).ok)
