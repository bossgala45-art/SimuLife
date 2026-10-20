import { dayNumber, formatTime, type SimulationState, type StepResult } from '../../engine/index.ts'
import ActionButton from '../life/ActionButton.tsx'
import type { EventCard } from './cards.ts'

type Props = {
  state: SimulationState
  cards: EventCard[]
  onDismiss: (seq: number) => void
  onDismissAll: () => void
  onResult: (result: StepResult) => void
}

/** Cartes d'événements du jour, tirées du journal du moteur. */
export default function EventCards({ state, cards, onDismiss, onDismissAll, onResult }: Props) {
  if (cards.length === 0) return null
  return (
    <section className="event-cards" aria-labelledby="cards-title">
      <div className="card__head">
        <h2 id="cards-title">Aujourd’hui</h2>
        <button type="button" className="link" onClick={onDismissAll}>
          Tout marquer comme lu
        </button>
      </div>
      <ul className="event-cards__list">
        {cards.map((card) => (
          <li key={card.seq} className={`event-card event-card--${card.tone}`}>
            <div className="event-card__head">
              <span className="event-card__icon" aria-hidden="true">
                {card.icon}
              </span>
              <strong>{card.title}</strong>
              <time>
                {dayNumber(card.at) < dayNumber(state.clock) && 'hier · '}
                {formatTime(card.at)}
              </time>
            </div>
            <p>{card.message}</p>
            <div className="event-card__actions">
              {card.action && (
                <ActionButton
                  state={state}
                  action={card.action.id}
                  params={card.action.params}
                  label={card.action.label}
                  onResult={(result) => {
                    if (result.ok) onDismiss(card.seq)
                    onResult(result)
                  }}
                />
              )}
              <button type="button" className="link" onClick={() => onDismiss(card.seq)} aria-label={`Fermer la carte « ${card.title} »`}>
                Lu
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
