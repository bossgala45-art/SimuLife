/**
 * Actions envers les proches. Chaque action vise une personne (`personId`).
 * Les issues incertaines (dispute, prêt) sont annoncées sous forme de probabilité.
 */
import { BASE, notSick, notTooTired, opensBetween, percent, weekdayOf, type ActionDefinition, type Precondition } from './actionKit.ts'
import { addDebt, addMoney } from './finances.ts'
import { writeLog } from './journal.ts'
import { clamp } from './needs.ts'
import { addMemory, adjustRelationship, findPerson, memoryScore, touch } from './relationships.ts'
import { drawRandom } from './rng.ts'
import { gainXp, skillLevel } from './skills.ts'
import type { ActionParams, SimulationState } from './types.ts'

export const VISIT_COST = 8
export const DISTANT_VISIT_COST = 60
export const LOAN_AMOUNTS = [200, 500]
/** Un prêt entre proches se rembourse en 5 mensualités, sans intérêts. */
export const FAMILY_LOAN_MONTHS = 5

const person = (s: SimulationState, p: ActionParams) => findPerson(s, p.personId!)!

const weekendIfDistant: Precondition = {
  code: 'PERSON_UNAVAILABLE',
  test: (s, p) => !person(s, p).distant || weekdayOf(s) >= 5,
  message: (s, p) => `${person(s, p).name} habite loin : visite possible le week-end seulement.`,
}

/** Risque de dispute pendant une visite, si la tension est forte. */
export function argumentRisk(state: SimulationState, personId: string): number {
  const tension = state.relationships[personId]?.tension ?? 0
  return tension >= 40 ? Math.round(((tension - 40) / 100) * 100) / 100 : 0
}

/** Probabilité estimée qu'un proche accepte de prêter cette somme. */
export function loanProbability(state: SimulationState, personId: string, amount: number): number {
  const p = findPerson(state, personId)
  const r = state.relationships[personId]
  if (!p || !r) return 0
  let chance = 0.1 + r.closeness / 150 + r.trust / 300 + p.generosity / 250 - r.tension / 100 + memoryScore(state, personId) / 40
  if (amount >= 500) chance -= 0.1
  if (p.occupation === 'student' || p.occupation === 'unemployed') chance -= 0.2
  return Math.round(clamp(chance, 0.02, 0.95) * 100) / 100
}

/** Bonus d'effet des échanges selon le niveau en communication. */
const talkBonus = (s: SimulationState) => skillLevel(s, 'communication') * 0.3

export const SOCIAL_ACTIONS: ActionDefinition[] = [
  {
    ...BASE,
    id: 'call',
    label: 'Appeler',
    description: 'Prendre des nouvelles au téléphone.',
    durationMinutes: 20,
    params: ['person'],
    effects: { needs: { mood: 3, stress: -2 } },
    preconditions: [opensBetween(9, 22, 'On n’appelle pas ses proches avant 9 h ni après 22 h.')],
    onComplete(draft, p) {
      touch(draft, p.personId!)
      adjustRelationship(draft, p.personId!, { closeness: 2 + talkBonus(draft), tension: -2 })
      gainXp(draft, 'communication', 3)
      writeLog(draft, 'social', 'called', `Appel avec ${person(draft, p).name}.`, { personId: p.personId! })
    },
  },
  {
    ...BASE,
    id: 'visit',
    label: 'Rendre visite',
    description: 'Passer quelques heures ensemble.',
    durationMinutes: 180,
    params: ['person'],
    extraCost: (s, p) => (person(s, p).distant ? DISTANT_VISIT_COST : VISIT_COST),
    effects: { needs: { mood: 8, stress: -5 } },
    preconditions: [
      opensBetween(10, 20, 'Visites entre 10 h et 20 h.'),
      notTooTired(85),
      notSick,
      {
        code: 'PERSON_UNAVAILABLE',
        test: (s, p) => person(s, p).role !== 'colleague' || weekdayOf(s) >= 5,
        message: 'Un·e collègue se voit en dehors du travail le week-end.',
      },
      weekendIfDistant,
    ],
    outcomes: (s, p) => {
      const risk = argumentRisk(s, p.personId!)
      return risk > 0 ? [{ label: 'Dispute', probability: risk }] : []
    },
    onComplete(draft, p) {
      const name = person(draft, p).name
      touch(draft, p.personId!)
      gainXp(draft, 'communication', 6)
      if (drawRandom(draft) < argumentRisk(draft, p.personId!)) {
        adjustRelationship(draft, p.personId!, { closeness: -5, tension: 10, trust: -3 })
        addMemory(draft, p.personId!, 'argument', -5, 'Dispute pendant une visite.')
        draft.character.needs.stress = clamp(draft.character.needs.stress + 15)
        writeLog(draft, 'social', 'argument', `La visite chez ${name} tourne à la dispute.`, { personId: p.personId! })
        return
      }
      adjustRelationship(draft, p.personId!, { closeness: 6 + talkBonus(draft), tension: -4 })
      writeLog(draft, 'social', 'visited', `Moment passé avec ${name}.`, { personId: p.personId! })
    },
  },
  {
    ...BASE,
    id: 'gift',
    label: 'Offrir un cadeau',
    description: 'Choisir et offrir un cadeau.',
    durationMinutes: 60,
    cost: { money: 30 },
    params: ['person'],
    preconditions: [opensBetween(9, 20, 'Les boutiques sont ouvertes de 9 h à 20 h.')],
    onComplete(draft, p) {
      touch(draft, p.personId!)
      adjustRelationship(draft, p.personId!, { closeness: 4, tension: -6 })
      addMemory(draft, p.personId!, 'gift', 3, 'Cadeau reçu de ta part.')
      writeLog(draft, 'social', 'gift', `Cadeau offert à ${person(draft, p).name}.`, { personId: p.personId! })
    },
  },
  {
    ...BASE,
    id: 'help',
    label: 'Aider',
    description: 'Apporter une aide concrète à un proche malade.',
    durationMinutes: 120,
    params: ['person'],
    effects: { needs: { fatigue: 5, mood: 4 } },
    preconditions: [
      {
        code: 'NOT_NEEDED',
        test: (s, p) => person(s, p).sickSince !== null,
        message: (s, p) => `${person(s, p).name} n’a pas besoin d’aide en ce moment.`,
      },
      opensBetween(9, 20, 'Aide possible entre 9 h et 20 h.'),
      notTooTired(80),
      notSick,
      weekendIfDistant,
    ],
    onComplete(draft, p) {
      const target = person(draft, p)
      touch(draft, target.id)
      target.health = clamp(target.health + 5)
      adjustRelationship(draft, target.id, { closeness: 8, trust: 6 })
      addMemory(draft, target.id, 'help', 6, 'Tu es venu·e aider pendant sa maladie.')
      writeLog(draft, 'social', 'helped', `Tu aides ${target.name} pendant sa maladie.`, { personId: target.id })
    },
  },
  {
    ...BASE,
    id: 'ask_loan',
    label: 'Demander un prêt',
    description: 'Emprunter de l’argent à un proche, sans intérêts, à rembourser en 5 mois.',
    durationMinutes: 20,
    params: ['person', 'amount'],
    amounts: LOAN_AMOUNTS,
    preconditions: [
      opensBetween(9, 22, 'Pas de demande d’argent avant 9 h ni après 22 h.'),
      {
        code: 'PERSON_UNAVAILABLE',
        test: (s, p) => person(s, p).role !== 'colleague',
        message: 'On ne demande pas d’argent à un·e collègue.',
      },
      {
        code: 'ALREADY_IN_DEBT',
        test: (s, p) => !s.finances.debts.some((d) => d.lender === p.personId),
        message: (s, p) => `Tu dois déjà de l’argent à ${person(s, p).name}.`,
      },
    ],
    outcomes: (s, p) => [{ label: 'Accord', probability: loanProbability(s, p.personId!, p.amount ?? 0) }],
    onComplete(draft, p) {
      const target = person(draft, p)
      const probability = loanProbability(draft, target.id, p.amount!)
      touch(draft, target.id)
      if (drawRandom(draft) < probability) {
        addMoney(draft, p.amount!, `Prêt de ${target.name}`)
        addDebt(draft, {
          lender: target.id,
          principal: p.amount!,
          monthlyPayment: Math.ceil(p.amount! / FAMILY_LOAN_MONTHS),
          annualRate: 0,
        })
        addMemory(draft, target.id, 'loan_granted', 2, `T’a prêté ${p.amount} €.`)
        writeLog(draft, 'social', 'loan_granted', `${target.name} accepte de te prêter ${p.amount} € (accord estimé ${percent(probability)}).`, {
          personId: target.id,
        })
      } else {
        adjustRelationship(draft, target.id, { closeness: -1 })
        addMemory(draft, target.id, 'loan_refused', -2, `A refusé de te prêter ${p.amount} €.`)
        writeLog(draft, 'social', 'loan_refused', `${target.name} refuse de te prêter ${p.amount} € (accord estimé ${percent(probability)}).`, {
          personId: target.id,
        })
      }
    },
  },
]

/** Probabilité affichée pour l'accord d'un proche (« ≈ 60 % »). */
export const loanChanceLabel = (s: SimulationState, personId: string, amount: number) => percent(loanProbability(s, personId, amount))
