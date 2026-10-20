/** WebGL est-il utilisable sur cet appareil ? (résultat mis en cache) */
let cached: boolean | null = null

export function hasWebGL(): boolean {
  if (cached !== null) return cached
  try {
    // L'environnement de test (jsdom) n'implémente pas le canvas.
    if (typeof navigator !== 'undefined' && navigator.userAgent.includes('jsdom')) return (cached = false)
    const canvas = document.createElement('canvas')
    cached = Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'))
  } catch {
    cached = false
  }
  return cached
}

export type AvatarMode = '3d' | '2d-disabled' | '2d-no-webgl' | '2d-error'

/** Mode d'affichage effectif de l'avatar (aussi affiché dans les réglages). */
export function avatarMode(enabled: boolean, failed: boolean): AvatarMode {
  if (!enabled) return '2d-disabled'
  if (!hasWebGL()) return '2d-no-webgl'
  return failed ? '2d-error' : '3d'
}

/** Échec du rendu 3D pendant la session (perte du contexte WebGL, erreur) : on reste en 2D. */
let failed3d = false
export const avatar3dFailed = () => failed3d
export function markAvatar3dFailed(): void {
  failed3d = true
}
