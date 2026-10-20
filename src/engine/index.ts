/** API publique du moteur de simulation (TypeScript pur, sans dépendance à l'interface). */
export { ACTIONS, ACTION_IDS, validateAction, type ActionDefinition, type ValidationResult } from './actions.ts'
export { SimulationError, type SimulationErrorCode } from './errors.ts'
export { NEEDS, NEED_IDS, isCritical } from './needs.ts'
export { hashSeed, nextRandom } from './rng.ts'
export { parseState, serializeState } from './serialization.ts'
export { advance, createSimulation, performAction, type NewLifeOptions, type StepResult } from './simulation.ts'
export { ageAt, dayNumber, formatDate, formatDateTime, formatDuration, formatTime, toCalendar, type TimeUnit } from './time.ts'
export type * from './types.ts'
