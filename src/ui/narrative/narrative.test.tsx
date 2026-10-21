import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NarrativeAiAdapter } from '../../ai/narrativeAi.ts'
import { createSimulation, type SimulationState } from '../../engine/index.ts'
import GameShell from '../game/GameShell.tsx'
import type { MapServices } from '../map/osm.ts'
import { DEFAULT_SETTINGS } from '../settings.ts'
import SettingsProvider from '../SettingsProvider.tsx'

const ENABLED: MapServices = {
  enabled: true,
  search: 'https://nominatim.openstreetmap.org/search',
  tiles: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  copyright: 'https://www.openstreetmap.org/copyright',
}
const OFF: MapServices = { enabled: false, search: '', tiles: '', copyright: '', reason: 'Configuration de test.' }

function life(hour = 10): SimulationState {
  // Lundi 6 janvier 2025
  return createSimulation({
    seed: 'narration-ui',
    name: 'Léa',
    birthDate: { year: 2000, month: 3, day: 15 },
    start: { year: 2025, month: 1, day: 6, hour, minute: 0 },
  })
}

function Harness({ initial, ai, map = OFF }: { initial: SimulationState; ai?: NarrativeAiAdapter; map?: MapServices }) {
  const [state, setState] = useState(initial)
  return (
    <SettingsProvider initial={DEFAULT_SETTINGS}>
      <GameShell state={state} onChange={setState} onQuit={() => {}} branchId="" branchName="Test" ai={ai} mapServices={() => Promise.resolve(map)} />
    </SettingsProvider>
  )
}

type User = ReturnType<typeof userEvent.setup>

async function play(initial = life(), options: { ai?: NarrativeAiAdapter; map?: MapServices } = {}): Promise<User> {
  const user = userEvent.setup()
  render(<Harness initial={initial} {...options} />)
  await user.click(within(screen.getByRole('dialog', { name: 'Une vie commence' })).getByRole('button', { name: 'Continuer' }))
  return user
}

const nav = () => screen.getByRole('navigation', { name: 'Navigation principale' })
const tab = (user: User, name: string) => user.click(within(nav()).getByRole('button', { name: new RegExp(`^${name}`) }))
async function page(user: User, name: string) {
  await user.click(screen.getByRole('button', { name: 'Menu' }))
  await user.click(within(screen.getByRole('dialog', { name: 'Menu' })).getByRole('button', { name: new RegExp(name) }))
}
const nearParent = (s: SimulationState) => s.people.find((p) => p.role === 'parent' && !p.distant)!

/** Ouvre la conversation avec un proche depuis l'onglet Social. */
async function openTalk(user: User, name: string) {
  await tab(user, 'Social')
  const card = within(screen.getByRole('region', { name: 'Proches' })).getByText(name, { exact: false }).closest('details')!
  await user.click(within(card).getByText(name, { exact: false }))
  await user.click(within(card).getByRole('button', { name: 'Discuter ou écrire' }))
}

beforeEach(() => localStorage.clear())
afterEach(() => vi.unstubAllGlobals())

describe('messagerie et conversations', () => {
  it('message écrit : réponse différée, signalée comme non lue, lue à l’ouverture', async () => {
    const initial = life()
    const parent = nearParent(initial)
    const user = await play(initial)
    await openTalk(user, parent.name)
    await user.click(screen.getByRole('button', { name: /^Prendre des nouvelles/ }))
    const thread = () => screen.getByRole('list', { name: 'Échanges' })
    expect(within(thread()).getAllByRole('listitem')).toHaveLength(1)
    expect(screen.getByText(/Les réponses écrites arrivent après un délai/)).toBeTruthy()

    await tab(user, 'Temps')
    for (let i = 0; i < 3; i++) await user.click(screen.getByRole('button', { name: /^Attendre une heure/ }))
    expect(within(nav()).getByLabelText('1 messages non lus')).toBeTruthy()

    await page(user, 'Messages')
    await user.click(screen.getByRole('button', { name: new RegExp(parent.name) }))
    expect(within(thread()).getAllByRole('listitem')).toHaveLength(2)
    expect(within(nav()).queryByLabelText(/messages non lus/)).toBeNull()
  })

  it('en personne : réponse immédiate, fondée sur des faits réels ; sujet non répétable', async () => {
    const initial = life()
    const parent = nearParent(initial)
    const user = await play(initial)
    await openTalk(user, parent.name)
    await user.click(screen.getByRole('button', { name: 'En personne' }))
    await user.click(screen.getByRole('button', { name: /^Prendre des nouvelles/ }))
    const items = within(screen.getByRole('list', { name: 'Échanges' })).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[1].textContent).toContain('En personne')
    expect(screen.queryByRole('button', { name: /^Prendre des nouvelles/ })).toBeNull()
    expect(screen.getByText(/Sujets impossibles maintenant/)).toBeTruthy()
  })

  it('message libre interprété par des règles', async () => {
    const initial = life()
    const parent = nearParent(initial)
    initial.relationships[parent.id].tension = 40
    const user = await play(initial)
    await openTalk(user, parent.name)
    await user.type(screen.getByLabelText('Message libre'), 'Désolé pour l’autre jour')
    await user.click(screen.getByRole('button', { name: 'Envoyer' }))
    expect(screen.getByRole('status').textContent).toBe('Message envoyé, compris comme : « S’excuser ».')
    expect(within(screen.getByRole('list', { name: 'Échanges' })).getByText('Désolé pour l’autre jour')).toBeTruthy()
  })
})

describe('actions libres', () => {
  it('une phrase devient une action proposée, exécutée seulement sur confirmation', async () => {
    const initial = life()
    const mother = initial.people.find((p) => p.relation === 'Mère')!
    const user = await play(initial)
    await user.type(screen.getByLabelText('Ce que tu veux faire'), 'je veux appeler maman')
    await user.click(screen.getByRole('button', { name: 'Interpréter' }))
    expect(screen.getByLabelText('Heure').textContent).toBe('10:00')
    await user.click(screen.getByRole('button', { name: new RegExp(`^Appeler — ${mother.name}`) }))
    expect(screen.getByLabelText('Heure').textContent).toBe('10:20')

    await user.type(screen.getByLabelText('Ce que tu veux faire'), 'xylophone quantique')
    await user.click(screen.getByRole('button', { name: 'Interpréter' }))
    expect(screen.getByText(/Je n’ai pas compris/)).toBeTruthy()
  })
})

describe('souvenirs, histoire et carte', () => {
  it('souvenirs et repères historiques sourcés', async () => {
    const user = await play()
    await page(user, 'Souvenirs')
    expect(within(screen.getByRole('region', { name: 'Souvenirs' })).getByText(/Début de la vie de Léa/)).toBeTruthy()
    await tab(user, 'Monde')
    const history = screen.getByRole('region', { name: 'Repères historiques' })
    expect(within(history).getByText('Jeux olympiques d’été à Paris')).toBeTruthy()
    expect(within(history).getByText(/tu avais 24 ans/)).toBeTruthy()
    expect(within(history).getAllByRole('link', { name: 'Wikipédia (fr)' })[0].getAttribute('href')).toMatch(/^https:\/\/fr\.wikipedia\.org/)
    expect(await screen.findByText(/Carte indisponible : Configuration de test\./)).toBeTruthy()
  })

  it('carte : rien n’est envoyé avant l’autorisation ; attribution visible', async () => {
    const fetchFn = vi.fn(() => Promise.resolve(new Response(JSON.stringify([{ display_name: 'Ville Exemple, France', lat: '45.75', lon: '4.85' }]))))
    vi.stubGlobal('fetch', fetchFn)
    const user = await play(life(), { map: ENABLED })
    await tab(user, 'Monde')
    expect(await screen.findByText(/Aucun lieu n’est associé à cette vie/)).toBeTruthy()
    await user.type(screen.getByLabelText('Ville ou quartier'), 'Ville Exemple')
    await user.click(screen.getByRole('button', { name: 'Chercher' }))
    const consent = screen.getByRole('alertdialog')
    expect(within(consent).getByText('Recherche : « Ville Exemple »')).toBeTruthy()
    expect(fetchFn).not.toHaveBeenCalled()

    await user.click(within(consent).getByRole('button', { name: 'Autoriser cette fois' }))
    await user.click(await screen.findByRole('button', { name: 'Ville Exemple, France' }))
    expect(fetchFn).toHaveBeenCalledTimes(1)
    expect(String((fetchFn.mock.calls[0] as unknown[])[0])).toContain('nominatim.openstreetmap.org/search?q=ville+exemple')

    // Afficher les tuiles demande une nouvelle autorisation (l'accord précédent valait une fois).
    await user.click(screen.getByRole('button', { name: 'Afficher la carte' }))
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: /Toujours autoriser/ }))
    const tiles = document.querySelectorAll('.map img')
    expect(tiles.length).toBeGreaterThan(0)
    expect(tiles[0].getAttribute('src')).toMatch(/^https:\/\/tile\.openstreetmap\.org\/12\/\d+\/\d+\.png$/)
    expect(screen.getByRole('link', { name: '© contributeurs d’OpenStreetMap' }).getAttribute('href')).toBe('https://www.openstreetmap.org/copyright')

    await page(user, 'Paramètres')
    expect(screen.getByText(/Carte OpenStreetMap — accordée le/)).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Retirer' }))
    expect(screen.getByText(/Aucune autorisation durable/)).toBeTruthy()
  })
})

describe('IA externe facultative', () => {
  it('désactivée par défaut : aucun bouton, raison affichée', async () => {
    const initial = life()
    const user = await play(initial)
    await openTalk(user, nearParent(initial).name)
    expect(screen.queryByRole('button', { name: /Suggestion de l’IA/ })).toBeNull()
    await page(user, 'Paramètres')
    expect(screen.getByTestId('ai-status').textContent).toMatch(/Désactivée : aucun service d’IA gratuit, sécurisé et durable/)
  })

  it('avec une IA (factice) : autorisation, données minimisées, propositions vérifiées et non appliquées', async () => {
    const complete = vi.fn(() => Promise.resolve({ reply: 'Je pense à toi', actions: [{ action: 'write', params: { topic: 'news' } }, { action: 'bank_loan' }] }))
    const fake: NarrativeAiAdapter = { id: 'faux', label: 'IA de test', available: true, complete }
    const initial = life()
    const parent = nearParent(initial)
    const user = await play(initial, { ai: fake })
    await openTalk(user, parent.name)
    await user.click(screen.getByRole('button', { name: 'Suggestion de l’IA (IA de test)' }))
    const consent = screen.getByRole('alertdialog')
    const preview = consent.querySelector('pre')!.textContent!
    expect(preview).toContain(`"relation": "${parent.relation}"`)
    expect(preview).not.toContain(parent.name)
    expect(preview).not.toContain('Léa')
    expect(complete).not.toHaveBeenCalled()

    await user.click(within(consent).getByRole('button', { name: 'Autoriser cette fois' }))
    expect(await screen.findByText('Réplique proposée : « Je pense à toi »')).toBeTruthy()
    expect(screen.getByText(/Écarté par le jeu : Action non autorisée : bank_loan\./)).toBeTruthy()
    expect(within(screen.getByRole('list', { name: 'Échanges' })).getAllByRole('listitem')[0].textContent).toBe('Aucun échange pour l’instant.')
    await user.click(screen.getByRole('button', { name: new RegExp(`^Envoyer un message avec ${parent.name}`) }))
    await waitFor(() => expect(within(screen.getByRole('list', { name: 'Échanges' })).getByText('Je pense à toi')).toBeTruthy())
  })
})
