import { describe, expect, it } from 'vitest'
import { validateAction } from './actions.ts'
import { SimulationError } from './errors.ts'
import { INJURY_RECOVERY_DAYS, processDueEvents, scheduleEvent, triggerEvent } from './events.ts'
import { advance } from './simulation.ts'
import { MINUTES_PER_DAY } from './time.ts'
import { newLife } from './testing.ts'

describe('événements immédiats', () => {
  it('s’appliquent tout de suite et sont journalisés', () => {
    const s = newLife()
    const money = s.character.money
    triggerEvent(s, { type: 'work_bonus', amount: 80 })
    expect(s.character.money).toBe(money + 80)
    expect(s.log.at(-1)).toMatchObject({ kind: 'event', code: 'work_bonus', at: s.clock })
  })
})

describe('événements différés', () => {
  it('une blessure bloque le sport puis guérit exactement après le délai prévu', () => {
    const s = newLife()
    const injuredAt = s.clock
    triggerEvent(s, { type: 'sport_injury' })
    expect(s.character.statuses).toContain('injured')
    expect(validateAction(s, 'sport').ok).toBe(false)

    const r = advance(s, 'week')
    if (!r.ok) throw new Error('refus inattendu')
    const healed = r.state.log.find((e) => e.code === 'injury_recovered')
    expect(healed?.at).toBe(injuredAt + INJURY_RECOVERY_DAYS * MINUTES_PER_DAY)
    expect(r.state.character.statuses).not.toContain('injured')
  })

  it('s’appliquent dans l’ordre chronologique, puis dans l’ordre de programmation', () => {
    const s = newLife()
    s.scheduled = []
    scheduleEvent(s, s.clock + 10, { type: 'friend_call' })
    scheduleEvent(s, s.clock + 5, { type: 'work_bonus', amount: 1 })
    scheduleEvent(s, s.clock + 10, { type: 'work_bonus', amount: 2 })
    s.clock += 10
    processDueEvents(s)
    expect(s.log.slice(-3).map((e) => e.code)).toEqual(['work_bonus', 'friend_call', 'work_bonus'])
    expect(s.scheduled).toEqual([])
  })

  it('ne peuvent pas être programmés dans le passé', () => {
    const s = newLife()
    expect(() => scheduleEvent(s, s.clock - 1, { type: 'friend_call' })).toThrow(SimulationError)
  })
})
