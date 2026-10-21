/**
 * Cartes d'événements : les faits marquants du journal, présentés comme des cartes.
 * Une carte ne propose une action que si cette action existe réellement dans le moteur.
 */
import { dayNumber, MINUTES_PER_DAY, type ActionId, type ActionParams, type LogEntry, type SimulationState } from '../../engine/index.ts'

export type CardTone = 'good' | 'bad' | 'info'

export interface EventCard {
  seq: number
  at: number
  tone: CardTone
  icon: string
  title: string
  message: string
  action?: { id: ActionId; params: ActionParams; label: string }
}

const CARD_TYPES: Record<string, { tone: CardTone; icon: string; title: string }> = {
  hired: { tone: 'good', icon: '💼', title: 'Nouveau travail' },
  application_refused: { tone: 'bad', icon: '📭', title: 'Candidature refusée' },
  offer_declined: { tone: 'info', icon: '📨', title: 'Offre déclinée' },
  raise: { tone: 'good', icon: '📈', title: 'Augmentation' },
  layoff: { tone: 'bad', icon: '📦', title: 'Licenciement' },
  absence: { tone: 'bad', icon: '⏰', title: 'Absence au travail' },
  work_bonus: { tone: 'good', icon: '🎁', title: 'Prime' },
  diploma: { tone: 'good', icon: '🎓', title: 'Diplôme obtenu' },
  exam_failed: { tone: 'bad', icon: '📝', title: 'Examen échoué' },
  skill_level: { tone: 'good', icon: '⭐', title: 'Progrès' },
  salary: { tone: 'good', icon: '💶', title: 'Salaire' },
  benefit: { tone: 'info', icon: '💶', title: 'Allocation' },
  rent_due: { tone: 'info', icon: '🏠', title: 'Loyer' },
  bills_due: { tone: 'info', icon: '🧾', title: 'Charges fixes' },
  debt: { tone: 'bad', icon: '⚠️', title: 'Découvert' },
  debt_missed: { tone: 'bad', icon: '⚠️', title: 'Remboursement manqué' },
  debt_closed: { tone: 'good', icon: '✅', title: 'Prêt remboursé' },
  overdraft_removed: { tone: 'bad', icon: '🏦', title: 'Découvert supprimé' },
  bank_loan_granted: { tone: 'good', icon: '🏦', title: 'Prêt accordé' },
  bank_loan_refused: { tone: 'bad', icon: '🏦', title: 'Prêt refusé' },
  appliance: { tone: 'bad', icon: '🔧', title: 'Panne' },
  lost_item: { tone: 'bad', icon: '🔍', title: 'Objet perdu' },
  refund: { tone: 'good', icon: '💌', title: 'Bonne surprise' },
  illness: { tone: 'bad', icon: '🤒', title: 'Malade' },
  illness_recovered: { tone: 'good', icon: '💪', title: 'Guéri·e' },
  sport_injury: { tone: 'bad', icon: '🩹', title: 'Blessure' },
  birthday: { tone: 'good', icon: '🎂', title: 'Ton anniversaire' },
  npc_sick: { tone: 'bad', icon: '🤒', title: 'Un proche est malade' },
  npc_recovered: { tone: 'info', icon: '🌤️', title: 'Rétablissement' },
  npc_birthday: { tone: 'info', icon: '🎈', title: 'Anniversaire d’un proche' },
  birthday_forgotten: { tone: 'bad', icon: '😔', title: 'Anniversaire oublié' },
  npc_called: { tone: 'good', icon: '📞', title: 'Un appel' },
  npc_death: { tone: 'bad', icon: '🕯️', title: 'Deuil' },
  npc_moved: { tone: 'info', icon: '🚚', title: 'Déménagement' },
  npc_job_change: { tone: 'info', icon: '🔄', title: 'Nouvelles d’un proche' },
  npc_retired: { tone: 'info', icon: '🌴', title: 'Retraite' },
  npc_first_job: { tone: 'info', icon: '🎒', title: 'Premier emploi d’un proche' },
  loan_granted: { tone: 'good', icon: '🤝', title: 'Prêt d’un proche' },
  loan_refused: { tone: 'bad', icon: '🙅', title: 'Prêt refusé' },
  argument: { tone: 'bad', icon: '💢', title: 'Dispute' },
  divergence: { tone: 'info', icon: '🌱', title: 'Nouvelle branche' },
  message_received: { tone: 'info', icon: '💬', title: 'Nouveau message' },
}

export const MAX_CARDS = 8

/** Action réelle proposée par une carte (appeler un proche malade, souhaiter un anniversaire…). */
function cardAction(state: SimulationState, entry: LogEntry): EventCard['action'] {
  const personId = typeof entry.data?.personId === 'string' ? entry.data.personId : undefined
  const person = personId ? state.people.find((p) => p.id === personId && p.alive) : undefined
  if (!person) return undefined
  if (entry.code === 'npc_sick' || entry.code === 'npc_birthday') {
    return { id: 'call', params: { personId: person.id }, label: `Appeler ${person.name}` }
  }
  if (entry.code === 'birthday_forgotten') return { id: 'gift', params: { personId: person.id }, label: `Offrir un cadeau à ${person.name}` }
  return undefined
}

/**
 * Cartes du jour : faits marquants d'hier et d'aujourd'hui pas encore lus
 * (les plus récents d'abord).
 */
export function eventCards(state: SimulationState, seen: { lastSeq: number; dismissed: readonly number[] }): EventCard[] {
  const since = (dayNumber(state.clock) - 1) * MINUTES_PER_DAY
  const cards: EventCard[] = []
  for (let i = state.log.length - 1; i >= 0 && cards.length < MAX_CARDS; i--) {
    const entry = state.log[i]
    if (entry.seq <= seen.lastSeq || entry.at < since) break
    const type = CARD_TYPES[entry.code]
    if (!type || seen.dismissed.includes(entry.seq)) continue
    cards.push({ seq: entry.seq, at: entry.at, ...type, message: entry.message, action: cardAction(state, entry) })
  }
  return cards
}
