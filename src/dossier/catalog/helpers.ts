import type { CategoryId, Option, Question } from '../types.ts'

/** Question sans sa catégorie (ajoutée par `inCategory`). */
export type QuestionDraft = Question extends infer Q ? (Q extends Question ? Omit<Q, 'category'> : never) : never

export function inCategory(category: CategoryId, drafts: QuestionDraft[]): Question[] {
  return drafts.map((d) => ({ ...d, category }) as Question)
}

export const YES_NO: Option[] = [
  { id: 'yes', label: 'Oui' },
  { id: 'no', label: 'Non' },
]

/** Longueurs maximales des réponses libres. */
export const SHORT = 120
export const LONG = 300
