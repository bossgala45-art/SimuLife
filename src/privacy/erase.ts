/**
 * Effacement complet des données de SIMULIFE sur cet appareil :
 * base IndexedDB (vies, branches, instantanés, historique) et toutes les clés
 * `simulife.*` du stockage local (dossier, réglages, autorisations, code, cache…).
 */
import Dexie from 'dexie'
import { DB_NAME } from '../storage/destiny.ts'

export const STORAGE_PREFIX = 'simulife.'

export function eraseLocalKeys(store: Storage = localStorage): number {
  const keys: string[] = []
  for (let i = 0; i < store.length; i++) {
    const k = store.key(i)
    if (k?.startsWith(STORAGE_PREFIX)) keys.push(k)
  }
  keys.forEach((k) => store.removeItem(k))
  return keys.length
}

/** Efface tout. Les connexions ouvertes à la base doivent être fermées avant (`repo.close()`). */
export async function eraseAllData(options: { dbName?: string; store?: Storage } = {}): Promise<void> {
  await Dexie.delete(options.dbName ?? DB_NAME)
  eraseLocalKeys(options.store ?? localStorage)
}
