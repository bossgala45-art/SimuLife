import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { createSimulation, type SimulationState } from '../../engine/index.ts'
import LifeScreen from './LifeScreen.tsx'

function life(): SimulationState {
  // Lundi 6 janvier 2025, 07:00
  return createSimulation({ seed: 'ui', name: 'Léa', birthDate: { year: 2000, month: 3, day: 15 } })
}

function Harness({ initial }: { initial: SimulationState }) {
  const [state, setState] = useState(initial)
  return <LifeScreen state={state} onChange={setState} onQuit={() => {}} />
}

describe('LifeScreen', () => {
  it('affiche le personnage, la date, l’heure et les besoins', () => {
    render(<Harness initial={life()} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Léa, 24 ans' })).toBeTruthy()
    expect(screen.getByText('lundi 6 janvier 2025', { selector: 'p' })).toBeTruthy()
    expect(screen.getByLabelText('Heure').textContent).toBe('07:00')
    expect(screen.getAllByRole('meter')).toHaveLength(6)
  })

  it('désactive une action impossible en indiquant pourquoi', () => {
    render(<Harness initial={life()} />)
    const sleep = screen.getByRole('button', { name: /^Dormir/ }) as HTMLButtonElement
    expect(sleep.disabled).toBe(true)
    expect(sleep.textContent).toContain('Pas sommeil (sommeil < 30).')
  })

  it('exécute une action et fait avancer l’heure', async () => {
    render(<Harness initial={life()} />)
    await userEvent.setup().click(screen.getByRole('button', { name: /^Attendre/ }))
    expect(screen.getByLabelText('Heure').textContent).toBe('08:00')
  })

  it('fait avancer la vie d’un jour', async () => {
    render(<Harness initial={life()} />)
    await userEvent.setup().click(screen.getByRole('button', { name: '+1 jour' }))
    expect(screen.getByText('mardi 7 janvier 2025', { selector: 'p' })).toBeTruthy()
    expect(screen.getByLabelText('Heure').textContent).toBe('07:00')
    // Le journal est regroupé par jour, le plus récent en premier.
    const days = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
    expect(days.slice(0, 2)).toEqual(['mardi 7 janvier 2025', 'lundi 6 janvier 2025'])
  })
})
