/**
 * Parcours complets de l'application avec l'arbre des destins (IndexedDB simulé).
 */
import { render, screen, within } from '@testing-library/react'
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

async function newLife(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Nouvelle vie' }))
  await user.clear(screen.getByLabelText('Graine'))
  await user.type(screen.getByLabelText('Graine'), 'arbre-ui')
  await user.click(screen.getByRole('button', { name: 'Commencer' }))
  await screen.findByText('Branche : Vie d’origine')
}

const nodes = () => screen.getAllByRole('treeitem')

describe('arbre des destins dans l’application', () => {
  it('crée une branche, la vit, puis reprend la vie d’origine', async () => {
    const { user } = start()
    await newLife(user)
    await user.click(screen.getByRole('button', { name: 'Arbre' }))
    expect(await screen.findAllByRole('treeitem')).toHaveLength(1)

    await user.click(screen.getByRole('button', { name: 'Faire un autre choix maintenant' }))
    await user.click(await screen.findByRole('radio', { name: /Mêmes choix, autre hasard/ }))
    await user.click(screen.getByRole('button', { name: 'Créer la branche et la vivre' }))
    await screen.findByText('Branche : Mêmes choix, autre hasard')

    await user.click(screen.getByRole('button', { name: 'Arbre' }))
    await screen.findByText('En cours')
    expect(nodes()).toHaveLength(2)
    expect(nodes()[1].getAttribute('aria-level')).toBe('2')
    expect(within(nodes()[1]).getByText('En cours')).toBeTruthy()

    await user.click(within(nodes()[0]).getByRole('button'))
    await user.click(screen.getByRole('button', { name: 'Reprendre cette vie' }))
    expect(await screen.findByText('Branche : Vie d’origine')).toBeTruthy()
  })

  it('montre pourquoi un choix est impossible à ce moment', async () => {
    const { user } = start()
    await newLife(user)
    await user.click(screen.getByRole('button', { name: 'Arbre' }))
    await user.click(await screen.findByRole('button', { name: 'Faire un autre choix maintenant' }))
    const cook = await screen.findByRole('radio', { name: /Accepter un poste : Cuisinier·ère/ })
    expect((cook as HTMLInputElement).disabled).toBe(true)
    expect(cook.closest('label')!.textContent).toContain('Diplôme requis : CAP Cuisine')
  })

  it('sauvegarde chaque action et la retrouve après fermeture', async () => {
    const first = start()
    await newLife(first.user)
    await first.user.click(screen.getByRole('button', { name: '+1 jour' }))
    expect(screen.getByText('mardi 7 janvier 2025', { selector: 'p' })).toBeTruthy()
    await first.user.click(screen.getByRole('button', { name: 'Menu' }))
    await screen.findByRole('button', { name: 'Continuer' })
    first.unmount()

    const second = start()
    await second.user.click(await screen.findByRole('button', { name: 'Continuer' }))
    expect(await screen.findByText('mardi 7 janvier 2025', { selector: 'p' })).toBeTruthy()
  })

  it('une branche protégée refuse d’être modifiée, avec un message clair', async () => {
    const { user } = start()
    await newLife(user)
    await user.click(screen.getByRole('button', { name: 'Arbre' }))
    await user.click(await screen.findByRole('button', { name: 'Protéger' }))
    await screen.findByText('Protégée')
    await user.click(screen.getByRole('button', { name: 'Revenir à cette vie' }))
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
