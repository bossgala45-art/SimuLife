import {
  ACTIONS,
  actionCost,
  actionOutcomes,
  formatDuration,
  percent,
  performAction,
  validateAction,
  type ActionId,
  type ActionParams,
  type SimulationState,
  type StepResult,
} from '../../engine/index.ts'

type Props = {
  state: SimulationState
  action: ActionId
  params?: ActionParams
  /** Libellé à la place du nom de l'action (ex. « Emprunter 1000 € »). */
  label?: string
  onResult: (result: StepResult) => void
}

/**
 * Bouton d'action : durée, coût, probabilités des issues incertaines,
 * et raison du refus quand l'action est impossible.
 */
export default function ActionButton({ state, action, params = {}, label, onResult }: Props) {
  const def = ACTIONS[action]
  const validation = validateAction(state, action, params)
  const cost = actionCost(state, def, params)
  const outcomes = actionOutcomes(state, action, params)

  return (
    <button type="button" className="action" disabled={!validation.ok} onClick={() => onResult(performAction(state, action, params))}>
      <span className="action__label">{label ?? def.label}</span>
      <span className="action__meta">
        {formatDuration(def.durationMinutes)}
        {cost > 0 && ` · ${cost} €`}
      </span>
      {outcomes.map((o) => (
        <span key={o.label} className="action__chance">
          {o.label} : {percent(o.probability)}
        </span>
      ))}
      {!validation.ok && <span className="action__reason">{validation.issues[0].message}</span>}
    </button>
  )
}
