import { useId, useState } from 'react'
import type { AnswerValue, Question } from '../../dossier/index.ts'
import FuzzyDateInput from './FuzzyDateInput.tsx'

type Props = {
  question: Question
  initial?: AnswerValue
  /** Réponse en cours de saisie, ou `null` si elle est incomplète. */
  onDraft: (value: AnswerValue | null) => void
}

/** Champ de saisie adapté au type de question. Remonté (`key`) à chaque changement de question. */
export default function AnswerInput({ question, initial, onDraft }: Props) {
  const id = useId()
  const [chosen, setChosen] = useState<string[]>(
    initial?.kind === 'choices' ? initial.options : initial?.kind === 'choice' ? [initial.option] : [],
  )

  switch (question.type) {
    case 'text': {
      const props = {
        'aria-label': 'Ta réponse',
        defaultValue: initial?.kind === 'text' ? initial.text : '',
        maxLength: question.maxLength,
        onChange: (e: { target: { value: string } }) =>
          onDraft(e.target.value.trim() ? { kind: 'text', text: e.target.value } : null),
      }
      return question.maxLength > 120 ? <textarea className="answer-text" rows={4} {...props} /> : <input className="answer-text" {...props} />
    }

    case 'number':
      return (
        <label className="field">
          <span>{question.unit ? `Nombre (${question.unit})` : 'Nombre'}</span>
          <input
            inputMode="numeric"
            defaultValue={initial?.kind === 'number' ? String(initial.value) : ''}
            onChange={(e) => {
              const v = e.target.value.trim()
              onDraft(/^-?\d+$/.test(v) ? { kind: 'number', value: Number(v) } : null)
            }}
          />
        </label>
      )

    case 'date':
      return (
        <FuzzyDateInput
          allowAge
          initial={initial?.kind === 'date' ? initial.date : undefined}
          onChange={(date) => onDraft(date ? { kind: 'date', date } : null)}
        />
      )

    case 'single':
      return (
        <div className="choices" role="radiogroup" aria-label="Choix">
          {question.options.map((o) => (
            <label key={o.id} className={chosen[0] === o.id ? 'choice choice--on' : 'choice'}>
              <input
                type="radio"
                name={`${id}-choice`}
                checked={chosen[0] === o.id}
                onChange={() => {
                  setChosen([o.id])
                  onDraft({ kind: 'choice', option: o.id })
                }}
              />
              {o.label}
            </label>
          ))}
        </div>
      )

    case 'multi': {
      const toggle = (optionId: string) => {
        const option = question.options.find((o) => o.id === optionId)!
        let next = chosen.includes(optionId) ? chosen.filter((c) => c !== optionId) : [...chosen, optionId]
        // Une option exclusive (« Aucun ») efface les autres, et inversement.
        if (!chosen.includes(optionId)) {
          next = option.exclusive ? [optionId] : next.filter((c) => !question.options.find((o) => o.id === c)?.exclusive)
        }
        setChosen(next)
        onDraft(next.length > 0 ? { kind: 'choices', options: next } : null)
      }
      const full = question.maxChoices !== undefined && chosen.length >= question.maxChoices
      return (
        <div className="choices" role="group" aria-label="Choix multiples">
          {question.maxChoices && <p className="hint">Jusqu’à {question.maxChoices} choix.</p>}
          {question.options.map((o) => {
            const on = chosen.includes(o.id)
            return (
              <label key={o.id} className={on ? 'choice choice--on' : 'choice'}>
                <input type="checkbox" checked={on} disabled={!on && full && !o.exclusive} onChange={() => toggle(o.id)} />
                {o.label}
              </label>
            )
          })}
        </div>
      )
    }
  }
}
