/**
 * Réglages de l'interface, propres à cet appareil (localStorage).
 * Lecture tolérante : une valeur absente ou invalide reprend sa valeur par défaut.
 */
export interface Settings {
  theme: 'auto' | 'light' | 'dark'
  /** 'auto' suit le réglage « Réduire les animations » du système. */
  motion: 'auto' | 'reduced' | 'full'
  avatar3d: boolean
  music: boolean
  musicVolume: number
  sfx: boolean
  sfxVolume: number
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'auto',
  motion: 'auto',
  avatar3d: true,
  // Pas de musique imposée : elle se choisit dans les réglages.
  music: false,
  musicVolume: 0.35,
  sfx: true,
  sfxVolume: 0.5,
}

const KEY = 'simulife.settings.v1'

function storage(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage
  } catch {
    return undefined
  }
}

const oneOf = <T extends string>(v: unknown, values: readonly T[], fallback: T): T => (values.includes(v as T) ? (v as T) : fallback)
const volume = (v: unknown, fallback: number) => (typeof v === 'number' && v >= 0 && v <= 1 ? v : fallback)
const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback)

export function loadSettings(store: Storage | undefined = storage()): Settings {
  let raw: Record<string, unknown>
  try {
    raw = JSON.parse(store?.getItem(KEY) ?? '{}') ?? {}
  } catch {
    raw = {}
  }
  const d = DEFAULT_SETTINGS
  return {
    theme: oneOf(raw.theme, ['auto', 'light', 'dark'] as const, d.theme),
    motion: oneOf(raw.motion, ['auto', 'reduced', 'full'] as const, d.motion),
    avatar3d: bool(raw.avatar3d, d.avatar3d),
    music: bool(raw.music, d.music),
    musicVolume: volume(raw.musicVolume, d.musicVolume),
    sfx: bool(raw.sfx, d.sfx),
    sfxVolume: volume(raw.sfxVolume, d.sfxVolume),
  }
}

/** Renvoie `false` si l'enregistrement est impossible (navigation privée…). */
export function saveSettings(settings: Settings, store: Storage | undefined = storage()): boolean {
  try {
    if (!store) return false
    store.setItem(KEY, JSON.stringify(settings))
    return true
  } catch {
    return false
  }
}

/** Applique thème et animations à la page (attributs lus par les styles globaux). */
export function applySettings(settings: Settings, root: HTMLElement = document.documentElement): void {
  if (settings.theme === 'auto') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', settings.theme)
  if (settings.motion === 'auto') root.removeAttribute('data-motion')
  else root.setAttribute('data-motion', settings.motion)
}

/** Animations réduites, d'après les réglages ou le système. */
export function prefersReducedMotion(settings: Settings): boolean {
  if (settings.motion !== 'auto') return settings.motion === 'reduced'
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
}
