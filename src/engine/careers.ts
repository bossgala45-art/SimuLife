/**
 * Emploi : candidatures (réponse différée et incertaine), journées de travail,
 * paie mensuelle au prorata, appréciation, absences, licenciement, chômage.
 */
import { BASE, opensBetween, percent, weekdayOf, type ActionDefinition } from './actionKit.ts'
import { findCareer, type CareerDefinition } from './data/careers.ts'
import { ECONOMY } from './data/economy.ts'
import { addMoney, closeMonth } from './finances.ts'
import { writeLog } from './journal.ts'
import { clamp } from './needs.ts'
import { addColleagues } from './people.ts'
import { adjustRelationship, touch } from './relationships.ts'
import { careerEligibility } from './requirements.ts'
import { chance, drawRandom } from './rng.ts'
import { scheduleEvent } from './schedule.ts'
import { gainXp, skillLevel } from './skills.ts'
import { dayNumber, MINUTES_PER_DAY, nextMonthlyOccurrence, toCalendar } from './time.ts'
import type { Career, GameEvent, SimulationState, SkillId } from './types.ts'

export const PAYDAY = 1
/** 7 h : le salaire arrive avant le loyer (8 h), comme un virement de fin de mois. */
export const PAYDAY_HOUR = 7
export const RAISE_CHANCE = 0.2
export const COLLEAGUE_WORK_CAP = 60
export const RAISE_RATE = 0.03
/** Une candidature reçoit une réponse entre 3 et 10 jours plus tard. */
export const RESPONSE_DAYS: [number, number] = [3, 10]

export function emptyCareer(): Career {
  return { job: null, experience: {}, benefit: null }
}

export const occupationLabel = (id: string) =>
  findCareer(id)?.label ?? ({ student: 'Études', retired: 'Retraite', unemployed: 'Sans emploi' } as Record<string, string>)[id] ?? id

/** Moyenne des niveaux dans les compétences utiles au métier. */
function fit(state: SimulationState, career: CareerDefinition): number {
  const skills = Object.keys(career.skills) as SkillId[]
  if (skills.length === 0) return 0
  return skills.reduce((sum, s) => sum + skillLevel(state, s), 0) / skills.length
}

/** Salaire proposé : dans la fourchette du métier, plus haut avec compétences et expérience. */
export function salaryOffer(state: SimulationState, career: CareerDefinition): number {
  const experienceYears = (state.career.experience[career.sector] ?? 0) / 220
  const position = Math.min(1, fit(state, career) / 8 + experienceYears / 10)
  return Math.round((career.salary.min + (career.salary.max - career.salary.min) * position) / 10) * 10
}

/** Probabilité estimée d'embauche (affichée avant la candidature). */
export function hireProbability(state: SimulationState, careerId: string): number {
  const career = findCareer(careerId)
  if (!career || !careerEligibility(state, career).ok) return 0
  let p = 0.3 + 0.04 * skillLevel(state, 'communication') + 0.05 * Math.min(4, fit(state, career))
  if ((state.career.experience[career.sector] ?? 0) >= 180) p += 0.1
  return Math.round(clamp(p, 0.05, 0.85) * 100) / 100
}

export const pendingApplication = (state: SimulationState, careerId: string) =>
  state.scheduled.some((s) => s.event.type === 'job_application_result' && s.event.career === careerId)

export const hasPendingApplication = (state: SimulationState) =>
  state.scheduled.some((s) => s.event.type === 'job_application_result')

export function startJob(draft: SimulationState, careerId: string): void {
  const career = findCareer(careerId)!
  draft.career.job = {
    career: careerId,
    since: draft.clock,
    salary: salaryOffer(draft, career),
    performance: 60,
    daysWorked: 0,
  }
  draft.career.benefit = null
  addColleagues(draft, careerId)
}

/** Effets d'une journée de travail, propres au métier. */
export function workDay(draft: SimulationState): void {
  const job = draft.career.job!
  const career = findCareer(job.career)!
  const n = draft.character.needs
  // La définition générique de « Travailler » compte 3 de stress et 2 de fatigue par heure.
  n.stress = clamp(n.stress + (career.stressPerHour - 3) * 8)
  n.fatigue = clamp(n.fatigue + (career.fatiguePerHour - 2) * 8)
  job.daysWorked++
  job.performance = clamp(job.performance + 1)
  draft.career.experience[career.sector] = (draft.career.experience[career.sector] ?? 0) + 1
  for (const [skill, xp] of Object.entries(career.skills) as [SkillId, number][]) gainXp(draft, skill, xp)
  draft.character.lastWorkDay = dayNumber(draft.clock)
  // Une journée de travail, c'est aussi une journée avec les collègues du poste
  // (le travail seul ne rapproche pas au-delà de 60).
  for (const colleague of draft.people.filter((p) => p.role === 'colleague' && p.alive && p.occupation === job.career)) {
    touch(draft, colleague.id)
    if (draft.relationships[colleague.id].closeness < COLLEAGUE_WORK_CAP) adjustRelationship(draft, colleague.id, { closeness: 0.2 })
  }
}

/** Vérifié chaque nuit : une journée ouvrée sans travail ni maladie compte comme absence. */
export function checkAbsence(draft: SimulationState): void {
  const job = draft.career.job
  if (!job) return
  const yesterday = dayNumber(draft.clock) - 1
  const startedBefore = dayNumber(job.since) < yesterday
  const weekday = toCalendar(yesterday * MINUTES_PER_DAY).weekday < 5
  if (startedBefore && weekday && draft.character.lastWorkDay !== yesterday && !draft.character.statuses.includes('sick')) {
    job.performance = clamp(job.performance - 8)
    writeLog(draft, 'warning', 'absence', `Absence au travail hier : ton appréciation baisse (${Math.round(job.performance)}/100).`)
  }
}

export function layOff(draft: SimulationState): void {
  const job = draft.career.job
  if (!job) return
  const months = (draft.clock - job.since) / (30 * MINUTES_PER_DAY)
  draft.career.job = null
  // Règle simplifiée : allocation si au moins 4 mois d'emploi.
  if (months >= 4) {
    draft.career.benefit = {
      amount: Math.round(job.salary * ECONOMY.unemploymentReplacement.value),
      remaining: ECONOMY.unemploymentMonths.value,
    }
  }
  writeLog(
    draft,
    'warning',
    'layoff',
    `Licenciement : tu perds ton poste (${findCareer(job.career)!.label}).` +
      (draft.career.benefit ? ` Allocation chômage d’environ ${draft.career.benefit.amount} € par mois.` : ''),
  )
}

export const CAREER_HANDLERS = {
  payday(draft: SimulationState, event: Extract<GameEvent, { type: 'payday' }>) {
    // Le relevé du mois écoulé est clôturé d'abord : le salaire compte dans le nouveau mois.
    closeMonth(draft)
    const job = draft.career.job
    if (job) {
      const share = Math.min(1, job.daysWorked / ECONOMY.workDaysPerMonth.value)
      const pay = Math.round(job.salary * share)
      addMoney(draft, pay, 'Salaire')
      writeLog(draft, 'money', 'salary', `Salaire versé : +${pay} € (${job.daysWorked} jours travaillés).`, {
        amount: pay,
        days: job.daysWorked,
      })
      job.daysWorked = 0
      const months = (draft.clock - job.since) / (30 * MINUTES_PER_DAY)
      if (job.performance >= 75 && months >= 6 && chance(draft, RAISE_CHANCE)) {
        job.salary = Math.round((job.salary * (1 + RAISE_RATE)) / 10) * 10
        writeLog(draft, 'event', 'raise', `Augmentation obtenue : salaire porté à environ ${job.salary} € net.`)
      }
    }
    const benefit = draft.career.benefit
    if (benefit && benefit.remaining > 0) {
      addMoney(draft, benefit.amount, 'Allocation chômage')
      benefit.remaining--
      writeLog(draft, 'money', 'benefit', `Allocation chômage : +${benefit.amount} € (montant approximatif).`)
      if (benefit.remaining === 0) draft.career.benefit = null
    }
    scheduleEvent(draft, nextMonthlyOccurrence(draft.clock, PAYDAY, PAYDAY_HOUR), event)
  },

  job_application_result(draft: SimulationState, event: Extract<GameEvent, { type: 'job_application_result' }>) {
    const career = findCareer(event.career)!
    if (draft.career.job?.career === career.id) return
    // Le hasard n'est tiré qu'au moment de la réponse.
    if (drawRandom(draft) < event.probability) {
      const previous = draft.career.job
      const offer = salaryOffer(draft, career)
      // Déjà en poste : on n'accepte qu'une offre mieux payée.
      if (previous && offer <= previous.salary) {
        writeLog(
          draft,
          'event',
          'offer_declined',
          `Offre reçue (${career.label}, environ ${offer} €) mais déclinée : ton poste actuel paie autant ou plus.`,
        )
        return
      }
      startJob(draft, career.id)
      writeLog(
        draft,
        'event',
        'hired',
        `Embauche : ${career.label}${previous ? ` (tu quittes ton poste : ${findCareer(previous.career)!.label})` : ''}. Salaire d’environ ${offer} € net par mois.`,
      )
    } else {
      writeLog(draft, 'event', 'application_refused', `Candidature refusée (${career.label}).`)
    }
  },
}

export const CAREER_ACTIONS: ActionDefinition[] = [
  {
    ...BASE,
    id: 'apply_job',
    label: 'Postuler',
    description: 'Envoyer une candidature. La réponse arrive quelques jours plus tard.',
    durationMinutes: 60,
    params: ['career'],
    preconditions: [
      { code: 'CLOSED', test: (s) => weekdayOf(s) < 5, message: 'Les recruteurs répondent en semaine.' },
      opensBetween(8, 18, 'Candidatures entre 8 h et 18 h.'),
      {
        code: 'ALREADY_EMPLOYED',
        test: (s, p) => s.career.job?.career !== p.career,
        message: 'Tu occupes déjà ce poste.',
      },
      {
        code: 'ALREADY_APPLIED',
        test: (s, p) => !pendingApplication(s, p.career!),
        message: 'Candidature déjà envoyée : réponse en attente.',
      },
      {
        code: 'REQUIREMENTS_NOT_MET',
        test: (s, p) => careerEligibility(s, findCareer(p.career!)!).ok,
        message: (s, p) => careerEligibility(s, findCareer(p.career!)!).reasons.join(' ; '),
      },
    ],
    outcomes: (s, p) => [{ label: 'Embauche', probability: hireProbability(s, p.career!) }],
    onComplete(draft, p) {
      const probability = hireProbability(draft, p.career!)
      const [min, max] = RESPONSE_DAYS
      const delay = min + Math.floor(drawRandom(draft) * (max - min + 1))
      scheduleEvent(draft, draft.clock + delay * MINUTES_PER_DAY, { type: 'job_application_result', career: p.career!, probability })
      writeLog(
        draft,
        'action',
        'application_sent',
        `Candidature envoyée (${findCareer(p.career!)!.label}) : réponse attendue sous ${min} à ${max} jours, chance estimée ${percent(probability)}.`,
      )
    },
  },
  {
    ...BASE,
    id: 'quit_job',
    label: 'Démissionner',
    description: 'Quitter ton emploi (sans allocation chômage).',
    durationMinutes: 10,
    preconditions: [{ code: 'NO_JOB', test: (s) => s.career.job !== null, message: 'Tu n’as pas d’emploi.' }],
    onComplete(draft) {
      const job = draft.career.job!
      draft.career.job = null
      writeLog(draft, 'event', 'quit', `Démission : tu quittes ton poste (${findCareer(job.career)!.label}).`)
    },
  },
]
