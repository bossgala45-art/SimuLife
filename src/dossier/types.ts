/**
 * Types du dossier de vie.
 *
 * Le catalogue de questions est du code (données déclaratives) ; le dossier du
 * joueur est un objet JSON pur, sauvegardé localement.
 */

export type CategoryId =
  | 'identity'
  | 'family'
  | 'childhood'
  | 'school'
  | 'relationships'
  | 'personality'
  | 'health'
  | 'leisure'
  | 'economy'
  | 'milestones'
  | 'decisions'
  | 'ambitions'

export type QuestionId = string

export interface Option {
  id: string
  label: string
  /** Choix multiple : cette option exclut toutes les autres (« Aucun »). */
  exclusive?: boolean
}

/** Condition d'affichage d'une question, sous forme de données (testable, sérialisable). */
export type Condition =
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition }
  /** Question répondue par une vraie réponse (ni inconnue, ni refusée). */
  | { answered: QuestionId }
  /** Choix unique égal à l'une des options. */
  | { is: QuestionId; options: string[] }
  /** Choix multiple contenant au moins une des options. */
  | { includes: QuestionId; options: string[] }
  /** Nombre strictement supérieur à la valeur. */
  | { greaterThan: QuestionId; value: number }
  /** Âge de départ de la vie alternative au moins égal à la valeur. */
  | { startAgeAtLeast: number }

interface QuestionBase {
  id: QuestionId
  category: CategoryId
  prompt: string
  help?: string
  /** Question personnelle : une note rappelle qu'elle est facultative. */
  sensitive?: boolean
  condition?: Condition
}

export interface TextQuestion extends QuestionBase {
  type: 'text'
  maxLength: number
}

export interface SingleQuestion extends QuestionBase {
  type: 'single'
  options: Option[]
}

export interface MultiQuestion extends QuestionBase {
  type: 'multi'
  options: Option[]
  maxChoices?: number
}

export interface NumberQuestion extends QuestionBase {
  type: 'number'
  min: number
  max: number
  unit?: string
}

export interface DateQuestion extends QuestionBase {
  type: 'date'
  /** Entrée dans la chronologie personnelle. */
  timeline?: {
    label: string
    /** Question texte dont la réponse précise l'entrée (« Premier emploi — serveur »). */
    detailFrom?: QuestionId
  }
  /** Cette date ne peut pas précéder ces autres dates. */
  after?: QuestionId[]
  /** Âges plausibles ; en dehors, un avertissement est émis. */
  plausibleAge?: [number, number]
}

export type Question = TextQuestion | SingleQuestion | MultiQuestion | NumberQuestion | DateQuestion

/**
 * Date exacte ou approximative.
 * - calendar : année seule, mois et année, ou date complète ;
 * - age : « vers mes 7 ans ».
 * `approximate` élargit l'intervalle possible (« environ »).
 */
export type FuzzyDate =
  | { kind: 'calendar'; year: number; month?: number; day?: number; approximate: boolean }
  | { kind: 'age'; age: number; approximate: boolean }

export type AnswerValue =
  | { kind: 'text'; text: string }
  | { kind: 'choice'; option: string }
  | { kind: 'choices'; options: string[] }
  | { kind: 'number'; value: number }
  | { kind: 'date'; date: FuzzyDate }
  /** « Je ne sais pas » */
  | { kind: 'unknown' }
  /** « Je préfère ne pas répondre » */
  | { kind: 'declined' }

export interface AnswerRecord {
  value: AnswerValue
  /** Nombre de modifications après la première réponse. */
  revision: number
}

export interface Dossier {
  version: 1
  /** Graine des hypothèses simulées (valeurs inventées pour combler les réponses manquantes). */
  seed: string
  /** Date de naissance : l'année suffit. Indispensable pour la chronologie. */
  birth: Extract<FuzzyDate, { kind: 'calendar' }> | null
  /** Âge auquel commence la vie alternative. */
  startAge: number | null
  answers: Record<QuestionId, AnswerRecord>
}

/** Jour : nombre de jours depuis le 1er janvier 1970 (calendrier grégorien, sans fuseau). */
export type DayNumber = number

/** Intervalle de jours possibles (bornes incluses). */
export interface DayInterval {
  start: DayNumber
  end: DayNumber
}
