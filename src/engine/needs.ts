/**
 * Besoins du personnage et leur évolution avec le temps.
 *
 * Toutes les valeurs vont de 0 à 100. Le sens suit la lecture naturelle :
 * « faim 90 » = très faim, « hygiène 90 » = très propre.
 *
 * Seules les opérations + − × ÷ sont utilisées (pas de puissance ni de
 * logarithme), dont le résultat est identique sur tous les navigateurs.
 */
import type { Attributes, NeedId, Needs } from './types.ts'

export interface NeedInfo {
  label: string
  /** 'low' : une valeur basse est bonne (faim) ; 'high' : une valeur haute est bonne (hygiène). */
  goodWhen: 'low' | 'high'
}

export const NEEDS: Record<NeedId, NeedInfo> = {
  sleep: { label: 'Sommeil', goodWhen: 'low' },
  hunger: { label: 'Faim', goodWhen: 'low' },
  hygiene: { label: 'Hygiène', goodWhen: 'high' },
  fatigue: { label: 'Fatigue', goodWhen: 'low' },
  stress: { label: 'Stress', goodWhen: 'low' },
  mood: { label: 'Humeur', goodWhen: 'high' },
}

export const NEED_IDS = Object.keys(NEEDS) as NeedId[]

/** Seuil au-delà duquel un besoin est critique (≥ pour 'low', ≤ pour 'high'). */
export const CRITICAL_HIGH = 80
export const CRITICAL_LOW = 20

export function isCritical(need: NeedId, value: number): boolean {
  return NEEDS[need].goodWhen === 'low' ? value >= CRITICAL_HIGH : value <= CRITICAL_LOW
}

export const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value))

/** Variation par heure, hors humeur (calculée à part). */
export type NeedRates = Partial<Record<Exclude<NeedId, 'mood'>, number>>

export const AWAKE_RATES: Required<NeedRates> = {
  sleep: 4,
  hunger: 5,
  hygiene: -2.5,
  fatigue: 1.5,
  stress: -1,
}

export const ASLEEP_RATES: Required<NeedRates> = {
  sleep: -11,
  hunger: 2,
  hygiene: -1,
  fatigue: -8,
  stress: -2,
}

/** Stress supplémentaire par heure tant qu'un besoin vital (faim, sommeil, hygiène) est critique. */
const CRITICAL_STRESS_PER_HOUR = 3
/** Part de l'écart à l'humeur « cible » comblée par heure. */
const MOOD_CONVERGENCE_PER_HOUR = 0.15
/** Perte de santé par heure et par besoin à l'extrême (faim ou sommeil ≥ 95). */
const HEALTH_LOSS_PER_HOUR = 1.5
const HEALTH_RECOVERY_PER_HOUR = 0.1

/** Humeur vers laquelle tend le personnage, compte tenu de ses autres besoins. */
export function moodTarget(n: Needs): number {
  return clamp(
    75 -
      0.4 * n.stress -
      0.3 * Math.max(0, n.hunger - 50) -
      0.3 * Math.max(0, n.sleep - 60) -
      0.3 * Math.max(0, n.fatigue - 60) -
      0.3 * Math.max(0, 40 - n.hygiene),
  )
}

export interface Activity {
  sleeping: boolean
  /** Variations propres à l'activité, ajoutées aux variations de base. */
  rates: NeedRates
}

/**
 * Fait évoluer besoins et santé pendant `minutes`.
 * Modifie `needs` et `attributes` en place (le moteur travaille sur une copie).
 */
export function applyTimeToNeeds(needs: Needs, attributes: Attributes, minutes: number, activity: Activity): void {
  const hours = minutes / 60
  const base = activity.sleeping ? ASLEEP_RATES : AWAKE_RATES
  for (const id of Object.keys(base) as (keyof NeedRates)[]) {
    needs[id] = clamp(needs[id] + (base[id] + (activity.rates[id] ?? 0)) * hours)
  }

  const vitalCritical = isCritical('hunger', needs.hunger) || isCritical('sleep', needs.sleep) || isCritical('hygiene', needs.hygiene)
  if (vitalCritical) needs.stress = clamp(needs.stress + CRITICAL_STRESS_PER_HOUR * hours)

  const target = moodTarget(needs)
  needs.mood = clamp(needs.mood + (target - needs.mood) * Math.min(1, MOOD_CONVERGENCE_PER_HOUR * hours))

  const extremes = (needs.hunger >= 95 ? 1 : 0) + (needs.sleep >= 95 ? 1 : 0)
  attributes.health =
    extremes > 0
      ? clamp(attributes.health - HEALTH_LOSS_PER_HOUR * extremes * hours)
      : vitalCritical
        ? attributes.health
        : clamp(attributes.health + HEALTH_RECOVERY_PER_HOUR * hours)
}
