/**
 * Carte OpenStreetMap, dans le respect des règles d'usage de la Fondation OSM :
 * - adresses des services lues dans `services.json` (coupure possible sans mise à jour) ;
 * - recherche de lieu : uniquement sur validation, jamais d'autocomplétion,
 *   au plus une requête par seconde, résultats mis en cache ;
 * - tuiles : seulement celles de la zone affichée, ni préchargement ni stockage
 *   hors ligne, cache laissé au navigateur ; attribution toujours visible ;
 * - aucun envoi sans autorisation explicite (voir `ai/consent.ts`).
 */
import type { Place } from '../../engine/index.ts'

export interface MapServices {
  enabled: boolean
  search: string
  tiles: string
  copyright: string
  reason?: string
}

export const OSM_SOURCE = 'OpenStreetMap (Nominatim)'
export const OSM_LICENCE = 'ODbL — © les contributeurs d’OpenStreetMap'
export const TILE_SIZE = 256

const disabled = (reason: string): MapServices => ({ enabled: false, search: '', tiles: '', copyright: '', reason })

const isHttps = (url: unknown): url is string => {
  try {
    return typeof url === 'string' && new URL(url.replace(/\{[xyz]\}/g, '0')).protocol === 'https:'
  } catch {
    return false
  }
}

/** Lit la configuration des services de carte ; tout problème désactive la carte. */
export async function loadMapServices(fetchFn: typeof fetch = fetch, url = `${import.meta.env.BASE_URL}services.json`): Promise<MapServices> {
  try {
    const res = await fetchFn(url, { cache: 'no-cache' })
    if (!res.ok) return disabled('Configuration des services de carte introuvable.')
    const map = ((await res.json()) as { map?: Record<string, unknown> }).map
    if (!map || map.enabled !== true) return disabled('La carte est désactivée dans la configuration.')
    const tiles = map.tiles as string
    if (!isHttps(map.search) || !isHttps(tiles) || !isHttps(map.copyright) || !['{z}', '{x}', '{y}'].every((p) => tiles.includes(p))) {
      return disabled('Configuration des services de carte invalide.')
    }
    return { enabled: true, search: map.search, tiles, copyright: map.copyright as string }
  } catch {
    return disabled('Services de carte injoignables (hors ligne ?).')
  }
}

// ——— Recherche de lieu ———

export interface PlaceResult {
  label: string
  lat: number
  lon: number
}

export const QUERY_MIN = 2
export const QUERY_MAX = 100
/** Écart minimal entre deux recherches (règle : 1 requête par seconde au plus). */
export const SEARCH_INTERVAL_MS = 1100
const CACHE_KEY = 'simulife.geocache.v1'
const CACHE_SIZE = 30

export function searchUrl(services: MapServices, query: string): string {
  const url = new URL(services.search)
  url.searchParams.set('q', query)
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('limit', '5')
  url.searchParams.set('accept-language', 'fr')
  return url.toString()
}

/** Résultats de Nominatim, vérifiés un par un (les entrées incomplètes sont écartées). */
export function parseResults(raw: unknown): PlaceResult[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((r: { display_name?: unknown; lat?: unknown; lon?: unknown }) => {
    const lat = Number(r?.lat)
    const lon = Number(r?.lon)
    if (typeof r?.display_name !== 'string' || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return []
    return [{ label: r.display_name.slice(0, 200), lat, lon }]
  })
}

const normalizeQuery = (q: string) => q.trim().replace(/\s+/g, ' ').toLowerCase()

function readCache(): Record<string, PlaceResult[]> {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}') as Record<string, PlaceResult[]>
  } catch {
    return {}
  }
}

function writeCache(cache: Record<string, PlaceResult[]>): void {
  try {
    const keys = Object.keys(cache)
    for (const k of keys.slice(0, Math.max(0, keys.length - CACHE_SIZE))) delete cache[k]
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
  } catch {
    // Cache facultatif.
  }
}

/** Recherche de lieu, espacée d'au moins une seconde et mise en cache. */
export class Geocoder {
  private last = -Infinity
  private readonly services: MapServices
  private readonly fetchFn: typeof fetch
  private readonly now: () => number
  private readonly wait: (ms: number) => Promise<void>

  constructor(
    services: MapServices,
    fetchFn: typeof fetch = fetch,
    now = () => Date.now(),
    wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
  ) {
    this.services = services
    this.fetchFn = fetchFn
    this.now = now
    this.wait = wait
  }

  async search(query: string): Promise<PlaceResult[]> {
    if (!this.services.enabled) throw new Error(this.services.reason ?? 'Carte indisponible.')
    const key = normalizeQuery(query)
    if (key.length < QUERY_MIN || key.length > QUERY_MAX) throw new Error(`Tape entre ${QUERY_MIN} et ${QUERY_MAX} caractères.`)
    const cache = readCache()
    if (cache[key]) return cache[key]

    const since = this.now() - this.last
    if (since < SEARCH_INTERVAL_MS) await this.wait(SEARCH_INTERVAL_MS - since)
    this.last = this.now()
    // `fetch` doit être appelé sans `this` (sinon « Illegal invocation » dans le navigateur).
    const fetchFn = this.fetchFn
    let res: Response
    try {
      res = await fetchFn(searchUrl(this.services, key), { headers: { Accept: 'application/json' }, credentials: 'omit' })
    } catch {
      throw new Error('Pas de connexion : la recherche de lieu est impossible pour l’instant.')
    }
    if (res.status === 429) throw new Error('Le service de recherche limite les requêtes : réessaie dans un moment.')
    if (!res.ok) throw new Error(`Recherche impossible (le service a répondu ${res.status}).`)
    let results: PlaceResult[]
    try {
      results = parseResults(await res.json())
    } catch {
      throw new Error('Réponse illisible du service de recherche.')
    }
    writeCache({ ...cache, [key]: results })
    return results
  }
}

export const toPlace = (r: PlaceResult): Place => ({ label: r.label, lat: r.lat, lon: r.lon, source: OSM_SOURCE, licence: OSM_LICENCE })

// ——— Tuiles ———

/** Coordonnées de tuile (fractionnaires) d'un point, projection Web Mercator. */
export function tileCoords(lat: number, lon: number, zoom: number): { x: number; y: number } {
  const n = 2 ** zoom
  const rad = (lat * Math.PI) / 180
  return { x: ((lon + 180) / 360) * n, y: ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n }
}

export interface Tile {
  key: string
  url: string
  left: number
  top: number
}

/** Tuiles nécessaires pour couvrir la zone affichée, centrée sur le point (et rien de plus). */
export function visibleTiles(services: MapServices, lat: number, lon: number, zoom: number, width: number, height: number): Tile[] {
  const n = 2 ** zoom
  const center = tileCoords(lat, lon, zoom)
  const originX = center.x * TILE_SIZE - width / 2
  const originY = center.y * TILE_SIZE - height / 2
  const tiles: Tile[] = []
  for (let ty = Math.floor(originY / TILE_SIZE); ty <= Math.floor((originY + height - 1) / TILE_SIZE); ty++) {
    if (ty < 0 || ty >= n) continue
    for (let tx = Math.floor(originX / TILE_SIZE); tx <= Math.floor((originX + width - 1) / TILE_SIZE); tx++) {
      const wrapped = ((tx % n) + n) % n
      tiles.push({
        key: `${zoom}/${tx}/${ty}`,
        url: services.tiles.replace('{z}', String(zoom)).replace('{x}', String(wrapped)).replace('{y}', String(ty)),
        left: Math.round(tx * TILE_SIZE - originX),
        top: Math.round(ty * TILE_SIZE - originY),
      })
    }
  }
  return tiles
}

export const MIN_ZOOM = 4
export const MAX_ZOOM = 16
