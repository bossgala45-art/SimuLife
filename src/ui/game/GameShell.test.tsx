import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { createSimulation, type LogEntry, type SimulationState } from '../../engine/index.ts'
import { DEFAULT_SETTINGS } from '../settings.ts'
import SettingsProvider from '../SettingsProvider.tsx'
import GameShell from './GameShell.tsx'

function life(hour = 7): SimulationState {
  // Lundi 6 janvier 2025
  return createSimulation({
    seed: 'onglets',
    name: 'Léa',
    birthDate: { year: 2000, month: 3, day: 15 },
    start: { year: 2025, month: 1, day: 6, hour, minute: 0 },
  })
}

function Harness({ initial }: { initial: SimulationState }) {
  const [state, setState] = useState(initial)
  return (
    <SettingsProvider initial={DEFAULT_SETTINGS}>
      <GameShell
        state={state}
        onChange={setState}
        onQuit={() => {}}
        branchId=""
        branchName="Sans sauvegarde"
        mapServices={() => Promise.resolve({ enabled: false, search: '', tiles: '', copyright: '', reason: 'test' })}
      />
    </SettingsProvider>
  )
}

type User = ReturnType<typeof userEvent.setup>

/** Lance le jeu et ferme la scène d'ouverture. */
async function play(initial = life()): Promise<User> {
  const user = userEvent.setup()
  render(<Harness initial={initial} />)
  const scene = screen.getByRole('dialog', { name: 'Une vie commence' })
  await user.click(within(scene).getByRole('button', { name: 'Continuer' }))
  return user
}

const nav = () => screen.getByRole('navigation', { name: 'Navigation principale' })
const tab = (user: User, name: string) => user.click(within(nav()).getByRole('button', { name: new RegExp(`^${name}`) }))

/** Fiche d'un proche dans l'onglet Social. */
const personCard = (name: string) => within(screen.getByRole('region', { name: 'Proches' })).getByText(name, { exact: false }).closest('details')!

async function page(user: User, name: string) {
  await user.click(screen.getByRole('button', { name: 'Menu' }))
  await user.click(within(screen.getByRole('dialog', { name: 'Menu' })).getByRole('button', { name: new RegExp(name) }))
}

beforeEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
})

describe('coque du jeu', () => {
  it('HUD, avatar (repli 2D sans WebGL), besoins et actions du quotidien', async () => {
    await play()
    expect(screen.getByText('Léa, 24 ans')).toBeTruthy()
    expect(document.querySelector('.hud__date')!.textContent).toContain('lundi 6 janvier 2025')
    expect(screen.getByLabelText('Heure').textContent).toBe('07:00')
    const avatar = screen.getByRole('img', { name: /^Léa, 24 ans/ })
    expect(avatar.dataset.mode).toBe('2d-no-webgl')
    expect(screen.getAllByRole('meter')).toHaveLength(6)
    const sleep = screen.getByRole('button', { name: /^Dormir/ }) as HTMLButtonElement
    expect(sleep.disabled).toBe(true)
    expect(sleep.textContent).toContain('Pas sommeil (sommeil < 30).')
  })

  it('les cinq onglets et les neuf pages du menu existent', async () => {
    const user = await play()
    expect(within(nav()).getAllByRole('button').map((b) => b.textContent)).toEqual(['Vie', 'Temps', 'Social', 'Monde', 'Destins'])
    await user.click(screen.getByRole('button', { name: 'Menu' }))
    const menu = screen.getByRole('dialog', { name: 'Menu' })
    expect(within(menu).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      '❤️Santé',
      '🎓Études',
      '💼Carrière',
      '💶Finances',
      '⭐Compétences',
      '💬Messages',
      '📜Souvenirs',
      '📖Journal',
      '⚙️Paramètres',
    ])
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Menu' })).toBeNull()
  })

  it('affiche les probabilités des issues incertaines avant d’agir', async () => {
    await play(life(18))
    expect(screen.getByRole('button', { name: /^Faire du sport/ }).textContent).toContain('Blessure : ≈ 4 %')
  })

  it('Temps : attendre une heure, avancer d’un jour, agenda du moteur', async () => {
    const user = await play()
    await tab(user, 'Temps')
    await user.click(screen.getByRole('button', { name: /^Attendre une heure/ }))
    expect(screen.getByLabelText('Heure').textContent).toBe('08:00')
    await user.click(screen.getByRole('button', { name: '+1 jour' }))
    expect(document.querySelector('.hud__date')!.textContent).toContain('mardi 7 janvier 2025')
    const agenda = screen.getByRole('region', { name: 'Agenda (45 jours)' })
    expect(within(agenda).getByText(/^Loyer/)).toBeTruthy()
  })

  it('Social : appeler un proche met à jour le dernier contact', async () => {
    const user = await play(life(10))
    await tab(user, 'Social')
    const mother = life().people.find((p) => p.relation === 'Mère')!
    const card = personCard(mother.name)
    await user.click(within(card).getByText(mother.name, { exact: false }))
    expect(within(card).getByText('Dernier contact : jamais')).toBeTruthy()
    await user.click(within(card).getByRole('button', { name: /^Appeler/ }))
    expect(within(personCard(mother.name)).getByText('Dernier contact : aujourd’hui')).toBeTruthy()
  })

  it('Monde et Carrière : conditions d’accès, candidature en attente au résultat incertain', async () => {
    const user = await play(life(10))
    await tab(user, 'Monde')
    expect(screen.getByText(/Montants approximatifs/)).toBeTruthy()
    const cook = screen.getByText('Cuisinier·ère').closest('li')!
    expect(within(cook).getByText('Diplôme requis : CAP Cuisine')).toBeTruthy()
    const waiter = screen.getByText('Serveur·se').closest('li')!
    await user.click(within(waiter).getByRole('button', { name: /^Postuler/ }))
    expect(within(screen.getByText('Serveur·se').closest('li')!).getByText('Candidature envoyée : réponse en attente.')).toBeTruthy()

    await page(user, 'Carrière')
    const applications = screen.getByRole('region', { name: 'Candidatures' })
    expect(within(applications).getByText(/Serveur·se · réponse le/)).toBeTruthy()
    expect(within(applications).getByText('Issue incertaine')).toBeTruthy()
  })

  it('Finances : épargner modifie les comptes', async () => {
    const user = await play(life(10))
    await page(user, 'Finances')
    await user.click(screen.getByRole('button', { name: /^Mettre 100 € de côté/ }))
    const accounts = screen.getByRole('region', { name: 'Comptes' })
    expect(within(accounts).getByText('Épargne').nextElementSibling!.textContent).toBe('100 €')
  })

  it('Santé, Études, Compétences, Journal lisent l’état du moteur', async () => {
    const user = await play(life(10))
    await page(user, 'Santé')
    expect(screen.getByText(/par jour, au hasard\./)).toBeTruthy()
    await page(user, 'Études')
    expect(screen.getByText('Aucune formation en cours.')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Voir les formations' }))
    expect(screen.getByRole('region', { name: 'Formations' })).toBeTruthy()
    await page(user, 'Compétences')
    expect(screen.getAllByRole('button', { name: /^S’entraîner/ })).toHaveLength(6)
    await page(user, 'Journal')
    const journal = screen.getByRole('region', { name: 'Journal' })
    expect(within(journal).getByText(/Début de la vie de Léa/)).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Argent' }))
    expect(within(journal).queryByText(/Début de la vie de Léa/)).toBeNull()
  })

  it('Paramètres : le thème et l’avatar changent réellement', async () => {
    const user = await play()
    await page(user, 'Paramètres')
    await user.click(screen.getByRole('radio', { name: 'Clair' }))
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(JSON.parse(localStorage.getItem('simulife.settings.v1')!).theme).toBe('light')
    expect(screen.getByTestId('avatar-mode').textContent).toContain('WebGL n’est pas disponible')
    await user.click(screen.getByRole('checkbox', { name: 'Avatar en 3D' }))
    expect(screen.getByTestId('avatar-mode').textContent).toBe('Avatar 2D (3D désactivée).')
    expect(screen.getByText('Le son n’est pas disponible sur ce navigateur.')).toBeTruthy()
  })

  it('carte du jour : appeler un proche malade, puis la carte disparaît', async () => {
    const base = life(10)
    const mother = base.people.find((p) => p.relation === 'Mère')!
    const entry: LogEntry = {
      seq: base.nextLogSeq,
      at: base.clock,
      kind: 'social',
      code: 'npc_sick',
      message: `${mother.name} est malade.`,
      data: { personId: mother.id },
    }
    const user = await play({ ...base, log: [...base.log, entry], nextLogSeq: base.nextLogSeq + 1 })
    const cards = screen.getByRole('region', { name: 'Aujourd’hui' })
    expect(within(cards).getByText('Un proche est malade')).toBeTruthy()
    expect(within(nav()).getByLabelText('1 nouvelles cartes')).toBeTruthy()
    await user.click(within(cards).getByRole('button', { name: new RegExp(`^Appeler ${mother.name}`) }))
    expect(screen.queryByText('Un proche est malade')).toBeNull()
    await tab(user, 'Social')
    const card = personCard(mother.name)
    await user.click(within(card).getByText(mother.name, { exact: false }))
    expect(within(card).getByText('Dernier contact : aujourd’hui')).toBeTruthy()
  })

  it('Destins sans stockage : le dit au lieu d’afficher un arbre vide', async () => {
    const user = await play()
    await tab(user, 'Destins')
    expect(screen.getByText(/Cette vie n’est pas sauvegardée/)).toBeTruthy()
  })
})
