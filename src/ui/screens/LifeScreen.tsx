import { useMemo, useState } from 'react'
import {
  ACTION_IDS,
  ACTIONS,
  advance,
  ageAt,
  dayNumber,
  formatDate,
  formatTime,
  isCritical,
  NEED_IDS,
  NEEDS,
  type ActionId,
  type AttributeId,
  type LogEntry,
  type SimulationState,
  type StepResult,
  type TimeUnit,
} from '../../engine/index.ts'
import ActionButton from '../life/ActionButton.tsx'
import MoneyPanel from '../life/MoneyPanel.tsx'
import PathPanel from '../life/PathPanel.tsx'
import PeoplePanel from '../life/PeoplePanel.tsx'
import './LifeScreen.css'

type LifeScreenProps = {
  state: SimulationState
  onChange: (state: SimulationState) => void
  onQuit: () => void
  /** Branche de l'arbre des destins jouée. */
  branchName?: string
  saveError?: string | null
  onRetrySave?: () => void
  onTree?: () => void
}

const ATTRIBUTES: Record<AttributeId, string> = {
  health: 'Santé',
  fitness: 'Forme',
  intelligence: 'Intelligence',
  sociability: 'Sociabilité',
}

const ADVANCES: { unit: TimeUnit; label: string }[] = [
  { unit: 'day', label: '+1 jour' },
  { unit: 'week', label: '+1 semaine' },
  { unit: 'month', label: '+1 mois' },
]

const JOURNAL_SIZE = 60

type Tab = 'life' | 'people' | 'path' | 'money'
const TABS: { id: Tab; label: string }[] = [
  { id: 'life', label: 'Vie' },
  { id: 'people', label: 'Proches' },
  { id: 'path', label: 'Parcours' },
  { id: 'money', label: 'Argent' },
]

/** Actions du quotidien (sans cible) ; les autres sont dans leurs onglets. */
const DAILY_ACTIONS = ACTION_IDS.filter((id) => !ACTIONS[id].params && id !== 'quit_job' && id !== 'drop_out') as ActionId[]

export default function LifeScreen({ state, onChange, onQuit, branchName, saveError, onRetrySave, onTree }: LifeScreenProps) {
  const [issues, setIssues] = useState<string[]>([])
  const [showWaits, setShowWaits] = useState(false)
  const [tab, setTab] = useState<Tab>('life')
  const c = state.character

  function apply(result: StepResult) {
    if (result.ok) {
      setIssues([])
      onChange(result.state)
    } else {
      setIssues(result.issues.map((i) => i.message))
    }
  }

  // Dernières entrées, regroupées par jour : jour le plus récent en premier, heures dans l'ordre.
  const journal = useMemo(() => {
    const entries: LogEntry[] = []
    for (let i = state.log.length - 1; i >= 0 && entries.length < JOURNAL_SIZE; i--) {
      const e = state.log[i]
      if (e.code === 'new_day' || (!showWaits && e.code === 'wait')) continue
      entries.push(e)
    }
    const days: { day: number; entries: LogEntry[] }[] = []
    for (const e of entries) {
      const day = dayNumber(e.at)
      if (days.at(-1)?.day !== day) days.push({ day, entries: [] })
      days.at(-1)!.entries.unshift(e)
    }
    return days
  }, [state.log, showWaits])

  return (
    <main className="life">
      <header className="life__header">
        <div>
          <h1 className="life__name">
            {c.name}, {ageAt(c.birthDate, state.clock)} ans
          </h1>
          <p className="life__date">{formatDate(state.clock)}</p>
          {branchName && <p className="life__branch">Branche : {branchName}</p>}
        </div>
        <div className="life__right">
          <p className="life__time" aria-label="Heure">
            {formatTime(state.clock)}
          </p>
          <p className={c.money < 0 ? 'life__money life__money--neg' : 'life__money'}>{c.money} €</p>
        </div>
        <nav className="tabs" role="tablist" aria-label="Sections">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={tab === t.id ? 'tabs__tab tabs__tab--on' : 'tabs__tab'}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      {saveError && (
        <div className="life__issues" role="alert">
          <p>{saveError}</p>
          {onRetrySave && (
            <button type="button" className="btn btn--secondary btn--small" onClick={onRetrySave}>
              Réessayer
            </button>
          )}
        </div>
      )}
      {!c.alive && (
        <p className="life__banner" role="status">
          {c.name} est décédé·e. Commence une nouvelle vie depuis le menu.
        </p>
      )}
      {c.statuses.includes('injured') && <p className="life__chip">Blessé·e</p>}
      {c.statuses.includes('sick') && <p className="life__chip">Malade</p>}
      {issues.length > 0 && (
        <ul className="life__issues" role="alert">
          {issues.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      )}

      {tab === 'people' && <PeoplePanel state={state} onResult={apply} />}
      {tab === 'path' && <PathPanel state={state} onResult={apply} />}
      {tab === 'money' && <MoneyPanel state={state} onResult={apply} />}

      {tab === 'life' && (
        <>
          <section className="card" aria-labelledby="needs-title">
            <h2 id="needs-title">Besoins</h2>
            <ul className="needs">
              {NEED_IDS.map((id) => {
                const value = Math.round(c.needs[id])
                const critical = isCritical(id, c.needs[id])
                return (
                  <li key={id} className={critical ? 'need need--critical' : 'need'}>
                    <span className="need__label">{NEEDS[id].label}</span>
                    <span className="need__value">{value}</span>
                    <span
                      className="need__bar"
                      role="meter"
                      aria-label={NEEDS[id].label}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={value}
                    >
                      <span style={{ width: `${value}%` }} />
                    </span>
                  </li>
                )
              })}
            </ul>
            <p className="hint">Sommeil, faim, fatigue, stress : plus c’est bas, mieux c’est.</p>
          </section>

          <section className="card" aria-labelledby="time-title">
            <h2 id="time-title">Faire avancer la vie</h2>
            <div className="advance">
              {ADVANCES.map(({ unit, label }) => (
                <button
                  key={unit}
                  type="button"
                  className="btn btn--secondary"
                  disabled={!c.alive}
                  onClick={() => apply(advance(state, unit))}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="hint">Le personnage suit sa routine : dormir, manger, se laver, travailler…</p>
          </section>

          <section className="card" aria-labelledby="actions-title">
            <h2 id="actions-title">Actions</h2>
            <ul className="actions">
              {DAILY_ACTIONS.map((id) => (
                <li key={id}>
                  <ActionButton state={state} action={id} onResult={apply} />
                </li>
              ))}
            </ul>
          </section>

          <section className="card" aria-labelledby="attr-title">
            <h2 id="attr-title">Caractéristiques</h2>
            <dl className="attributes">
              {(Object.keys(ATTRIBUTES) as AttributeId[]).map((id) => (
                <div key={id}>
                  <dt>{ATTRIBUTES[id]}</dt>
                  <dd>{Math.round(c.attributes[id])}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="card" aria-labelledby="log-title">
            <div className="card__head">
              <h2 id="log-title">Journal</h2>
              <label className="toggle">
                <input type="checkbox" checked={showWaits} onChange={(e) => setShowWaits(e.target.checked)} />
                Attentes
              </label>
            </div>
            {journal.map(({ day, entries }) => (
              <section key={day} className="journal__day" aria-label={formatDate(entries[0].at)}>
                <h3>{formatDate(entries[0].at)}</h3>
                <ol className="journal">
                  {entries.map((e) => (
                    <li key={e.seq} className={`journal__entry journal__entry--${e.kind}`}>
                      <time>{formatTime(e.at)}</time>
                      <span>{e.message}</span>
                    </li>
                  ))}
                </ol>
              </section>
            ))}
          </section>
        </>
      )}

      <footer className="life__footer">
        <p>
          Graine : <code>{state.seed}</code>
        </p>
        <div className="life__footer-actions">
          {onTree && (
            <button type="button" className="btn btn--secondary" onClick={onTree}>
              Arbre
            </button>
          )}
          <button type="button" className="btn btn--secondary" onClick={onQuit}>
            Menu
          </button>
        </div>
      </footer>
    </main>
  )
}
