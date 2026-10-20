/**
 * Événements imprévus, tirés chaque nuit. Chacun a une probabilité qui dépend
 * du contexte (santé, stress, emploi…) et un délai avant de pouvoir se reproduire,
 * pour rester cohérent (pas deux pannes de lave-linge la même semaine).
 */
import { layOff } from './careers.ts'
import { addMoney } from './finances.ts'
import { writeLog } from './journal.ts'
import { clamp } from './needs.ts'
import { chance, drawRandom } from './rng.ts'
import { scheduleEvent } from './schedule.ts'
import { dayNumber, MINUTES_PER_DAY } from './time.ts'
import type { SimulationState } from './types.ts'

export const ILLNESS_DAYS = 3

export interface IncidentDefinition {
  id: string
  label: string
  /** Probabilité par jour dans la situation actuelle (0 = impossible). */
  probability: (state: SimulationState) => number
  cooldownDays: number
  apply: (draft: SimulationState) => void
}

const amountBetween = (draft: SimulationState, min: number, max: number) => min + Math.floor(drawRandom(draft) * (max - min + 1))

export const INCIDENTS: IncidentDefinition[] = [
  {
    id: 'illness',
    label: 'Maladie passagère',
    probability: (s) => {
      if (s.character.statuses.includes('sick')) return 0
      const c = s.character
      return 0.002 + (c.attributes.health < 70 ? 0.004 : 0) + (c.needs.stress > 70 ? 0.004 : 0) + (c.needs.sleep > 80 ? 0.003 : 0)
    },
    cooldownDays: 14,
    apply(draft) {
      const c = draft.character
      c.statuses.push('sick')
      c.attributes.health = clamp(c.attributes.health - 5)
      // Une maladie couvre des journées entières : la guérison a lieu en début de journée,
      // après le contrôle des absences de la veille.
      scheduleEvent(draft, (dayNumber(draft.clock) + ILLNESS_DAYS) * MINUTES_PER_DAY + 5, { type: 'illness_recovered' })
      writeLog(draft, 'warning', 'illness', `Tu tombes malade : environ ${ILLNESS_DAYS} jours de repos. Tes absences au travail sont justifiées.`)
    },
  },
  {
    id: 'appliance',
    label: 'Panne d’un appareil ménager',
    probability: () => 0.002,
    cooldownDays: 60,
    apply(draft) {
      const cost = amountBetween(draft, 80, 400)
      addMoney(draft, -cost, 'Réparation imprévue')
      writeLog(draft, 'money', 'appliance', `Imprévu : un appareil ménager tombe en panne (−${cost} €).`, { amount: cost })
    },
  },
  {
    id: 'lost_item',
    label: 'Objet perdu',
    probability: () => 0.001,
    cooldownDays: 90,
    apply(draft) {
      const cost = amountBetween(draft, 20, 80)
      addMoney(draft, -cost, 'Objet perdu à remplacer')
      writeLog(draft, 'money', 'lost_item', `Imprévu : tu perds un objet qu’il faut remplacer (−${cost} €).`, { amount: cost })
    },
  },
  {
    id: 'refund',
    label: 'Remboursement inattendu',
    probability: () => 0.001,
    cooldownDays: 90,
    apply(draft) {
      const gain = amountBetween(draft, 20, 150)
      addMoney(draft, gain, 'Remboursement d’un trop-perçu')
      writeLog(draft, 'money', 'refund', `Bonne surprise : remboursement d’un trop-perçu (+${gain} €).`, { amount: gain })
    },
  },
  {
    id: 'layoff',
    label: 'Licenciement',
    // Rare, sauf si l'appréciation au travail est très basse.
    probability: (s) => (s.career.job ? (s.career.job.performance < 30 ? 0.01 : 0.0003) : 0),
    cooldownDays: 0,
    apply: layOff,
  },
]

export function dailyIncidents(draft: SimulationState): void {
  for (const incident of INCIDENTS) {
    if ((draft.cooldowns[incident.id] ?? -Infinity) > draft.clock) continue
    const p = incident.probability(draft)
    if (p > 0 && chance(draft, p)) {
      incident.apply(draft)
      if (incident.cooldownDays > 0) draft.cooldowns[incident.id] = draft.clock + incident.cooldownDays * MINUTES_PER_DAY
    }
  }
}

export const INCIDENT_HANDLERS = {
  illness_recovered(draft: SimulationState) {
    draft.character.statuses = draft.character.statuses.filter((s) => s !== 'sick')
    writeLog(draft, 'event', 'illness_recovered', 'Tu es guéri·e.')
  },
}
