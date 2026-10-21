/**
 * Écrans de la narration : messagerie, souvenirs, actions libres, repères historiques.
 * Tous lisent l'état du moteur ; les actions passent par `performAction`.
 */
import { useState } from 'react'
import {
  ageAtMemory,
  formatDate,
  formatDateTime,
  historyCoverageEnd,
  interpretText,
  livedEvents,
  TEXT_MAX_LENGTH,
  unreadCount,
  type Interpretation,
  type SimulationState,
  type StepResult,
} from '../../engine/index.ts'
import ActionButton from '../life/ActionButton.tsx'

/** Liste des proches et de leurs fils de discussion. */
export function MessagesPage({ state, onOpen }: { state: SimulationState; onOpen: (personId: string) => void }) {
  const last = (id: string) => state.narrative.threads[id]?.at(-1)
  const people = state.people
    .filter((p) => p.alive || last(p.id))
    .sort((a, b) => (last(b.id)?.at ?? -1) - (last(a.id)?.at ?? -1) || a.name.localeCompare(b.name))
  return (
    <section className="card" aria-labelledby="inbox-title">
      <h2 id="inbox-title">Conversations</h2>
      <ul className="inbox">
        {people.map((p) => {
          const m = last(p.id)
          const unread = unreadCount(state, p.id)
          return (
            <li key={p.id}>
              <button type="button" className="inbox__item" onClick={() => onOpen(p.id)}>
                <span className="inbox__name">
                  {p.name} <span className="person__relation">· {p.relation}</span>
                  {unread > 0 && (
                    <span className="badge" aria-label={`${unread} non lus`}>
                      {unread}
                    </span>
                  )}
                </span>
                <span className="inbox__last">{m ? `${m.from === 'player' ? 'Toi : ' : ''}${m.text}` : 'Aucun échange'}</span>
                {m && <time>{formatDateTime(m.at)}</time>}
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

const TONE_ICON = { good: '☀️', bad: '🌧️', neutral: '•' } as const

/** Mémoire narrative : les grands moments, gardés même quand le journal les oublie. */
export function MemoriesPage({ state }: { state: SimulationState }) {
  const memories = [...state.narrative.memories].reverse()
  const name = (id: string) => state.people.find((p) => p.id === id)?.name
  return (
    <section className="card" aria-labelledby="memories-title">
      <h2 id="memories-title">Souvenirs</h2>
      <p className="hint">Les moments importants de cette vie, conservés durablement.</p>
      <ol className="story">
        {memories.map((m) => (
          <li key={m.id} className={`story__item story__item--${m.tone}`}>
            <span aria-hidden="true">{TONE_ICON[m.tone]}</span>
            <div>
              <p>{m.text}</p>
              <p className="hint">
                {formatDate(m.at)} · {ageAtMemory(state, m)} ans
                {m.people.length > 0 && ` · avec ${m.people.map(name).filter(Boolean).join(', ')}`}
                {m.importance === 3 && ' · moment marquant'}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}

const EXAMPLES = ['appeler maman', 'aller courir', 'mettre 100 € de côté', 'postuler comme serveur', 'écrire à mon frère pour prendre des nouvelles']

/** Action libre : une phrase interprétée par des règles, confirmée avant d'agir. */
export function FreeAction({ state, onResult }: { state: SimulationState; onResult: (result: StepResult) => void }) {
  const [text, setText] = useState('')
  const [found, setFound] = useState<Interpretation[] | null>(null)
  return (
    <section className="card" aria-labelledby="free-title">
      <h2 id="free-title">Que fais-tu ?</h2>
      <form
        className="free"
        onSubmit={(e) => {
          e.preventDefault()
          setFound(interpretText(state, text).slice(0, 3))
        }}
      >
        <input
          aria-label="Ce que tu veux faire"
          value={text}
          maxLength={TEXT_MAX_LENGTH}
          placeholder="Ex. : appeler maman, aller courir…"
          onChange={(e) => {
            setText(e.target.value)
            setFound(null)
          }}
        />
        <button type="submit" className="btn btn--secondary" disabled={!text.trim() || !state.character.alive}>
          Interpréter
        </button>
      </form>
      {found && found.length === 0 && (
        <p className="hint" role="status">
          Je n’ai pas compris. Exemples : {EXAMPLES.map((e) => `« ${e} »`).join(', ')}.
        </p>
      )}
      {found && found.length > 0 && (
        <>
          <p className="hint" role="status">
            J’ai compris (rien ne se passe sans ton choix) :
          </p>
          <ul className="actions">
            {found.map((i) => (
              <li key={`${i.action}-${JSON.stringify(i.params)}`}>
                <ActionButton
                  state={state}
                  action={i.action}
                  params={i.params}
                  label={i.label}
                  onResult={(result) => {
                    if (result.ok) {
                      setText('')
                      setFound(null)
                    }
                    onResult(result)
                  }}
                />
                {i.note && <p className="hint">{i.note}</p>}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

/** Repères historiques vécus par le personnage, avec leur source. */
export function HistorySection({ state }: { state: SimulationState }) {
  const lived = livedEvents(state)
  const end = historyCoverageEnd()
  return (
    <section className="card" aria-labelledby="history-title">
      <h2 id="history-title">Repères historiques</h2>
      {lived.length === 0 ? (
        <p className="hint">Aucun repère de la base pendant la vie de ce personnage.</p>
      ) : (
        <ol className="history">
          {lived.map(({ event, age }) => (
            <li key={event.id}>
              <p>
                <strong>{event.title}</strong>
              </p>
              <p className="hint">
                {formatDate(Date.UTC(event.date.year, event.date.month - 1, event.date.day) / 60000)}
                {event.end && ` → ${formatDate(Date.UTC(event.end.year, event.end.month - 1, event.end.day) / 60000)}`} · tu avais {age} an
                {age > 1 ? 's' : ''}
              </p>
              <details>
                <summary>Source</summary>
                <p className="hint">
                  « {event.source.quote} » —{' '}
                  <a href={event.source.url} target="_blank" rel="noreferrer">
                    {event.source.label}
                  </a>
                  , vérifié le {event.checkedOn.split('-').reverse().join('/')}.
                </p>
              </details>
            </li>
          ))}
        </ol>
      )}
      {end && (
        <p className="hint">
          Base couverte jusqu’au {end.day}/{end.month}/{end.year} : aucun événement n’est inventé pour les années simulées au-delà.
        </p>
      )}
    </section>
  )
}
