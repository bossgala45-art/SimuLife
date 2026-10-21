/**
 * Onglets et pages du jeu. Chaque écran lit l'état du moteur et n'agit que par
 * de vraies actions (`performAction`, `advance`).
 */
import { useMemo, useState } from 'react'
import {
  advance,
  APPROXIMATE_NOTE,
  dayNumber,
  ECONOMY,
  findCareer,
  formatDate,
  formatTime,
  INCIDENTS,
  isCritical,
  MONTHLY_BILLS,
  NEED_IDS,
  NEEDS,
  percent,
  type ActionId,
  type AttributeId,
  type LogEntry,
  type LogKind,
  type SimulationState,
  type StepResult,
  type TimeUnit,
} from '../../engine/index.ts'
import Avatar from '../avatar/Avatar.tsx'
import ActionButton from '../life/ActionButton.tsx'
import MoneyPanel from '../life/MoneyPanel.tsx'
import PeoplePanel from '../life/PeoplePanel.tsx'
import { CareersCatalog, JobSection, ProgramsCatalog, SkillsSection, StudySection } from '../life/sections.tsx'
import type { MapServices } from '../map/osm.ts'
import MapCard from '../narrative/MapCard.tsx'
import { FreeAction, HistorySection } from '../narrative/pages.tsx'
import { agenda } from './agenda.ts'
import type { EventCard } from './cards.ts'
import EventCards from './EventCards.tsx'

type Props = {
  state: SimulationState
  onResult: (result: StepResult) => void
}

const ATTRIBUTES: Record<AttributeId, string> = {
  health: 'Santé',
  fitness: 'Forme',
  intelligence: 'Intelligence',
  sociability: 'Sociabilité',
}

/** Actions du quotidien proposées dans l'onglet Vie. */
const DAILY: ActionId[] = ['sleep', 'cook_meal', 'shower', 'work', 'study', 'sport', 'friends', 'relax', 'restaurant', 'food_aid']
/** Actions qui agissent sur la santé et le corps. */
const HEALTH: ActionId[] = ['sleep', 'relax', 'sport', 'shower', 'cook_meal', 'restaurant', 'food_aid']

function ActionList({ state, actions, onResult }: Props & { actions: ActionId[] }) {
  return (
    <ul className="actions">
      {actions.map((id) => (
        <li key={id}>
          <ActionButton state={state} action={id} onResult={onResult} />
        </li>
      ))}
    </ul>
  )
}

export function NeedsCard({ state }: { state: SimulationState }) {
  const c = state.character
  return (
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
              <span className="need__bar" role="meter" aria-label={NEEDS[id].label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}>
                <span style={{ width: `${value}%` }} />
              </span>
            </li>
          )
        })}
      </ul>
      <p className="hint">Sommeil, faim, fatigue, stress : plus c’est bas, mieux c’est.</p>
    </section>
  )
}

function Statuses({ state }: { state: SimulationState }) {
  const s = state.character.statuses
  if (s.length === 0) return null
  return (
    <div className="chips">
      {s.includes('injured') && <p className="life__chip">Blessé·e</p>}
      {s.includes('sick') && <p className="life__chip">Malade</p>}
    </div>
  )
}

function AttributesCard({ state, only }: { state: SimulationState; only?: AttributeId[] }) {
  const ids = only ?? (Object.keys(ATTRIBUTES) as AttributeId[])
  return (
    <section className="card" aria-labelledby="attr-title">
      <h2 id="attr-title">Caractéristiques</h2>
      <dl className="attributes">
        {ids.map((id) => (
          <div key={id}>
            <dt>{ATTRIBUTES[id]}</dt>
            <dd>{Math.round(state.character.attributes[id])}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

// ——— Onglets ———

type CardsProps = {
  cards: EventCard[]
  onDismiss: (seq: number) => void
  onDismissAll: () => void
}

export function VieTab({ state, onResult, cards, onDismiss, onDismissAll }: Props & CardsProps) {
  return (
    <>
      <section className="hero">
        <Avatar state={state} />
        <Statuses state={state} />
      </section>
      <EventCards state={state} cards={cards} onDismiss={onDismiss} onDismissAll={onDismissAll} onResult={onResult} />
      <FreeAction state={state} onResult={onResult} />
      <NeedsCard state={state} />
      <section className="card" aria-labelledby="actions-title">
        <h2 id="actions-title">Actions</h2>
        <ActionList state={state} actions={DAILY} onResult={onResult} />
      </section>
      <AttributesCard state={state} />
    </>
  )
}

const ADVANCES: { unit: TimeUnit; label: string }[] = [
  { unit: 'day', label: '+1 jour' },
  { unit: 'week', label: '+1 semaine' },
  { unit: 'month', label: '+1 mois' },
]

export function TempsTab({ state, onResult }: Props) {
  const items = useMemo(() => agenda(state), [state])
  const today = dayNumber(state.clock)
  const todayEntries = state.log.filter((e) => dayNumber(e.at) === today && e.code !== 'wait' && e.code !== 'new_day')
  const alive = state.character.alive
  return (
    <>
      <section className="card clock" aria-labelledby="clock-title">
        <h2 id="clock-title" className="visually-hidden">
          Horloge
        </h2>
        <p className="clock__time">{formatTime(state.clock)}</p>
        <p className="clock__date">{formatDate(state.clock)}</p>
      </section>
      <section className="card" aria-labelledby="advance-title">
        <h2 id="advance-title">Faire avancer la vie</h2>
        <ActionButton state={state} action="wait" label="Attendre une heure" onResult={onResult} />
        <div className="advance">
          {ADVANCES.map(({ unit, label }) => (
            <button key={unit} type="button" className="btn btn--secondary" disabled={!alive} onClick={() => onResult(advance(state, unit))}>
              {label}
            </button>
          ))}
        </div>
        <p className="hint">Pendant ce temps, ton personnage suit sa routine et tes proches vivent leur vie.</p>
      </section>
      <section className="card" aria-labelledby="agenda-title">
        <h2 id="agenda-title">Agenda (45 jours)</h2>
        {items.length === 0 ? (
          <p className="hint">Rien de prévu.</p>
        ) : (
          <ol className="agenda">
            {items.map((item, i) => (
              <li key={`${item.at}-${i}`}>
                <span aria-hidden="true">{item.icon}</span>
                <span>
                  {item.label}
                  {item.uncertain && <span className="badge badge--maybe">Issue incertaine</span>}
                </span>
                <time>{formatDate(item.at)}</time>
              </li>
            ))}
          </ol>
        )}
      </section>
      <section className="card" aria-labelledby="today-title">
        <h2 id="today-title">Aujourd’hui</h2>
        {todayEntries.length === 0 ? (
          <p className="hint">Rien pour l’instant.</p>
        ) : (
          <ol className="journal">
            {todayEntries.map((e) => (
              <li key={e.seq} className={`journal__entry journal__entry--${e.kind}`}>
                <time>{formatTime(e.at)}</time>
                <span>{e.message}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </>
  )
}

export function SocialTab({ state, onResult, onTalk }: Props & { onTalk: (personId: string) => void }) {
  return <PeoplePanel state={state} onResult={onResult} onTalk={onTalk} />
}

type WorldProps = { onState: (state: SimulationState) => void; loadServices: () => Promise<MapServices> }

export function MondeTab({ state, onResult, onState, loadServices }: Props & WorldProps) {
  const bills = MONTHLY_BILLS.reduce((sum, b) => sum + b.value, 0)
  return (
    <>
      <section className="card" aria-labelledby="economy-title">
        <h2 id="economy-title">Coût de la vie</h2>
        <dl className="facts-list">
          <div>
            <dt>{ECONOMY.rent.label}</dt>
            <dd>≈ {ECONOMY.rent.value} €</dd>
          </div>
          {MONTHLY_BILLS.map((b) => (
            <div key={b.label}>
              <dt>{b.label}</dt>
              <dd>≈ {b.value} €</dd>
            </div>
          ))}
          <div>
            <dt>Total fixe par mois</dt>
            <dd>≈ {ECONOMY.rent.value + bills} €</dd>
          </div>
        </dl>
        <p className="hint">{APPROXIMATE_NOTE}</p>
      </section>
      <MapCard state={state} onState={onState} loadServices={loadServices} />
      <HistorySection state={state} />
      <CareersCatalog state={state} onResult={onResult} />
      <ProgramsCatalog state={state} onResult={onResult} />
    </>
  )
}

// ——— Pages du menu ———

type NavProps = { onNavigate: (tab: 'monde') => void }

export function SantePage({ state, onResult }: Props) {
  const illness = INCIDENTS.find((i) => i.id === 'illness')
  const risk = illness && state.character.alive ? illness.probability(state) : 0
  return (
    <>
      <Statuses state={state} />
      <AttributesCard state={state} only={['health', 'fitness']} />
      <section className="card" aria-labelledby="risk-title">
        <h2 id="risk-title">Risque de maladie</h2>
        <p>
          {state.character.statuses.includes('sick')
            ? 'Tu es malade : repose-toi, la guérison est programmée.'
            : `≈ ${percent(risk)} par jour, au hasard.`}
        </p>
        <p className="hint">Le risque augmente avec une santé basse, le stress et le manque de sommeil.</p>
      </section>
      <NeedsCard state={state} />
      <section className="card" aria-labelledby="care-title">
        <h2 id="care-title">Prendre soin de soi</h2>
        <ActionList state={state} actions={HEALTH} onResult={onResult} />
      </section>
    </>
  )
}

export function EtudesPage({ state, onResult, onNavigate }: Props & NavProps) {
  return (
    <>
      <StudySection state={state} onResult={onResult} />
      <section className="card">
        <ActionButton state={state} action="study" onResult={onResult} />
        <button type="button" className="btn btn--secondary page-link" onClick={() => onNavigate('monde')}>
          Voir les formations
        </button>
      </section>
    </>
  )
}

export function CarrierePage({ state, onResult, onNavigate }: Props & NavProps) {
  const applications = state.scheduled.flatMap(({ at, event }) => (event.type === 'job_application_result' ? [{ at, career: event.career }] : []))
  const experience = Object.entries(state.career.experience).filter(([, days]) => days > 0)
  return (
    <>
      <JobSection state={state} onResult={onResult} />
      {state.career.job && (
        <section className="card">
          <ActionButton state={state} action="work" onResult={onResult} />
        </section>
      )}
      <section className="card" aria-labelledby="applications-title">
        <h2 id="applications-title">Candidatures</h2>
        {applications.length === 0 ? (
          <p className="hint">Aucune candidature en attente.</p>
        ) : (
          <ul className="plain">
            {applications.map((a) => (
              <li key={a.career}>
                {findCareer(a.career)?.label ?? a.career} · réponse le {formatDate(a.at)} <span className="badge badge--maybe">Issue incertaine</span>
              </li>
            ))}
          </ul>
        )}
        <button type="button" className="btn btn--secondary page-link" onClick={() => onNavigate('monde')}>
          Voir les métiers
        </button>
      </section>
      <section className="card" aria-labelledby="xp-title">
        <h2 id="xp-title">Expérience</h2>
        {experience.length === 0 ? (
          <p className="hint">Pas encore d’expérience professionnelle.</p>
        ) : (
          <dl className="facts-list">
            {experience.map(([sector, days]) => (
              <div key={sector}>
                <dt>{sector}</dt>
                <dd>{days} jours</dd>
              </div>
            ))}
          </dl>
        )}
      </section>
    </>
  )
}

export function FinancesPage({ state, onResult }: Props) {
  return <MoneyPanel state={state} onResult={onResult} />
}

export function CompetencesPage({ state, onResult }: Props) {
  return <SkillsSection state={state} onResult={onResult} />
}

const FILTERS: { id: string; label: string; kinds: LogKind[] | null }[] = [
  { id: 'all', label: 'Tout', kinds: null },
  { id: 'action', label: 'Actions', kinds: ['action'] },
  { id: 'event', label: 'Événements', kinds: ['event', 'system'] },
  { id: 'social', label: 'Proches', kinds: ['social'] },
  { id: 'money', label: 'Argent', kinds: ['money'] },
  { id: 'warning', label: 'Alertes', kinds: ['warning'] },
]

const JOURNAL_SIZE = 80

export function JournalPage({ state }: { state: SimulationState }) {
  const [filter, setFilter] = useState('all')
  const kinds = FILTERS.find((f) => f.id === filter)!.kinds
  const days = useMemo(() => {
    const entries: LogEntry[] = []
    for (let i = state.log.length - 1; i >= 0 && entries.length < JOURNAL_SIZE; i--) {
      const e = state.log[i]
      if (e.code === 'new_day' || e.code === 'wait' || (kinds && !kinds.includes(e.kind))) continue
      entries.push(e)
    }
    const grouped: { day: number; entries: LogEntry[] }[] = []
    for (const e of entries) {
      const day = dayNumber(e.at)
      if (grouped.at(-1)?.day !== day) grouped.push({ day, entries: [] })
      grouped.at(-1)!.entries.unshift(e)
    }
    return grouped
  }, [state.log, kinds])

  return (
    <section className="card" aria-labelledby="log-title">
      <h2 id="log-title">Journal</h2>
      <div className="filters" role="group" aria-label="Filtrer le journal">
        {FILTERS.map((f) => (
          <button key={f.id} type="button" className={f.id === filter ? 'filter filter--on' : 'filter'} aria-pressed={f.id === filter} onClick={() => setFilter(f.id)}>
            {f.label}
          </button>
        ))}
      </div>
      {days.length === 0 && <p className="hint">Aucune entrée.</p>}
      {days.map(({ day, entries }) => (
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
      <p className="hint">Graine de cette vie : {state.seed}</p>
    </section>
  )
}
