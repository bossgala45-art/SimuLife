import { useState } from 'react'
import { buildProfile, QUESTIONNAIRE, REASON_LABELS, type Dossier, type ProfileFact } from '../../dossier/index.ts'
import { createSimulation, SimulationError, type SimulationState } from '../../engine/index.ts'

type Props = {
  dossier: Dossier
  errorCount: number
  onStartLife: (state: SimulationState) => void
  onBack: () => void
}

function Facts({ facts }: { facts: ProfileFact[] }) {
  return (
    <dl className="facts">
      {facts.map((f) => (
        <div key={f.key}>
          <dt>{f.label}</dt>
          <dd>
            {f.display}
            {f.reason && <small>{REASON_LABELS[f.reason]}</small>}
          </dd>
        </div>
      ))}
    </dl>
  )
}

export default function ProfileView({ dossier, errorCount, onStartLife, onBack }: Props) {
  const [error, setError] = useState<string | null>(null)
  const profile = buildProfile(QUESTIONNAIRE, dossier)!
  const declared = profile.facts.filter((f) => f.origin === 'declared')
  const simulated = profile.facts.filter((f) => f.origin === 'simulated')

  function start() {
    try {
      onStartLife(
        createSimulation({
          seed: dossier.seed,
          name: profile.name,
          birthDate: profile.birthDate,
          start: { ...profile.startDate, hour: 7, minute: 0 },
          attributes: profile.attributes,
          ...profile.setup,
        }),
      )
    } catch (e) {
      if (e instanceof SimulationError) setError(e.detail)
      else throw e
    }
  }

  return (
    <main className="dossier">
      <header className="dossier__bar">
        <button type="button" className="link" onClick={onBack}>
          ‹ Dossier
        </button>
      </header>
      <h1 className="dossier__title">Profil de départ</h1>

      <section className="card" aria-labelledby="declared-title">
        <h2 id="declared-title">Faits déclarés</h2>
        {declared.length > 0 ? <Facts facts={declared} /> : <p className="hint">Aucun fait déclaré pour l’instant.</p>}
      </section>

      <section className="card card--simulated" aria-labelledby="simulated-title">
        <h2 id="simulated-title">Hypothèses simulées</h2>
        <p className="hint">Inventées pour compléter ton dossier. Elles ne remplacent jamais une réponse.</p>
        <Facts facts={simulated} />
      </section>

      {errorCount > 0 && (
        <p className="question__error">
          Ta chronologie contient {errorCount} incohérence{errorCount > 1 ? 's' : ''}. Tu peux les corriger avant de commencer.
        </p>
      )}
      {error && (
        <p className="question__error" role="alert">
          {error}
        </p>
      )}
      <button type="button" className="btn btn--primary" onClick={start}>
        Vivre cette vie à partir de {dossier.startAge} ans
      </button>
    </main>
  )
}
