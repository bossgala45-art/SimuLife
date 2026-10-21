/**
 * Questionnaire de vie soumis à des dossiers aléatoires : réponses valides, inconnues,
 * refusées, dates parfois incohérentes. Chaque dossier doit produire une vie saine.
 */
import { describe, expect, it } from 'vitest'
import { checkCoherence } from '../dossier/coherence.ts'
import { QUESTIONNAIRE as Q } from '../dossier/index.ts'
import { buildProfile } from '../dossier/profile.ts'
import { answerQuestion, configure, emptyDossier, nextQuestion } from '../dossier/questionnaire.ts'
import { parseDossier, serializeDossier } from '../dossier/serialization.ts'
import { buildTimeline } from '../dossier/timeline.ts'
import type { AnswerValue, Dossier, Question } from '../dossier/types.ts'
import { advance, createSimulation, SimulationError } from '../engine/index.ts'
import { checkInvariants } from '../engine/invariants.ts'
import { nextRandom } from '../engine/rng.ts'

const TODAY = { year: 2025, month: 6, day: 15 }
const COUNT = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.SIMULIFE_AUDIT === '1' ? 300 : 40

function randomAnswer(q: Question, d: Dossier, roll: () => number): AnswerValue {
  const r = roll()
  if (r < 0.1) return { kind: 'unknown' }
  if (r < 0.18) return { kind: 'declined' }
  const pick = <T,>(list: readonly T[]) => list[Math.floor(roll() * list.length)]
  switch (q.type) {
    case 'text':
      return { kind: 'text', text: 'x'.repeat(1 + Math.floor(roll() * Math.min(40, q.maxLength))) }
    case 'single':
      return { kind: 'choice', option: pick(q.options).id }
    case 'multi': {
      const n = 1 + Math.floor(roll() * Math.min(3, q.maxChoices ?? 3))
      return { kind: 'choices', options: [...new Set(Array.from({ length: n }, () => pick(q.options).id))] }
    }
    case 'number':
      return { kind: 'number', value: q.min + Math.floor(roll() * (q.max - q.min + 1)) }
    case 'date':
      // Parfois hors de la vie (incohérent) : la cohérence doit le signaler, pas planter.
      return { kind: 'date', date: { kind: 'age', age: Math.floor(roll() * ((d.startAge ?? 30) + 5)), approximate: roll() < 0.3 } }
  }
}

describe('questionnaire de vie : dossiers aléatoires', () => {
  it(`${COUNT} dossiers aléatoires donnent tous une vie valide`, () => {
    let rng = 12345
    const roll = () => {
      const r = nextRandom(rng)
      rng = r.state
      return r.value
    }
    const report = { lives: 0, refusedAnswers: 0, coherenceIssues: 0, creationErrors: [] as string[] }
    for (let i = 0; i < COUNT; i++) {
      const birthYear = 1940 + Math.floor(roll() * 66)
      const maxAge = TODAY.year - birthYear - 1
      const startAge = 18 + Math.floor(roll() * Math.max(1, maxAge - 18))
      const configured = configure(emptyDossier(`fuzz-${i}`), { birth: { kind: 'calendar', year: birthYear, approximate: false }, startAge }, TODAY)
      if (!configured.ok) throw new Error(configured.error)
      let d = configured.value
      for (let next = nextQuestion(Q, d), guard = 0; next && guard < 400; next = nextQuestion(Q, d), guard++) {
        const r = answerQuestion(Q, d, next.id, randomAnswer(next, d, roll))
        if (r.ok) d = r.value
        else {
          // Réponse refusée par la validation (attendu pour certaines dates) : on passe la question.
          report.refusedAnswers++
          const skip = answerQuestion(Q, d, next.id, { kind: 'declined' })
          if (!skip.ok) throw new Error(`${next.id} : impossible de passer la question (${skip.error})`)
          d = skip.value
        }
      }
      report.coherenceIssues += checkCoherence(Q, d, TODAY).length
      expect(parseDossier(serializeDossier(d))).toEqual(d)
      buildTimeline(Q, d)
      const profile = buildProfile(Q, d)!
      try {
        const state = createSimulation({
          seed: d.seed,
          name: profile.name,
          birthDate: profile.birthDate,
          start: { ...profile.startDate, hour: 7, minute: 0 },
          attributes: profile.attributes,
          ...profile.setup,
        })
        expect(checkInvariants(state, { roundTrip: true })).toEqual([])
        const after = advance(state, 'month', 2)
        if (after.ok) expect(checkInvariants(after.state)).toEqual([])
        report.lives++
      } catch (e) {
        if (e instanceof SimulationError) report.creationErrors.push(`${d.seed} : ${e.detail}`)
        else throw e
      }
    }
    console.info(JSON.stringify(report))
    expect(report.creationErrors).toEqual([])
    expect(report.lives).toBe(COUNT)
  }, 600_000)
})
