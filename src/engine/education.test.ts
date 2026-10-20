import { describe, expect, it } from 'vitest'
import { validateAction } from './actions.ts'
import { examProbability } from './education.ts'
import { nextRandom } from './rng.ts'
import { performAction } from './simulation.ts'
import { levelOf } from './skills.ts'
import { toCalendar } from './time.ts'
import { dt, newLife, ok, withEvent } from './testing.ts'

const september = dt(1, 10, 9) // lundi 1er septembre 2025
const issues = (r: ReturnType<typeof validateAction>) => (r.ok ? [] : r.issues)
function rngWhere(test: (value: number) => boolean): number {
  for (let s = 1; ; s++) if (test(nextRandom(s).value)) return s
}

describe('scolarité et diplômes', () => {
  it('n’inscrit qu’à la rentrée pour une formation diplômante', () => {
    expect(issues(validateAction(newLife({ start: dt(6, 10) }), 'enroll', { program: 'cap_cuisine' }))).toEqual([
      { code: 'ENROLLMENT_CLOSED', message: 'Inscriptions seulement en septembre.' },
    ])
    const s = ok(performAction(newLife({ start: september }), 'enroll', { program: 'cap_cuisine' }))
    expect(s.education.enrollment).toMatchObject({ program: 'cap_cuisine', studyHours: 0 })
    const exam = s.scheduled.find((e) => e.event.type === 'exam')!
    expect(toCalendar(exam.at)).toMatchObject({ year: 2026, month: 9, day: 1, hour: 10 })
  })

  it('vérifie les prérequis et les frais', () => {
    expect(issues(validateAction(newLife({ start: september }), 'enroll', { program: 'licence' }))).toEqual([
      { code: 'REQUIREMENTS_NOT_MET', message: 'Niveau d’études requis : bac ou plus' },
    ])
    expect(validateAction(newLife({ start: september, diplomas: ['bac'] }), 'enroll', { program: 'licence' }).ok).toBe(true)
    // Formation privée accessible toute l'année, mais coûteuse (montant approximatif).
    expect(issues(validateAction(newLife({ start: dt(6, 10) }), 'enroll', { program: 'titre_dev' }))[0].code).toBe('INSUFFICIENT_MONEY')
    const paid = ok(performAction(newLife({ start: dt(6, 10), money: 5000 }), 'enroll', { program: 'titre_dev' }))
    expect(paid.character.money).toBe(1000)
  })

  it('compte les heures d’étude et fait progresser les compétences du programme', () => {
    let s = ok(performAction(newLife({ start: september }), 'enroll', { program: 'cap_cuisine' }))
    const before = examProbability(s)
    s.clock += 9 * 60 // 19 h
    for (let i = 0; i < 5; i++) s = ok(performAction(s, 'study'))
    expect(s.education.enrollment!.studyHours).toBe(10)
    expect(levelOf(s.skills.cooking)).toBeGreaterThan(0)
    expect(examProbability(s)).toBeGreaterThan(before)
  })

  it('l’examen différé délivre le diplôme… ou non, selon le tirage', () => {
    const s = ok(performAction(newLife({ start: september }), 'enroll', { program: 'cap_cuisine' }))
    s.education.enrollment!.studyHours = 300
    const p = examProbability(s)
    expect(p).toBeGreaterThan(0.7)

    const passed = structuredClone(s)
    passed.rngState = rngWhere((v) => v < p)
    const a = withEvent(passed, { type: 'exam', program: 'cap_cuisine' })
    expect(a.education.diplomas.map((d) => d.id)).toEqual(['cap_cuisine'])
    expect(a.education.enrollment).toBeNull()
    // Les parents en gardent un souvenir de fierté.
    const parent = a.people.find((x) => x.role === 'parent')!
    expect(a.relationships[parent.id].memories.at(-1)).toMatchObject({ kind: 'diploma' })

    const failed = structuredClone(s)
    failed.rngState = rngWhere((v) => v >= p)
    const b = withEvent(failed, { type: 'exam', program: 'cap_cuisine' })
    expect(b.education.diplomas).toEqual([])
    expect(b.log.at(-1)!.code).toBe('exam_failed')
  })

  it('l’abandon annule l’examen prévu', () => {
    let s = ok(performAction(newLife({ start: september }), 'enroll', { program: 'cap_cuisine' }))
    s = ok(performAction(s, 'drop_out'))
    expect(s.education.enrollment).toBeNull()
    expect(s.scheduled.some((e) => e.event.type === 'exam')).toBe(false)
  })
})
