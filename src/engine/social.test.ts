import { describe, expect, it } from 'vitest'
import { actionOutcomes, validateAction } from './actions.ts'
import { npcDailyUpdate } from './autonomy.ts'
import { addDebt } from './finances.ts'
import { addMemory, memoryScore, MEMORY_LIMIT } from './relationships.ts'
import { nextRandom } from './rng.ts'
import { advance, performAction } from './simulation.ts'
import { MINUTES_PER_DAY, toCalendar } from './time.ts'
import { dt, newLife, ok, withEvent } from './testing.ts'
import type { SimulationState } from './types.ts'

/** État du générateur dont le prochain tirage vérifie la condition (pour tester chaque issue). */
function rngWhere(test: (value: number) => boolean): number {
  for (let s = 1; ; s++) if (test(nextRandom(s).value)) return s
}
const issueCodes = (r: ReturnType<typeof validateAction>) => (r.ok ? [] : r.issues.map((i) => i.code))
const mother = (s: SimulationState) => s.people.find((p) => p.relation === 'Mère')!

describe('personnages non joueurs', () => {
  it('crée un entourage reproductible, adapté aux informations fournies', () => {
    const s = newLife({ entourage: { parents: ['mother'], siblings: 2, friends: 1, familyCloseness: 70 } })
    expect(s.people.map((p) => p.role)).toEqual(['parent', 'sibling', 'sibling', 'friend', 'colleague', 'colleague'])
    expect(mother(s).name).toBeTruthy()
    expect(s.relationships[mother(s).id].closeness).toBe(70)
    expect(newLife({ seed: 'x' }).people).toEqual(newLife({ seed: 'x' }).people)
    expect(newLife({ seed: 'x' }).people).not.toEqual(newLife({ seed: 'y' }).people)
    // Pas deux proches avec le même prénom.
    for (const seed of ['a', 'b', 'c', 'd', 'e']) {
      const names = newLife({ seed, entourage: { siblings: 3, friends: 3 } }).people.map((p) => p.name)
      expect(new Set(names).size, seed).toBe(names.length)
    }
    // Les collègues exercent le même métier que le joueur.
    expect(s.people.filter((p) => p.role === 'colleague').every((p) => p.occupation === 'cashier')).toBe(true)
  })
})

describe('mémoire relationnelle', () => {
  it('oublie d’abord les souvenirs légers au-delà de la limite', () => {
    const s = newLife()
    const id = mother(s).id
    addMemory(s, id, 'gift', 2, 'léger')
    for (let i = 0; i < MEMORY_LIMIT; i++) addMemory(s, id, 'help', 6, `important ${i}`)
    const memories = s.relationships[id].memories
    expect(memories).toHaveLength(MEMORY_LIMIT)
    expect(memories.some((m) => m.text === 'léger')).toBe(false)
  })

  it('donne moins de poids aux souvenirs anciens', () => {
    const s = newLife()
    const id = mother(s).id
    addMemory(s, id, 'argument', -10, 'dispute')
    expect(memoryScore(s, id)).toBe(-10)
    s.clock += 730 * MINUTES_PER_DAY
    expect(memoryScore(s, id)).toBeCloseTo(-2)
  })
})

describe('autonomie des proches', () => {
  it('fait vieillir et évoluer les proches sans le joueur', () => {
    const s = newLife()
    const p = mother(s)
    p.birthDate = { year: 1961, month: 1, day: 1 } // 64 ans en 2025
    p.occupation = 'accountant'
    const sibling = s.people.find((x) => x.role === 'sibling' || x.role === 'friend')!
    sibling.birthDate = { year: 2002, month: 1, day: 1 }
    sibling.occupation = 'student'
    npcDailyUpdate(s)
    expect(p.occupation).toBe('retired')
    expect(sibling.occupation).not.toBe('student')
    expect(s.log.map((e) => e.code)).toEqual(expect.arrayContaining(['npc_retired', 'npc_first_job']))
  })

  it('se souvient du soutien, ou de l’absence, pendant une maladie', () => {
    const base = newLife()
    const id = mother(base).id
    base.relationships[id].closeness = 60
    mother(base).sickSince = base.clock

    const supported = structuredClone(base)
    supported.relationships[id].lastContact = base.clock + 60
    const a = withEvent(supported, { type: 'npc_recovered', personId: id })
    expect(a.relationships[id].memories.at(-1)).toMatchObject({ kind: 'support', weight: 5 })

    const b = withEvent(base, { type: 'npc_recovered', personId: id })
    expect(b.relationships[id].memories.at(-1)).toMatchObject({ kind: 'absent_when_sick', weight: -5 })
    expect(b.relationships[id].closeness).toBe(55)
  })

  it('constate un anniversaire souhaité ou oublié le lendemain', () => {
    const base = newLife({ start: dt(8, 0) }) // mercredi 8 janvier, minuit
    const id = mother(base).id
    mother(base).birthDate = { year: 1970, month: 1, day: 7 }
    base.relationships[id].closeness = 60

    const forgotten = structuredClone(base)
    npcDailyUpdate(forgotten)
    expect(forgotten.relationships[id].memories.at(-1)).toMatchObject({ kind: 'birthday_forgotten' })

    const wished = structuredClone(base)
    wished.relationships[id].lastContact = base.clock - 10 * 60 // hier à 14 h
    npcDailyUpdate(wished)
    expect(wished.relationships[id].memories.at(-1)).toMatchObject({ kind: 'birthday_wished' })
  })

  it('produit des événements relationnels au fil des mois', () => {
    const s = ok(advance(newLife({ seed: 'vie-sociale' }), 'month', 6))
    expect(s.log.some((e) => e.kind === 'social' && e.code.startsWith('npc_'))).toBe(true)
  })
})

describe('actions envers les proches', () => {
  it('vérifie la cible, l’heure et le contexte', () => {
    const s = newLife({ start: dt(6, 10) })
    expect(issueCodes(validateAction(s, 'call'))).toEqual(['MISSING_PARAM'])
    expect(issueCodes(validateAction(s, 'call', { personId: 'p999' }))).toEqual(['UNKNOWN_PERSON'])
    mother(s).alive = false
    expect(issueCodes(validateAction(s, 'call', { personId: mother(s).id }))).toEqual(['PERSON_UNAVAILABLE'])
    expect(issueCodes(validateAction(newLife({ start: dt(6, 23) }), 'call', { personId: 'p1' }))).toEqual(['CLOSED'])
  })

  it('rapproche après un appel et garde la date du contact', () => {
    const s = newLife({ start: dt(6, 10) })
    const id = mother(s).id
    const after = ok(performAction(s, 'call', { personId: id }))
    expect(after.relationships[id].lastContact).toBe(after.clock)
    expect(after.relationships[id].closeness).toBeGreaterThan(s.relationships[id].closeness)
  })

  it('ne rend visite à un proche éloigné que le week-end, pour un trajet plus cher', () => {
    const s = newLife({ start: dt(6, 11) })
    mother(s).distant = true
    expect(issueCodes(validateAction(s, 'visit', { personId: mother(s).id }))).toEqual(['PERSON_UNAVAILABLE'])
    const weekend = newLife({ start: dt(11, 11) })
    mother(weekend).distant = true
    const after = ok(performAction(weekend, 'visit', { personId: mother(weekend).id }))
    expect(after.character.money).toBe(1000 - 60)
  })

  it('annonce le risque de dispute et en garde la trace si elle survient', () => {
    const s = newLife({ start: dt(11, 11) })
    const id = mother(s).id
    s.relationships[id].tension = 80
    expect(actionOutcomes(s, 'visit', { personId: id })).toEqual([{ label: 'Dispute', probability: 0.4 }])
    s.rngState = rngWhere((v) => v < 0.4)
    const after = ok(performAction(s, 'visit', { personId: id }))
    expect(after.relationships[id].memories.at(-1)).toMatchObject({ kind: 'argument' })
  })

  it('n’aide qu’un proche qui en a besoin', () => {
    const s = newLife({ start: dt(11, 11) })
    const id = mother(s).id
    expect(issueCodes(validateAction(s, 'help', { personId: id }))).toEqual(['NOT_NEEDED'])
    mother(s).sickSince = s.clock
    mother(s).distant = false
    const after = ok(performAction(s, 'help', { personId: id }))
    expect(after.relationships[id].memories.at(-1)).toMatchObject({ kind: 'help', weight: 6 })
  })

  it('demande un prêt : probabilité annoncée, accord ou refus, puis remboursements', () => {
    const s = newLife({ start: dt(6, 10) })
    const id = mother(s).id
    const [outcome] = actionOutcomes(s, 'ask_loan', { personId: id, amount: 200 })
    expect(outcome.label).toBe('Accord')

    const accepted = structuredClone(s)
    accepted.rngState = rngWhere((v) => v < outcome.probability)
    const yes = ok(performAction(accepted, 'ask_loan', { personId: id, amount: 200 }))
    expect(yes.character.money).toBe(1200)
    expect(yes.finances.debts).toEqual([expect.objectContaining({ lender: id, remaining: 200, monthlyPayment: 40 })])
    expect(issueCodes(validateAction(yes, 'ask_loan', { personId: id, amount: 200 }))).toEqual(['ALREADY_IN_DEBT'])

    const refused = structuredClone(s)
    refused.rngState = rngWhere((v) => v >= outcome.probability)
    const no = ok(performAction(refused, 'ask_loan', { personId: id, amount: 200 }))
    expect(no.character.money).toBe(1000)
    expect(no.relationships[id].memories.at(-1)).toMatchObject({ kind: 'loan_refused' })

    const colleague = s.people.find((p) => p.role === 'colleague')!
    expect(issueCodes(validateAction(s, 'ask_loan', { personId: colleague.id, amount: 200 }))).toEqual(['PERSON_UNAVAILABLE'])
  })

  it('un remboursement manqué rend le proche moins enclin à prêter de nouveau', () => {
    const s = newLife({ start: dt(6, 10), money: 0 })
    const id = mother(s).id
    const before = actionOutcomes(s, 'ask_loan', { personId: id, amount: 200 })[0].probability
    const debt = addDebt(s, { lender: id, principal: 200, monthlyPayment: 40, annualRate: 0 })
    let after = withEvent(s, { type: 'debt_payment', debtId: debt.id })
    after = { ...after, finances: { ...after.finances, debts: [] } }
    expect(actionOutcomes(after, 'ask_loan', { personId: id, amount: 200 })[0].probability).toBeLessThan(before)
  })
})

describe('échéances', () => {
  it('le prélèvement d’un prêt entre proches a lieu le 10 du mois', () => {
    const s = newLife({ start: dt(6, 10) })
    addDebt(s, { lender: mother(s).id, principal: 200, monthlyPayment: 40, annualRate: 0 })
    const due = s.scheduled.find((e) => e.event.type === 'debt_payment')!
    expect(toCalendar(due.at)).toMatchObject({ day: 10, hour: 10, month: 1 })
  })
})
