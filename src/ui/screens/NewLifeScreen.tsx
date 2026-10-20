import { useState, type FormEvent } from 'react'
import { createSimulation, SimulationError, type SimulationState } from '../../engine/index.ts'
import { randomSeed } from '../seed.ts'
import './NewLifeScreen.css'

type NewLifeScreenProps = {
  onCreate: (state: SimulationState) => void
  onCancel: () => void
}

export default function NewLifeScreen({ onCreate, onCancel }: NewLifeScreenProps) {
  const [name, setName] = useState('Alex')
  const [birth, setBirth] = useState('2000-03-15')
  const [seed, setSeed] = useState(randomSeed)
  const [error, setError] = useState<string | null>(null)

  function submit(e: FormEvent) {
    e.preventDefault()
    const [year, month, day] = birth.split('-').map(Number)
    try {
      onCreate(createSimulation({ seed, name, birthDate: { year, month, day } }))
    } catch (err) {
      if (err instanceof SimulationError) setError(err.detail)
      else throw err
    }
  }

  return (
    <main className="newlife">
      <h1 className="newlife__title">Nouvelle vie</h1>
      <form className="newlife__form" onSubmit={submit}>
        <label className="field">
          <span>Prénom</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoComplete="off" />
        </label>
        <label className="field">
          <span>Date de naissance</span>
          <input type="date" value={birth} onChange={(e) => setBirth(e.target.value)} required />
        </label>
        <div className="field">
          <label htmlFor="seed">Graine</label>
          <div className="field__row">
            <input
              id="seed"
              value={seed}
              onChange={(e) => setSeed(e.target.value)}
              maxLength={64}
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
            />
            <button type="button" className="btn btn--secondary btn--small" onClick={() => setSeed(randomSeed())}>
              Changer
            </button>
          </div>
          <small>La même graine et les mêmes choix donnent exactement la même vie.</small>
        </div>
        {error && (
          <p className="newlife__error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn--primary">
          Commencer
        </button>
        <button type="button" className="btn btn--secondary" onClick={onCancel}>
          Retour
        </button>
      </form>
    </main>
  )
}
