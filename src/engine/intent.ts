/**
 * Actions libres : une phrase tapée par le joueur (« j'appelle maman », « je vais
 * courir », « mettre 100 € de côté ») est interprétée par des règles en une action
 * du catalogue ou un sujet de conversation.
 *
 * L'interprétation ne fait QUE proposer : rien n'est exécuté ici. Chaque proposition
 * passe ensuite par `validateAction` / `performAction`, comme un bouton de l'interface.
 */
import { ACTIONS, validateAction } from './actions.ts'
import { isTopicId, TOPICS, topicOptions, type TopicId } from './dialogue.ts'
import { findCareer, findProgram, SKILLS } from './data/careers.ts'
import type { ActionId, ActionParams, Channel, Person, SimulationState, SkillId, ValidationIssue } from './types.ts'

export interface Interpretation {
  action: ActionId
  params: ActionParams
  /** Ce que le jeu a compris, en clair. */
  label: string
  /** Précision sur l'interprétation (montant ajusté…). */
  note?: string
  /** Plus c'est haut, plus la règle était précise. */
  score: number
  /** Validation au moment de l'interprétation (l'action n'est jamais lancée sans confirmation). */
  issues: ValidationIssue[]
}

export const TEXT_MAX_LENGTH = 200

/** Minuscules, sans accents ni ponctuation, espaces simples. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’'·\-_/]/g, ' ')
    .replace(/[^a-z0-9€ ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Vrai si l'un des motifs apparaît comme mot (ou début de mot) dans le texte normalisé. */
const has = (norm: string, ...patterns: string[]) => patterns.some((p) => new RegExp(`(^| )${p}`).test(norm))

const RELATION_WORDS: { words: string[]; match: (p: Person) => boolean }[] = [
  { words: ['maman', 'mere', 'ma mere'], match: (p) => p.relation === 'Mère' },
  { words: ['papa', 'pere', 'mon pere'], match: (p) => p.relation === 'Père' },
  { words: ['frere', 'frangin'], match: (p) => p.relation === 'Frère' },
  { words: ['soeur', 'frangine'], match: (p) => p.relation === 'Sœur' },
  { words: ['parents'], match: (p) => p.role === 'parent' },
  { words: ['ami', 'amie', 'pote', 'copain', 'copine'], match: (p) => p.role === 'friend' },
  { words: ['collegue'], match: (p) => p.role === 'colleague' },
]

/** Proches désignés dans la phrase, par leur prénom ou leur lien. */
export function mentionedPeople(state: SimulationState, norm: string): Person[] {
  const alive = state.people.filter((p) => p.alive)
  const byName = alive.filter((p) => has(norm, `${normalize(p.name.split(' ')[0])}( |$)`))
  if (byName.length > 0) return byName
  for (const { words, match } of RELATION_WORDS) {
    if (words.some((w) => has(norm, `${w}s?( |$)`))) return alive.filter(match)
  }
  return []
}

const CAREER_WORDS: Record<string, string[]> = {
  cashier: ['caisse', 'caissier', 'caissiere'],
  warehouse: ['entrepot', 'preparateur', 'preparatrice', 'logistique'],
  waiter: ['serveur', 'serveuse'],
  cook: ['cuisinier', 'cuisiniere'],
  electrician: ['electricien'],
  admin_assistant: ['assistant', 'administratif', 'secretaire'],
  accountant: ['comptable'],
  developer: ['developpeu', 'programmeu'],
  nurse: ['infirmier', 'infirmiere'],
  teacher: ['professeur', 'prof ', 'enseignant', 'instit'],
  team_lead: ['responsable', 'manager', 'chef d equipe'],
  graphic_designer: ['graphiste'],
}

const PROGRAM_WORDS: Record<string, string[]> = {
  cap_cuisine: ['cap cuisine'],
  cap_elec: ['cap elec'],
  daeu: ['daeu', 'equivalent du bac'],
  bts_compta: ['bts', 'compta'],
  licence: ['licence'],
  ifsi: ['ifsi', 'soins infirmiers'],
  master: ['master'],
  titre_dev: ['developpeur', 'code', 'programmation'],
}

const SKILL_WORDS: Record<SkillId, string[]> = {
  cooking: ['cuisine', 'cuisiner'],
  communication: ['communication', 'parler en public', 'eloquence'],
  logic: ['logique', 'maths', 'echecs'],
  manual: ['bricol', 'manuel', 'reparer'],
  creativity: ['creativite', 'dessin', 'musique', 'peinture', 'ecrire'],
  organization: ['organisation', 'organiser', 'planning'],
}

const firstMatch = (norm: string, table: Record<string, string[]>) => Object.keys(table).filter((id) => has(norm, ...table[id]))

/** Sujet de conversation que suggère un message libre (« désolé », « bravo », « ça va ? »). */
export function messageTopic(text: string): TopicId {
  const n = normalize(text)
  if (has(n, 'desole', 'pardon', 'excuse')) return 'apologize'
  if (has(n, 'joyeux anniv', 'bon anniv')) return 'birthday'
  if (has(n, 'bravo', 'felicitation')) return 'congratulate'
  if (has(n, 'merci')) return 'thank'
  if (has(n, 'malade', 'ta sante', 'te sens', 'gueri', 'remets')) return 'support'
  if (has(n, 'stress', 'angoiss', 'pas le moral', 'ca va pas', 'besoin de parler', 'deprim')) return 'confide'
  if (has(n, 'souviens', 'souvenir', 'tu te rappelles')) return 'remember'
  if (has(n, 'conseil', 'idee de travail', 'trouver un travail', 'trouver du travail', 'chercher du travail')) return 'advice'
  if (has(n, 'devine', 'nouvelle', 'diplome', 'embauche', 'raconter')) return 'share'
  if (has(n, 'comment tu vas', 'comment vas', 'ca va', 'quoi de neuf', 'des nouvelles', 'tu deviens')) return 'news'
  return 'chat'
}

/**
 * Sujet retenu pour un message libre vers ce proche : celui que suggère le texte s'il
 * est possible maintenant, sinon un simple bavardage (ou `null` si plus rien n'est possible).
 */
export function resolveTopic(state: SimulationState, personId: string, channel: Channel, text: string): TopicId | null {
  const options = topicOptions(state, personId, channel)
  const wanted = messageTopic(text)
  if (options.find((o) => o.id === wanted)?.available) return wanted
  return options.find((o) => o.id === 'chat')?.available ? 'chat' : null
}

function amountFor(action: ActionId, norm: string): { amount: number; note?: string } {
  const allowed = ACTIONS[action].amounts ?? []
  const asked = Number(norm.match(/\d+/)?.[0])
  if (!Number.isFinite(asked)) return { amount: allowed[0], note: `Montant proposé : ${allowed[0]} € (possibles : ${allowed.join(' €, ')} €).` }
  if (allowed.includes(asked)) return { amount: asked }
  const nearest = [...allowed].sort((a, b) => Math.abs(a - asked) - Math.abs(b - asked))[0]
  return { amount: nearest, note: `${asked} € n’est pas possible : montant ajusté à ${nearest} € (possibles : ${allowed.join(' €, ')} €).` }
}

type Draft = Omit<Interpretation, 'issues' | 'label'> & { label?: string }

/** Interprétations possibles d'une phrase, la plus précise d'abord (liste vide : rien compris). */
export function interpretText(state: SimulationState, text: string): Interpretation[] {
  const norm = normalize(text.slice(0, TEXT_MAX_LENGTH))
  if (!norm) return []
  const people = mentionedPeople(state, norm)
  const found: Draft[] = []
  const add = (action: ActionId, params: ActionParams = {}, score = 1, note?: string) => found.push({ action, params, score, note })

  // Avec un proche.
  for (const person of people) {
    const personId = person.id
    if (has(norm, 'appel', 'telephon', 'coup de fil')) add('call', { personId }, 3)
    if (has(norm, 'rendre visite', 'aller voir', 'voir', 'passer chez', 'visite')) add('visit', { personId }, 2)
    if (has(norm, 'cadeau', 'offrir', 'offre')) add('gift', { personId }, 3)
    if (has(norm, 'aider', 'aide')) add('help', { personId }, 2)
    if (has(norm, 'emprunt', 'preter', 'prete', 'pret ', 'argent')) {
      const { amount, note } = amountFor('ask_loan', norm)
      add('ask_loan', { personId, amount }, 3, note)
    }
    const topic = messageTopic(norm)
    if (has(norm, 'ecri', 'message', 'texto', 'sms')) add('write', { personId, topic }, 3)
    if (has(norm, 'parler', 'discuter', 'dire', 'excuse', 'feliciter', 'souhaiter', 'confier', 'raconter', 'remercier')) {
      add('talk', { personId, topic }, 2)
      add('write', { personId, topic }, 1)
    }
  }

  // Seul.
  if (has(norm, 'dormir', 'dors', 'coucher', 'sieste', 'au lit')) add('sleep')
  if (has(norm, 'restaurant', 'resto ')) add('restaurant', {}, 2)
  else if (has(norm, 'manger', 'mange', 'cuisiner un repas', 'repas', 'diner', 'dejeuner', 'faim')) add('cook_meal')
  if (has(norm, 'aide alimentaire', 'banque alimentaire', 'restos du coeur')) add('food_aid', {}, 3)
  if (has(norm, 'douche', 'laver', 'bain')) add('shower')
  if (has(norm, 'travailler', 'boulot', 'bosser', 'taf', 'aller au travail')) add('work')
  if (has(norm, 'sport', 'courir', 'cours a pied', 'footing', 'jogging', 'muscu', 'nager', 'natation', 'velo')) add('sport')
  if (has(norm, 'etudier', 'reviser', 'devoirs', 'potasser')) add('study')
  if (people.length === 0 && has(norm, 'sortir', 'soiree', 'boire un verre', 'amis', 'potes')) add('friends')
  if (has(norm, 'reposer', 'repose', 'detendre', 'tele( |$)', 'television', 'serie', 'lire', 'bouquiner', 'glander')) add('relax')
  if (has(norm, 'attendre', 'rien faire', 'patienter')) add('wait')

  if (has(norm, 'epargn', 'economis', 'de cote', 'livret')) {
    const { amount, note } = amountFor('deposit_savings', norm)
    add('deposit_savings', { amount }, 3, note)
  }
  if (has(norm, 'retirer', 'sortir de l epargne')) {
    const { amount, note } = amountFor('withdraw_savings', norm)
    add('withdraw_savings', { amount }, 3, note)
  }
  if (has(norm, 'banque') && has(norm, 'pret', 'emprunt', 'credit')) {
    const { amount, note } = amountFor('bank_loan', norm)
    add('bank_loan', { amount }, 3, note)
  }

  if (has(norm, 'postul', 'candidat', 'travailler comme', 'devenir', 'job de', 'boulot de', 'emploi de')) {
    for (const career of firstMatch(norm, CAREER_WORDS)) add('apply_job', { career }, 3)
  }
  if (has(norm, 'demission', 'quitter mon travail', 'quitter mon boulot', 'quitter mon job')) add('quit_job', {}, 3)
  if (has(norm, 'inscri', 'formation', 'reprendre les etudes')) {
    for (const program of firstMatch(norm, PROGRAM_WORDS)) add('enroll', { program }, 3)
  }
  if (has(norm, 'abandonner', 'arreter') && has(norm, 'formation', 'etudes')) add('drop_out', {}, 3)
  if (has(norm, 'entrain', 'pratiquer', 'apprendre', 'progresser', 'ameliorer')) {
    for (const skill of firstMatch(norm, SKILL_WORDS) as SkillId[]) add('practice', { skill }, 3)
  }

  // Doublons retirés, plus précis d'abord ; validation jointe sans rien exécuter.
  const seen = new Set<string>()
  return found
    .sort((a, b) => b.score - a.score)
    .filter((d) => {
      const id = `${d.action}:${JSON.stringify(d.params)}`
      if (seen.has(id)) return false
      seen.add(id)
      return true
    })
    .map((d) => {
      const validation = validateAction(state, d.action, d.params)
      return { ...d, label: describe(state, d.action, d.params), issues: validation.ok ? [] : validation.issues }
    })
}

/** Libellé clair d'une action interprétée (« Appeler Nadia », « Postuler : Serveur·se »). */
export function describe(state: SimulationState, action: ActionId, params: ActionParams): string {
  const person = params.personId ? state.people.find((p) => p.id === params.personId) : undefined
  const base = ACTIONS[action].label
  if ((action === 'talk' || action === 'write') && person && isTopicId(params.topic)) {
    const ctx = { state, person, rel: state.relationships[person.id], channel: (action === 'talk' ? 'person' : 'message') as Channel }
    return `${base} avec ${person.name} : ${TOPICS[params.topic].label(ctx).toLowerCase()}`
  }
  if (person) return `${base} — ${person.name}${params.amount ? ` (${params.amount} €)` : ''}`
  if (params.career) return `${base} : ${findCareer(params.career)?.label}`
  if (params.program) return `${base} : ${findProgram(params.program)?.label}`
  if (params.amount) return `${base} (${params.amount} €)`
  if (params.skill) return `${base} : ${SKILLS.find((s) => s.id === params.skill)?.label.toLowerCase()}`
  return base
}
