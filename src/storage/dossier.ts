/**
 * Sauvegarde locale du dossier de vie (localStorage) : il ne quitte jamais l'appareil.
 */
import { parseDossier, serializeDossier, type Dossier } from '../dossier/index.ts'

const KEY = 'simulife.dossier.v1'

export type DossierLoad = { status: 'empty' } | { status: 'loaded'; dossier: Dossier } | { status: 'error'; message: string }

function safeStorage(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage
  } catch {
    return undefined
  }
}

export function loadDossier(storage: Storage | undefined = safeStorage()): DossierLoad {
  let raw: string | null
  try {
    raw = storage?.getItem(KEY) ?? null
  } catch {
    return { status: 'error', message: 'Stockage local inaccessible.' }
  }
  if (raw === null) return { status: 'empty' }
  try {
    return { status: 'loaded', dossier: parseDossier(raw) }
  } catch (e) {
    return { status: 'error', message: e instanceof Error ? e.message : String(e) }
  }
}

/** Renvoie un message d'erreur si l'enregistrement a échoué. */
export function saveDossier(dossier: Dossier, storage: Storage | undefined = safeStorage()): string | null {
  try {
    if (!storage) return 'Stockage local indisponible : le dossier ne sera pas sauvegardé.'
    storage.setItem(KEY, serializeDossier(dossier))
    return null
  } catch {
    return 'Sauvegarde du dossier impossible (stockage plein ou désactivé).'
  }
}

export function clearDossier(storage: Storage | undefined = safeStorage()): void {
  try {
    storage?.removeItem(KEY)
  } catch {
    // Stockage inaccessible : rien à effacer.
  }
}
