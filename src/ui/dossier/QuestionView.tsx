import { useState } from 'react'
import { answerQuestion, CATEGORIES, QUESTIONNAIRE, type AnswerValue, type CoherenceIssue, type Dossier, type Question } from '../../dossier/index.ts'
import AnswerInput from './AnswerInput.tsx'

type Props = {
  dossier: Dossier
  question: Question
  /** Position dans la catégorie (1-indexée) et nombre de questions visibles. */
  position: { index: number; total: number }
  issues: CoherenceIssue[]
  onAnswer: (dossier: Dossier) => void
  onPrevious?: () => void
  onSkip: () => void
  onClose: () => void
}

export default function QuestionView({ dossier, question, position, issues, onAnswer, onPrevious, onSkip, onClose }: Props) {
  const current = dossier.answers[question.id]?.value
  const [draft, setDraft] = useState<AnswerValue | null>(current && current.kind !== 'unknown' && current.kind !== 'declined' ? current : null)
  const [error, setError] = useState<string | null>(null)
  const category = CATEGORIES.find((c) => c.id === question.category)!

  function submit(value: AnswerValue | null) {
    if (!value) {
      setError('Complète ta réponse, ou choisis « Je ne sais pas ».')
      return
    }
    const r = answerQuestion(QUESTIONNAIRE, dossier, question.id, value)
    if (r.ok) onAnswer(r.value)
    else setError(r.error)
  }

  return (
    <main className="dossier">
      <header className="dossier__bar">
        <button type="button" className="link" onClick={onClose}>
          ‹ {category.label}
        </button>
        <span className="dossier__count">
          {position.index} / {position.total}
        </span>
      </header>

      <form
        className="question"
        onSubmit={(e) => {
          e.preventDefault()
          submit(draft)
        }}
      >
        <h1 className="question__prompt">{question.prompt}</h1>
        {question.help && <p className="question__help">{question.help}</p>}
        {question.sensitive && (
          <p className="question__private">Question personnelle : tu peux choisir de ne pas répondre.</p>
        )}

        <AnswerInput
          key={question.id}
          question={question}
          initial={current}
          onDraft={(v) => {
            setDraft(v)
            setError(null)
          }}
        />

        {error && (
          <p className="question__error" role="alert">
            {error}
          </p>
        )}
        {issues.length > 0 && (
          <ul className="issues" aria-label="Cohérence">
            {issues.map((i) => (
              <li key={i.code} className={`issue issue--${i.severity}`}>
                {i.message}
              </li>
            ))}
          </ul>
        )}

        <button type="submit" className="btn btn--primary">
          Valider
        </button>
        <div className="question__alt">
          <button type="button" className="btn btn--secondary" onClick={() => submit({ kind: 'unknown' })}>
            Je ne sais pas
          </button>
          <button type="button" className="btn btn--secondary" onClick={() => submit({ kind: 'declined' })}>
            Je préfère ne pas répondre
          </button>
        </div>
        <div className="question__nav">
          <button type="button" className="link" onClick={onPrevious} disabled={!onPrevious}>
            Précédente
          </button>
          <button type="button" className="link" onClick={onSkip}>
            {current ? 'Continuer' : 'Passer pour l’instant'}
          </button>
        </div>
      </form>
    </main>
  )
}
