import { beforeEach, describe, expect, it } from 'vitest'
import { applySettings, DEFAULT_SETTINGS, loadSettings, prefersReducedMotion, saveSettings } from './settings.ts'

beforeEach(() => localStorage.clear())

describe('réglages', () => {
  it('valeurs par défaut sans sauvegarde : pas de musique imposée', () => {
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS)
    expect(DEFAULT_SETTINGS.music).toBe(false)
  })

  it('enregistre et relit les réglages', () => {
    const next = { ...DEFAULT_SETTINGS, theme: 'light' as const, music: true, musicVolume: 0.8 }
    expect(saveSettings(next)).toBe(true)
    expect(loadSettings()).toEqual(next)
  })

  it('lecture tolérante : valeurs invalides remplacées, JSON cassé ignoré', () => {
    localStorage.setItem('simulife.settings.v1', JSON.stringify({ theme: 'rose', musicVolume: 7, sfx: 'oui', motion: 'full' }))
    expect(loadSettings()).toEqual({ ...DEFAULT_SETTINGS, motion: 'full' })
    localStorage.setItem('simulife.settings.v1', '{pas du json')
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS)
  })

  it('signale un enregistrement impossible (stockage plein ou interdit)', () => {
    const broken = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
    } as unknown as Storage
    expect(saveSettings(DEFAULT_SETTINGS, broken)).toBe(false)
  })

  it('applique le thème et les animations sur la racine du document', () => {
    const root = document.createElement('html')
    applySettings({ ...DEFAULT_SETTINGS, theme: 'dark', motion: 'reduced' }, root)
    expect(root.dataset.theme).toBe('dark')
    expect(root.dataset.motion).toBe('reduced')
    applySettings(DEFAULT_SETTINGS, root)
    expect(root.hasAttribute('data-theme')).toBe(false)
    expect(root.hasAttribute('data-motion')).toBe(false)
  })

  it('animations réduites : réglage explicite prioritaire sur le système', () => {
    expect(prefersReducedMotion({ ...DEFAULT_SETTINGS, motion: 'reduced' })).toBe(true)
    expect(prefersReducedMotion({ ...DEFAULT_SETTINGS, motion: 'full' })).toBe(false)
  })
})
