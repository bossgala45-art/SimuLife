/**
 * Catalogue du dossier de vie.
 *
 * L'ordre des catégories est l'ordre du parcours. Une condition ne peut viser
 * qu'une question placée avant elle (vérifié par `createQuestionnaire`).
 * Objectif : 500 questions. Le nombre réel est `CATALOG.length`.
 */
import type { CategoryId, Question } from '../types.ts'
import { AMBITIONS } from './ambitions.ts'
import { CHILDHOOD } from './childhood.ts'
import { DECISIONS } from './decisions.ts'
import { ECONOMY } from './economy.ts'
import { FAMILY } from './family.ts'
import { HEALTH } from './health.ts'
import { IDENTITY } from './identity.ts'
import { LEISURE } from './leisure.ts'
import { MILESTONES } from './milestones.ts'
import { PERSONALITY } from './personality.ts'
import { RELATIONSHIPS } from './relationships.ts'
import { SCHOOL } from './school.ts'

export const CATALOG_TARGET = 500

export const CATEGORIES: { id: CategoryId; label: string }[] = [
  { id: 'identity', label: 'Identité et naissance' },
  { id: 'family', label: 'Famille et environnement' },
  { id: 'childhood', label: 'Enfance et souvenirs' },
  { id: 'school', label: 'Scolarité' },
  { id: 'relationships', label: 'Amitiés et relations' },
  { id: 'personality', label: 'Personnalité et habitudes' },
  { id: 'health', label: 'Santé et développement' },
  { id: 'leisure', label: 'Sport et loisirs' },
  { id: 'economy', label: 'Situation économique' },
  { id: 'milestones', label: 'Événements marquants' },
  { id: 'decisions', label: 'Décisions et regrets' },
  { id: 'ambitions', label: 'Ambitions' },
]

export const CATALOG: readonly Question[] = [
  ...IDENTITY,
  ...FAMILY,
  ...CHILDHOOD,
  ...SCHOOL,
  ...RELATIONSHIPS,
  ...PERSONALITY,
  ...HEALTH,
  ...LEISURE,
  ...ECONOMY,
  ...MILESTONES,
  ...DECISIONS,
  ...AMBITIONS,
]
