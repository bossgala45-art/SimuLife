/**
 * Générateur pseudo-aléatoire à graine (mulberry32).
 *
 * Tout l'état du générateur tient dans un entier 32 bits, enregistré dans
 * `SimulationState.rngState` : sauvegarder l'état suffit à reproduire la suite.
 * Seules des opérations entières (Math.imul, décalages) sont utilisées, ce qui
 * garantit les mêmes tirages sur tous les navigateurs.
 */

/** Convertit une graine texte en état initial (hachage FNV-1a 32 bits). */
export function hashSeed(seed: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/** Tire un nombre dans [0, 1) et renvoie le nouvel état du générateur. */
export function nextRandom(state: number): { value: number; state: number } {
  const next = (state + 0x6d2b79f5) >>> 0
  let t = next
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296
  return { value, state: next }
}

/**
 * Tire un nombre dans [0, 1) en faisant avancer le générateur de l'état fourni.
 * Réservé au moteur, qui travaille sur une copie de l'état (brouillon).
 */
export function drawRandom(draft: { rngState: number }): number {
  const { value, state } = nextRandom(draft.rngState)
  draft.rngState = state
  return value
}

/** Vrai avec la probabilité `p` (consomme toujours exactement un tirage). */
export function chance(draft: { rngState: number }, p: number): boolean {
  return drawRandom(draft) < p
}
