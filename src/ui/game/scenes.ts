/**
 * Scènes plein écran pour les moments importants, déclenchées par de vraies
 * entrées du journal (diplôme, embauche, anniversaire, deuil…).
 */
import type { LogEntry } from '../../engine/index.ts'
import type { SoundName } from '../audio/sound.ts'

export type SceneKind = 'diploma' | 'hired' | 'birthday' | 'raise' | 'layoff' | 'loss' | 'death' | 'branch' | 'start'

export interface Scene {
  seq: number
  kind: SceneKind
  title: string
  message: string
  tone: 'joy' | 'sorrow' | 'calm'
  sound: SoundName
}

const SCENES: Record<string, Omit<Scene, 'seq' | 'message'>> = {
  diploma: { kind: 'diploma', title: 'Diplômé·e !', tone: 'joy', sound: 'success' },
  hired: { kind: 'hired', title: 'Un nouveau départ', tone: 'joy', sound: 'success' },
  birthday: { kind: 'birthday', title: 'Joyeux anniversaire', tone: 'joy', sound: 'success' },
  raise: { kind: 'raise', title: 'Ton travail est reconnu', tone: 'joy', sound: 'money' },
  layoff: { kind: 'layoff', title: 'Un coup dur', tone: 'sorrow', sound: 'sad' },
  npc_death: { kind: 'loss', title: 'Un deuil', tone: 'sorrow', sound: 'sad' },
  death: { kind: 'death', title: 'Fin d’une vie', tone: 'sorrow', sound: 'sad' },
  divergence: { kind: 'branch', title: 'Une autre vie commence', tone: 'calm', sound: 'page' },
  life_started: { kind: 'start', title: 'Une vie commence', tone: 'calm', sound: 'page' },
}

/** Scènes à jouer pour de nouvelles entrées du journal, dans l'ordre chronologique. */
export function scenesFor(entries: LogEntry[]): Scene[] {
  return entries.flatMap((e) => (SCENES[e.code] ? [{ ...SCENES[e.code], seq: e.seq, message: e.message }] : []))
}
