/** API publique du moteur de simulation (TypeScript pur, sans dépendance à l'interface). */
export { percent, type Outcome } from './actionKit.ts'
export {
  ACTIONS,
  ACTION_IDS,
  actionCost,
  actionOutcomes,
  validateAction,
  type ActionDefinition,
  type ValidationResult,
} from './actions.ts'
export { hireProbability, occupationLabel, pendingApplication, salaryOffer } from './careers.ts'
export {
  CAREERS,
  DIPLOMAS,
  findCareer,
  findDiploma,
  findProgram,
  PROGRAMS,
  SKILLS,
  type CareerDefinition,
  type ProgramDefinition,
} from './data/careers.ts'
export { APPROXIMATE_NOTE, ECONOMY, MONTHLY_BILLS } from './data/economy.ts'
export { enrollmentReasons, examProbability } from './education.ts'
export {
  cleanText,
  currentSession,
  isTopicId,
  topicOptions,
  TOPIC_IDS,
  untoldNews,
  type TalkContext,
  type TopicId,
  type TopicOption,
} from './dialogue.ts'
export { SimulationError, type SimulationErrorCode } from './errors.ts'
export { available, BANK_LOANS, bankLoanProbability, monthlyPayment } from './finances.ts'
export { createHistoryBase, extendHistory, HISTORY, historyCoverageEnd, livedEvents, validateHistory, type HistoricalEvent, type HistoryBase, type HistoryCategory } from './history.ts'
export { INCIDENTS } from './incidents.ts'
export { describe, interpretText, messageTopic, normalize, resolveTopic, TEXT_MAX_LENGTH, type Interpretation } from './intent.ts'
export { NEEDS, NEED_IDS, isCritical } from './needs.ts'
export type { Entourage } from './people.ts'
export { daysSinceContact, memoryScore } from './relationships.ts'
export { careerEligibility, diplomaLevel, LEVEL_LABELS } from './requirements.ts'
export { hashSeed, nextRandom } from './rng.ts'
export { parseState, serializeState } from './serialization.ts'
export { advance, createSimulation, performAction, type NewLifeOptions, type StepResult } from './simulation.ts'
export { levelOf, levelProgress, MAX_LEVEL } from './skills.ts'
export { ageAtMemory, markThreadRead, MESSAGE_MAX_LENGTH, setHome, STORY_RULES, unreadCount } from './story.ts'
export { argumentRisk, loanProbability } from './social.ts'
export { ageAt, dayNumber, formatDate, MINUTES_PER_DAY, formatDateTime, formatDuration, formatTime, toCalendar, type TimeUnit } from './time.ts'
export type * from './types.ts'
