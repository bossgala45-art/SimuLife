import { describe, expect, it } from 'vitest'
import { ACTION_IDS, ACTIONS, validateAction } from './actions.ts'
import { dayNumber } from './time.ts'
import { dt, newLife } from './testing.ts'

const codes = (r: ReturnType<typeof validateAction>) => (r.ok ? [] : r.issues.map((i) => i.code))

describe('catalogue d’actions', () => {
  it('déclare pour chaque action une durée, un coût et des effets cohérents', () => {
    expect(ACTION_IDS.length).toBeGreaterThanOrEqual(10)
    for (const id of ACTION_IDS) {
      const a = ACTIONS[id]
      expect(a.label.length).toBeGreaterThan(0)
      expect(Number.isInteger(a.durationMinutes) && a.durationMinutes > 0).toBe(true)
      expect(Number.isInteger(a.cost.money) && a.cost.money >= 0).toBe(true)
    }
  })
})

describe('validation des actions', () => {
  it('refuse une action inconnue', () => {
    expect(validateAction(newLife(), 'voler')).toEqual({
      ok: false,
      issues: [{ code: 'UNKNOWN_ACTION', message: 'Action inconnue : « voler ».' }],
    })
  })

  it('accepte le travail un jour de semaine pendant les heures d’embauche', () => {
    expect(validateAction(newLife({ start: dt(6, 8) }), 'work')).toEqual({ ok: true })
  })

  it('refuse le travail le week-end et hors horaires, en listant toutes les raisons', () => {
    expect(codes(validateAction(newLife({ start: dt(11, 8) }), 'work'))).toEqual(['NOT_A_WORKDAY'])
    expect(codes(validateAction(newLife({ start: dt(6, 14) }), 'work'))).toEqual(['OUTSIDE_WORK_HOURS'])
    const tired = newLife({ start: dt(12, 14), needs: { fatigue: 90, sleep: 90 } })
    expect(codes(validateAction(tired, 'work'))).toEqual(['NOT_A_WORKDAY', 'OUTSIDE_WORK_HOURS', 'TOO_TIRED', 'TOO_SLEEPY'])
  })

  it('refuse de travailler deux fois le même jour', () => {
    const s = newLife({ start: dt(6, 9) })
    s.character.lastWorkDay = dayNumber(s.clock)
    expect(codes(validateAction(s, 'work'))).toEqual(['ALREADY_WORKED_TODAY'])
  })

  it('refuse une action trop chère avec un message chiffré, découvert autorisé compris', () => {
    // −298 € avec 300 € de découvert autorisé : 2 € utilisables.
    const r = validateAction(newLife({ money: -298, needs: { hunger: 50 } }), 'cook_meal')
    expect(r).toEqual({
      ok: false,
      issues: [
        { code: 'INSUFFICIENT_MONEY', message: 'Pas assez d’argent : 6 € nécessaires, 2 € disponibles (découvert autorisé compris).' },
      ],
    })
    expect(validateAction(newLife({ money: 3, needs: { hunger: 50 } }), 'cook_meal')).toEqual({ ok: true })
  })

  it('laisse les actions gratuites possibles avec un compte à découvert', () => {
    const s = newLife({ money: -300, needs: { hunger: 50 } })
    expect(validateAction(s, 'wait')).toEqual({ ok: true })
    expect(validateAction(s, 'shower')).toEqual({ ok: true })
    expect(codes(validateAction(s, 'cook_meal'))).toEqual(['INSUFFICIENT_MONEY'])
  })

  it('vérifie les besoins avant d’agir', () => {
    expect(codes(validateAction(newLife({ needs: { hunger: 10 } }), 'cook_meal'))).toEqual(['NOT_HUNGRY'])
    expect(codes(validateAction(newLife({ needs: { sleep: 5 } }), 'sleep'))).toEqual(['NOT_SLEEPY'])
    expect(codes(validateAction(newLife({ needs: { hygiene: 95 } }), 'shower'))).toEqual(['ALREADY_CLEAN'])
  })

  it('respecte les horaires d’ouverture', () => {
    expect(codes(validateAction(newLife({ start: dt(6, 8), needs: { hunger: 50 } }), 'restaurant'))).toEqual(['CLOSED'])
    expect(validateAction(newLife({ start: dt(6, 12), needs: { hunger: 50 } }), 'restaurant').ok).toBe(true)
    expect(codes(validateAction(newLife({ start: dt(6, 12) }), 'friends'))).toEqual(['CLOSED'])
  })

  it('interdit le sport en cas de blessure', () => {
    const s = newLife()
    s.character.statuses.push('injured')
    expect(codes(validateAction(s, 'sport'))).toEqual(['INJURED'])
  })

  it('refuse toute action si le personnage est décédé', () => {
    const s = newLife()
    s.character.alive = false
    for (const id of ACTION_IDS) expect(codes(validateAction(s, id))).toEqual(['CHARACTER_DEAD'])
  })

  it('autorise toujours « attendre » pour un personnage vivant', () => {
    expect(validateAction(newLife({ money: 0, needs: { fatigue: 100, sleep: 100, hunger: 100 } }), 'wait')).toEqual({ ok: true })
  })
})
