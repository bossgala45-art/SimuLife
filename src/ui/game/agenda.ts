/**
 * Agenda : échéances réellement programmées dans le moteur, plus les anniversaires
 * des proches. Un rendez-vous dont l'issue dépend du hasard est signalé comme incertain.
 */
import { findCareer, findProgram, MINUTES_PER_DAY as DAY, type SimulationState } from '../../engine/index.ts'

export interface AgendaItem {
  at: number
  icon: string
  label: string
  /** Vrai si le résultat de l'événement n'est pas connu d'avance. */
  uncertain: boolean
}

export function agenda(state: SimulationState, days = 45): AgendaItem[] {
  const until = state.clock + days * DAY
  const items: AgendaItem[] = []
  for (const { at, event } of state.scheduled) {
    if (at > until) continue
    switch (event.type) {
      case 'payday':
        if (state.career.job || state.career.benefit || state.career.pension !== null) {
          const label = state.career.job ? 'Salaire' : state.career.pension !== null ? 'Pension de retraite' : 'Allocation chômage'
          items.push({ at, icon: '💶', label, uncertain: false })
        }
        break
      case 'rent_due':
        items.push({ at, icon: '🏠', label: `Loyer (${event.amount} €)`, uncertain: false })
        break
      case 'bills_due':
        items.push({ at, icon: '🧾', label: 'Charges fixes', uncertain: false })
        break
      case 'birthday':
        items.push({ at, icon: '🎂', label: 'Ton anniversaire', uncertain: false })
        break
      case 'debt_payment': {
        const debt = state.finances.debts.find((d) => d.id === event.debtId)
        if (!debt) break
        const lender = debt.lender === 'bank' ? 'la banque' : (state.people.find((p) => p.id === debt.lender)?.name ?? 'un proche')
        items.push({ at, icon: '💳', label: `Mensualité de ${debt.monthlyPayment} € à ${lender}`, uncertain: false })
        break
      }
      case 'job_application_result':
        items.push({ at, icon: '📨', label: `Réponse de candidature : ${findCareer(event.career)?.label ?? event.career}`, uncertain: true })
        break
      case 'exam':
        items.push({ at, icon: '📝', label: `Examen : ${findProgram(event.program)?.label ?? event.program}`, uncertain: true })
        break
      case 'npc_recovered': {
        const person = state.people.find((p) => p.id === event.personId)
        if (person) items.push({ at, icon: '🌤️', label: `Guérison attendue de ${person.name}`, uncertain: false })
        break
      }
      case 'illness_recovered':
        items.push({ at, icon: '💪', label: 'Fin de ta maladie', uncertain: false })
        break
      case 'injury_recovered':
        items.push({ at, icon: '🩹', label: 'Fin de ta blessure', uncertain: false })
        break
    }
  }
  // Anniversaires des proches à venir.
  for (const person of state.people) {
    if (!person.alive || person.role === 'colleague') continue
    const at = nextBirthday(state.clock, person.birthDate)
    if (at <= until) items.push({ at, icon: '🎈', label: `Anniversaire de ${person.name}`, uncertain: false })
  }
  return items.sort((a, b) => a.at - b.at)
}

function nextBirthday(clock: number, birth: { month: number; day: number }): number {
  const today = Math.floor(clock / DAY) * DAY
  const year = new Date(clock * 60000).getUTCFullYear()
  for (const y of [year, year + 1]) {
    const last = new Date(Date.UTC(y, birth.month, 0)).getUTCDate()
    const at = Date.UTC(y, birth.month - 1, Math.min(birth.day, last)) / 60000
    if (at >= today) return at
  }
  return Infinity
}
