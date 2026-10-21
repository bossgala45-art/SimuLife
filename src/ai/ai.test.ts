import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSimulation, serializeState, type SimulationState } from '../engine/index.ts'
import { ConsentRequiredError, grantConsent, hasConsent, loadConsents, revokeConsent, withConsent } from './consent.ts'
import { buildAiRequest, createProxyAdapter, disabledAdapter, suggest, validateAiResponse, type NarrativeAiAdapter } from './narrativeAi.ts'

function life(): SimulationState {
  return createSimulation({
    seed: 'graine-secrete-42',
    name: 'Léa',
    birthDate: { year: 2000, month: 3, day: 15 },
    start: { year: 2025, month: 1, day: 6, hour: 10, minute: 0 },
  })
}
const parent = (s: SimulationState) => s.people.find((p) => p.role === 'parent' && !p.distant)!

beforeEach(() => localStorage.clear())

describe('autorisations', () => {
  it('rien n’est envoyé sans accord ; accord durable, puis retrait', async () => {
    const send = vi.fn(() => Promise.resolve('envoyé'))
    await expect(withConsent('openstreetmap', send)).rejects.toBeInstanceOf(ConsentRequiredError)
    expect(send).not.toHaveBeenCalled()

    expect(await withConsent('openstreetmap', send, { once: true })).toBe('envoyé')
    expect(hasConsent('openstreetmap')).toBe(false) // « cette fois seulement » n'est pas mémorisé

    expect(grantConsent('openstreetmap', new Date('2026-10-21T10:00:00Z'))).toBe(true)
    expect(loadConsents()).toEqual({ openstreetmap: { grantedAt: '2026-10-21T10:00:00.000Z' } })
    expect(await withConsent('openstreetmap', send)).toBe('envoyé')
    revokeConsent('openstreetmap')
    await expect(withConsent('openstreetmap', send)).rejects.toThrow('Autorisation nécessaire')
  })
})

describe('adaptateur d’IA facultatif', () => {
  it('désactivé par défaut, avec la raison', async () => {
    expect(disabledAdapter.available).toBe(false)
    await expect(suggest(disabledAdapter, life(), parent(life()).id)).rejects.toThrow(/aucun service d’IA gratuit, sécurisé et durable/)
  })

  it('données minimisées : ni prénom, ni graine, ni date, ni argent', () => {
    const state = life()
    const request = buildAiRequest(state, parent(state).id)
    const sent = JSON.stringify(request)
    for (const secret of [state.character.name, state.seed, parent(state).name, String(state.character.money), '2000']) {
      expect(sent).not.toContain(secret)
    }
    expect(request).toMatchObject({ purpose: 'dialogue', player: { ageRange: '20-29 ans' } })
  })

  it('pas d’envoi sans autorisation, même avec une IA active', async () => {
    const complete = vi.fn(() => Promise.resolve({ reply: 'Salut !' }))
    const fake: NarrativeAiAdapter = { id: 'faux', label: 'Faux', available: true, complete }
    const state = life()
    await expect(suggest(fake, state, parent(state).id)).rejects.toBeInstanceOf(ConsentRequiredError)
    expect(complete).not.toHaveBeenCalled()
    const result = await suggest(fake, state, parent(state).id, { once: true })
    expect(result.reply).toBe('Salut !')
  })

  it('les réponses sont filtrées et validées, jamais appliquées', () => {
    const state = life()
    const before = serializeState(state)
    const id = parent(state).id
    const result = validateAiResponse(
      {
        reply: '  Coucou,\n tu me manques  ',
        actions: [
          { action: 'write', params: { topic: 'news', personId: 'p999' } },
          { action: 'bank_loan', params: { amount: 5000 } },
          { action: 'call' },
          { action: 'gift' },
        ],
      },
      state,
      id,
    )
    expect(result.reply).toBe('Coucou, tu me manques')
    expect(result.proposals.map((p) => [p.action, p.params.personId])).toEqual([
      ['write', id],
      ['call', id],
    ])
    expect(result.proposals[0].params.text).toBe('Coucou, tu me manques')
    expect(result.rejected).toEqual([
      'Cible différente du proche concerné : ignorée.',
      'Action non autorisée : bank_loan.',
      'Au plus 3 propositions : le reste est ignoré.',
    ])
    expect(validateAiResponse({ actions: [{ action: 'talk', params: { topic: 'pirater' } }] }, state, id).rejected).toEqual(['Sujet de conversation inconnu.'])
    expect(serializeState(state)).toBe(before)
    expect(validateAiResponse('<script>', state, id)).toEqual({ reply: null, proposals: [], rejected: ['Réponse illisible.'] })
    expect(validateAiResponse({ reply: 'x'.repeat(400) }, state, id).reply).toBeNull()
  })

  it('serveur intermédiaire : HTTPS obligatoire, aucune clé dans l’adresse', async () => {
    expect(() => createProxyAdapter('http://exemple.org/ia')).toThrow(/HTTPS/)
    expect(() => createProxyAdapter('https://exemple.org/ia?api_key=123')).toThrow(/Aucune clé/)
    const fetchFn = vi.fn(() => Promise.resolve(new Response(JSON.stringify({ reply: 'ok' }), { status: 200 })))
    const adapter = createProxyAdapter('https://exemple.org/ia', fetchFn as unknown as typeof fetch)
    const state = life()
    expect(await adapter.complete(buildAiRequest(state, parent(state).id))).toEqual({ reply: 'ok' })
    const offline = createProxyAdapter('https://exemple.org/ia', (() => Promise.reject(new TypeError('Failed to fetch'))) as unknown as typeof fetch)
    await expect(offline.complete(buildAiRequest(state, parent(state).id))).rejects.toThrow('Pas de connexion au service d’IA.')
    const [, init] = fetchFn.mock.calls[0] as unknown as [URL, RequestInit]
    expect(init.credentials).toBe('omit')
    expect(JSON.stringify(init.headers)).not.toMatch(/authorization|key/i)
  })
})
