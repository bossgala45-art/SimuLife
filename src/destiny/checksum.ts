/** Empreinte SHA-256 (hexadécimale) d'un texte, via l'API Web Crypto. */
export async function sha256(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Identifiant unique (UUID v4). */
export function newId(): string {
  return crypto.randomUUID()
}
