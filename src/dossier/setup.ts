/**
 * Passage du dossier de vie aux options de la simulation : entourage, diplômes,
 * situation professionnelle et compétences de départ.
 *
 * Chaque élément est un fait déclaré s'il vient d'une réponse, sinon une
 * hypothèse explicitement marquée (valeur par défaut ou tirée par le moteur).
 */
import { DIPLOMAS, SKILLS } from '../engine/data/careers.ts'
import type { Entourage } from '../engine/people.ts'
import type { SkillId } from '../engine/types.ts'
import type { ProfileFact } from './profile.ts'
import { activeAnswer, type Questionnaire } from './questionnaire.ts'
import type { AnswerValue, Dossier } from './types.ts'

export interface SimulationSetup {
  entourage: Entourage
  /** Métier précis, 'auto' (le meilleur accessible) ou `null` (sans emploi). */
  career: string | null
  diplomas: string[]
  skills: Partial<Record<SkillId, number>>
}

/** Niveau d'études déclaré → diplômes reconnus par la simulation. */
const DIPLOMAS_BY_LEVEL: Record<string, string[]> = {
  primary: [],
  middle: [],
  vocational: ['cap_other'],
  high_school: [],
  bac: ['bac'],
  bac2: ['bac', 'bac2_other'],
  bac5: ['bac', 'licence', 'master'],
}

/** Ambiance familiale → proximité et tension de départ avec la famille. */
const CLIMATE: Record<string, { closeness: number; tension: number }> = {
  warm: { closeness: 80, tension: 5 },
  calm: { closeness: 65, tension: 10 },
  changing: { closeness: 50, tension: 25 },
  tense: { closeness: 35, tension: 45 },
}

/** Situation à l'âge de départ → emploi de départ. */
const CAREER_BY_SITUATION: Record<string, string | null> = {
  employed: 'auto',
  apprentice: 'auto',
  studies: null,
  searching: null,
  other: null,
}

/** Loisirs déclarés → niveaux de compétence de départ. */
const SKILLS_BY_HOBBY: Record<string, Partial<Record<SkillId, number>>> = {
  cooking: { cooking: 2 },
  music: { creativity: 1 },
  drawing: { creativity: 2 },
  diy: { manual: 2 },
  writing: { communication: 1, creativity: 1 },
  reading: { communication: 1 },
  video_games: { logic: 1 },
}

const FRIENDS_BY_GROUP: Record<string, number> = { few: 2, small: 3, large: 4 }

const reasonOf = (v: AnswerValue | undefined) =>
  !v ? 'unanswered' : v.kind === 'unknown' ? 'unknown' : v.kind === 'declined' ? 'declined' : 'unanswered'

export function deriveSetup(q: Questionnaire, d: Dossier): { setup: SimulationSetup; facts: ProfileFact[] } {
  const answer = (id: string) => activeAnswer(q, d, id)?.value
  const facts: ProfileFact[] = []
  const entourage: Entourage = {}
  const add = (key: string, label: string, questionId: string, declared: string | null, simulated: string) => {
    const value = answer(questionId)
    facts.push(
      declared !== null
        ? { key, label, display: declared, origin: 'declared', questionId }
        : { key, label, display: simulated, origin: 'simulated', reason: reasonOf(value), questionId },
    )
  }

  // Parents présents pendant l'enfance.
  const household = answer('family.household')
  if (household?.kind === 'choices') {
    entourage.parents = (['mother', 'father'] as const).filter((p) => household.options.includes(p))
  }
  const parentsLabel = (list: readonly string[]) =>
    list.length === 2 ? 'Mère et père' : list[0] === 'mother' ? 'Mère' : list[0] === 'father' ? 'Père' : 'Aucun des deux'
  add('parents', 'Parents dans ton entourage', 'family.household', entourage.parents ? parentsLabel(entourage.parents) : null, 'Mère et père')

  const siblings = answer('family.siblings_count')
  if (siblings?.kind === 'number') entourage.siblings = siblings.value

  const atmosphere = answer('family.atmosphere')
  if (atmosphere?.kind === 'choice') {
    entourage.familyCloseness = CLIMATE[atmosphere.option].closeness
    entourage.familyTension = CLIMATE[atmosphere.option].tension
  }
  add(
    'familyClimate',
    'Liens familiaux de départ',
    'family.atmosphere',
    entourage.familyCloseness !== undefined ? `Proximité ${entourage.familyCloseness}/100` : null,
    'Tirés au hasard',
  )

  const group = answer('relationships.group_size')
  if (group?.kind === 'choice') entourage.friends = FRIENDS_BY_GROUP[group.option]
  add('friends', 'Amis proches', 'relationships.group_size', entourage.friends !== undefined ? String(entourage.friends) : null, '2')

  const bestFriend = answer('relationships.best_friend')
  const inTouch = answer('relationships.still_in_touch')
  if (bestFriend?.kind === 'choice' && bestFriend.option === 'yes') {
    entourage.bestFriendCloseness = inTouch?.kind === 'choice' && inTouch.option === 'no' ? 20 : 70
  }

  // Diplômes.
  const level = answer('school.highest_level')
  const diplomas = level?.kind === 'choice' ? DIPLOMAS_BY_LEVEL[level.option] : []
  const diplomaLabel = (ids: string[]) =>
    ids.length === 0 ? 'Aucun diplôme reconnu' : ids.map((id) => DIPLOMAS.find((x) => x.id === id)!.label).join(', ')
  add('diplomas', 'Diplômes', 'school.highest_level', level?.kind === 'choice' ? diplomaLabel(diplomas) : null, diplomaLabel([]))

  // Situation professionnelle.
  const situation = answer('economy.situation')
  const career = situation?.kind === 'choice' ? CAREER_BY_SITUATION[situation.option] : 'auto'
  const situationLabel = (c: string | null) => (c === null ? 'Sans emploi au départ' : 'En emploi (métier accessible le mieux payé)')
  add('situation', 'Situation à l’âge de départ', 'economy.situation', situation?.kind === 'choice' ? situationLabel(career) : null, situationLabel('auto'))

  // Compétences issues des loisirs.
  const skills: Partial<Record<SkillId, number>> = {}
  const hobbies = answer('leisure.hobbies')
  if (hobbies?.kind === 'choices') {
    for (const hobby of hobbies.options) {
      for (const [skill, lvl] of Object.entries(SKILLS_BY_HOBBY[hobby] ?? {}) as [SkillId, number][]) {
        skills[skill] = Math.max(skills[skill] ?? 0, lvl)
      }
    }
  }
  const skillsLabel = Object.entries(skills)
    .map(([id, lvl]) => `${SKILLS.find((s) => s.id === id)!.label} ${lvl}`)
    .join(', ')
  add('skills', 'Compétences de départ', 'leisure.hobbies', hobbies?.kind === 'choices' ? skillsLabel || 'Aucune' : null, 'Aucune')

  return { setup: { entourage, career, diplomas, skills }, facts }
}
