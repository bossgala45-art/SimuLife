/**
 * Données économiques utilisées par la simulation.
 *
 * AUCUNE de ces valeurs n'a été vérifiée auprès d'une source officielle :
 * ce sont des ordres de grandeur pour la France (2024-2025), marqués
 * `approximate: true` et affichés avec « ≈ » dans l'interface.
 */

export const APPROXIMATE_NOTE = 'Montants approximatifs : ordres de grandeur pour la France (2024-2025), non vérifiés.'

export interface EconomicValue {
  label: string
  value: number
  approximate: true
}

const approx = (label: string, value: number): EconomicValue => ({ label, value, approximate: true })

export const ECONOMY = {
  rent: approx('Loyer mensuel', 700),
  energy: approx('Énergie', 70),
  telecom: approx('Internet et téléphone', 35),
  transport: approx('Transports', 45),
  insurance: approx('Assurances', 20),
  overdraftLimit: approx('Découvert autorisé', 300),
  overdraftRate: approx('Taux annuel des agios', 0.16),
  missedPaymentFee: approx('Frais de rejet de prélèvement', 20),
  savingsRate: approx('Taux annuel du livret d’épargne', 0.02),
  bankLoanRate: approx('Taux annuel d’un prêt personnel', 0.06),
  maxDebtRatio: approx('Taux d’endettement maximal accepté par la banque', 0.35),
  unemploymentReplacement: approx('Part du salaire versée en allocation chômage', 0.57),
  unemploymentMonths: approx('Durée de l’allocation chômage (mois, règle simplifiée)', 6),
  workDaysPerMonth: approx('Jours travaillés par mois', 21),
} satisfies Record<string, EconomicValue>

/** Charges fixes prélevées chaque mois (hors loyer). */
export const MONTHLY_BILLS: EconomicValue[] = [ECONOMY.energy, ECONOMY.telecom, ECONOMY.transport, ECONOMY.insurance]
