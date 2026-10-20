import {
  APPROXIMATE_NOTE,
  BANK_LOANS,
  ECONOMY,
  formatDate,
  MONTHLY_BILLS,
  type SimulationState,
  type StepResult,
} from '../../engine/index.ts'
import ActionButton from './ActionButton.tsx'

type Props = {
  state: SimulationState
  onResult: (result: StepResult) => void
}

const LEDGER_SHOWN = 20

export default function MoneyPanel({ state, onResult }: Props) {
  const f = state.finances
  const lenderName = (lender: string) =>
    lender === 'bank' ? 'Banque' : (state.people.find((p) => p.id === lender)?.name ?? 'Un proche')

  return (
    <>
      <section className="card" aria-labelledby="accounts-title">
        <h2 id="accounts-title">Comptes</h2>
        <dl className="facts-list">
          <div>
            <dt>Compte courant</dt>
            <dd className={state.character.money < 0 ? 'neg' : undefined}>{state.character.money} €</dd>
          </div>
          <div>
            <dt>Découvert autorisé</dt>
            <dd>{f.overdraftLimit} €</dd>
          </div>
          <div>
            <dt>Épargne</dt>
            <dd>{f.savings} €</dd>
          </div>
          <div>
            <dt>Ce mois-ci</dt>
            <dd>
              +{f.month.income} € / −{f.month.expenses} €
            </dd>
          </div>
          {f.lastMonth && (
            <div>
              <dt>Mois dernier</dt>
              <dd>
                +{f.lastMonth.income} € / −{f.lastMonth.expenses} €
              </dd>
            </div>
          )}
        </dl>
        <ul className="actions">
          {[100, 500].map((amount) => (
            <li key={`d${amount}`}>
              <ActionButton state={state} action="deposit_savings" params={{ amount }} label={`Mettre ${amount} € de côté`} onResult={onResult} />
            </li>
          ))}
          {[100, 500].map((amount) => (
            <li key={`w${amount}`}>
              <ActionButton state={state} action="withdraw_savings" params={{ amount }} label={`Retirer ${amount} € de l’épargne`} onResult={onResult} />
            </li>
          ))}
        </ul>
      </section>

      <section className="card" aria-labelledby="debts-title">
        <h2 id="debts-title">Dettes</h2>
        {f.debts.length === 0 ? (
          <p className="hint">Aucune dette.</p>
        ) : (
          <ul className="plain">
            {f.debts.map((d) => (
              <li key={d.id}>
                {lenderName(d.lender)} : reste {d.remaining} €, mensualité {d.monthlyPayment} € le 10 du mois
                {d.missedPayments > 0 && <span className="neg"> · {d.missedPayments} échéance(s) manquée(s)</span>}
              </li>
            ))}
          </ul>
        )}
        <ul className="actions">
          {BANK_LOANS.map((loan) => (
            <li key={loan.amount}>
              <ActionButton
                state={state}
                action="bank_loan"
                params={{ amount: loan.amount }}
                label={`Emprunter ${loan.amount} € sur ${loan.months} mois`}
                onResult={onResult}
              />
            </li>
          ))}
        </ul>
      </section>

      <section className="card" aria-labelledby="bills-title">
        <h2 id="bills-title">Dépenses fixes mensuelles</h2>
        <ul className="plain">
          <li>
            {ECONOMY.rent.label} : ≈ {ECONOMY.rent.value} € (le 1er)
          </li>
          {MONTHLY_BILLS.map((b) => (
            <li key={b.label}>
              {b.label} : ≈ {b.value} € (le 5)
            </li>
          ))}
        </ul>
        <p className="hint">{APPROXIMATE_NOTE}</p>
      </section>

      <section className="card" aria-labelledby="ledger-title">
        <h2 id="ledger-title">Relevé</h2>
        <ul className="ledger">
          {f.ledger
            .slice(-LEDGER_SHOWN)
            .reverse()
            .map((t, i) => (
              <li key={`${t.at}-${i}`}>
                <span>
                  {t.label}
                  <time>{formatDate(t.at)}</time>
                </span>
                <span className={t.amount < 0 ? 'neg' : 'pos'}>
                  {t.amount > 0 ? '+' : ''}
                  {t.amount} €
                </span>
              </li>
            ))}
        </ul>
      </section>
    </>
  )
}
