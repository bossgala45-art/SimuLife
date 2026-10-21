/**
 * Autorisations explicites avant tout envoi de données hors de l'appareil.
 *
 * Chaque service externe a une fiche (destinataire, données envoyées, finalité).
 * Rien n'est envoyé tant que le joueur n'a pas accepté ; l'accord peut valoir
 * pour une seule fois ou jusqu'à son retrait dans les Paramètres.
 */
export type ConsentId = 'ai-narration' | 'openstreetmap'

export interface ConsentPurpose {
  id: ConsentId
  title: string
  recipient: string
  /** Données envoyées, en clair. */
  data: string[]
  purpose: string
  policyUrl: string
}

export const CONSENT_PURPOSES: Record<ConsentId, ConsentPurpose> = {
  'ai-narration': {
    id: 'ai-narration',
    title: 'Suggestions d’une IA externe',
    recipient: 'Le service d’IA configuré (aucun n’est activé dans cette version)',
    data: ['Le lien avec le proche (ex. « Mère »), sans prénom', 'L’état de la relation, en grandes catégories', 'Ta situation générale (tranche d’âge, emploi oui/non, stress élevé oui/non)'],
    purpose: 'Proposer une réplique ou une action, que le jeu vérifie avant de te la soumettre.',
    policyUrl: '',
  },
  openstreetmap: {
    id: 'openstreetmap',
    title: 'Carte OpenStreetMap',
    recipient: 'Fondation OpenStreetMap (nominatim.openstreetmap.org et tile.openstreetmap.org)',
    data: ['Le nom de lieu que tu tapes (recherche)', 'La zone de carte affichée (images de la carte)', 'Ton adresse IP, comme pour tout site web'],
    purpose: 'Trouver les coordonnées du lieu choisi et afficher la carte autour.',
    policyUrl: 'https://osmfoundation.org/wiki/Privacy_Policy',
  },
}

export interface ConsentRecord {
  grantedAt: string
}

const KEY = 'simulife.consent.v1'

function storage(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage
  } catch {
    return undefined
  }
}

export function loadConsents(store = storage()): Partial<Record<ConsentId, ConsentRecord>> {
  try {
    const raw = JSON.parse(store?.getItem(KEY) ?? '{}') as Record<string, unknown>
    const out: Partial<Record<ConsentId, ConsentRecord>> = {}
    for (const id of Object.keys(CONSENT_PURPOSES) as ConsentId[]) {
      const r = raw[id] as { grantedAt?: unknown } | undefined
      if (r && typeof r.grantedAt === 'string') out[id] = { grantedAt: r.grantedAt }
    }
    return out
  } catch {
    return {}
  }
}

/** Accord durable (jusqu'au retrait). Renvoie `false` s'il n'a pas pu être enregistré. */
export function grantConsent(id: ConsentId, now = new Date(), store = storage()): boolean {
  try {
    if (!store) return false
    store.setItem(KEY, JSON.stringify({ ...loadConsents(store), [id]: { grantedAt: now.toISOString() } }))
    return true
  } catch {
    return false
  }
}

export function revokeConsent(id: ConsentId, store = storage()): void {
  try {
    const next = loadConsents(store)
    delete next[id]
    store?.setItem(KEY, JSON.stringify(next))
  } catch {
    // Rien d'enregistré : rien à retirer.
  }
}

export const hasConsent = (id: ConsentId, store = storage()) => loadConsents(store)[id] !== undefined

export class ConsentRequiredError extends Error {
  readonly consent: ConsentId
  constructor(consent: ConsentId) {
    super(`Autorisation nécessaire : ${CONSENT_PURPOSES[consent].title}.`)
    this.consent = consent
  }
}

/**
 * Seule porte de sortie des données : exécute `send` uniquement si l'autorisation
 * est donnée (durablement, ou pour cette fois avec `once`).
 */
export async function withConsent<T>(id: ConsentId, send: () => Promise<T>, options: { once?: boolean; store?: Storage } = {}): Promise<T> {
  if (!options.once && !hasConsent(id, options.store ?? storage())) throw new ConsentRequiredError(id)
  return send()
}
