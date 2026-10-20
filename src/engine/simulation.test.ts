import { describe, expect, it } from 'vitest'
import { WORK_BONUS } from './actions.ts'
import { SimulationError } from './errors.ts'
import { NEED_IDS } from './needs.ts'
import { parseState, serializeState } from './serialization.ts'
import { advance, createSimulation, performAction, type StepResult } from './simulation.ts'
import { fromCalendar, MINUTES_PER_DAY, MINUTES_PER_WEEK, toCalendar } from './time.ts'
import { dt, newLife } from './testing.ts'
import type { SimulationState } from './types.ts'

function ok(result: StepResult): SimulationState {
  if (!result.ok) throw new Error(`Refus inattendu : ${result.issues.map((i) => i.message).join(' / ')}`)
  return result.state
}

describe('création d’une vie', () => {
  it('initialise un état reproductible à partir de la graine', () => {
    const a = newLife({ seed: 'x' })
    expect(newLife({ seed: 'x' })).toEqual(a)
    expect(newLife({ seed: 'y' }).character.attributes).not.toEqual(a.character.attributes)
    expect(a.log).toHaveLength(1)
    expect(a.log[0].message).toBe('Début de la vie de Léa, 24 ans (graine « x »).')
  })

  it('refuse des paramètres invalides avec une erreur explicite', () => {
    const base = { seed: 's', name: 'Léa', birthDate: { year: 2000, month: 1, day: 1 } }
    const expectError = (fn: () => unknown, message: RegExp) => {
      try {
        fn()
        expect.unreachable('une erreur était attendue')
      } catch (e) {
        expect(e).toBeInstanceOf(SimulationError)
        expect((e as SimulationError).code).toBe('INVALID_ARGUMENT')
        expect((e as Error).message).toMatch(message)
      }
    }
    expectError(() => createSimulation({ ...base, seed: '  ' }), /graine/)
    expectError(() => createSimulation({ ...base, name: '' }), /prénom/)
    expectError(() => createSimulation({ ...base, birthDate: { year: 2000, month: 2, day: 31 } }), /naissance invalide/)
    expectError(() => createSimulation({ ...base, birthDate: { year: 2010, month: 1, day: 1 } }), /au moins 18 ans/)
  })
})

describe('exécution des actions', () => {
  it('fait avancer l’horloge de la durée exacte et applique coût et effets', () => {
    const s = newLife({ start: dt(6, 12), needs: { hunger: 70 } })
    const after = ok(performAction(s, 'restaurant'))
    expect(after.clock - s.clock).toBe(90)
    expect(after.character.money).toBe(s.character.money - 25)
    // Faim : +5/h pendant 1 h 30, puis −60 à la fin du repas.
    expect(after.character.needs.hunger).toBeCloseTo(70 + 7.5 - 60)
  })

  it('compte la journée de travail pour le salaire du mois', () => {
    const s = newLife({ start: dt(6, 8) })
    const r = performAction(s, 'work')
    const after = ok(r)
    expect(toCalendar(after.clock)).toMatchObject({ day: 6, hour: 16, minute: 0 })
    expect(after.career.job!.daysWorked).toBe(s.career.job!.daysWorked + 1)
    // Le salaire est versé le 1er du mois ; seule une éventuelle prime arrive tout de suite.
    const bonus = r.ok && r.entries.some((e) => e.code === 'work_bonus') ? WORK_BONUS : 0
    expect(after.character.money).toBe(s.character.money + bonus)
  })

  it('n’exécute pas une action refusée et ne modifie jamais l’état reçu', () => {
    const s = newLife({ start: dt(11, 8) }) // samedi
    const snapshot = structuredClone(s)
    const r = performAction(s, 'work')
    expect(r.ok).toBe(false)
    expect(r.ok ? [] : r.issues.map((i) => i.code)).toEqual(['NOT_A_WORKDAY'])
    expect(s).toEqual(snapshot)

    ok(performAction(s, 'wait'))
    expect(s).toEqual(snapshot)
  })

  it('journalise l’action avec sa durée et son coût', () => {
    const r = performAction(newLife({ needs: { hunger: 50 } }), 'cook_meal')
    expect(r.ok && r.entries[0]).toMatchObject({
      kind: 'action',
      code: 'cook_meal',
      message: 'Cuisiner un repas (45 min, −6 €)',
      data: { action: 'cook_meal', duration: 45, cost: 6, interrupted: false },
    })
  })

  it('signale un besoin qui devient critique', () => {
    const r = performAction(newLife({ needs: { hunger: 78 } }), 'wait')
    expect(r.ok && r.entries.map((e) => e.code)).toContain('critical_hunger')
  })

  it('arrête la vie quand la santé tombe à zéro et bloque ensuite toute action', () => {
    const s = newLife({ needs: { hunger: 100, sleep: 100 } })
    s.character.attributes.health = 1
    const dead = ok(performAction(s, 'wait'))
    expect(dead.character.alive).toBe(false)
    expect(dead.log.at(-1)?.code).toBe('death')
    expect(performAction(dead, 'wait').ok).toBe(false)
    expect(advance(dead, 'day').ok).toBe(false)
  })
})

describe('passage du temps', () => {
  it('avance exactement d’un jour, d’une semaine ou d’un mois', () => {
    const s = newLife({ start: dt(31, 7) })
    expect(ok(advance(s, 'day')).clock - s.clock).toBe(MINUTES_PER_DAY)
    expect(ok(advance(s, 'week')).clock - s.clock).toBe(MINUTES_PER_WEEK)
    expect(toCalendar(ok(advance(s, 'month')).clock)).toMatchObject({ year: 2025, month: 2, day: 28, hour: 7, minute: 0 })
  })

  it('garde un journal chronologique et des besoins bornés sur deux mois', () => {
    for (const seed of ['a', 'b', 'c']) {
      const s = ok(advance(newLife({ seed }), 'month', 2))
      expect(s.character.alive).toBe(true)
      for (let i = 1; i < s.log.length; i++) {
        expect(s.log[i].seq).toBe(s.log[i - 1].seq + 1)
        expect(s.log[i].at).toBeGreaterThanOrEqual(s.log[i - 1].at)
      }
      for (const id of NEED_IDS) {
        expect(s.character.needs[id]).toBeGreaterThanOrEqual(0)
        expect(s.character.needs[id]).toBeLessThanOrEqual(100)
      }
      // Une entrée « nouvelle journée » par minuit franchi.
      expect(s.log.filter((e) => e.code === 'new_day')).toHaveLength(59)
      // La routine travaille les jours ouvrés.
      expect(s.log.filter((e) => e.code === 'work').length).toBeGreaterThanOrEqual(40)
    }
  })

  it('refuse une durée invalide', () => {
    expect(() => advance(newLife(), 'day', 0)).toThrow(SimulationError)
    expect(() => advance(newLife(), 'week', -1)).toThrow(/Durée invalide/)
  })
})

describe('reproductibilité', () => {
  const play = (s: SimulationState) => {
    s = ok(advance(s, 'day', 2))
    s = ok(performAction(s, 'wait'))
    return ok(advance(s, 'week'))
  }

  it('donne exactement le même résultat pour la même graine et les mêmes choix', () => {
    expect(play(newLife({ seed: 'repro' }))).toEqual(play(newLife({ seed: 'repro' })))
  })

  it('donne une autre histoire avec une autre graine', () => {
    expect(play(newLife({ seed: 'repro' })).rngState).not.toBe(play(newLife({ seed: 'repro-2' })).rngState)
  })

  it('reprend à l’identique après sauvegarde et chargement', () => {
    const direct = ok(advance(ok(advance(newLife({ seed: 'save' }), 'week')), 'month'))
    const saved = serializeState(ok(advance(newLife({ seed: 'save' }), 'week')))
    expect(ok(advance(parseState(saved), 'month'))).toEqual(direct)
  })

  it('n’utilise aucun hasard extérieur à la graine', () => {
    const original = Math.random
    Math.random = () => {
      throw new Error('Math.random ne doit pas être utilisé par le moteur')
    }
    try {
      expect(() => advance(newLife(), 'month')).not.toThrow()
    } finally {
      Math.random = original
    }
  })
})

describe('événements différés du calendrier', () => {
  it('prélève le loyer le 1er du mois à 8 h puis reprogramme le suivant', () => {
    const s = ok(advance(newLife(), 'month'))
    const rent = s.log.filter((e) => e.code === 'rent_due')
    expect(rent).toHaveLength(1)
    expect(rent[0].at).toBe(fromCalendar(dt(1, 8, 2)))
    expect(s.scheduled.find((e) => e.event.type === 'rent_due')?.at).toBe(fromCalendar(dt(1, 8, 3)))
  })

  it('fête l’anniversaire à la bonne date', () => {
    const s = ok(advance(newLife({ start: dt(1, 7, 3) }), 'month'))
    const birthday = s.log.find((e) => e.code === 'birthday')
    expect(birthday?.at).toBe(fromCalendar(dt(15, 9, 3)))
    expect(birthday?.message).toBe('Joyeux anniversaire ! Léa a 25 ans.')
  })
})
