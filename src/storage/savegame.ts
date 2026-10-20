/**
 * Sauvegarde locale (localStorage) : les données restent sur l'appareil.
 * Toute lecture/écriture est protégée : navigation privée ou stockage plein
 * ne font pas planter l'application.
 */
import { parseState, serializeState, type SimulationState } from '../engine/index.ts'

const KEY = 'simulife.save.v1'

export type LoadResult = { status: 'empty' } | { status: 'loaded'; state: SimulationState } | { status: 'error'; message: string }

export function loadGame(storage: Storage | undefined = safeStorage()): LoadResult {
  let raw: string | null
  try {
    raw = storage?.getItem(KEY) ?? null
  } catch {
    return { status: 'error', message: 'Stockage local inaccessible.' }
  }
  if (raw === null) return { status: 'empty' }
  try {
    return { status: 'loaded', state: parseState(raw) }
  } catch (e) {
    return { status: 'error', message: e instanceof Error ? e.message : String(e) }
  }
}

/** Renvoie un message d'erreur si la sauvegarde a échoué. */
export function saveGame(state: SimulationState, storage: Storage | undefined = safeStorage()): string | null {
  try {
    if (!storage) return 'Stockage local indisponible : la partie ne sera pas sauvegardée.'
    storage.setItem(KEY, serializeState(state))
    return null
  } catch {
    return 'Sauvegarde impossible (stockage plein ou désactivé).'
  }
}

export function clearGame(storage: Storage | undefined = safeStorage()): void {
  try {
    storage?.removeItem(KEY)
  } catch {
    // Rien à faire : le stockage est inaccessible.
  }
}

function safeStorage(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage
  } catch {
    return undefined
  }
}
