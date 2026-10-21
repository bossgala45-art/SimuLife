import { describe, expect, it } from 'vitest'
import { createSimulation, type SimulationState } from '../../engine/index.ts'
import { avatarLook, skinTone } from './look.ts'
import { avatarMode, hasWebGL } from './webgl.ts'

function life(seed = 'visage', birthYear = 2000): SimulationState {
  return createSimulation({ seed, name: 'Léa', birthDate: { year: birthYear, month: 3, day: 15 }, career: null })
}

function withNeeds(state: SimulationState, needs: Partial<SimulationState['character']['needs']>): SimulationState {
  return { ...state, character: { ...state.character, needs: { ...state.character.needs, ...needs } } }
}

describe('apparence de l’avatar (dérivée du moteur)', () => {
  it('même graine, même visage ; l’humeur change l’expression', () => {
    const a = avatarLook(life())
    expect(avatarLook(life()).skin).toBe(a.skin)
    expect(avatarLook(life()).hair).toBe(a.hair)
    expect(avatarLook(withNeeds(life(), { mood: 80 })).expression).toBe('happy')
    expect(avatarLook(withNeeds(life(), { mood: 45 })).expression).toBe('neutral')
    expect(avatarLook(withNeeds(life(), { mood: 10 })).expression).toBe('sad')
  })

  it('le sommeil ferme les yeux, la fatigue fait tomber la posture', () => {
    expect(avatarLook(withNeeds(life(), { sleep: 20 })).eyeOpen).toBe(1)
    expect(avatarLook(withNeeds(life(), { sleep: 100 })).eyeOpen).toBe(0.25)
    const tired = avatarLook(withNeeds(life(), { fatigue: 90, sleep: 70 }))
    expect(tired.droop).toBeCloseTo(0.9)
    expect(tired.label).toContain('qui a sommeil')
    expect(tired.label).toContain('fatigué·e')
  })

  it('maladie, âge, métier et décès se voient', () => {
    const base = life()
    const sick = { ...base, character: { ...base.character, statuses: ['sick' as const] } }
    expect(skinTone(avatarLook(sick))).not.toBe(avatarLook(sick).skin)
    expect(avatarLook(life('visage', 1960)).grey).toBe(true)
    expect(avatarLook(base).grey).toBe(false)

    const waiter = createSimulation({ seed: 'visage', name: 'Léa', birthDate: { year: 2000, month: 3, day: 15 }, career: 'waiter' })
    expect(avatarLook(waiter).outfit).not.toBe(avatarLook(base).outfit)

    const dead = { ...base, character: { ...base.character, alive: false } }
    expect(avatarLook(dead).label).toBe('Léa, décédé·e')
  })

  it('sans WebGL (jsdom), l’avatar passe en 2D et le dit', () => {
    expect(hasWebGL()).toBe(false)
    expect(avatarMode(true, false)).toBe('2d-no-webgl')
    expect(avatarMode(false, false)).toBe('2d-disabled')
  })
})
