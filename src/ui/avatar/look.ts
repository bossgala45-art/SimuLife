/**
 * Apparence de l'avatar, entièrement dérivée de l'état du moteur :
 * humeur → expression, sommeil → paupières, fatigue → posture,
 * maladie → teint, âge → cheveux gris, emploi → couleur de la tenue.
 * Les traits fixes (peau, cheveux) sont tirés de la graine : même vie, même visage.
 */
import { findCareer, hashSeed, type SimulationState } from '../../engine/index.ts'
import { ageAt } from '../../engine/time.ts'

export type Expression = 'happy' | 'neutral' | 'sad'

export interface AvatarLook {
  skin: string
  hair: string
  outfit: string
  expression: Expression
  /** Ouverture des yeux (0,25 = presque fermés). */
  eyeOpen: number
  /** Tête et épaules qui tombent avec la fatigue (0 à 1). */
  droop: number
  /** Vitesse du mouvement de respiration (0 à 1). */
  energy: number
  sick: boolean
  grey: boolean
  alive: boolean
  /** Description pour les lecteurs d'écran. */
  label: string
}

const SKINS = ['#f6d2b8', '#e8b48f', '#c98e64', '#a86b45', '#7d4b2e', '#5a3420']
const HAIRS = ['#2b1b12', '#4a2e1a', '#7a4b26', '#c08a3e', '#1d1d24']
const GREY_HAIR = '#b9b9c2'

/** Couleur de tenue selon le secteur d'activité. */
const OUTFITS: Record<string, string> = {
  commerce: '#2bb3a3',
  logistique: '#5f7d95',
  restauration: '#e0793a',
  bâtiment: '#e0b43a',
  administration: '#6a7ee0',
  gestion: '#4f6bd1',
  numérique: '#7c5cff',
  santé: '#3a9be0',
  enseignement: '#3fae63',
  création: '#d4559a',
}
const STUDENT_OUTFIT = '#5b5fd6'
const IDLE_OUTFIT = '#8a8fa8'

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

export function avatarLook(state: SimulationState): AvatarLook {
  const c = state.character
  const n = c.needs
  const age = ageAt(c.birthDate, state.clock)
  const job = state.career.job ? findCareer(state.career.job.career) : undefined
  const expression: Expression = n.mood >= 60 ? 'happy' : n.mood >= 35 ? 'neutral' : 'sad'
  const sick = c.statuses.includes('sick')
  const grey = age >= 55

  const feelings = [
    expression === 'happy' ? 'de bonne humeur' : expression === 'sad' ? 'morose' : 'd’humeur égale',
    n.sleep >= 60 && 'qui a sommeil',
    n.fatigue >= 60 && 'fatigué·e',
    sick && 'malade',
  ].filter(Boolean)

  return {
    skin: SKINS[hashSeed(`${state.seed}:peau`) % SKINS.length],
    hair: grey ? GREY_HAIR : HAIRS[hashSeed(`${state.seed}:cheveux`) % HAIRS.length],
    outfit: job ? (OUTFITS[job.sector] ?? IDLE_OUTFIT) : state.education.enrollment ? STUDENT_OUTFIT : IDLE_OUTFIT,
    expression,
    eyeOpen: clamp(1 - Math.max(0, n.sleep - 50) / 60, 0.25, 1),
    droop: clamp(n.fatigue / 100, 0, 1),
    energy: clamp(1 - n.fatigue / 100, 0, 1),
    sick,
    grey,
    alive: c.alive,
    label: c.alive ? `${c.name}, ${age} ans, ${feelings.join(', ')}` : `${c.name}, décédé·e`,
  }
}

/** Teint légèrement verdâtre en cas de maladie. */
export function skinTone(look: AvatarLook): string {
  return look.sick ? '#c9d2a4' : look.skin
}
