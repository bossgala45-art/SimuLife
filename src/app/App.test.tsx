/**
 * Parcours complets de l'application avec l'arbre des destins (IndexedDB simulé).
 */
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { newId } from '../destiny/checksum.ts'
import { createSimulation, serializeState } from '../engine/index.ts'
import { DestinyRepository } from '../storage/destiny.ts'
import App from './App.tsx'

let dbName: string
let repos: DestinyRepository[] = []

beforeEach(() => {
  dbName = `ui-${newId()}`
  localStorage.clear()
})
afterEach(() => {
  repos.forEach((r) => r.close())
  repos = []
})

function start() {
  const repo = new DestinyRepository(dbName)
  repos.push(repo)
  const view = render(<App repository={repo} />)
  return { ...view, repo, user: userEvent.setup() }
}

type User = ReturnType<typeof userEvent.setup>

/** Ferme la scène plein écran affichée (moment important). */
async function closeScene(user: User, title: string) {
  const scene = await screen.findByRole('dialog', { name: title })
  await user.click(within(scene).getByRole('button', { name: 'Continuer' }))
}

/** Nom de la branche jouée, lu dans le menu. */
async function currentBranch(user: User) {
  await user.click(await screen.findByRole('button', { name: 'Menu' }))
  const menu = screen.getByRole('dialog', { name: 'Menu' })
  const name = within(menu).getByText(/^Branche :/).textContent
  await user.click(within(menu).getByRole('button', { name: 'Fermer' }))
  return name
}

const tab = (user: User, name: string) => user.click(within(screen.getByRole('navigation', { name: 'Navigation principale' })).getByRole('button', { name }))

const hudDate = () => document.querySelector('.hud__date')!.textContent

async function newLife(user: User) {
  await user.click(await screen.findByRole('button', { name: 'Nouvelle vie' }))
  await user.clear(screen.getByLabelText('Graine'))
  await user.type(screen.getByLabelText('Graine'), 'arbre-ui')
  await user.click(screen.getByRole('button', { name: 'Commencer' }))
  await closeScene(user, 'Une vie commence')
  await waitFor(async () => expect(await currentBranch(user)).toBe('Branche : Vie d’origine'))
}

const nodes = () => screen.getAllByRole('treeitem')

describe('arbre des destins dans l’application', () => {
  it('crée une branche, la vit, puis reprend la vie d’origine', async () => {
    const { user } = start()
    await newLife(user)
    await tab(user, 'Destins')
    expect(await screen.findAllByRole('treeitem')).toHaveLength(1)

    await user.click(screen.getByRole('button', { name: 'Faire un autre choix maintenant' }))
    await user.click(await screen.findByRole('radio', { name: /Mêmes choix, autre hasard/ }))
    await user.click(screen.getByRole('button', { name: 'Créer la branche et la vivre' }))
    await closeScene(user, 'Une autre vie commence')
    await waitFor(async () => expect(await currentBranch(user)).toBe('Branche : Mêmes choix, autre hasard'))

    await tab(user, 'Destins')
    await screen.findByText('En cours')
    expect(nodes()).toHaveLength(2)
    expect(nodes()[1].getAttribute('aria-level')).toBe('2')
    expect(within(nodes()[1]).getByText('En cours')).toBeTruthy()

    await user.click(within(nodes()[0]).getByRole('button'))
    await user.click(screen.getByRole('button', { name: 'Reprendre cette vie' }))
    // Déjà visitée : pas de nouvelle scène d'ouverture.
    await waitFor(async () => expect(await currentBranch(user)).toBe('Branche : Vie d’origine'))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('montre pourquoi un choix est impossible à ce moment', async () => {
    const { user } = start()
    await newLife(user)
    await tab(user, 'Destins')
    await user.click(await screen.findByRole('button', { name: 'Faire un autre choix maintenant' }))
    const cook = await screen.findByRole('radio', { name: /Accepter un poste : Cuisinier·ère/ })
    expect((cook as HTMLInputElement).disabled).toBe(true)
    expect(cook.closest('label')!.textContent).toContain('Diplôme requis : CAP Cuisine')
  })

  it('sauvegarde chaque action et la retrouve après fermeture', async () => {
    const first = start()
    await newLife(first.user)
    await tab(first.user, 'Temps')
    await first.user.click(screen.getByRole('button', { name: '+1 jour' }))
    expect(hudDate()).toContain('mardi 7 janvier 2025')
    await first.user.click(screen.getByRole('button', { name: 'Menu' }))
    await first.user.click(screen.getByRole('button', { name: 'Retour à l’accueil' }))
    await screen.findByRole('button', { name: 'Continuer' })
    first.unmount()

    const second = start()
    await second.user.click(await screen.findByRole('button', { name: 'Continuer' }))
    await waitFor(() => expect(hudDate()).toContain('mardi 7 janvier 2025'))
  })

  it('une branche protégée refuse d’être modifiée, avec un message clair', async () => {
    const { user } = start()
    await newLife(user)
    await tab(user, 'Destins')
    await user.click(await screen.findByRole('button', { name: 'Protéger' }))
    await screen.findByText('Protégée')
    await user.click(screen.getByRole('button', { name: 'Revenir à cette vie' }))
    // La vie rouvre sur l'onglet Vie.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Vie' }).getAttribute('aria-current')).toBe('page'))
    await tab(user, 'Temps')
    await user.click(await screen.findByRole('button', { name: '+1 jour' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/Sauvegarde impossible : « Vie d’origine » est protégée/)
  })

  it('refuse un fichier d’import invalide', async () => {
    const { user } = start()
    await user.click(await screen.findByRole('button', { name: 'Arbre des destins' }))
    const file = new File(['{"format":"autre"}'], 'vie.json', { type: 'application/json' })
    await user.upload(screen.getByLabelText('Fichier à importer'), file)
    expect((await screen.findByRole('alert')).textContent).toBe('Fichier invalide : ce n’est pas un export SIMULIFE.')
  })

  it('importe l’ancienne sauvegarde unique au premier lancement', async () => {
    const state = createSimulation({ seed: 'ancienne', name: 'Zoé', birthDate: { year: 1999, month: 5, day: 2 } })
    localStorage.setItem('simulife.save.v1', serializeState(state))
    start()
    expect((await screen.findByRole('button', { name: 'Continuer' })).parentElement!.textContent).toContain('Zoé, 25 ans')
    expect(localStorage.getItem('simulife.save.v1')).toBeNull()
  })
})
