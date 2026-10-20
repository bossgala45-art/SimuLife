/**
 * Types de l'état de simulation.
 *
 * L'état est un objet JSON pur (aucune fonction, aucune classe, aucune Date) :
 * il peut être cloné, sérialisé et comparé tel quel.
 */

export type NeedId = 'sleep' | 'hunger' | 'hygiene' | 'fatigue' | 'stress' | 'mood'
export type Needs = Record<NeedId, number>

export type AttributeId = 'health' | 'fitness' | 'intelligence' | 'sociability'
export type Attributes = Record<AttributeId, number>

export type StatusId = 'injured' | 'sick'

export type ActionId =
  | 'sleep'
  | 'cook_meal'
  | 'food_aid'
  | 'restaurant'
  | 'shower'
  | 'work'
  | 'sport'
  | 'study'
  | 'friends'
  | 'relax'
  | 'wait'
  // Relations
  | 'call'
  | 'visit'
  | 'gift'
  | 'help'
  | 'ask_loan'
  // Compétences, études, métiers
  | 'practice'
  | 'enroll'
  | 'drop_out'
  | 'apply_job'
  | 'quit_job'
  // Argent
  | 'deposit_savings'
  | 'withdraw_savings'
  | 'bank_loan'

/** Paramètres d'une action (cible, métier, formation, compétence, montant). */
export interface ActionParams {
  personId?: string
  career?: string
  program?: string
  skill?: SkillId
  amount?: number
}

export interface CalendarDate {
  year: number
  /** 1 = janvier … 12 = décembre */
  month: number
  day: number
}

export interface CalendarDateTime extends CalendarDate {
  hour: number
  minute: number
}

export interface Character {
  name: string
  birthDate: CalendarDate
  /** Euros (entiers). Peut devenir négatif uniquement à cause d'une dépense imposée (loyer). */
  money: number
  needs: Needs
  attributes: Attributes
  statuses: StatusId[]
  alive: boolean
  /** Numéro du dernier jour travaillé (voir `dayNumber`), pour limiter à un service par jour. */
  lastWorkDay: number | null
}

export type GameEvent =
  | { type: 'rent_due'; amount: number }
  | { type: 'birthday' }
  | { type: 'injury_recovered' }
  | { type: 'work_bonus'; amount: number }
  | { type: 'sport_injury' }
  | { type: 'friend_call' }
  | { type: 'payday' }
  | { type: 'bills_due' }
  | { type: 'debt_payment'; debtId: number }
  | { type: 'job_application_result'; career: string; probability: number }
  | { type: 'exam'; program: string }
  | { type: 'npc_recovered'; personId: string }
  | { type: 'illness_recovered' }

export type GameEventType = GameEvent['type']

export interface ScheduledEvent {
  id: number
  /** Instant de déclenchement, en minutes de simulation (voir `time.ts`). */
  at: number
  event: GameEvent
}

export type LogKind = 'action' | 'event' | 'warning' | 'day' | 'system' | 'social' | 'money'

export interface LogEntry {
  seq: number
  /** Instant, en minutes de simulation. */
  at: number
  kind: LogKind
  code: string
  message: string
  data?: Record<string, string | number | boolean>
}

// ——— Personnages non joueurs et relations ———

export type PersonRole = 'parent' | 'sibling' | 'friend' | 'colleague'

export interface Person {
  id: string
  name: string
  role: PersonRole
  /** Lien affiché : « Mère », « Frère », « Ami·e »… */
  relation: string
  birthDate: CalendarDate
  alive: boolean
  /** Identifiant de métier du catalogue, ou 'student' | 'retired' | 'unemployed'. */
  occupation: string
  health: number
  /** Date de début de la maladie en cours, sinon `null`. */
  sickSince: number | null
  /** Habite loin : les visites ne sont possibles que le week-end et coûtent plus cher. */
  distant: boolean
  /** Disposition à aider financièrement (0 à 100). */
  generosity: number
}

export type MemoryKind =
  | 'help'
  | 'support'
  | 'absent_when_sick'
  | 'gift'
  | 'argument'
  | 'birthday_wished'
  | 'birthday_forgotten'
  | 'loan_granted'
  | 'loan_refused'
  | 'loan_repaid'
  | 'loan_unpaid'
  | 'diploma'
  | 'reconnected'

/** Souvenir relationnel : il pèse sur la relation tant qu'il est récent. */
export interface Memory {
  at: number
  kind: MemoryKind
  /** De −10 (blessant) à +10 (précieux). */
  weight: number
  text: string
}

export interface Relationship {
  closeness: number
  trust: number
  tension: number
  lastContact: number | null
  memories: Memory[]
}

// ——— Compétences, études, métiers ———

export type SkillId = 'cooking' | 'communication' | 'logic' | 'manual' | 'creativity' | 'organization'

export interface Enrollment {
  program: string
  since: number
  endsAt: number
  studyHours: number
}

export interface Education {
  diplomas: { id: string; at: number | null }[]
  enrollment: Enrollment | null
}

export interface Job {
  career: string
  since: number
  /** Salaire net mensuel (euros, approximatif). */
  salary: number
  /** Appréciation au travail (0 à 100). */
  performance: number
  /** Jours travaillés depuis la dernière paie. */
  daysWorked: number
}

export interface Career {
  job: Job | null
  /** Jours d'expérience par secteur. */
  experience: Record<string, number>
  /** Allocation chômage mensuelle et nombre de versements restants (règle simplifiée). */
  benefit: { amount: number; remaining: number } | null
}

// ——— Finances ———

export interface Debt {
  id: number
  /** 'bank' ou identifiant d'un proche. */
  lender: string
  remaining: number
  monthlyPayment: number
  /** Taux annuel (0 pour un proche). */
  annualRate: number
  missedPayments: number
}

export interface Transaction {
  at: number
  label: string
  amount: number
}

export interface Finances {
  savings: number
  /** Découvert autorisé (euros). */
  overdraftLimit: number
  /** Fractions d'euro d'intérêts et d'agios, reportées jusqu'à faire un euro entier. */
  interestCarry: number
  overdraftCarry: number
  debts: Debt[]
  nextDebtId: number
  /** Dernières opérations (les plus anciennes sont effacées). */
  ledger: Transaction[]
  month: { income: number; expenses: number }
  lastMonth: { income: number; expenses: number } | null
}

export interface SimulationState {
  version: 2
  /** Graine d'origine, telle que saisie. */
  seed: string
  /** État courant du générateur pseudo-aléatoire (entier 32 bits non signé). */
  rngState: number
  /** Horloge : minutes écoulées depuis le 1er janvier 1970 à 00:00 (calendrier grégorien, sans fuseau). */
  clock: number
  character: Character
  scheduled: ScheduledEvent[]
  nextEventId: number
  log: LogEntry[]
  nextLogSeq: number
  people: Person[]
  relationships: Record<string, Relationship>
  nextPersonId: number
  /** Expérience accumulée par compétence (le niveau s'en déduit). */
  skills: Record<SkillId, number>
  education: Education
  career: Career
  finances: Finances
  /** Imprévus : date jusqu'à laquelle chacun ne peut pas se reproduire. */
  cooldowns: Record<string, number>
}

export interface ValidationIssue {
  code: ValidationCode
  message: string
}

export type ValidationCode =
  | 'UNKNOWN_ACTION'
  | 'CHARACTER_DEAD'
  | 'INSUFFICIENT_MONEY'
  | 'NOT_SLEEPY'
  | 'NOT_HUNGRY'
  | 'TOO_HUNGRY'
  | 'ALREADY_CLEAN'
  | 'TOO_DIRTY'
  | 'TOO_TIRED'
  | 'TOO_SLEEPY'
  | 'INJURED'
  | 'CLOSED'
  | 'NOT_A_WORKDAY'
  | 'OUTSIDE_WORK_HOURS'
  | 'ALREADY_WORKED_TODAY'
  | 'SICK'
  | 'NO_JOB'
  | 'MISSING_PARAM'
  | 'UNKNOWN_PERSON'
  | 'PERSON_UNAVAILABLE'
  | 'NOT_NEEDED'
  | 'ALREADY_IN_DEBT'
  | 'UNKNOWN_CAREER'
  | 'REQUIREMENTS_NOT_MET'
  | 'ALREADY_APPLIED'
  | 'ALREADY_EMPLOYED'
  | 'UNKNOWN_PROGRAM'
  | 'ALREADY_ENROLLED'
  | 'NOT_ENROLLED'
  | 'ENROLLMENT_CLOSED'
  | 'UNKNOWN_SKILL'
  | 'INVALID_AMOUNT'
  | 'LOAN_LIMIT'
  | 'TOO_YOUNG'
