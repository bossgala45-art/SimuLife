/** API publique du dossier de vie (TypeScript pur, sans dépendance à l'interface). */
import { CATALOG } from './catalog/index.ts'
import { createQuestionnaire } from './questionnaire.ts'

export { CATALOG, CATALOG_TARGET, CATEGORIES } from './catalog/index.ts'
export { checkCoherence, type CoherenceIssue } from './coherence.ts'
export { formatFuzzyDate, MAX_YEAR, MIN_YEAR, monthName } from './dates.ts'
export { DossierError } from './errors.ts'
export { buildProfile, REASON_LABELS, type LifeProfile, type ProfileFact } from './profile.ts'
export {
  activeAnswer,
  answerQuestion,
  clearAnswer,
  configure,
  emptyDossier,
  isConfigured,
  MIN_START_AGE,
  nextQuestion,
  progress,
  validateAnswer,
  visibleQuestions,
  type Questionnaire,
} from './questionnaire.ts'
export { parseDossier, serializeDossier } from './serialization.ts'
export { buildTimeline, type TimelineEntry } from './timeline.ts'
export type * from './types.ts'

/** Questionnaire officiel (catalogue vérifié au chargement). */
export const QUESTIONNAIRE = createQuestionnaire(CATALOG)
