/**
 * Chiffrement des exports par phrase de passe (Web Crypto, intégré au navigateur) :
 * clé dérivée par PBKDF2-SHA-256 (sel aléatoire), chiffrement authentifié AES-256-GCM.
 * Une phrase de passe fausse ou un fichier modifié sont détectés (échec d'authentification).
 * Rien n'est envoyé : tout se passe sur l'appareil. La phrase de passe n'est jamais stockée.
 */

export const ENCRYPTED_FORMAT = 'simulife-encrypted'
export const ENCRYPTED_VERSION = 1
export const PBKDF2_ITERATIONS = 310_000
export const MIN_PASSPHRASE = 8

export interface EncryptedEnvelope {
  format: typeof ENCRYPTED_FORMAT
  version: typeof ENCRYPTED_VERSION
  kdf: { name: 'PBKDF2'; hash: 'SHA-256'; iterations: number; salt: string }
  cipher: { name: 'AES-GCM'; iv: string }
  data: string
}

export class CryptoError extends Error {}

const encoder = new TextEncoder()

export function toBase64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

export function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const s = atob(text)
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}

async function deriveKey(passphrase: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

export async function encryptText(plain: string, passphrase: string, iterations = PBKDF2_ITERATIONS): Promise<string> {
  if (passphrase.length < MIN_PASSPHRASE) throw new CryptoError(`La phrase de passe doit contenir au moins ${MIN_PASSPHRASE} caractères.`)
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(passphrase, salt, iterations)
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(plain)))
  const envelope: EncryptedEnvelope = {
    format: ENCRYPTED_FORMAT,
    version: ENCRYPTED_VERSION,
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations, salt: toBase64(salt) },
    cipher: { name: 'AES-GCM', iv: toBase64(iv) },
    data: toBase64(data),
  }
  return JSON.stringify(envelope)
}

/** Vrai si le texte est un export chiffré (sans le déchiffrer). */
export function isEncrypted(text: string): boolean {
  try {
    return (JSON.parse(text) as { format?: unknown }).format === ENCRYPTED_FORMAT
  } catch {
    return false
  }
}

export async function decryptText(envelopeText: string, passphrase: string): Promise<string> {
  let env: EncryptedEnvelope
  try {
    env = JSON.parse(envelopeText) as EncryptedEnvelope
  } catch {
    throw new CryptoError('Fichier chiffré illisible.')
  }
  if (env.format !== ENCRYPTED_FORMAT || env.version !== ENCRYPTED_VERSION || env.kdf?.name !== 'PBKDF2' || env.cipher?.name !== 'AES-GCM') {
    throw new CryptoError('Format de fichier chiffré non pris en charge.')
  }
  if (!Number.isInteger(env.kdf.iterations) || env.kdf.iterations < 100_000 || env.kdf.iterations > 5_000_000) {
    throw new CryptoError('Paramètres de chiffrement invalides.')
  }
  try {
    const key = await deriveKey(passphrase, fromBase64(env.kdf.salt), env.kdf.iterations)
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(env.cipher.iv) }, key, fromBase64(env.data))
    return new TextDecoder().decode(plain)
  } catch {
    throw new CryptoError('Phrase de passe incorrecte, ou fichier modifié.')
  }
}
