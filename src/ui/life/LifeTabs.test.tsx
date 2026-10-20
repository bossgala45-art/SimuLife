import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { createSimulation, type SimulationState } from '../../engine/index.ts'
import LifeScreen from '../screens/LifeScreen.tsx'

function life(hour = 10): SimulationState {
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
  return <LifeScreen state={state} onChange={setState} onQuit={() => {}} />
}

async function openTab(name: string) {
  const user = userEvent.setup()
  render(<Harness initial={life()} />)
  await user.click(screen.getByRole('tab', { name }))
  return user
}

describe('onglets de la démonstration', () => {
  it('affiche les probabilités des issues incertaines avant d’agir', () => {
    render(<Harness initial={life(18)} />)
    expect(screen.getByRole('button', { name: /^Faire du sport/ }).textContent).toContain('Blessure : ≈ 4 %')
  })

  it('Proches : appeler met à jour le dernier contact', async () => {
    const user = await openTab('Proches')
    const state = life()
    const mother = state.people.find((p) => p.relation === 'Mère')!
    const card = screen.getByText(mother.name, { exact: false }).closest('details')!
    await user.click(within(card).getByText(mother.name, { exact: false }))
    expect(within(card).getByText('Dernier contact : jamais')).toBeTruthy()
    await user.click(within(card).getByRole('button', { name: /^Appeler/ }))
    expect(within(screen.getByText(mother.name, { exact: false }).closest('details')!).getByText('Dernier contact : aujourd’hui')).toBeTruthy()
    expect(within(card).getByRole('button', { name: /^Demander 200 €/ }).textContent).toMatch(/Accord : ≈ \d+ %/)
  })

  it('Parcours : conditions d’accès, candidature et réponse en attente', async () => {
    const user = await openTab('Parcours')
    const cook = screen.getByText('Cuisinier·ère').closest('li')!
    expect(within(cook).getByText('Diplôme requis : CAP Cuisine')).toBeTruthy()
    expect(within(cook).queryByRole('button')).toBeNull()

    const waiter = screen.getByText('Serveur·se').closest('li')!
    const apply = within(waiter).getByRole('button', { name: /^Postuler/ })
    expect(apply.textContent).toMatch(/Embauche : ≈ \d+ %/)
    await user.click(apply)
    expect(within(screen.getByText('Serveur·se').closest('li')!).getByText('Candidature envoyée : réponse en attente.')).toBeTruthy()

    const cap = screen.getByText('CAP Cuisine (formation adulte)').closest('li')!
    expect(within(cap).getByRole('button', { name: /^S’inscrire/ }).textContent).toContain('Inscriptions seulement en septembre.')
  })

  it('Argent : épargner, montants marqués comme approximatifs', async () => {
    const user = await openTab('Argent')
    await user.click(screen.getByRole('button', { name: /^Mettre 100 € de côté/ }))
    const accounts = screen.getByRole('region', { name: 'Comptes' })
    expect(within(accounts).getByText('Épargne').nextElementSibling!.textContent).toBe('100 €')
    expect(screen.getByText(/Montants approximatifs/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /^Emprunter 1000 €/ }).textContent).toMatch(/Accord de la banque : ≈ \d+ %/)
  })
})
