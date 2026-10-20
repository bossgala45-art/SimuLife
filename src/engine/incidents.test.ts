import { describe, expect, it } from 'vitest'
import { validateAction } from './actions.ts'
import { dailyIncidents, INCIDENTS } from './incidents.ts'
import { nextRandom } from './rng.ts'
import { MINUTES_PER_DAY } from './time.ts'
import { dt, newLife, withEvent } from './testing.ts'

const incident = (id: string) => INCIDENTS.find((i) => i.id === id)!
function rngWhere(test: (value: number) => boolean): number {
  for (let s = 1; ; s++) if (test(nextRandom(s).value)) return s
}

describe('événements imprévus', () => {
  it('ont une probabilité qui dépend du contexte', () => {
    const s = newLife()
    const base = incident('illness').probability(s)
    s.character.needs.stress = 90
    expect(incident('illness').probability(s)).toBeGreaterThan(base)
    s.character.statuses.push('sick')
    expect(incident('illness').probability(s)).toBe(0)

    expect(incident('layoff').probability(newLife({ career: null }))).toBe(0)
    const struggling = newLife()
    struggling.career.job!.performance = 20
    expect(incident('layoff').probability(struggling)).toBe(0.01)
  })

  it('ne se répètent pas pendant leur délai de carence', () => {
    const s = newLife()
    s.character.statuses.push('sick') // pas de tirage pour la maladie : la panne est tirée en premier
    s.rngState = rngWhere((v) => v < 0.002)
    dailyIncidents(s)
    expect(s.log.at(-1)!.code).toBe('appliance')
    expect(s.cooldowns.appliance).toBe(s.clock + 60 * MINUTES_PER_DAY)

    s.rngState = rngWhere((v) => v < 0.002)
    const count = s.log.length
    dailyIncidents(s)
    expect(s.log.slice(count).some((e) => e.code === 'appliance')).toBe(false)
  })

  it('une maladie empêche de travailler, puis guérit', () => {
    const s = newLife({ start: dt(6, 8) })
    incident('illness').apply(s)
    expect(validateAction(s, 'work')).toMatchObject({ ok: false, issues: [{ code: 'SICK' }] })
    expect(s.scheduled.some((e) => e.event.type === 'illness_recovered')).toBe(true)
    const healed = withEvent(s, { type: 'illness_recovered' })
    expect(validateAction(healed, 'work').ok).toBe(true)
  })
})
