/**
 * Finances : compte courant (avec découvert autorisé), épargne, dettes, charges fixes.
 *
 * Tout mouvement d'argent passe par `addMoney`, qui tient le relevé et les totaux
 * du mois. Les montants sont des euros entiers ; les intérêts et agios fractionnaires
 * sont reportés jusqu'à atteindre un euro entier.
 */
import { BASE, opensBetween, percent, weekdayOf, type ActionDefinition, type Precondition } from './actionKit.ts'
import { ECONOMY, MONTHLY_BILLS } from './data/economy.ts'
import { writeLog } from './journal.ts'
import { addMemory, adjustRelationship, personName } from './relationships.ts'
import { drawRandom } from './rng.ts'
import { cancelEvents, scheduleEvent } from './schedule.ts'
import { nextMonthlyOccurrence } from './time.ts'
import type { Debt, Finances, GameEvent, SimulationState } from './types.ts'

export const LEDGER_SIZE = 100
export const BILLS_DAY = 5
export const BILLS_HOUR = 8
export const DEBT_DAY = 10
export const DEBT_HOUR = 10
export const MAX_BANK_LOANS = 2
/** Après ce nombre de prélèvements rejetés, la banque supprime le découvert autorisé. */
export const MAX_MISSED_PAYMENTS = 3

export const BANK_LOANS: { amount: number; months: number }[] = [
  { amount: 1000, months: 12 },
  { amount: 3000, months: 24 },
  { amount: 5000, months: 36 },
]

export function initialFinances(): Finances {
  return {
    savings: 0,
    overdraftLimit: ECONOMY.overdraftLimit.value,
    interestCarry: 0,
    overdraftCarry: 0,
    debts: [],
    nextDebtId: 1,
    ledger: [],
    month: { income: 0, expenses: 0 },
    lastMonth: null,
  }
}

/** Argent utilisable, découvert autorisé compris. */
export const available = (s: SimulationState) => s.character.money + s.finances.overdraftLimit

export function addMoney(draft: SimulationState, amount: number, label: string): void {
  if (amount === 0) return
  const f = draft.finances
  draft.character.money += amount
  if (amount > 0) f.month.income += amount
  else f.month.expenses -= amount
  f.ledger.push({ at: draft.clock, label, amount })
  if (f.ledger.length > LEDGER_SIZE) f.ledger.shift()
}

/**
 * Mensualité d'un prêt amortissable, arrondie à l'euro supérieur.
 * (1 + r)^n est calculé par multiplications successives : résultat identique sur tous les navigateurs.
 */
export function monthlyPayment(principal: number, annualRate: number, months: number): number {
  const r = annualRate / 12
  if (r === 0) return Math.ceil(principal / months)
  let factor = 1
  for (let i = 0; i < months; i++) factor *= 1 + r
  return Math.ceil((principal * r * factor) / (factor - 1))
}

export function addDebt(
  draft: SimulationState,
  debt: { lender: string; principal: number; monthlyPayment: number; annualRate: number },
): Debt {
  const created: Debt = {
    id: draft.finances.nextDebtId++,
    lender: debt.lender,
    remaining: debt.principal,
    monthlyPayment: debt.monthlyPayment,
    annualRate: debt.annualRate,
    missedPayments: 0,
  }
  draft.finances.debts.push(created)
  scheduleEvent(draft, nextMonthlyOccurrence(draft.clock, DEBT_DAY, DEBT_HOUR), { type: 'debt_payment', debtId: created.id })
  return created
}

export const bankDebts = (s: SimulationState) => s.finances.debts.filter((d) => d.lender === 'bank')

/** Probabilité estimée d'accord d'un prêt bancaire (affichée avant la demande). */
export function bankLoanProbability(state: SimulationState, amount: number): number {
  const loan = BANK_LOANS.find((l) => l.amount === amount)
  const job = state.career.job
  if (!loan || !job) return 0.05
  const payment = monthlyPayment(amount, ECONOMY.bankLoanRate.value, loan.months)
  const existing = bankDebts(state).reduce((sum, d) => sum + d.monthlyPayment, 0)
  let p = (existing + payment) / job.salary <= ECONOMY.maxDebtRatio.value ? 0.85 : 0.1
  if (state.finances.debts.some((d) => d.missedPayments > 0)) p *= 0.3
  // Moins de 3 mois d'ancienneté : la banque hésite.
  if (state.clock - job.since < 90 * 24 * 60) p *= 0.6
  return Math.round(p * 100) / 100
}

/** Agios : calculés chaque jour de découvert, prélevés au relevé mensuel. */
export function accrueOverdraft(draft: SimulationState): void {
  if (draft.character.money < 0) {
    draft.finances.overdraftCarry += (-draft.character.money * ECONOMY.overdraftRate.value) / 365
  }
}

/** Relevé mensuel : intérêts d'épargne, agios, bilan du mois écoulé. */
export function closeMonth(draft: SimulationState): void {
  const f = draft.finances
  f.interestCarry += (f.savings * ECONOMY.savingsRate.value) / 12
  const interest = Math.floor(f.interestCarry)
  if (interest > 0) {
    f.interestCarry -= interest
    f.savings += interest
    writeLog(draft, 'money', 'savings_interest', `Intérêts de l’épargne : +${interest} € (taux approximatif).`, { amount: interest })
  }
  const fees = Math.floor(f.overdraftCarry)
  if (fees > 0) {
    f.overdraftCarry -= fees
    addMoney(draft, -fees, 'Agios (découvert)')
    writeLog(draft, 'money', 'overdraft_fees', `Agios prélevés pour le découvert : −${fees} €.`, { amount: fees })
  }
  f.lastMonth = { ...f.month }
  f.month = { income: 0, expenses: 0 }
}

export const FINANCE_HANDLERS = {
  bills_due(draft: SimulationState, event: Extract<GameEvent, { type: 'bills_due' }>) {
    const total = MONTHLY_BILLS.reduce((sum, b) => sum + b.value, 0)
    addMoney(draft, -total, 'Charges fixes')
    writeLog(draft, 'money', 'bills_due', `Charges fixes prélevées (énergie, téléphone, transports, assurances) : −${total} €.`, {
      amount: total,
    })
    scheduleEvent(draft, nextMonthlyOccurrence(draft.clock, BILLS_DAY, BILLS_HOUR), event)
  },

  debt_payment(draft: SimulationState, event: Extract<GameEvent, { type: 'debt_payment' }>) {
    const f = draft.finances
    const debt = f.debts.find((d) => d.id === event.debtId)
    if (!debt) return
    const interest = Math.round((debt.remaining * debt.annualRate) / 12)
    const due = Math.min(debt.monthlyPayment, debt.remaining + interest)
    const fromBank = debt.lender === 'bank'
    const lenderName = fromBank ? 'la banque' : personName(draft, debt.lender)
    // La banque prélève dans la limite du découvert ; un proche n'est remboursé qu'avec de l'argent disponible.
    const canPay = fromBank ? available(draft) >= due : draft.character.money >= due

    if (canPay) {
      addMoney(draft, -due, fromBank ? 'Remboursement du prêt bancaire' : `Remboursement à ${lenderName}`)
      debt.remaining = debt.remaining + interest - due
      writeLog(draft, 'money', 'debt_paid', `Remboursement à ${lenderName} : −${due} € (reste ${debt.remaining} €).`, {
        amount: due,
        remaining: debt.remaining,
      })
    } else {
      debt.missedPayments++
      if (fromBank) {
        addMoney(draft, -ECONOMY.missedPaymentFee.value, 'Frais de rejet')
        writeLog(draft, 'warning', 'debt_missed', `Prélèvement rejeté faute de provision (frais −${ECONOMY.missedPaymentFee.value} €).`)
        if (debt.missedPayments >= MAX_MISSED_PAYMENTS && f.overdraftLimit > 0) {
          f.overdraftLimit = 0
          writeLog(draft, 'warning', 'overdraft_removed', 'Trop d’incidents : la banque supprime ton découvert autorisé.')
        }
      } else {
        adjustRelationship(draft, debt.lender, { trust: -8, tension: 8 })
        addMemory(draft, debt.lender, 'loan_unpaid', -5, `Remboursement de ${due} € non honoré.`)
        writeLog(draft, 'warning', 'debt_missed', `Tu n’as pas pu rembourser ${lenderName} ce mois-ci.`)
      }
    }

    if (debt.remaining <= 0) {
      f.debts = f.debts.filter((d) => d.id !== debt.id)
      cancelDebtPayments(draft, debt.id)
      writeLog(draft, 'money', 'debt_closed', `Prêt de ${lenderName} entièrement remboursé.`)
      if (!fromBank) addMemory(draft, debt.lender, 'loan_repaid', 4, 'Prêt remboursé jusqu’au bout.')
      return
    }
    scheduleEvent(draft, nextMonthlyOccurrence(draft.clock, DEBT_DAY, DEBT_HOUR), event)
  },
}

/** Annule les prélèvements à venir d'une dette (utile si elle est soldée par ailleurs). */
export const cancelDebtPayments = (draft: SimulationState, debtId: number) =>
  cancelEvents(draft, (e) => e.type === 'debt_payment' && e.debtId === debtId)

const bankOpen: Precondition[] = [
  { code: 'CLOSED', test: (s) => weekdayOf(s) < 5, message: 'La banque est fermée le week-end.' },
  opensBetween(9, 17, 'La banque est ouverte de 9 h à 17 h.'),
]

export const FINANCE_ACTIONS: ActionDefinition[] = [
  {
    ...BASE,
    id: 'deposit_savings',
    label: 'Mettre de côté',
    description: 'Virer de l’argent du compte courant vers l’épargne.',
    durationMinutes: 5,
    params: ['amount'],
    amounts: [100, 500],
    preconditions: [
      {
        code: 'INSUFFICIENT_MONEY',
        test: (s, p) => s.character.money >= (p.amount ?? 0),
        message: (s, p) => `Pas assez sur le compte courant : ${p.amount} € demandés, ${s.character.money} € disponibles.`,
      },
    ],
    onComplete(draft, p) {
      addMoney(draft, -p.amount!, 'Virement vers l’épargne')
      draft.finances.savings += p.amount!
    },
  },
  {
    ...BASE,
    id: 'withdraw_savings',
    label: 'Retirer de l’épargne',
    description: 'Virer de l’épargne vers le compte courant.',
    durationMinutes: 5,
    params: ['amount'],
    amounts: [100, 500],
    preconditions: [
      {
        code: 'INSUFFICIENT_MONEY',
        test: (s, p) => s.finances.savings >= (p.amount ?? 0),
        message: (s, p) => `Épargne insuffisante : ${p.amount} € demandés, ${s.finances.savings} € disponibles.`,
      },
    ],
    onComplete(draft, p) {
      draft.finances.savings -= p.amount!
      addMoney(draft, p.amount!, 'Retrait de l’épargne')
    },
  },
  {
    ...BASE,
    id: 'bank_loan',
    label: 'Demander un prêt à la banque',
    description: 'Prêt personnel remboursable chaque mois, avec intérêts.',
    durationMinutes: 30,
    params: ['amount'],
    amounts: BANK_LOANS.map((l) => l.amount),
    preconditions: [
      ...bankOpen,
      {
        code: 'LOAN_LIMIT',
        test: (s) => bankDebts(s).length < MAX_BANK_LOANS,
        message: `Déjà ${MAX_BANK_LOANS} prêts en cours.`,
      },
    ],
    outcomes: (s, p) => [{ label: 'Accord de la banque', probability: bankLoanProbability(s, p.amount ?? 0) }],
    onComplete(draft, p) {
      const loan = BANK_LOANS.find((l) => l.amount === p.amount)!
      const probability = bankLoanProbability(draft, loan.amount)
      // Le tirage est fait ici ; avant, seule la probabilité est connue.
      const accepted = drawRandom(draft) < probability
      if (!accepted) {
        writeLog(draft, 'money', 'bank_loan_refused', `La banque refuse le prêt de ${loan.amount} € (accord estimé ${percent(probability)}).`)
        return
      }
      const payment = monthlyPayment(loan.amount, ECONOMY.bankLoanRate.value, loan.months)
      addDebt(draft, { lender: 'bank', principal: loan.amount, monthlyPayment: payment, annualRate: ECONOMY.bankLoanRate.value })
      addMoney(draft, loan.amount, 'Prêt bancaire')
      writeLog(
        draft,
        'money',
        'bank_loan_granted',
        `Prêt accordé : +${loan.amount} €, ${loan.months} mensualités d’environ ${payment} € (taux approximatif).`,
        { amount: loan.amount, payment },
      )
    },
  },
]
