import { afterEach, describe, expect, it, vi } from 'vitest'
import { BAR_SECONDS, SoundEngine } from './sound.ts'

/** Faux AudioContext : compte les oscillateurs démarrés. */
function fakeContext() {
  const started: number[] = []
  const param = () => ({ value: 0, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() })
  const ctx = {
    state: 'suspended',
    currentTime: 0,
    destination: {},
    resume: vi.fn(() => Promise.resolve()),
    close: vi.fn(() => Promise.resolve()),
    createGain: () => ({ gain: param(), connect: vi.fn() }),
    createOscillator: () => ({
      type: 'sine',
      frequency: param(),
      connect: vi.fn(),
      start: (t: number) => started.push(t),
      stop: vi.fn(),
    }),
  }
  return { ctx: ctx as unknown as AudioContext, started, raw: ctx }
}

const SETTINGS = { music: false, musicVolume: 0.35, sfx: true, sfxVolume: 0.5 }

afterEach(() => vi.useRealTimers())

describe('son synthétisé', () => {
  it('reste muet tant que l’utilisateur n’a pas touché l’écran (exigence de Safari)', () => {
    const fake = fakeContext()
    const engine = new SoundEngine(() => fake.ctx)
    engine.configure(SETTINGS)
    engine.play('success')
    expect(engine.available).toBe(false)
    expect(fake.started).toHaveLength(0)

    engine.unlock()
    expect(engine.available).toBe(true)
    expect(fake.raw.resume).toHaveBeenCalled()
    engine.play('success')
    expect(fake.started).toHaveLength(3)
  })

  it('respecte le réglage des effets et le volume nul', () => {
    const fake = fakeContext()
    const engine = new SoundEngine(() => fake.ctx)
    engine.unlock()
    engine.configure({ ...SETTINGS, sfx: false })
    engine.play('tap')
    engine.configure({ ...SETTINGS, sfxVolume: 0 })
    engine.play('tap')
    expect(fake.started).toHaveLength(0)
  })

  it('musique : démarre, joue une mesure toutes les quatre secondes, s’arrête', () => {
    vi.useFakeTimers()
    const fake = fakeContext()
    const engine = new SoundEngine(() => fake.ctx)
    engine.unlock()
    engine.configure({ ...SETTINGS, music: true })
    expect(engine.musicPlaying).toBe(true)
    const firstBar = fake.started.length
    expect(firstBar).toBe(6) // 4 notes d'accord + 2 notes de mélodie
    vi.advanceTimersByTime(BAR_SECONDS * 1000)
    expect(fake.started.length).toBe(12)
    engine.configure(SETTINGS)
    expect(engine.musicPlaying).toBe(false)
    vi.advanceTimersByTime(BAR_SECONDS * 3000)
    expect(fake.started.length).toBe(12)
  })

  it('sans Web Audio : aucune erreur, simplement silencieux', () => {
    const engine = new SoundEngine(() => null)
    engine.unlock()
    engine.configure({ ...SETTINGS, music: true })
    engine.play('money')
    expect(engine.available).toBe(false)
    expect(engine.musicPlaying).toBe(false)
    const throwing = new SoundEngine(() => {
      throw new Error('NotAllowedError')
    })
    expect(() => throwing.unlock()).not.toThrow()
  })
})
