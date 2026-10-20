import { useState } from 'react'
import { configure, MIN_START_AGE, type Dossier, type FuzzyDate } from '../../dossier/index.ts'
import type { CalendarDate } from '../../engine/index.ts'
import FuzzyDateInput from './FuzzyDateInput.tsx'

type Props = {
  dossier: Dossier
  today: CalendarDate
  onSave: (dossier: Dossier) => void
  onCancel?: () => void
}

export default function SetupView({ dossier, today, onSave, onCancel }: Props) {
  const [birth, setBirth] = useState<FuzzyDate | null>(dossier.birth)
  const [startAge, setStartAge] = useState(String(dossier.startAge ?? MIN_START_AGE))
  const [error, setError] = useState<string | null>(null)

  function submit() {
    if (!birth) {
      setError('Indique au moins ton année de naissance.')
      return
    }
    const r = configure(dossier, { birth, startAge: Number(startAge) }, today)
    if (r.ok) onSave(r.value)
    else setError(r.error)
  }

  return (
    <main className="dossier">
      <h1 className="dossier__title">Ton point de départ</h1>
      <form
        className="question"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <fieldset className="fieldset">
          <legend>Date de naissance</legend>
          <p className="question__help">
            Elle sert à construire ta chronologie. L’année suffit ; tu peux cocher « environ ».
          </p>
          <FuzzyDateInput initial={dossier.birth ?? undefined} allowAge={false} onChange={setBirth} />
        </fieldset>

        <label className="field">
          <span>À quel âge commence ta vie alternative ?</span>
          <input inputMode="numeric" value={startAge} onChange={(e) => setStartAge(e.target.value)} />
          <small>
            Tu racontes ta vie jusqu’à cet âge ; ensuite, la simulation prend le relais. Minimum {MIN_START_AGE} ans pour
            l’instant.
          </small>
        </label>

        {error && (
          <p className="question__error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn--primary">
          Enregistrer
        </button>
        {onCancel && (
          <button type="button" className="btn btn--secondary" onClick={onCancel}>
            Annuler
          </button>
        )}
      </form>
    </main>
  )
}
