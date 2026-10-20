import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ageAt } from '../../engine/index.ts'
import DossierScreen from './DossierScreen.tsx'

const TODAY = { year: 2025, month: 6, day: 15 }

function renderDossier(onStartLife = vi.fn()) {
  const utils = render(<DossierScreen today={TODAY} onBack={() => {}} onStartLife={onStartLife} />)
  return { ...utils, user: userEvent.setup(), onStartLife }
}

async function setup(user: ReturnType<typeof userEvent.setup>, year = '2000', startAge = '20') {
  await user.type(screen.getByRole('textbox', { name: 'Année' }), year)
  const age = screen.getByRole('textbox', { name: /À quel âge commence/ })
  await user.clear(age)
  await user.type(age, startAge)
  await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
}

const heading = () => screen.getByRole('heading', { level: 1 }).textContent

beforeEach(() => localStorage.clear())

describe('dossier de vie : parcours dans l’interface', () => {
  it('demande d’abord la naissance et l’âge de départ, avec des erreurs explicites', async () => {
    const { user } = renderDossier()
    expect(heading()).toBe('Ton point de départ')
    await setup(user, '2000', '30')
    expect(screen.getByRole('alert').textContent).toBe('L’âge de départ (30 ans) dépasse ton âge actuel (25 ans au plus).')
    const age = screen.getByRole('textbox', { name: /À quel âge commence/ })
    await user.clear(age)
    await user.type(age, '20')
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(heading()).toBe('Dossier de vie')
    expect(screen.getAllByRole('button', { name: /\d+\/\d+$/ })).toHaveLength(12)
  })

  it('enchaîne les questions et fait apparaître une question conditionnelle', async () => {
    const { user } = renderDossier()
    await setup(user)
    await user.click(screen.getByRole('button', { name: /Famille et environnement/ }))
    expect(heading()).toBe('Avec qui as-tu grandi principalement ?')
    await user.click(screen.getByRole('checkbox', { name: 'Ta mère' }))
    await user.click(screen.getByRole('button', { name: 'Valider' }))

    expect(heading()).toMatch(/Combien de frères et sœurs/)
    await user.type(screen.getByRole('textbox', { name: 'Nombre' }), '2')
    await user.click(screen.getByRole('button', { name: 'Valider' }))
    expect(heading()).toBe('Quelle est ta place dans la fratrie ?')
  })

  it('accepte « je ne sais pas » et « je préfère ne pas répondre »', async () => {
    const { user } = renderDossier()
    await setup(user)
    await user.click(screen.getByRole('button', { name: /Identité et naissance/ }))
    await user.click(screen.getByRole('button', { name: 'Je préfère ne pas répondre' }))
    await user.click(screen.getByRole('button', { name: 'Je ne sais pas' }))
    await user.click(screen.getByRole('button', { name: /Identité et naissance/ }))
    expect(screen.getByRole('button', { name: /Quel prénom veux-tu.*Préfère ne pas répondre/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /type de lieu.*Je ne sais pas/ })).toBeTruthy()
  })

  it('signale aussitôt une date incohérente et reste sur la question', async () => {
    const { user } = renderDossier()
    await setup(user)
    await user.click(screen.getByRole('button', { name: /Scolarité/ }))
    expect(heading()).toBe('Quand es-tu entré·e à l’école primaire ?')
    await user.type(screen.getByRole('textbox', { name: 'Année' }), '1995')
    await user.click(screen.getByRole('button', { name: 'Valider' }))
    expect(heading()).toBe('Quand es-tu entré·e à l’école primaire ?')
    expect(screen.getByRole('list', { name: 'Cohérence' }).textContent).toContain('Cette date est antérieure à ta naissance.')
  })

  it('sauvegarde la progression et la retrouve après fermeture', async () => {
    const first = renderDossier()
    await setup(first.user)
    await first.user.click(screen.getByRole('button', { name: /Identité et naissance/ }))
    await first.user.type(screen.getByRole('textbox', { name: 'Ta réponse' }), 'Nina')
    await first.user.click(screen.getByRole('button', { name: 'Valider' }))
    first.unmount()

    renderDossier()
    expect(heading()).toBe('Dossier de vie')
    expect(screen.getByRole('button', { name: /Identité et naissance/ }).textContent).toMatch(/1\/7$/)
  })

  it('permet de modifier une réponse depuis le récapitulatif', async () => {
    const { user } = renderDossier()
    await setup(user)
    await user.click(screen.getByRole('button', { name: /Identité et naissance/ }))
    await user.type(screen.getByRole('textbox', { name: 'Ta réponse' }), 'Nina')
    await user.click(screen.getByRole('button', { name: 'Valider' }))
    await user.click(screen.getByRole('button', { name: /^‹ Identité/ }))

    await user.click(screen.getByRole('button', { name: /Quel prénom veux-tu.*Nina/ }))
    const field = screen.getByRole('textbox', { name: 'Ta réponse' })
    await user.clear(field)
    await user.type(field, 'Zoé')
    await user.click(screen.getByRole('button', { name: 'Valider' }))
    expect(heading()).toBe('Identité et naissance')
    expect(screen.getByRole('button', { name: /Quel prénom veux-tu.*Zoé/ })).toBeTruthy()
  })

  it('sépare faits et hypothèses, puis démarre la vie à l’âge choisi', async () => {
    const { user, onStartLife } = renderDossier()
    await setup(user, '2000', '20')
    await user.click(screen.getByRole('button', { name: /Identité et naissance/ }))
    await user.type(screen.getByRole('textbox', { name: 'Ta réponse' }), 'Nina')
    await user.click(screen.getByRole('button', { name: 'Valider' }))
    await user.click(screen.getByRole('button', { name: /^‹ Identité/ }))
    await user.click(screen.getByRole('button', { name: '‹ Dossier' }))
    await user.click(screen.getByRole('button', { name: 'Profil et nouvelle vie' }))

    const declared = screen.getByRole('region', { name: 'Faits déclarés' })
    const simulated = screen.getByRole('region', { name: 'Hypothèses simulées' })
    expect(declared.textContent).toContain('Nina')
    expect(simulated.textContent).toContain('Date de naissance')
    expect(simulated.textContent).toContain('date approximative')

    await user.click(screen.getByRole('button', { name: 'Vivre cette vie à partir de 20 ans' }))
    expect(onStartLife).toHaveBeenCalledOnce()
    const state = onStartLife.mock.calls[0][0]
    expect(state.character.name).toBe('Nina')
    expect(ageAt(state.character.birthDate, state.clock)).toBe(20)
  })
})
