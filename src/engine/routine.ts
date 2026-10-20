/**
 * Routine automatique utilisée quand on fait avancer le temps par jour, semaine ou mois.
 *
 * Elle choisit la première action souhaitée ET valide, par ordre de priorité.
 * « Attendre » sert de repli : elle est toujours valide pour un personnage vivant.
 */
import { ACTIONS, validateAction, type ActionDefinition } from './actions.ts'
import { invariant } from './errors.ts'
import { toCalendar } from './time.ts'
import type { ActionId, SimulationState } from './types.ts'

export function routineWishes(state: SimulationState): ActionId[] {
  const { hour, weekday } = toCalendar(state.clock)
  const n = state.character.needs
  const night = hour >= 22 || hour < 6
  // Avant une éventuelle journée de travail, on mange et on se lave plus tôt.
  const morning = hour >= 6 && hour < 11
  const wishes: ActionId[] = []

  if (n.sleep >= 70 || night) wishes.push('sleep')
  if (n.hunger >= 45 || (morning && n.hunger >= 25)) wishes.push('cook_meal')
  if (n.hygiene <= 40 || (morning && n.hygiene <= 60)) wishes.push('shower')
  wishes.push('work')
  if (n.stress >= 50 || n.fatigue >= 60) wishes.push('relax')
  // Sport lundi, mercredi et vendredi soir.
  if ((weekday === 0 || weekday === 2 || weekday === 4) && hour >= 18 && n.fatigue < 50) wishes.push('sport')
  // Sorties du vendredi au dimanche soir, si le budget le permet.
  if (weekday >= 4 && hour >= 19 && state.character.money >= 100) wishes.push('friends')
  wishes.push('wait')
  return wishes
}

/** Action à lancer maintenant sans dépasser `limit` (seules les actions interruptibles peuvent être écourtées). */
export function chooseRoutineAction(state: SimulationState, limit: number): ActionDefinition {
  const remaining = limit - state.clock
  for (const id of routineWishes(state)) {
    const def = ACTIONS[id]
    if (def.durationMinutes > remaining && !def.interruptible) continue
    if (validateAction(state, id).ok) return def
  }
  invariant(false, 'Aucune action possible pour la routine.')
}
