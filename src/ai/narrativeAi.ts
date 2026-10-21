/**
 * Adaptateur pour une IA externe FACULTATIVE.
 *
 * Règles de sécurité :
 * - aucune clé d'API dans l'application : un adaptateur réel passerait par un serveur
 *   intermédiaire qui garde la clé (voir `createProxyAdapter`) ;
 * - l'IA ne modifie jamais l'état du jeu : elle PROPOSE une réplique et des actions,
 *   que `validateAiResponse` filtre et que le moteur valide ; le joueur confirme ;
 * - rien n'est envoyé sans autorisation explicite (`withConsent`) ;
 * - données minimisées : ni prénom, ni date, ni montant, ni graine.
 *
 * Aucun service d'IA gratuit, sécurisé et durable n'a été retenu : l'adaptateur
 * par défaut est désactivé et le jeu fonctionne entièrement sans IA.
 */
import {
  ageAt,
  cleanText,
  describe as describeAction,
  isTopicId,
  MESSAGE_MAX_LENGTH,
  validateAction,
  type ActionId,
  type ActionParams,
  type SimulationState,
  type ValidationIssue,
} from '../engine/index.ts'
import { withConsent } from './consent.ts'

/** Données envoyées à l'IA : uniquement des catégories, jamais d'identité. */
export interface AiRequest {
  purpose: 'dialogue'
  relation: string
  closeness: 'distante' | 'correcte' | 'proche'
  tension: 'aucune' | 'légère' | 'forte'
  personSick: boolean
  player: { ageRange: string; employed: boolean; stressed: boolean }
  /** Actions que l'IA a le droit de proposer. */
  allowedActions: AiActionId[]
}

export interface NarrativeAiAdapter {
  id: string
  label: string
  available: boolean
  unavailableReason?: string
  complete: (request: AiRequest) => Promise<unknown>
}

export const AI_DISABLED_REASON =
  'Désactivée : aucun service d’IA gratuit, sécurisé et durable n’est disponible pour SIMULIFE. Le jeu fonctionne entièrement sans IA.'

export const disabledAdapter: NarrativeAiAdapter = {
  id: 'disabled',
  label: 'Aucune IA',
  available: false,
  unavailableReason: AI_DISABLED_REASON,
  complete: () => Promise.reject(new Error(AI_DISABLED_REASON)),
}

/**
 * Adaptateur vers un serveur intermédiaire HTTPS qui détient la clé de l'IA.
 * Il n'est branché nulle part dans cette version (pas de serveur) ; il sert de modèle.
 */
export function createProxyAdapter(endpoint: string, fetchFn: typeof fetch = fetch, timeoutMs = 15000): NarrativeAiAdapter {
  const url = new URL(endpoint)
  if (url.protocol !== 'https:') throw new Error('Le serveur d’IA doit être en HTTPS.')
  if (url.username || url.password || [...url.searchParams.keys()].some((k) => /key|token|secret/i.test(k))) {
    throw new Error('Aucune clé ni identifiant ne doit figurer dans l’adresse : la clé reste sur le serveur.')
  }
  return {
    id: 'proxy',
    label: url.host,
    available: true,
    async complete(request) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      try {
        let res: Response
        try {
          res = await fetchFn(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(request),
            signal: controller.signal,
            credentials: 'omit',
          })
        } catch (e) {
          throw new Error(controller.signal.aborted ? 'Le service d’IA ne répond pas (délai dépassé).' : 'Pas de connexion au service d’IA.', { cause: e })
        }
        if (!res.ok) throw new Error(`Le service d’IA a répondu ${res.status}.`)
        return await res.json()
      } finally {
        clearTimeout(timer)
      }
    },
  }
}

const AI_ACTIONS = ['talk', 'write', 'call', 'visit', 'gift', 'help'] as const
export type AiActionId = (typeof AI_ACTIONS)[number]
const isAiAction = (v: unknown): v is AiActionId => AI_ACTIONS.includes(v as AiActionId)

const band = (n: number, low: number, high: number) => (n < low ? 0 : n < high ? 1 : 2)

/** Contexte minimal pour une suggestion de dialogue avec ce proche. */
export function buildAiRequest(state: SimulationState, personId: string): AiRequest {
  const person = state.people.find((p) => p.id === personId)
  const rel = state.relationships[personId]
  if (!person || !rel) throw new Error('Proche inconnu.')
  const age = ageAt(state.character.birthDate, state.clock)
  const decade = Math.floor(age / 10) * 10
  return {
    purpose: 'dialogue',
    relation: person.relation,
    closeness: (['distante', 'correcte', 'proche'] as const)[band(rel.closeness, 30, 60)],
    tension: (['aucune', 'légère', 'forte'] as const)[band(rel.tension, 15, 40)],
    personSick: person.sickSince !== null,
    player: { ageRange: `${decade}-${decade + 9} ans`, employed: state.career.job !== null, stressed: state.character.needs.stress >= 60 },
    allowedActions: [...AI_ACTIONS],
  }
}

export interface AiProposal {
  action: AiActionId
  params: ActionParams
  label: string
  issues: ValidationIssue[]
}

export interface AiSuggestion {
  reply: string | null
  proposals: AiProposal[]
  /** Éléments de la réponse écartés, avec la raison. */
  rejected: string[]
}

const MAX_PROPOSALS = 3

/**
 * Filtre une réponse d'IA : texte nettoyé et limité, actions autorisées seulement,
 * cible forcée sur le proche concerné, validation par le moteur. Rien n'est exécuté.
 */
export function validateAiResponse(raw: unknown, state: SimulationState, personId: string): AiSuggestion {
  const rejected: string[] = []
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { reply: null, proposals: [], rejected: ['Réponse illisible.'] }
  const r = raw as Record<string, unknown>

  let reply: string | null = null
  if (typeof r.reply === 'string') {
    const text = cleanText(r.reply)
    if (text.length > 0 && text.length <= MESSAGE_MAX_LENGTH) reply = text
    else rejected.push('Réplique vide ou trop longue.')
  }

  const proposals: AiProposal[] = []
  const list = Array.isArray(r.actions) ? r.actions : []
  for (const item of list.slice(0, MAX_PROPOSALS)) {
    const a = item as { action?: unknown; params?: Record<string, unknown> }
    if (!isAiAction(a?.action)) {
      rejected.push(`Action non autorisée : ${String(a?.action)}.`)
      continue
    }
    const params: ActionParams = { personId }
    if (a.action === 'talk' || a.action === 'write') {
      if (!isTopicId(a.params?.topic)) {
        rejected.push('Sujet de conversation inconnu.')
        continue
      }
      params.topic = a.params.topic
      if (a.action === 'write' && reply) params.text = reply
    }
    if (a.params?.personId !== undefined && a.params.personId !== personId) rejected.push('Cible différente du proche concerné : ignorée.')
    const validation = validateAction(state, a.action as ActionId, params)
    proposals.push({ action: a.action, params, label: describeAction(state, a.action, params), issues: validation.ok ? [] : validation.issues })
  }
  if (list.length > MAX_PROPOSALS) rejected.push(`Au plus ${MAX_PROPOSALS} propositions : le reste est ignoré.`)
  return { reply, proposals, rejected }
}

/** Demande une suggestion : adaptateur actif, autorisation donnée, réponse filtrée. */
export async function suggest(
  adapter: NarrativeAiAdapter,
  state: SimulationState,
  personId: string,
  options: { once?: boolean; store?: Storage } = {},
): Promise<AiSuggestion> {
  if (!adapter.available) throw new Error(adapter.unavailableReason ?? AI_DISABLED_REASON)
  const request = buildAiRequest(state, personId)
  const raw = await withConsent('ai-narration', () => adapter.complete(request), options)
  return validateAiResponse(raw, state, personId)
}
