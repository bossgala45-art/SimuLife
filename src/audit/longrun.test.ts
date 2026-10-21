/**
 * Simulations longues : plusieurs vies, des décennies, un joueur qui agit au hasard
 * (actions valides du catalogue, conversations, prêts, études…) entre deux mois.
 * Les invariants sont vérifiés chaque mois et la sauvegarde à chaque année.
 *
 * Version courte dans la suite normale ; version longue avec `npm run audit`.
 */
import { describe, expect, it } from 'vitest'
import {
  ACTION_IDS,
  ACTIONS,
  advance,
  ageAt,
  createSimulation,
  performAction,
  topicOptions,
  validateAction,
  type ActionId,
  type ActionParams,
  type SimulationState,
} from '../engine/index.ts'
import { checkInvariants } from '../engine/invariants.ts'
import { nextRandom } from '../engine/rng.ts'
import { CAREERS, PROGRAMS, SKILLS } from '../engine/data/careers.ts'

const LONG = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.SIMULIFE_AUDIT === '1'

/** Joueur aléatoire reproductible : choisit des paramètres plausibles et ne garde que les actions valides. */
function randomParams(state: SimulationState, id: ActionId, roll: () => number): ActionParams {
  const pick = <T,>(list: readonly T[]) => list[Math.floor(roll() * list.length)]
  const def = ACTIONS[id]
  const params: ActionParams = {}
  for (const kind of def.params ?? []) {
    if (kind === 'person') params.personId = pick(state.people).id
    if (kind === 'career') params.career = pick(CAREERS).id
    if (kind === 'program') params.program = pick(PROGRAMS).id
    if (kind === 'skill') params.skill = pick(SKILLS).id
    if (kind === 'amount') params.amount = pick(def.amounts ?? [0])
    if (kind === 'topic' && params.personId) {
      const ok = topicOptions(state, params.personId, id === 'talk' ? 'person' : 'message').filter((o) => o.available)
      params.topic = ok.length ? pick(ok).id : 'chat'
    }
  }
  return params
}

export interface RunStats {
  seed: string
  months: number
  actions: number
  refused: number
  issues: string[]
  alive: boolean
  /** Âge au décès (null si vivant). */
  deathAge: number | null
  ms: number
  bytes: number
}

export function runLife(seed: string, years: number, birthYear = 1995): RunStats {
  let rng = nextRandom(Number.parseInt(seed.replace(/\D/g, '') || '7', 10) >>> 0).state
  const roll = () => {
    const r = nextRandom(rng)
    rng = r.state
    return r.value
  }
  let state = createSimulation({ seed, name: 'Audit', birthDate: { year: birthYear, month: 6, day: 30 } })
  const stats: RunStats = { seed, months: 0, actions: 0, refused: 0, issues: [], alive: true, deathAge: null, ms: 0, bytes: 0 }
  const t0 = performance.now()
  for (let month = 0; month < years * 12 && state.character.alive; month++) {
    // Quelques actions du joueur, choisies au hasard parmi celles qui sont possibles.
    for (let k = 0; k < 4; k++) {
      const id = ACTION_IDS[Math.floor(roll() * ACTION_IDS.length)] as ActionId
      const params = randomParams(state, id, roll)
      if (!validateAction(state, id, params).ok) {
        stats.refused++
        continue
      }
      const r = performAction(state, id, params)
      if (!r.ok) throw new Error(`action validée puis refusée : ${id}`)
      state = r.state
      stats.actions++
    }
    const r = advance(state, 'month')
    if (!r.ok) break
    state = r.state
    stats.months++
    const found = checkInvariants(state, { roundTrip: month % 12 === 11 })
    if (found.length) {
      stats.issues.push(...found.map((i) => `mois ${month} : ${i}`))
      break
    }
  }
  stats.alive = state.character.alive
  if (!stats.alive) stats.deathAge = ageAt(state.character.birthDate, state.clock)
  if (!state.character.alive) {
    const tail = state.log.filter((e) => e.kind !== 'day').slice(-40).map((e) => `${new Date(e.at * 60000).toISOString().slice(0, 16)} ${e.code} ${e.message}`)
    console.info(`DECES ${seed}\n${tail.join('\n')}\nattributs ${JSON.stringify(state.character.attributes)} besoins ${JSON.stringify(state.character.needs)} argent ${state.character.money}`)
  }
  stats.ms = Math.round(performance.now() - t0)
  stats.bytes = JSON.stringify(state).length
  return stats
}

describe('simulations longues', () => {
  const seeds = LONG ? Array.from({ length: 12 }, (_, i) => `audit-${i + 1}`) : ['audit-1', 'audit-2']
  const years = LONG ? 40 : 3
  for (const seed of seeds) {
    it(`${seed} : ${years} ans sans anomalie`, () => {
      const stats = runLife(seed, years)
      console.info(JSON.stringify({ ...stats, issues: stats.issues.length }))
      expect(stats.issues).toEqual([])
      expect(stats.actions).toBeGreaterThan(0)
    }, 600_000)
  }

  it('fin de vie : un personnage âgé finit par mourir, et l’état reste sain', () => {
    const stats = runLife('audit-vieillesse', LONG ? 70 : 8, 1940)
    console.info(JSON.stringify({ ...stats, issues: stats.issues.length }))
    expect(stats.issues).toEqual([])
    if (LONG) expect(stats.deathAge).not.toBeNull()
  }, 600_000)
})
