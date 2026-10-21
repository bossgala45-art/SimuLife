/**
 * Routine automatique utilisée quand on fait avancer le temps par jour, semaine ou mois.
 *
 * Elle choisit la première action souhaitée ET valide, par ordre de priorité.
 * « Attendre » sert de repli : elle est toujours valide pour un personnage vivant.
 */
import { ACTIONS, validateAction, type ActionDefinition } from './actions.ts'
import { hasPendingApplication, hireProbability, salaryOffer } from './careers.ts'
import { invariant } from './errors.ts'
import { isBirthday } from './people.ts'
import { available } from './finances.ts'
import { daysSinceContact } from './relationships.ts'
import { loanProbability } from './social.ts'
import type { CareerDefinition } from './data/careers.ts'
import { eligibleCareers } from './requirements.ts'
import { dayNumber, toCalendar } from './time.ts'
import type { ActionId, ActionParams, SimulationState } from './types.ts'

export interface RoutineChoice {
  id: ActionId
  params?: ActionParams
}

/** Métier accessible au meilleur salaire espéré (probabilité × salaire) ; une seule candidature à la fois. */
function bestApplication(state: SimulationState): string | undefined {
  if (hasPendingApplication(state)) return undefined
  const expected = (c: CareerDefinition) => hireProbability(state, c.id) * salaryOffer(state, c)
  const options = [...eligibleCareers(state)].sort((a, b) => expected(b) - expected(a))
  return options[0]?.id
}

/** Proche le plus susceptible de prêter 200 €, s'il y a une chance raisonnable (≥ 25 %). */
function bestLender(state: SimulationState): string | undefined {
  const candidates = state.people
    .filter((p) => p.alive && p.role !== 'colleague' && !state.finances.debts.some((d) => d.lender === p.id))
    .map((p) => ({ id: p.id, p: loanProbability(state, p.id, 200) }))
    .filter((c) => c.p >= 0.25)
    .sort((a, b) => b.p - a.p)
  return candidates[0]?.id
}

/** Proche à appeler en priorité : malade sans nouvelles, anniversaire du jour, ou contact ancien le dimanche. */
function personToCall(state: SimulationState): string | undefined {
  const { weekday, hour } = toCalendar(state.clock)
  const today = toCalendar(state.clock)
  const alive = state.people.filter((p) => p.alive && p.role !== 'colleague')
  const contactedToday = (id: string) => daysSinceContact(state, id) === 0
  const sick = alive.find((p) => {
    const last = state.relationships[p.id]?.lastContact ?? null
    return p.sickSince !== null && (last === null || last < p.sickSince)
  })
  if (sick) return sick.id
  const birthday = alive.find((p) => isBirthday(p, today) && state.relationships[p.id]?.closeness >= 50 && !contactedToday(p.id))
  if (birthday) return birthday.id
  // Le dimanche soir, un appel à la personne la moins contactée (un seul par jour).
  if (weekday === 6 && hour >= 17 && !alive.some((p) => contactedToday(p.id))) {
    const due = alive
      .filter((p) => state.relationships[p.id]?.closeness >= 30 && (daysSinceContact(state, p.id) ?? Infinity) >= 7)
      .sort((a, b) => (daysSinceContact(state, b.id) ?? Infinity) - (daysSinceContact(state, a.id) ?? Infinity))
    return due[0]?.id
  }
  return undefined
}

/** L'action a-t-elle déjà été faite aujourd'hui ? (parcourt le journal depuis la fin) */
function doneToday(state: SimulationState, code: string): boolean {
  const today = dayNumber(state.clock)
  for (let i = state.log.length - 1; i >= 0 && dayNumber(state.log[i].at) === today; i--) {
    if (state.log[i].code === code) return true
  }
  return false
}

export function routineWishes(state: SimulationState): RoutineChoice[] {
  const { hour, weekday } = toCalendar(state.clock)
  const n = state.character.needs
  const night = hour >= 22 || hour < 6
  // Avant une éventuelle journée de travail, on mange et on se lave plus tôt.
  const morning = hour >= 6 && hour < 11
  const sick = state.character.statuses.includes('sick')
  const wishes: RoutineChoice[] = []

  if (n.sleep >= 70 || night) wishes.push({ id: 'sleep' })
  const broke = available(state) < ACTIONS.cook_meal.cost.money
  // Sans argent, la dernière distribution de l'aide alimentaire (avant 19 h) tient jusqu'au lendemain midi.
  const lastAid = broke && hour >= 17 && hour < 19 && n.hunger >= 25
  if (n.hunger >= 45 || (morning && n.hunger >= 25) || lastAid) {
    wishes.push({ id: 'cook_meal' })
    // Plus de quoi payer un repas : épargne, puis prêt d'un proche, puis aide alimentaire.
    if (broke) {
      if (state.finances.savings >= 100) wishes.push({ id: 'withdraw_savings', params: { amount: 100 } })
      const lender = bestLender(state)
      if (lender) wishes.push({ id: 'ask_loan', params: { personId: lender, amount: 200 } })
      wishes.push({ id: 'food_aid' })
    }
  }
  if (n.hygiene <= 40 || (morning && n.hygiene <= 60)) wishes.push({ id: 'shower' })
  if (sick) {
    wishes.push({ id: 'relax' }, { id: 'wait' })
    return wishes
  }
  wishes.push({ id: 'work' })
  if (!state.career.job && weekday < 5) {
    const career = bestApplication(state)
    if (career) wishes.push({ id: 'apply_job', params: { career } })
  }
  const toCall = personToCall(state)
  if (toCall) wishes.push({ id: 'call', params: { personId: toCall } })
  if (n.stress >= 50 || n.fatigue >= 60) wishes.push({ id: 'relax' })
  if (state.education.enrollment && weekday < 5 && hour >= 19 && n.fatigue < 70) wishes.push({ id: 'study' })
  // Sport lundi, mercredi et vendredi soir, une séance par jour.
  if ((weekday === 0 || weekday === 2 || weekday === 4) && hour >= 18 && n.fatigue < 50 && !doneToday(state, 'sport')) {
    wishes.push({ id: 'sport' })
  }
  // Sorties du vendredi au dimanche soir, si le budget le permet.
  if (weekday >= 4 && hour >= 19 && state.character.money >= 100) wishes.push({ id: 'friends' })
  wishes.push({ id: 'wait' })
  return wishes
}

/** Action à lancer maintenant sans dépasser `limit` (seules les actions interruptibles peuvent être écourtées). */
export function chooseRoutineAction(state: SimulationState, limit: number): { def: ActionDefinition; params: ActionParams } {
  const remaining = limit - state.clock
  for (const { id, params = {} } of routineWishes(state)) {
    const def = ACTIONS[id]
    if (def.durationMinutes > remaining && !def.interruptible) continue
    if (validateAction(state, id, params).ok) return { def, params }
  }
  invariant(false, 'Aucune action possible pour la routine.')
}
