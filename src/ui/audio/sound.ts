/**
 * Musique et effets sonores, entièrement synthétisés (Web Audio API) :
 * aucun fichier audio, donc aucune question de licence.
 *
 * Sur iPhone, le son ne peut démarrer qu'après un geste de l'utilisateur :
 * `unlock()` est appelé au premier toucher. Sans Web Audio, tout reste muet sans erreur.
 */

export type SoundName = 'tap' | 'success' | 'warning' | 'money' | 'page' | 'sad'

export interface SoundSettings {
  music: boolean
  musicVolume: number
  sfx: boolean
  sfxVolume: number
}

type Note = { freq: number; at: number; dur: number; type?: OscillatorType; gain?: number }

/** Effets : courtes suites de notes. */
const EFFECTS: Record<SoundName, Note[]> = {
  tap: [{ freq: 660, at: 0, dur: 0.05, type: 'triangle', gain: 0.25 }],
  page: [
    { freq: 520, at: 0, dur: 0.06, type: 'sine', gain: 0.2 },
    { freq: 780, at: 0.05, dur: 0.08, type: 'sine', gain: 0.15 },
  ],
  success: [
    { freq: 523.25, at: 0, dur: 0.18, type: 'triangle' },
    { freq: 659.25, at: 0.12, dur: 0.18, type: 'triangle' },
    { freq: 783.99, at: 0.24, dur: 0.32, type: 'triangle' },
  ],
  money: [
    { freq: 987.77, at: 0, dur: 0.08, type: 'square', gain: 0.12 },
    { freq: 1318.51, at: 0.08, dur: 0.2, type: 'square', gain: 0.1 },
  ],
  warning: [
    { freq: 392, at: 0, dur: 0.16, type: 'sawtooth', gain: 0.12 },
    { freq: 311.13, at: 0.16, dur: 0.24, type: 'sawtooth', gain: 0.12 },
  ],
  sad: [
    { freq: 329.63, at: 0, dur: 0.5, type: 'sine', gain: 0.3 },
    { freq: 261.63, at: 0.4, dur: 0.8, type: 'sine', gain: 0.3 },
  ],
}

/** Musique d'ambiance : accords lents (do maj7, la m7, fa maj7, sol 6) et notes pentatoniques. */
const CHORDS = [
  [130.81, 164.81, 196.0, 246.94],
  [110.0, 130.81, 164.81, 196.0],
  [87.31, 110.0, 130.81, 164.81],
  [98.0, 123.47, 146.83, 164.81],
]
const MELODY = [523.25, 587.33, 659.25, 783.99, 880.0]
export const BAR_SECONDS = 4

type AudioFactory = () => AudioContext | null

const defaultFactory: AudioFactory = () => {
  const Ctor = (globalThis as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ??
    (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  return Ctor ? new Ctor() : null
}

export class SoundEngine {
  private ctx: AudioContext | null = null
  private sfxGain: GainNode | null = null
  private musicGain: GainNode | null = null
  private musicTimer: ReturnType<typeof setInterval> | null = null
  private bar = 0
  private settings: SoundSettings = { music: false, musicVolume: 0.35, sfx: true, sfxVolume: 0.5 }
  private readonly factory: AudioFactory

  constructor(factory: AudioFactory = defaultFactory) {
    this.factory = factory
  }

  /** Vrai si l'audio a pu être initialisé. */
  get available(): boolean {
    return this.ctx !== null
  }

  get musicPlaying(): boolean {
    return this.musicTimer !== null
  }

  configure(settings: SoundSettings): void {
    this.settings = { ...settings }
    if (this.sfxGain) this.sfxGain.gain.value = settings.sfxVolume
    if (this.musicGain) this.musicGain.gain.value = settings.musicVolume * 0.4
    if (!this.ctx) return
    if (settings.music) this.startMusic()
    else this.stopMusic()
  }

  /** À appeler lors d'un geste de l'utilisateur (exigence de Safari sur iPhone). */
  unlock(): void {
    if (!this.ctx) {
      try {
        this.ctx = this.factory()
      } catch {
        this.ctx = null
      }
      if (!this.ctx) return
      this.sfxGain = this.ctx.createGain()
      this.sfxGain.connect(this.ctx.destination)
      this.musicGain = this.ctx.createGain()
      this.musicGain.connect(this.ctx.destination)
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => {})
    this.configure(this.settings)
  }

  play(name: SoundName): void {
    if (!this.ctx || !this.sfxGain || !this.settings.sfx || this.settings.sfxVolume === 0) return
    for (const note of EFFECTS[name]) this.tone(note, this.sfxGain)
  }

  dispose(): void {
    this.stopMusic()
    void this.ctx?.close().catch(() => {})
    this.ctx = null
  }

  private tone(note: Note, out: GainNode, attack = 0.01): void {
    const ctx = this.ctx!
    const t = ctx.currentTime + note.at
    const osc = ctx.createOscillator()
    const env = ctx.createGain()
    osc.type = note.type ?? 'sine'
    osc.frequency.value = note.freq
    env.gain.setValueAtTime(0.0001, t)
    env.gain.linearRampToValueAtTime(note.gain ?? 0.3, t + attack)
    env.gain.linearRampToValueAtTime(0.0001, t + note.dur)
    osc.connect(env)
    env.connect(out)
    osc.start(t)
    osc.stop(t + note.dur + 0.05)
  }

  private startMusic(): void {
    if (this.musicTimer || !this.ctx || this.settings.musicVolume === 0) return
    this.playBar()
    this.musicTimer = setInterval(() => this.playBar(), BAR_SECONDS * 1000)
  }

  private stopMusic(): void {
    if (this.musicTimer) clearInterval(this.musicTimer)
    this.musicTimer = null
  }

  private playBar(): void {
    if (!this.ctx || !this.musicGain) return
    const chord = CHORDS[this.bar % CHORDS.length]
    for (const freq of chord) this.tone({ freq, at: 0, dur: BAR_SECONDS + 0.5, type: 'sine', gain: 0.12 }, this.musicGain, 1.2)
    // Deux notes de mélodie par mesure, choisies dans la gamme pentatonique.
    for (const offset of [1, 2.5]) {
      const freq = MELODY[(this.bar * 3 + offset * 2) % MELODY.length | 0]
      this.tone({ freq, at: offset, dur: 0.9, type: 'triangle', gain: 0.06 }, this.musicGain, 0.02)
    }
    this.bar++
  }
}

/** Instance partagée par l'application. */
export const sound = new SoundEngine()
