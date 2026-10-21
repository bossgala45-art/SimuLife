import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../../app/App.tsx'
import { newId } from '../../destiny/checksum.ts'
import { createSimulation } from '../../engine/index.ts'
import { decryptText, isEncrypted } from '../../privacy/crypto.ts'
import { hasPin, setPin } from '../../privacy/lock.ts'
import { DestinyRepository } from '../../storage/destiny.ts'

const downloads: { name: string; text: string }[] = []
vi.mock('../destiny/download.ts', async (original) => ({
  ...(await original<typeof import('../destiny/download.ts')>()),
  downloadText: (name: string, text: string) => downloads.push({ name, text }),
}))

let repos: DestinyRepository[] = []
let dbName: string
beforeEach(() => {
  localStorage.clear()
  downloads.length = 0
  dbName = `privacy-${newId()}`
})
afterEach(() => {
  repos.forEach((r) => r.close())
  repos = []
})

function start(reload = vi.fn()) {
  const repo = new DestinyRepository(dbName)
  repos.push(repo)
  render(<App repository={repo} reload={reload} />)
  return { repo, reload, user: userEvent.setup() }
}

describe('verrouillage par code', () => {
  it('rien n’est visible avant le bon code', async () => {
    await setPin('2468', localStorage, 1000)
    const { user } = start()
    expect(screen.queryByRole('button', { name: 'Nouvelle vie' })).toBeNull()
    await user.type(screen.getByLabelText('Code de verrouillage'), '1111')
    await user.click(screen.getByRole('button', { name: 'Déverrouiller' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/Code incorrect\. Encore 4 essais/)
    await user.type(screen.getByLabelText('Code de verrouillage'), '2468')
    await user.click(screen.getByRole('button', { name: 'Déverrouiller' }))
    expect(await screen.findByRole('button', { name: 'Nouvelle vie' })).toBeTruthy()
  })

  it('activer un code depuis l’accueil', async () => {
    const { user } = start()
    await user.click(await screen.findByRole('button', { name: 'Confidentialité et données' }))
    await user.type(screen.getByLabelText('Code (4 à 8 chiffres)'), '1357')
    await user.type(screen.getByLabelText('Confirmer le code'), '1357')
    await user.click(screen.getByRole('button', { name: 'Activer le code' }))
    expect(await screen.findByText('Code enregistré.')).toBeTruthy()
    expect(hasPin()).toBe(true)
    expect(localStorage.getItem('simulife.lock.v1')).not.toContain('1357')
  })
})

describe('effacement complet', () => {
  it('efface les vies et les données locales, puis relance', async () => {
    const seed = new DestinyRepository(dbName)
    await seed.createTree({ name: 'Vie', state: createSimulation({ seed: 's', name: 'Léa', birthDate: { year: 2000, month: 1, day: 1 } }) })
    seed.close()
    localStorage.setItem('simulife.dossier.v1', '{}')
    const { user, reload } = start()
    await user.click(await screen.findByRole('button', { name: 'Confidentialité et données' }))
    await user.click(screen.getByRole('button', { name: 'Effacer toutes mes données…' }))
    await user.click(screen.getByRole('button', { name: 'Tout effacer définitivement' }))
    await waitFor(() => expect(reload).toHaveBeenCalled())
    const after = new DestinyRepository(dbName)
    expect(await after.listTrees()).toEqual([])
    after.close()
    expect(localStorage.getItem('simulife.dossier.v1')).toBeNull()
  })
})

describe('exports chiffrés', () => {
  it('exporte chiffré, refuse une mauvaise phrase, réimporte avec la bonne', async () => {
    const seed = new DestinyRepository(dbName)
    await seed.createTree({ name: 'Ma vie', state: createSimulation({ seed: 's', name: 'Léa', birthDate: { year: 2000, month: 1, day: 1 } }) })
    seed.close()
    const { user } = start()
    await user.click(await screen.findByRole('button', { name: 'Arbre des destins' }))
    await user.click(await screen.findByRole('button', { name: 'Exporter cette vie…' }))
    const form = screen.getByRole('form', { name: 'Export' })
    await user.type(within(form).getByLabelText(/^Phrase de passe/), 'une longue phrase')
    await user.type(within(form).getByLabelText('Confirmer la phrase de passe'), 'une longue phrase')
    await user.click(within(form).getByRole('button', { name: 'Exporter chiffré' }))
    await waitFor(() => expect(downloads).toHaveLength(1))
    const { name, text } = downloads[0]
    expect(name).toMatch(/\.chiffre\.json$/)
    expect(isEncrypted(text)).toBe(true)
    expect(text).not.toContain('Léa')
    expect(JSON.parse(await decryptText(text, 'une longue phrase')).format).toBe('simulife-destiny')

    await user.upload(screen.getByLabelText('Fichier à importer'), new File([text], 'vie.chiffre.json', { type: 'application/json' }))
    const prompt = await screen.findByRole('form', { name: 'Fichier chiffré' })
    await user.type(within(prompt).getByLabelText('Phrase de passe du fichier chiffré'), 'mauvaise phrase')
    await user.click(within(prompt).getByRole('button', { name: 'Déchiffrer et importer' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Phrase de passe incorrecte, ou fichier modifié.')
    const field = within(screen.getByRole('form', { name: 'Fichier chiffré' })).getByLabelText('Phrase de passe du fichier chiffré')
    await user.clear(field)
    await user.type(field, 'une longue phrase')
    await user.click(screen.getByRole('button', { name: 'Déchiffrer et importer' }))
    expect(await screen.findByText(/Vie importée \(fichier chiffré\)/)).toBeTruthy()
  }, 30_000)
})
