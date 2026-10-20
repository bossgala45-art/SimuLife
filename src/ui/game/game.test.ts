import { beforeEach, describe, expect, it } from 'vitest'
import { advance, createSimulation, MINUTES_PER_DAY, performAction, type LogEntry, type SimulationState } from '../../engine/index.ts'
import { agenda } from './agenda.ts'
import { eventCards, MAX_CARDS } from './cards.ts'
import { scenesFor } from './scenes.ts'
import { loadSeen, saveSeen } from './seen.ts'

function life(career: string | null = null): SimulationState {
  // Lundi 6 janvier 2025, 10:00
  return createSimulation({
    seed: 'coque',
    name: 'Léa',
    birthDate: { year: 2000, month: 3, day: 15 },
    start: { year: 2025, month: 1, day: 6, hour: 10, minute: 0 },
    career,
  })
}

/** Ajoute une entrée au journal, comme le ferait le moteur. */
function withEntry(state: SimulationState, entry: Omit<LogEntry, 'seq' | 'at'> & { at?: number }): SimulationState {
  const full: LogEntry = { at: state.clock, ...entry, seq: state.nextLogSeq }
  return { ...state, log: [...state.log, full], nextLogSeq: state.nextLogSeq + 1 }
}

const NONE = { lastSeq: -1, dismissed: [] }

beforeEach(() => localStorage.clear())

describe('cartes d’événements', () => {
  it('une carte « proche malade » propose de l’appeler, avec une vraie action du moteur', () => {
    const base = life()
    const mother = base.people.find((p) => p.relation === 'Mère')!
    const state = withEntry(base, { kind: 'social', code: 'npc_sick', message: `${mother.name} est malade.`, data: { personId: mother.id } })
    const [card] = eventCards(state, NONE)
    expect(card).toMatchObject({ tone: 'bad', title: 'Un proche est malade', action: { id: 'call', params: { personId: mother.id } } })

    const called = performAction(state, card.action!.id, card.action!.params)
    expect(called.ok).toBe(true)
    if (called.ok) expect(called.state.relationships[mother.id].lastContact).toBeGreaterThanOrEqual(state.clock)
  })

  it('pas d’action proposée pour un proche décédé', () => {
    const base = life()
    const mother = base.people.find((p) => p.relation === 'Mère')!
    const gone = { ...base, people: base.people.map((p) => (p.id === mother.id ? { ...p, alive: false } : p)) }
    const state = withEntry(gone, { kind: 'social', code: 'npc_birthday', message: 'Anniversaire.', data: { personId: mother.id } })
    expect(eventCards(state, NONE)[0].action).toBeUndefined()
  })

  it('cartes lues, fermées, trop anciennes ou sans intérêt : non affichées', () => {
    let state = withEntry(life(), { kind: 'money', code: 'refund', message: 'Remboursement.' })
    state = withEntry(state, { kind: 'action', code: 'wait', message: 'Tu attends.' })
    state = withEntry(state, { kind: 'warning', code: 'illness', message: 'Malade.' })
    const seqs = eventCards(state, NONE).map((c) => c.seq)
    expect(seqs).toHaveLength(2) // l'attente n'est pas une carte
    expect(eventCards(state, { lastSeq: seqs[1], dismissed: [] }).map((c) => c.seq)).toEqual([seqs[0]])
    expect(eventCards(state, { lastSeq: -1, dismissed: [seqs[0]] }).map((c) => c.seq)).toEqual([seqs[1]])

    // Deux jours plus tard, les cartes de lundi ne sont plus « du jour ».
    const later = { ...state, clock: state.clock + 2 * MINUTES_PER_DAY }
    expect(eventCards(later, NONE)).toEqual([])
  })

  it('une semaine de vie produit au plus quelques cartes, toutes tirées du journal', () => {
    const result = advance(life('waiter'), 'week')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const cards = eventCards(result.state, NONE)
    expect(cards.length).toBeLessThanOrEqual(MAX_CARDS)
    for (const card of cards) expect(result.state.log.some((e) => e.seq === card.seq && e.message === card.message)).toBe(true)
  })
})

describe('scènes des moments importants', () => {
  it('seuls les grands moments déclenchent une scène, avec le son associé', () => {
    const entries: LogEntry[] = [
      { seq: 1, at: 0, kind: 'event', code: 'diploma', message: 'Diplôme obtenu : CAP Cuisine.' },
      { seq: 2, at: 0, kind: 'action', code: 'cook_meal', message: 'Tu cuisines.' },
      { seq: 3, at: 0, kind: 'social', code: 'npc_death', message: 'Décès.' },
    ]
    expect(scenesFor(entries)).toEqual([
      { seq: 1, kind: 'diploma', title: 'Diplômé·e !', tone: 'joy', sound: 'success', message: 'Diplôme obtenu : CAP Cuisine.' },
      { seq: 3, kind: 'loss', title: 'Un deuil', tone: 'sorrow', sound: 'sad', message: 'Décès.' },
    ])
  })

  it('le début d’une vie est un moment important', () => {
    const state = life()
    expect(scenesFor(state.log).map((s) => s.kind)).toContain('start')
  })
})

describe('agenda', () => {
  it('liste les échéances programmées dans le moteur, dans l’ordre', () => {
    const items = agenda(life('waiter'))
    expect(items.map((i) => i.label)).toEqual(expect.arrayContaining(['Salaire', 'Charges fixes']))
    expect(items.some((i) => i.label.startsWith('Loyer'))).toBe(true)
    expect(items.map((i) => i.at)).toEqual([...items.map((i) => i.at)].sort((a, b) => a - b))
    expect(items.every((i) => !i.uncertain)).toBe(true)
  })

  it('une réponse de candidature est marquée comme incertaine', () => {
    const applied = performAction(life(), 'apply_job', { career: 'waiter' })
    expect(applied.ok).toBe(true)
    if (!applied.ok) return
    const answer = agenda(applied.state).find((i) => i.label.startsWith('Réponse de candidature'))
    expect(answer).toMatchObject({ uncertain: true, label: 'Réponse de candidature : Serveur·se' })
  })

  it('inclut les anniversaires des proches dans la fenêtre', () => {
    const state = life()
    const person = state.people.find((p) => p.role !== 'colleague')!
    const soon = { ...state, people: state.people.map((p) => (p.id === person.id ? { ...p, birthDate: { ...p.birthDate, month: 1, day: 20 } } : p)) }
    expect(agenda(soon).some((i) => i.label === `Anniversaire de ${person.name}`)).toBe(true)
    const far = { ...state, people: state.people.map((p) => (p.id === person.id ? { ...p, birthDate: { ...p.birthDate, month: 7, day: 1 } } : p)) }
    expect(agenda(far).some((i) => i.label === `Anniversaire de ${person.name}`)).toBe(false)
  })
})

describe('cartes lues mémorisées par branche', () => {
  it('relit ce qui a été enregistré ; rien sans branche', () => {
    expect(loadSeen('b1')).toBeNull()
    saveSeen('b1', { lastSeq: 12, dismissed: [14] })
    expect(loadSeen('b1')).toEqual({ lastSeq: 12, dismissed: [14] })
    expect(loadSeen('b2')).toBeNull()
    saveSeen('', { lastSeq: 3, dismissed: [] })
    expect(loadSeen('')).toBeNull()
    localStorage.setItem('simulife.cards.b3', '{cassé')
    expect(loadSeen('b3')).toBeNull()
  })
})
