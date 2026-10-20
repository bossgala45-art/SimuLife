import { describe, expect, it } from 'vitest'
import { validateAction } from './actions.ts'
import { ECONOMY } from './data/economy.ts'
import { accrueOverdraft, addDebt, addMoney, bankLoanProbability, closeMonth, LEDGER_SIZE, monthlyPayment } from './finances.ts'
import { performAction } from './simulation.ts'
import { MINUTES_PER_DAY, toCalendar } from './time.ts'
import { dt, newLife, ok, withEvent } from './testing.ts'

describe('compte courant et relevé', () => {
  it('enregistre chaque mouvement et les totaux du mois', () => {
    const s = newLife()
    addMoney(s, -50, 'Courses')
    addMoney(s, 200, 'Remboursement')
    expect(s.character.money).toBe(1150)
    expect(s.finances.month).toEqual({ income: 200, expenses: 50 })
    expect(s.finances.ledger.slice(-2)).toEqual([
      { at: s.clock, label: 'Courses', amount: -50 },
      { at: s.clock, label: 'Remboursement', amount: 200 },
    ])
    for (let i = 0; i < 100; i++) addMoney(s, -1, 'Petite dépense')
    expect(s.finances.ledger).toHaveLength(LEDGER_SIZE)
  })

  it('prélève les charges fixes chaque mois (montants approximatifs)', () => {
    const s = withEvent(newLife(), { type: 'bills_due' })
    expect(s.character.money).toBe(1000 - 170)
    const next = s.scheduled.filter((e) => e.event.type === 'bills_due').map((e) => toCalendar(e.at))
    expect(next.at(-1)).toMatchObject({ month: 2, day: 5, hour: 8 })
  })

  it('autorise un découvert, facturé en agios au relevé mensuel', () => {
    const s = newLife({ money: -300 })
    for (let d = 0; d < 30; d++) accrueOverdraft(s)
    closeMonth(s)
    // 300 € × 16 % / 365 × 30 jours ≈ 3,95 € → 3 € prélevés, le reste reporté.
    expect(s.character.money).toBe(-303)
    expect(s.finances.overdraftCarry).toBeCloseTo(0.945, 3)
    expect(s.finances.lastMonth).toEqual({ income: 0, expenses: 3 })
  })
})

describe('épargne', () => {
  it('vire vers l’épargne et rapporte des intérêts', () => {
    const s = ok(performAction(newLife(), 'deposit_savings', { amount: 500 }))
    expect(s.character.money).toBe(500)
    expect(s.finances.savings).toBe(500)
    expect(validateAction(s, 'withdraw_savings', { amount: 500 }).ok).toBe(true)
    expect(validateAction(s, 'deposit_savings', { amount: 250 })).toMatchObject({ ok: false, issues: [{ code: 'INVALID_AMOUNT' }] })
    s.finances.savings = 6000
    closeMonth(s)
    expect(s.finances.savings).toBe(6010) // 6000 × 2 % / 12, taux approximatif
  })

  it('refuse un retrait supérieur à l’épargne', () => {
    expect(validateAction(newLife(), 'withdraw_savings', { amount: 100 })).toEqual({
      ok: false,
      issues: [{ code: 'INSUFFICIENT_MONEY', message: 'Épargne insuffisante : 100 € demandés, 0 € disponibles.' }],
    })
  })
})

describe('dettes', () => {
  it('calcule une mensualité de prêt de façon reproductible', () => {
    expect(monthlyPayment(1000, 0.06, 12)).toBe(87)
    expect(monthlyPayment(5000, 0.06, 36)).toBe(153)
    expect(monthlyPayment(500, 0, 5)).toBe(100)
  })

  it('estime l’accord bancaire selon l’emploi, l’ancienneté et l’endettement', () => {
    const s = newLife()
    expect(bankLoanProbability(s, 1000)).toBe(0.51) // période d'essai : 0,85 × 0,6
    s.career.job!.since -= 100 * MINUTES_PER_DAY
    expect(bankLoanProbability(s, 1000)).toBe(0.85)
    s.career.job!.salary = 300
    expect(bankLoanProbability(s, 5000)).toBe(0.1) // 153 € / 300 € > 35 %
    s.career.job = null
    expect(bankLoanProbability(s, 1000)).toBe(0.05)
  })

  it('rembourse chaque mois avec intérêts et reprogramme l’échéance', () => {
    const s = newLife()
    const debt = addDebt(s, { lender: 'bank', principal: 1000, monthlyPayment: 87, annualRate: 0.06 })
    const after = withEvent(s, { type: 'debt_payment', debtId: debt.id })
    expect(after.character.money).toBe(1000 - 87)
    expect(after.finances.debts[0].remaining).toBe(1000 + 5 - 87)
    expect(after.scheduled.filter((e) => e.event.type === 'debt_payment')).toHaveLength(2)
  })

  it('rejette un prélèvement sans provision, puis supprime le découvert après 3 rejets', () => {
    let s = newLife({ money: -300 })
    const debt = addDebt(s, { lender: 'bank', principal: 1000, monthlyPayment: 87, annualRate: 0.06 })
    for (let i = 0; i < 3; i++) s = withEvent(s, { type: 'debt_payment', debtId: debt.id })
    expect(s.finances.debts[0].missedPayments).toBe(3)
    expect(s.character.money).toBe(-300 - 3 * ECONOMY.missedPaymentFee.value)
    expect(s.finances.overdraftLimit).toBe(0)
    expect(s.log.some((e) => e.code === 'overdraft_removed')).toBe(true)
  })

  it('un remboursement manqué à un proche crée de la tension et un souvenir', () => {
    const s = newLife({ money: 0 })
    const mother = s.people.find((p) => p.relation === 'Mère')!
    const tension = s.relationships[mother.id].tension
    const debt = addDebt(s, { lender: mother.id, principal: 500, monthlyPayment: 100, annualRate: 0 })
    const after = withEvent(s, { type: 'debt_payment', debtId: debt.id })
    expect(after.relationships[mother.id].tension).toBe(tension + 8)
    expect(after.relationships[mother.id].memories.at(-1)).toMatchObject({ kind: 'loan_unpaid', weight: -5 })
  })

  it('solde la dette et s’en souvient quand elle est entièrement remboursée', () => {
    const s = newLife()
    const mother = s.people.find((p) => p.relation === 'Mère')!
    const debt = addDebt(s, { lender: mother.id, principal: 100, monthlyPayment: 100, annualRate: 0 })
    const after = withEvent(s, { type: 'debt_payment', debtId: debt.id })
    expect(after.finances.debts).toEqual([])
    expect(after.relationships[mother.id].memories.at(-1)).toMatchObject({ kind: 'loan_repaid' })
    expect(after.scheduled.some((e) => e.event.type === 'debt_payment')).toBe(false)
  })

  it('ouvre la banque en semaine seulement et limite le nombre de prêts', () => {
    expect(validateAction(newLife({ start: dt(11, 10) }), 'bank_loan', { amount: 1000 })).toMatchObject({
      ok: false,
      issues: [{ code: 'CLOSED', message: 'La banque est fermée le week-end.' }],
    })
    const s = newLife({ start: dt(6, 10) })
    addDebt(s, { lender: 'bank', principal: 1000, monthlyPayment: 87, annualRate: 0.06 })
    addDebt(s, { lender: 'bank', principal: 1000, monthlyPayment: 87, annualRate: 0.06 })
    expect(validateAction(s, 'bank_loan', { amount: 1000 })).toMatchObject({ ok: false, issues: [{ code: 'LOAN_LIMIT' }] })
  })
})
