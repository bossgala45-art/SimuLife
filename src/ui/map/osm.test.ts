import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Geocoder, loadMapServices, parseResults, searchUrl, SEARCH_INTERVAL_MS, tileCoords, toPlace, visibleTiles, type MapServices } from './osm.ts'

const SERVICES: MapServices = {
  enabled: true,
  search: 'https://nominatim.openstreetmap.org/search',
  tiles: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  copyright: 'https://www.openstreetmap.org/copyright',
}

const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }))

beforeEach(() => localStorage.clear())

describe('configuration des services de carte', () => {
  it('lit la configuration ; toute anomalie désactive la carte', async () => {
    expect(await loadMapServices(() => json({ map: { ...SERVICES, enabled: true } }), '/services.json')).toEqual(SERVICES)
    expect((await loadMapServices(() => json({ map: { ...SERVICES, enabled: false } }), '/s')).enabled).toBe(false)
    expect((await loadMapServices(() => json({ map: { ...SERVICES, tiles: 'http://tile.example/{z}/{x}/{y}.png' } }), '/s')).enabled).toBe(false)
    expect((await loadMapServices(() => Promise.reject(new Error('hors ligne')), '/s')).reason).toMatch(/injoignables/)
  })
})

describe('recherche de lieu (Nominatim)', () => {
  it('requête explicite, en français, 5 résultats au plus', () => {
    const url = new URL(searchUrl(SERVICES, 'lyon'))
    expect(url.origin + url.pathname).toBe('https://nominatim.openstreetmap.org/search')
    expect(Object.fromEntries(url.searchParams)).toEqual({ q: 'lyon', format: 'jsonv2', limit: '5', 'accept-language': 'fr' })
  })

  it('écarte les résultats incomplets ou hors limites', () => {
    expect(
      parseResults([
        { display_name: 'Lieu A', lat: '45.5', lon: '4.8' },
        { display_name: 'Sans coordonnées' },
        { display_name: 'Hors limites', lat: '95', lon: '0' },
        'texte',
      ]),
    ).toEqual([{ label: 'Lieu A', lat: 45.5, lon: 4.8 }])
    expect(parseResults({ error: 'x' })).toEqual([])
  })

  it('au plus une requête par seconde, et cache des résultats', async () => {
    let clock = 0
    const waits: number[] = []
    const fetchFn = vi.fn(() => json([{ display_name: 'Lieu', lat: '1', lon: '2' }]))
    const geo = new Geocoder(SERVICES, fetchFn as unknown as typeof fetch, () => clock, async (ms) => {
      waits.push(ms)
      clock += ms
    })
    await geo.search('Lieu un')
    clock += 200
    await geo.search('Lieu deux')
    expect(waits).toEqual([SEARCH_INTERVAL_MS - 200])
    await geo.search('  lieu UN ')
    expect(fetchFn).toHaveBeenCalledTimes(2)
    await expect(geo.search('x')).rejects.toThrow(/entre 2 et 100/)
    await expect(new Geocoder({ ...SERVICES, enabled: false, reason: 'Coupé' }).search('Lyon')).rejects.toThrow('Coupé')
  })

  it('appelle fetch sans le lier au géocodeur (comme le navigateur l’exige)', async () => {
    const strictFetch = function (this: unknown) {
      // Le vrai fetch refuse d'être appelé comme méthode d'un autre objet.
      if (this !== undefined && this !== globalThis) throw new TypeError('Illegal invocation')
      return json([])
    }
    await expect(new Geocoder(SERVICES, strictFetch as unknown as typeof fetch).search('Lieu')).resolves.toEqual([])
  })

  it('erreurs réseau : messages clairs, rien d’enregistré', async () => {
    const offline = new Geocoder(SERVICES, (() => Promise.reject(new TypeError('Failed to fetch'))) as unknown as typeof fetch)
    await expect(offline.search('Lyon')).rejects.toThrow('Pas de connexion : la recherche de lieu est impossible pour l’instant.')
    const limited = new Geocoder(SERVICES, (() => json({}, 429)) as unknown as typeof fetch)
    await expect(limited.search('Lyon')).rejects.toThrow(/limite les requêtes/)
    const garbage = new Geocoder(SERVICES, (() => Promise.resolve(new Response('<html>'))) as unknown as typeof fetch)
    await expect(garbage.search('Lyon')).rejects.toThrow('Réponse illisible du service de recherche.')
    expect(localStorage.getItem('simulife.geocache.v1')).toBeNull()
  })

  it('un lieu choisi garde sa source et sa licence', () => {
    expect(toPlace({ label: 'Lieu', lat: 1, lon: 2 })).toMatchObject({ source: 'OpenStreetMap (Nominatim)', licence: expect.stringContaining('ODbL') })
  })
})

describe('tuiles', () => {
  it('projection Web Mercator : coordonnées de tuile connues', () => {
    expect(tileCoords(0, 0, 1)).toEqual({ x: 1, y: 1 })
    const t = tileCoords(0, -180, 3)
    expect(t.x).toBe(0)
  })

  it('seulement les tuiles de la zone affichée', () => {
    const tiles = visibleTiles(SERVICES, 0, 0, 2, 300, 200)
    expect(tiles.length).toBeLessThanOrEqual(4)
    for (const t of tiles) {
      expect(t.url).toMatch(/^https:\/\/tile\.openstreetmap\.org\/2\/\d\/\d\.png$/)
      expect(t.left).toBeGreaterThan(-256)
      expect(t.left).toBeLessThan(300)
    }
    // Pas de tuile au-delà des pôles.
    expect(visibleTiles(SERVICES, 85, 0, 0, 256, 2000).every((t) => !t.url.includes('/-'))).toBe(true)
  })
})
