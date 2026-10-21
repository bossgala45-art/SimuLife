/**
 * Verrouillage de l'application par code (4 à 8 chiffres).
 *
 * Le code n'est jamais stocké : seule une empreinte PBKDF2-SHA-256 salée l'est.
 * Après 5 essais faux, une attente croissante est imposée.
 *
 * LIMITE : c'est un écran de confidentialité contre un regard ou un emprunt de
 * l'iPhone. Il ne chiffre pas les données enregistrées sur l'appareil.
 */
import { fromBase64, toBase64 } from './crypto.ts'

const KEY = 'simulife.lock.v1'
export const LOCK_ITERATIONS = 150_000
export const FREE_ATTEMPTS = 5
/** Verrouillage automatique après ce temps en arrière-plan. */
export const RELOCK_AFTER_MS = 60_000

interface LockRecord {
  salt: string
  hash: string
  iterations: number
  failures: number
  /** Pas de nouvel essai avant cette date (ms). */
  blockedUntil: number
}

export const isValidPin = (pin: string) => /^\d{4,8}$/.test(pin)

function read(store: Storage): LockRecord | null {
  try {
    const r = JSON.parse(store.getItem(KEY) ?? 'null') as Partial<LockRecord> | null
    if (!r || typeof r.salt !== 'string' || typeof r.hash !== 'string' || !Number.isInteger(r.iterations)) return null
    return { salt: r.salt, hash: r.hash, iterations: r.iterations!, failures: r.failures ?? 0, blockedUntil: r.blockedUntil ?? 0 }
  } catch {
    return null
  }
}

async function digest(pin: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<string> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, 256)
  return toBase64(new Uint8Array(bits))
}

export const hasPin = (store: Storage = localStorage) => read(store) !== null

export async function setPin(pin: string, store: Storage = localStorage, iterations = LOCK_ITERATIONS): Promise<void> {
  if (!isValidPin(pin)) throw new Error('Le code doit contenir de 4 à 8 chiffres.')
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const record: LockRecord = { salt: toBase64(salt), hash: await digest(pin, salt, iterations), iterations, failures: 0, blockedUntil: 0 }
  store.setItem(KEY, JSON.stringify(record))
}

export const removePin = (store: Storage = localStorage) => store.removeItem(KEY)

export type PinCheck = { ok: true } | { ok: false; reason: 'wrong'; remaining: number } | { ok: false; reason: 'blocked'; waitMs: number }

/** Attente imposée après `failures` essais faux (0 pour les 5 premiers). */
export const penaltyMs = (failures: number) => (failures < FREE_ATTEMPTS ? 0 : 30_000 * 2 ** Math.min(6, failures - FREE_ATTEMPTS))

export async function checkPin(pin: string, store: Storage = localStorage, now = Date.now()): Promise<PinCheck> {
  const record = read(store)
  if (!record) return { ok: true }
  if (now < record.blockedUntil) return { ok: false, reason: 'blocked', waitMs: record.blockedUntil - now }
  const hash = await digest(pin, fromBase64(record.salt), record.iterations)
  // Comparaison sans court-circuit.
  let diff = hash.length ^ record.hash.length
  for (let i = 0; i < Math.min(hash.length, record.hash.length); i++) diff |= hash.charCodeAt(i) ^ record.hash.charCodeAt(i)
  if (diff === 0) {
    store.setItem(KEY, JSON.stringify({ ...record, failures: 0, blockedUntil: 0 }))
    return { ok: true }
  }
  const failures = record.failures + 1
  store.setItem(KEY, JSON.stringify({ ...record, failures, blockedUntil: now + penaltyMs(failures) }))
  return { ok: false, reason: 'wrong', remaining: Math.max(0, FREE_ATTEMPTS - failures) }
}
