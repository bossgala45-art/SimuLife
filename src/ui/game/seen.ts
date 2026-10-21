/**
 * Cartes déjà vues, mémorisées par branche sur l'appareil (localStorage).
 * Sans stockage, l'information reste en mémoire le temps de la partie.
 */
export interface Seen {
  /** Toutes les entrées jusqu'à ce numéro sont lues. */
  lastSeq: number
  /** Cartes fermées une à une au-delà de `lastSeq`. */
  dismissed: number[]
}

const key = (branchId: string) => `simulife.cards.${branchId}`

export function loadSeen(branchId: string): Seen | null {
  if (!branchId) return null
  try {
    const raw = JSON.parse(localStorage.getItem(key(branchId)) ?? 'null') as Partial<Seen> | null
    if (!raw || typeof raw.lastSeq !== 'number') return null
    const dismissed = Array.isArray(raw.dismissed) ? raw.dismissed.filter((n): n is number => typeof n === 'number') : []
    return { lastSeq: raw.lastSeq, dismissed }
  } catch {
    return null
  }
}

export function saveSeen(branchId: string, seen: Seen): void {
  if (!branchId) return
  try {
    localStorage.setItem(key(branchId), JSON.stringify(seen))
  } catch {
    // Stockage plein ou interdit : l'état reste en mémoire.
  }
}
