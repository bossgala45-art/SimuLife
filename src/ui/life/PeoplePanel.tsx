import {
  ageAt,
  daysSinceContact,
  formatDate,
  occupationLabel,
  type Person,
  type SimulationState,
  type StepResult,
} from '../../engine/index.ts'
import ActionButton from './ActionButton.tsx'

type Props = {
  state: SimulationState
  onResult: (result: StepResult) => void
}

function Gauge({ label, value, inverse = false }: { label: string; value: number; inverse?: boolean }) {
  const v = Math.round(value)
  return (
    <div className={inverse ? 'gauge gauge--inverse' : 'gauge'}>
      <span>{label}</span>
      <span className="gauge__bar" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={v}>
        <span style={{ width: `${v}%` }} />
      </span>
      <span className="gauge__value">{v}</span>
    </div>
  )
}

function lastContact(days: number | null): string {
  if (days === null) return 'jamais'
  if (days === 0) return 'aujourd’hui'
  return days === 1 ? 'hier' : `il y a ${days} jours`
}

function PersonCard({ state, person, onResult }: Props & { person: Person }) {
  const rel = state.relationships[person.id]
  const params = { personId: person.id }
  const badges = [
    !person.alive && 'Décédé·e',
    person.sickSince !== null && 'Malade',
    person.distant && 'Habite loin',
  ].filter(Boolean) as string[]

  return (
    <details className="person">
      <summary>
        <span className="person__name">
          {person.name} <span className="person__relation">· {person.relation}</span>
        </span>
        <span className="person__meta">
          {ageAt(person.birthDate, state.clock)} ans · {occupationLabel(person.occupation)}
        </span>
        {badges.length > 0 && (
          <span className="person__badges">
            {badges.map((b) => (
              <span key={b} className="badge">
                {b}
              </span>
            ))}
          </span>
        )}
      </summary>

      <div className="person__body">
        <Gauge label="Proximité" value={rel.closeness} />
        <Gauge label="Confiance" value={rel.trust} />
        <Gauge label="Tension" value={rel.tension} inverse />
        <p className="hint">Dernier contact : {lastContact(daysSinceContact(state, person.id))}</p>

        {rel.memories.length > 0 && (
          <>
            <h3 className="person__subtitle">Souvenirs</h3>
            <ul className="memories">
              {rel.memories
                .slice(-4)
                .reverse()
                .map((m) => (
                  <li key={`${m.at}-${m.kind}`} className={m.weight >= 0 ? 'memory memory--good' : 'memory memory--bad'}>
                    <span>{m.text}</span>
                    <time>{formatDate(m.at)}</time>
                  </li>
                ))}
            </ul>
          </>
        )}

        {person.alive && (
          <ul className="actions">
            <li>
              <ActionButton state={state} action="call" params={params} onResult={onResult} />
            </li>
            <li>
              <ActionButton state={state} action="visit" params={params} onResult={onResult} />
            </li>
            <li>
              <ActionButton state={state} action="gift" params={params} onResult={onResult} />
            </li>
            {person.sickSince !== null && (
              <li>
                <ActionButton state={state} action="help" params={params} onResult={onResult} />
              </li>
            )}
            {person.role !== 'colleague' && (
              <li>
                <ActionButton
                  state={state}
                  action="ask_loan"
                  params={{ ...params, amount: 200 }}
                  label="Demander 200 €"
                  onResult={onResult}
                />
              </li>
            )}
          </ul>
        )}
      </div>
    </details>
  )
}

export default function PeoplePanel({ state, onResult }: Props) {
  const order = { parent: 0, sibling: 1, friend: 2, colleague: 3 }
  const people = [...state.people].sort((a, b) => Number(!a.alive) - Number(!b.alive) || order[a.role] - order[b.role])
  return (
    <section className="card" aria-labelledby="people-title">
      <h2 id="people-title">Proches</h2>
      <p className="hint">Tes proches vivent leur vie : maladies, déménagements, changements de travail… Ils se souviennent de ce que tu fais pour eux.</p>
      <div className="people">
        {people.map((p) => (
          <PersonCard key={p.id} state={state} person={p} onResult={onResult} />
        ))}
      </div>
    </section>
  )
}
