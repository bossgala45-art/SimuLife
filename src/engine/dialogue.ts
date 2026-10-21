/**
 * Moteur de dialogues, sans IA : des sujets de conversation définis par des règles.
 *
 * Chaque sujet déclare quand il est proposé (contexte réel : maladie d'un proche,
 * nouvelle récente, tension, stress…), la phrase du joueur, la réponse du proche
 * et des effets BORNÉS sur la relation. Une issue incertaine (des excuses acceptées
 * ou non) est annoncée avec sa probabilité avant le choix.
 *
 * Deux canaux, deux actions du catalogue :
 * - `talk`  : conversation en personne (15 min), mêmes contraintes qu'une rencontre ;
 * - `write` : message écrit (5 min), la réponse arrive plus tard (voir `story.ts`).
 * Un sujet n'est abordé qu'une fois par conversation.
 */
import { notSick, opensBetween, percent, weekdayOf, type ActionDefinition, type Outcome, type Precondition } from './actionKit.ts'
import { hireProbability, occupationLabel } from './careers.ts'
import { CAREERS } from './data/careers.ts'
import { writeLog } from './journal.ts'
import { clamp } from './needs.ts'
import { isBirthday } from './people.ts'
import { adjustRelationship, findPerson, touch } from './relationships.ts'
import { drawRandom } from './rng.ts'
import { gainXp, skillLevel } from './skills.ts'
import { addMessage, MESSAGE_MAX_LENGTH, scheduleReply, SHARED_LIMIT, variant } from './story.ts'
import { MINUTES_PER_DAY, toCalendar } from './time.ts'
import type { ActionParams, Channel, ConversationSession, Person, Relationship, SimulationState, StoryMemory } from './types.ts'

export const TOPIC_IDS = [
  'news',
  'share',
  'support',
  'congratulate',
  'birthday',
  'thank',
  'remember',
  'apologize',
  'confide',
  'advice',
  'chat',
] as const
export type TopicId = (typeof TOPIC_IDS)[number]
export const isTopicId = (v: unknown): v is TopicId => TOPIC_IDS.includes(v as TopicId)

/** Une conversation s'arrête après deux heures sans échange. */
export const SESSION_GAP_MINUTES = 120
/** Bavardages possibles par conversation (sans effet notable au-delà). */
export const CHAT_LIMIT = 2

export interface TalkContext {
  state: SimulationState
  person: Person
  rel: Relationship
  channel: Channel
}

interface Topic {
  id: TopicId
  /** Libellé du choix proposé au joueur. */
  label: (ctx: TalkContext) => string
  /** Ce que dit (ou écrit) le joueur. */
  line: (ctx: TalkContext) => string
  /** `null` si le sujet est possible, sinon la raison. */
  unavailable: (ctx: TalkContext) => string | null
  /** Probabilité de réussite, pour les sujets à l'issue incertaine. */
  chance?: (ctx: TalkContext) => number
  outcomeLabel?: string
  /** Applique les effets (bornés) et renvoie la réponse du proche. */
  apply: (draft: SimulationState, ctx: TalkContext, success: boolean) => string
}

const DAY = MINUTES_PER_DAY
/** Les effets d'un message écrit valent un peu plus de la moitié de ceux d'une rencontre. */
const scale = (ctx: TalkContext) => (ctx.channel === 'person' ? 1 : 0.6)
const warm = (ctx: TalkContext) => ctx.rel.closeness >= 60 && ctx.rel.tension < 30
const cold = (ctx: TalkContext) => ctx.rel.tension >= 40
const key = (ctx: TalkContext, topic: string) => `${topic}:${ctx.person.id}:${ctx.state.clock}`
const shared = (state: SimulationState, personId: string) => state.narrative.shared[personId] ?? []

function markShared(draft: SimulationState, personId: string, mark: string): void {
  const list = (draft.narrative.shared[personId] ??= [])
  list.push(mark)
  if (list.length > SHARED_LIMIT) list.splice(0, list.length - SHARED_LIMIT)
}

/** Événements de la vie du joueur qui se racontent (récents, importants, pas encore racontés à ce proche). */
const SHAREABLE = new Set(['diploma', 'exam_failed', 'enrolled', 'dropped_out', 'hired', 'layoff', 'quit', 'raise', 'debt_closed', 'birthday', 'npc_death'])

export function untoldNews(state: SimulationState, personId: string): StoryMemory | undefined {
  const told = shared(state, personId)
  for (let i = state.narrative.memories.length - 1; i >= 0; i--) {
    const m = state.narrative.memories[i]
    if (state.clock - m.at > 120 * DAY) break
    if (SHAREABLE.has(m.kind) && !m.people.includes(personId) && !told.includes(`mem:${m.id}`)) return m
  }
  return undefined
}

/** Bonne nouvelle récente d'un proche, pas encore saluée. */
function personGoodNews(state: SimulationState, personId: string): StoryMemory | undefined {
  const told = shared(state, personId)
  return state.narrative.memories.findLast(
    (m) =>
      m.people.includes(personId) &&
      ['npc_first_job', 'npc_retired', 'npc_job_change'].includes(m.kind) &&
      state.clock - m.at <= 45 * DAY &&
      !told.includes(`congrats:${m.id}`),
  )
}

/** Prêt récent d'un proche, pas encore remercié. */
function unthankedLoan(state: SimulationState, rel: Relationship, personId: string) {
  const told = shared(state, personId)
  return rel.memories.findLast((m) => m.kind === 'loan_granted' && state.clock - m.at <= 180 * DAY && !told.includes(`thank:${m.at}`))
}

const goodMemory = (rel: Relationship) => rel.memories.findLast((m) => m.weight >= 3)

const SHARE_LINES: Record<string, string> = {
  diploma: 'J’ai une super nouvelle : j’ai eu mon diplôme !',
  exam_failed: 'J’ai raté mon examen… je suis déçu·e.',
  enrolled: 'Je me suis inscrit·e à une formation !',
  dropped_out: 'J’ai arrêté ma formation.',
  hired: 'J’ai trouvé un nouveau travail !',
  layoff: 'J’ai perdu mon travail…',
  quit: 'J’ai quitté mon travail.',
  raise: 'J’ai eu une augmentation !',
  debt_closed: 'J’ai fini de rembourser un prêt, quel soulagement.',
  birthday: 'J’ai passé un cap cette année, un anniversaire qui compte !',
  npc_death: 'J’ai perdu quelqu’un de proche…',
}

/** Ce que raconte un proche : uniquement des faits réels de la simulation. */
function personFacts(ctx: TalkContext): string[] {
  const { person, state } = ctx
  const facts: string[] = []
  if (person.sickSince !== null) facts.push('Je suis malade en ce moment, mais ça va aller.')
  const recent = state.narrative.memories.findLast((m) => m.people.includes(person.id) && state.clock - m.at <= 30 * DAY)
  if (recent?.kind === 'npc_moved') facts.push(person.distant ? 'Je m’installe doucement dans ma nouvelle ville.' : 'Je suis encore dans les cartons après mon déménagement.')
  if (person.occupation === 'retired') facts.push('Je profite de ma retraite.')
  else if (person.occupation === 'student') facts.push('Je suis toujours dans mes études.')
  else if (person.occupation === 'unemployed') facts.push('Je cherche du travail en ce moment.')
  else facts.push(`Toujours ${occupationLabel(person.occupation).toLowerCase()}, rien de neuf de ce côté.`)
  return facts
}

/** Métier accessible le plus prometteur, d'après les règles du jeu. */
function bestCareer(state: SimulationState) {
  return CAREERS.map((c) => ({ career: c, p: hireProbability(state, c.id) }))
    .filter((x) => x.p > 0)
    .sort((a, b) => b.p - a.p)[0]
}

export const TOPICS: Record<TopicId, Topic> = {
  news: {
    id: 'news',
    label: () => 'Prendre des nouvelles',
    line: (ctx) => variant(ctx.state, key(ctx, 'news-line'), ['Comment tu vas ? Quoi de neuf ?', 'Alors, comment ça va de ton côté ?']),
    unavailable: () => null,
    apply(draft, ctx) {
      adjustRelationship(draft, ctx.person.id, { closeness: (1 + skillLevel(draft, 'communication') * 0.2) * scale(ctx), tension: -1 })
      const opener = cold(ctx) ? 'Ça va.' : warm(ctx) ? variant(draft, key(ctx, 'news-open'), ['Ça me fait plaisir d’avoir de tes nouvelles !', 'Ah, content·e de t’entendre !']) : 'Ça va, merci.'
      return [opener, ...personFacts(ctx)].join(' ')
    },
  },
  share: {
    id: 'share',
    label: (ctx) => {
      const m = untoldNews(ctx.state, ctx.person.id)
      return m ? `Raconter : ${m.text.replace(/\.$/, '')}` : 'Raconter une nouvelle'
    },
    line: (ctx) => {
      const m = untoldNews(ctx.state, ctx.person.id)
      return (m && SHARE_LINES[m.kind]) ?? 'Il faut que je te raconte quelque chose.'
    },
    unavailable: (ctx) => (untoldNews(ctx.state, ctx.person.id) ? null : 'Rien de nouveau à raconter.'),
    apply(draft, ctx) {
      const m = untoldNews(ctx.state, ctx.person.id)!
      markShared(draft, ctx.person.id, `mem:${m.id}`)
      adjustRelationship(draft, ctx.person.id, { closeness: 2 * scale(ctx), trust: 1 })
      if (m.tone === 'good') return variant(draft, key(ctx, 'share-good'), ['Bravo ! Je suis vraiment content·e pour toi.', 'Génial ! Tu le mérites.'])
      if (m.tone === 'bad') return variant(draft, key(ctx, 'share-bad'), ['Oh… je suis désolé·e. Si tu as besoin, je suis là.', 'Courage. On en reparle quand tu veux.'])
      return 'Merci de me tenir au courant !'
    },
  },
  support: {
    id: 'support',
    label: () => 'Demander comment va sa santé',
    line: () => 'J’ai appris que tu étais malade. Comment tu te sens ?',
    unavailable: (ctx) => (ctx.person.sickSince !== null ? null : 'Personne n’est malade.'),
    apply(draft, ctx) {
      adjustRelationship(draft, ctx.person.id, { closeness: 2 * scale(ctx), trust: 1 })
      return variant(draft, key(ctx, 'support'), ['Ça me touche que tu prennes de mes nouvelles. Ça va un peu mieux.', 'Merci, c’est gentil. Je me repose.'])
    },
  },
  congratulate: {
    id: 'congratulate',
    label: (ctx) => {
      const m = personGoodNews(ctx.state, ctx.person.id)
      return m?.kind === 'npc_retired' ? 'Féliciter pour sa retraite' : 'Féliciter pour son nouveau travail'
    },
    line: (ctx) => (personGoodNews(ctx.state, ctx.person.id)?.kind === 'npc_retired' ? 'Bonne retraite ! Tu l’as bien méritée.' : 'Félicitations pour ton nouveau travail !'),
    unavailable: (ctx) => (personGoodNews(ctx.state, ctx.person.id) ? null : 'Pas de nouvelle à saluer.'),
    apply(draft, ctx) {
      const m = personGoodNews(ctx.state, ctx.person.id)!
      markShared(draft, ctx.person.id, `congrats:${m.id}`)
      adjustRelationship(draft, ctx.person.id, { closeness: 2 * scale(ctx) })
      return 'Merci, ça me fait plaisir que tu y penses !'
    },
  },
  birthday: {
    id: 'birthday',
    label: () => 'Souhaiter son anniversaire',
    line: () => 'Joyeux anniversaire ! 🎂',
    unavailable: (ctx) => {
      const today = toCalendar(ctx.state.clock)
      if (!isBirthday(ctx.person, today)) return 'Ce n’est pas son anniversaire.'
      return shared(ctx.state, ctx.person.id).includes(`bday:${today.year}`) ? 'Anniversaire déjà souhaité.' : null
    },
    apply(draft, ctx) {
      markShared(draft, ctx.person.id, `bday:${toCalendar(draft.clock).year}`)
      adjustRelationship(draft, ctx.person.id, { closeness: 1 })
      return variant(draft, key(ctx, 'bday'), ['Merci beaucoup, tu as pensé à moi !', 'Merci ! Ça me fait vraiment plaisir.'])
    },
  },
  thank: {
    id: 'thank',
    label: () => 'Remercier pour le prêt',
    line: () => 'Merci encore pour ton aide avec l’argent, ça m’a vraiment dépanné·e.',
    unavailable: (ctx) => (unthankedLoan(ctx.state, ctx.rel, ctx.person.id) ? null : 'Rien de particulier à remercier.'),
    apply(draft, ctx) {
      markShared(draft, ctx.person.id, `thank:${unthankedLoan(ctx.state, ctx.rel, ctx.person.id)!.at}`)
      adjustRelationship(draft, ctx.person.id, { trust: 2, closeness: 1 })
      return 'Avec plaisir, c’est normal.'
    },
  },
  remember: {
    id: 'remember',
    label: () => 'Évoquer un bon souvenir',
    line: (ctx) => `Tu te souviens ? ${goodMemory(ctx.rel)?.text ?? ''}`.trim(),
    unavailable: (ctx) => (goodMemory(ctx.rel) ? null : 'Pas encore de bon souvenir commun.'),
    apply(draft, ctx) {
      adjustRelationship(draft, ctx.person.id, { closeness: 2 * scale(ctx) })
      draft.character.needs.mood = clamp(draft.character.needs.mood + 3)
      return variant(draft, key(ctx, 'remember'), ['Oui, c’était un bon moment !', 'Ah oui ! J’y repense souvent.'])
    },
  },
  apologize: {
    id: 'apologize',
    label: () => 'S’excuser',
    line: () => 'Je suis désolé·e pour ce qui s’est passé entre nous.',
    unavailable: (ctx) => (ctx.rel.tension >= 15 ? null : 'Il n’y a pas de tension à apaiser.'),
    chance: (ctx) => Math.round(clamp(0.35 + ctx.rel.trust / 200 + ctx.rel.closeness / 300 - ctx.rel.tension / 250, 0.1, 0.9) * 100) / 100,
    outcomeLabel: 'Excuses acceptées',
    apply(draft, ctx, success) {
      if (success) {
        adjustRelationship(draft, ctx.person.id, { tension: -12 * scale(ctx), trust: 2, closeness: 1 })
        return 'Merci de le dire. On passe à autre chose.'
      }
      adjustRelationship(draft, ctx.person.id, { tension: 2 })
      return 'J’ai besoin d’un peu de temps.'
    },
  },
  confide: {
    id: 'confide',
    label: () => 'Se confier sur ton stress',
    line: () => 'En ce moment, je suis vraiment stressé·e…',
    unavailable: (ctx) => {
      if (ctx.state.character.needs.stress < 50) return 'Tu n’es pas particulièrement stressé·e.'
      return ctx.rel.closeness >= 30 ? null : 'Pas assez proches pour se confier.'
    },
    apply(draft, ctx) {
      draft.character.needs.stress = clamp(draft.character.needs.stress - (ctx.channel === 'person' ? 8 : 5))
      adjustRelationship(draft, ctx.person.id, { closeness: 1, trust: 1 })
      return variant(draft, key(ctx, 'confide'), ['Je comprends. Prends soin de toi, et parle-moi quand tu veux.', 'Ça va aller. Tu n’es pas seul·e.'])
    },
  },
  advice: {
    id: 'advice',
    label: () => 'Demander conseil pour trouver un travail',
    line: () => 'Tu aurais une idée de travail pour moi ?',
    unavailable: (ctx) => (ctx.state.career.job ? 'Tu as déjà un travail.' : null),
    apply(draft, ctx) {
      adjustRelationship(draft, ctx.person.id, { closeness: 1 * scale(ctx) })
      const best = bestCareer(draft)
      if (!best) return 'Je ne vois pas trop… peut-être une formation d’abord ?'
      return `Tu pourrais postuler comme ${best.career.label.toLowerCase()}. (Estimation du jeu : chance d’embauche ${percent(best.p)}.)`
    },
  },
  chat: {
    id: 'chat',
    label: () => 'Discuter de tout et de rien',
    line: () => 'Je passais juste dire bonjour.',
    unavailable: () => null,
    apply(draft, ctx) {
      adjustRelationship(draft, ctx.person.id, { closeness: 0.5 * scale(ctx) })
      return cold(ctx) ? 'Hmm.' : variant(draft, key(ctx, 'chat'), ['😊', 'Ah, coucou !', 'Ça fait plaisir !'])
    },
  },
}

function context(state: SimulationState, personId: string, channel: Channel): TalkContext | null {
  const person = findPerson(state, personId)
  const rel = state.relationships[personId]
  return person && rel ? { state, person, rel, channel } : null
}

/** Conversation en cours avec ce proche sur ce canal (sinon `null`). */
export function currentSession(state: SimulationState, personId: string, channel: Channel): ConversationSession | null {
  const s = state.narrative.session
  return s && s.personId === personId && s.channel === channel && state.clock - s.lastAt <= SESSION_GAP_MINUTES ? s : null
}

function topicIssue(state: SimulationState, params: ActionParams, channel: Channel): string | null {
  const ctx = context(state, params.personId!, channel)
  if (!ctx || !isTopicId(params.topic)) return 'Sujet impossible.'
  const topic = TOPICS[params.topic]
  const reason = topic.unavailable(ctx)
  if (reason) return reason
  const done = currentSession(state, ctx.person.id, channel)?.topics ?? []
  if (topic.id === 'chat') return done.filter((t) => t === 'chat').length >= CHAT_LIMIT ? 'Vous avez déjà bien bavardé.' : null
  return done.includes(topic.id) ? 'Déjà abordé dans cette conversation.' : null
}

/** Texte libre d'un message : nettoyé, une ligne, longueur limitée. */
export function cleanText(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()
}

const textIssue = (p: ActionParams) => p.text !== undefined && (cleanText(p.text).length === 0 || cleanText(p.text).length > MESSAGE_MAX_LENGTH)

export interface TopicOption {
  id: TopicId
  label: string
  line: string
  available: boolean
  reason?: string
  chance?: number
  outcomeLabel?: string
}

/** Choix contextuels proposés pour un proche, sur un canal (les sujets impossibles sont expliqués). */
export function topicOptions(state: SimulationState, personId: string, channel: Channel): TopicOption[] {
  const ctx = context(state, personId, channel)
  if (!ctx) return []
  return TOPIC_IDS.map((id) => {
    const topic = TOPICS[id]
    const reason = topicIssue(state, { personId, topic: id }, channel)
    return {
      id,
      label: topic.label(ctx),
      line: topic.line(ctx),
      available: reason === null,
      ...(reason ? { reason } : {}),
      ...(topic.chance ? { chance: topic.chance(ctx), outcomeLabel: topic.outcomeLabel } : {}),
    }
  })
}

function runTopic(draft: SimulationState, p: ActionParams, channel: Channel): void {
  const ctx = context(draft, p.personId!, channel)!
  const topic = TOPICS[p.topic as TopicId]
  const line = p.text !== undefined ? cleanText(p.text) : topic.line(ctx)
  // Le contexte est figé avant les effets : la réponse correspond à la situation au moment de l'échange.
  const frozen: TalkContext = { ...ctx, state: structuredClone(draft) }
  const success = topic.chance ? drawRandom(draft) < topic.chance(frozen) : true
  const reply = topic.apply(draft, frozen, success)

  touch(draft, ctx.person.id)
  gainXp(draft, 'communication', channel === 'person' ? 2 : 1)
  const session = currentSession(draft, ctx.person.id, channel) ?? { personId: ctx.person.id, channel, startedAt: draft.clock, lastAt: draft.clock, topics: [] }
  draft.narrative.session = { ...session, lastAt: draft.clock, topics: [...session.topics, topic.id] }

  addMessage(draft, ctx.person.id, 'player', channel, line)
  if (channel === 'person') {
    addMessage(draft, ctx.person.id, ctx.person.id, 'person', reply)
    writeLog(draft, 'social', 'talked', `Conversation avec ${ctx.person.name} : ${topic.label(frozen).toLowerCase()}.`, { personId: ctx.person.id, topic: topic.id })
  } else {
    scheduleReply(draft, ctx.person.id, reply)
    writeLog(draft, 'social', 'message_sent', `Message envoyé à ${ctx.person.name} : « ${line} »`, { personId: ctx.person.id, topic: topic.id })
  }
}

function topicOutcomes(state: SimulationState, p: ActionParams, channel: Channel): Outcome[] {
  const ctx = context(state, p.personId!, channel)
  const topic = isTopicId(p.topic) ? TOPICS[p.topic] : undefined
  return ctx && topic?.chance ? [{ label: topic.outcomeLabel!, probability: topic.chance(ctx) }] : []
}

const person = (s: SimulationState, p: ActionParams) => findPerson(s, p.personId!)!

const topicPrecondition = (channel: Channel): Precondition => ({
  code: 'TOPIC_UNAVAILABLE',
  test: (s, p) => topicIssue(s, p, channel) === null,
  message: (s, p) => topicIssue(s, p, channel) ?? '',
})

const validText: Precondition = {
  code: 'INVALID_TEXT',
  test: (_s, p) => !textIssue(p),
  message: `Message vide ou trop long (${MESSAGE_MAX_LENGTH} caractères au plus).`,
}

/** Se voir en personne : un·e collègue en semaine au travail ; un proche éloigné le week-end. */
const canMeet: Precondition = {
  code: 'PERSON_UNAVAILABLE',
  test: (s, p) => {
    const who = person(s, p)
    if (who.role === 'colleague') return weekdayOf(s) < 5
    return !who.distant || weekdayOf(s) >= 5
  },
  message: (s, p) =>
    person(s, p).role === 'colleague' ? 'Tes collègues se voient au travail, en semaine.' : `${person(s, p).name} habite loin : rencontre possible le week-end seulement.`,
}

export const DIALOGUE_ACTIONS: ActionDefinition[] = [
  {
    id: 'talk',
    label: 'Discuter en personne',
    description: 'Un sujet de conversation, face à face.',
    durationMinutes: 15,
    cost: { money: 0 },
    interruptible: false,
    sleeping: false,
    ratesPerHour: {},
    effects: { needs: { mood: 1 } },
    params: ['person', 'topic'],
    preconditions: [opensBetween(9, 22, 'Rencontres entre 9 h et 22 h.'), notSick, canMeet, topicPrecondition('person'), validText],
    outcomes: (s, p) => topicOutcomes(s, p, 'person'),
    onComplete: (draft, p) => runTopic(draft, p, 'person'),
  },
  {
    id: 'write',
    label: 'Envoyer un message',
    description: 'Un message écrit ; la réponse arrive plus tard.',
    durationMinutes: 5,
    cost: { money: 0 },
    interruptible: false,
    sleeping: false,
    ratesPerHour: {},
    effects: {},
    params: ['person', 'topic'],
    preconditions: [topicPrecondition('message'), validText],
    outcomes: (s, p) => topicOutcomes(s, p, 'message'),
    onComplete: (draft, p) => runTopic(draft, p, 'message'),
  },
]
