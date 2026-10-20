/**
 * Scolarité et diplômes : inscription (rentrée, prérequis, frais), heures d'étude,
 * examen final différé dont l'issue dépend du travail fourni et reste incertaine.
 */
import { BASE, opensBetween, percent, weekdayOf, type ActionDefinition } from './actionKit.ts'
import { findDiploma, findProgram, type ProgramDefinition } from './data/careers.ts'
import { writeLog } from './journal.ts'
import { clamp } from './needs.ts'
import { addMemory, adjustRelationship } from './relationships.ts'
import { unmetReasons } from './requirements.ts'
import { drawRandom } from './rng.ts'
import { cancelEvents, scheduleEvent } from './schedule.ts'
import { gainXp, skillLevel } from './skills.ts'
import { addMonths, ageAt, formatDate, fromCalendar, toCalendar } from './time.ts'
import type { Education, GameEvent, SimulationState, SkillId } from './types.ts'

export const STUDY_SESSION_HOURS = 2
const MONTH_NAMES = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']

export function emptyEducation(): Education {
  return { diplomas: [], enrollment: null }
}

/** Probabilité estimée de réussite à l'examen, selon le travail fourni à ce jour. */
export function examProbability(state: SimulationState): number {
  const enrollment = state.education.enrollment
  if (!enrollment) return 0
  const program = findProgram(enrollment.program)!
  const ratio = Math.min(1, enrollment.studyHours / program.studyHours)
  const skills = Object.keys(program.skills) as SkillId[]
  const avgLevel = skills.reduce((sum, s) => sum + skillLevel(state, s), 0) / Math.max(1, skills.length)
  const p = 0.1 + 0.7 * ratio + 0.03 * avgLevel + (state.character.attributes.intelligence - 50) / 500
  return Math.round(clamp(p, 0.05, 0.95) * 100) / 100
}

export function enrollmentReasons(state: SimulationState, program: ProgramDefinition): string[] {
  const reasons = unmetReasons(state, program.requires)
  if (ageAt(state.character.birthDate, state.clock) < program.minAge) reasons.push(`Âge minimal : ${program.minAge} ans`)
  return reasons
}

/** Commence une formation : examen programmé à 10 h le jour où elle se termine. */
export function startEnrollment(draft: SimulationState, programId: string): void {
  const program = findProgram(programId)!
  const endsAt = fromCalendar({ ...toCalendar(addMonths(draft.clock, program.durationMonths)), hour: 10, minute: 0 })
  draft.education.enrollment = { program: program.id, since: draft.clock, endsAt, studyHours: 0 }
  scheduleEvent(draft, endsAt, { type: 'exam', program: program.id })
  writeLog(draft, 'event', 'enrolled', `Inscription : ${program.label}. Examen prévu le ${formatDate(endsAt)}.`)
}

/** Une séance d'étude : compte pour la formation en cours, sinon entretient la logique. */
export function studySession(draft: SimulationState): void {
  const enrollment = draft.education.enrollment
  if (!enrollment) {
    gainXp(draft, 'logic', 3 * STUDY_SESSION_HOURS)
    return
  }
  enrollment.studyHours += STUDY_SESSION_HOURS
  const program = findProgram(enrollment.program)!
  for (const [skill, xp] of Object.entries(program.skills) as [SkillId, number][]) {
    gainXp(draft, skill, xp * STUDY_SESSION_HOURS)
  }
}

export const EDUCATION_HANDLERS = {
  exam(draft: SimulationState, event: Extract<GameEvent, { type: 'exam' }>) {
    const enrollment = draft.education.enrollment
    if (!enrollment || enrollment.program !== event.program) return
    const program = findProgram(event.program)!
    const probability = examProbability(draft)
    draft.education.enrollment = null
    if (drawRandom(draft) < probability) {
      draft.education.diplomas.push({ id: program.diploma, at: draft.clock })
      writeLog(draft, 'event', 'diploma', `Diplôme obtenu : ${findDiploma(program.diploma)!.label} !`, { program: program.id })
      // Les parents sont fiers : souvenir durable.
      for (const parent of draft.people.filter((p) => p.role === 'parent' && p.alive)) {
        adjustRelationship(draft, parent.id, { closeness: 3 })
        addMemory(draft, parent.id, 'diploma', 4, `Fierté pour ton diplôme (${findDiploma(program.diploma)!.label}).`)
      }
    } else {
      writeLog(
        draft,
        'event',
        'exam_failed',
        `Examen échoué (${program.label}) : ${enrollment.studyHours} h d’étude sur ${program.studyHours} conseillées. Tu pourras te réinscrire.`,
      )
    }
  },
}

export const EDUCATION_ACTIONS: ActionDefinition[] = [
  {
    ...BASE,
    id: 'enroll',
    label: 'S’inscrire',
    description: 'S’inscrire à une formation diplômante.',
    durationMinutes: 60,
    params: ['program'],
    extraCost: (_s, p) => findProgram(p.program!)?.tuition.value ?? 0,
    preconditions: [
      { code: 'CLOSED', test: (s) => weekdayOf(s) < 5, message: 'Inscriptions en semaine seulement.' },
      opensBetween(9, 17, 'Inscriptions entre 9 h et 17 h.'),
      { code: 'ALREADY_ENROLLED', test: (s) => s.education.enrollment === null, message: 'Déjà inscrit·e à une formation.' },
      {
        code: 'ENROLLMENT_CLOSED',
        test: (s, p) => {
          const months = findProgram(p.program!)!.startMonths
          return months.length === 0 || months.includes(toCalendar(s.clock).month)
        },
        message: (_s, p) =>
          `Inscriptions seulement en ${findProgram(p.program!)!.startMonths.map((m) => MONTH_NAMES[m - 1]).join(', ')}.`,
      },
      {
        code: 'REQUIREMENTS_NOT_MET',
        test: (s, p) => enrollmentReasons(s, findProgram(p.program!)!).length === 0,
        message: (s, p) => enrollmentReasons(s, findProgram(p.program!)!).join(' ; '),
      },
    ],
    onComplete: (draft, p) => startEnrollment(draft, p.program!),
  },
  {
    ...BASE,
    id: 'drop_out',
    label: 'Abandonner la formation',
    description: 'Quitter la formation en cours.',
    durationMinutes: 10,
    preconditions: [{ code: 'NOT_ENROLLED', test: (s) => s.education.enrollment !== null, message: 'Aucune formation en cours.' }],
    onComplete(draft) {
      const program = findProgram(draft.education.enrollment!.program)!
      draft.education.enrollment = null
      cancelEvents(draft, (e) => e.type === 'exam' && e.program === program.id)
      writeLog(draft, 'event', 'dropped_out', `Formation abandonnée : ${program.label}.`)
    },
  },
]

export const examChanceLabel = (state: SimulationState) => percent(examProbability(state))
