import { useEffect, useState } from 'react'
import { decisionOptions, type DecisionOption } from '../../destiny/decisions.ts'
import type { Decision } from '../../destiny/types.ts'
import { formatDate } from '../../engine/index.ts'
import type { BranchSession, DestinyRepository } from '../../storage/destiny.ts'
import { errorText } from './download.ts'

type Props = {
  repo: DestinyRepository
  from: { snapshotId: string; branchName: string }
  onCreated: (session: BranchSession) => void
  onCancel: () => void
}

const GROUPS: { title: string; kinds: Decision['kind'][] }[] = [
  { title: 'Hasard', kinds: ['reroll'] },
  { title: 'Travail', kinds: ['career', 'quit_job'] },
  { title: 'Études', kinds: ['study'] },
  { title: 'Lieu de vie', kinds: ['move'] },
  { title: 'Relations', kinds: ['reconnect'] },
]

/** Choix de la décision alternative qui crée une nouvelle branche. */
export default function ForkView({ repo, from, onCreated, onCancel }: Props) {
  const [options, setOptions] = useState<DecisionOption[] | null>(null)
  const [clock, setClock] = useState<number | null>(null)
  const [chosen, setChosen] = useState<number | null>(null)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    repo
      .readSnapshot(from.snapshotId)
      .then(({ state }) => {
        if (cancelled) return
        setOptions(decisionOptions(state))
        setClock(state.clock)
      })
      .catch((e) => !cancelled && setError(errorText(e)))
    return () => {
      cancelled = true
    }
  }, [repo, from.snapshotId])

  async function create() {
    if (chosen === null || !options) return
    setBusy(true)
    try {
      onCreated(await repo.fork({ fromSnapshotId: from.snapshotId, decision: options[chosen].decision, name }))
    } catch (e) {
      setError(errorText(e))
      setBusy(false)
    }
  }

  return (
    <main className="dossier">
      <header className="dossier__bar">
        <button type="button" className="link" onClick={onCancel}>
          ‹ Arbre
        </button>
      </header>
      <h1 className="dossier__title">Nouvelle branche</h1>
      <p className="dossier__summary">
        Depuis « {from.branchName} »{clock !== null && `, le ${formatDate(clock)}`}. Tout ce qui précède est conservé ; la suite
        sera simulée avec son propre hasard.
      </p>
      {error && (
        <p className="question__error" role="alert">
          {error}
        </p>
      )}
      {!options && !error && <p className="hint">Chargement…</p>}
      {options && (
        <form
          className="question"
          onSubmit={(e) => {
            e.preventDefault()
            void create()
          }}
        >
          {GROUPS.map((group) => {
            const items = options.map((o, i) => ({ o, i })).filter(({ o }) => group.kinds.includes(o.decision.kind))
            if (items.length === 0) return null
            return (
              <fieldset key={group.title} className="fieldset">
                <legend>{group.title}</legend>
                <div className="choices">
                  {items.map(({ o, i }) => (
                    <label key={i} className={chosen === i ? 'choice choice--on' : 'choice'}>
                      <input
                        type="radio"
                        name="decision"
                        checked={chosen === i}
                        disabled={o.unavailable !== null}
                        onChange={() => {
                          setChosen(i)
                          setName(o.label)
                        }}
                      />
                      <span>
                        {o.label}
                        {o.unavailable && <small className="choice__why">{o.unavailable}</small>}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )
          })}
          <label className="field">
            <span>Nom de la branche</span>
            <input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
          </label>
          <button type="submit" className="btn btn--primary" disabled={chosen === null || busy}>
            Créer la branche et la vivre
          </button>
        </form>
      )}
    </main>
  )
}
