import { activeAnswer, CATEGORIES, QUESTIONNAIRE, visibleQuestions, type CategoryId, type Dossier } from '../../dossier/index.ts'
import { formatAnswer } from './format.ts'

type Props = {
  dossier: Dossier
  category: CategoryId
  onEdit: (questionId: string) => void
  onBack: () => void
}

/** Récapitulatif d'une catégorie : chaque réponse peut être modifiée. */
export default function ReviewView({ dossier, category, onEdit, onBack }: Props) {
  const label = CATEGORIES.find((c) => c.id === category)!.label
  const questions = visibleQuestions(QUESTIONNAIRE, dossier, category)

  return (
    <main className="dossier">
      <header className="dossier__bar">
        <button type="button" className="link" onClick={onBack}>
          ‹ Dossier
        </button>
      </header>
      <h1 className="dossier__title">{label}</h1>
      <ul className="review">
        {questions.map((q) => {
          const value = activeAnswer(QUESTIONNAIRE, dossier, q.id)?.value
          return (
            <li key={q.id}>
              <button type="button" className="review__item" onClick={() => onEdit(q.id)}>
                <span className="review__prompt">{q.prompt}</span>
                <span className={value ? 'review__answer' : 'review__answer review__answer--empty'}>{formatAnswer(q, value)}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </main>
  )
}
