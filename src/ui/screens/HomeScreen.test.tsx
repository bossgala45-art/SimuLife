import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import HomeScreen from './HomeScreen.tsx'

describe('HomeScreen', () => {
  it('affiche le titre SIMULIFE', () => {
    render(<HomeScreen installed={false} />)
    expect(screen.getByRole('heading', { level: 1, name: 'SIMULIFE' })).toBeTruthy()
  })

  it('désactive « Nouvelle vie » tant que la simulation n’existe pas', () => {
    render(<HomeScreen installed={false} />)
    const button = screen.getByRole('button', { name: 'Nouvelle vie' }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
  })

  it('ouvre et ferme le panneau « À propos »', async () => {
    const user = userEvent.setup()
    render(<HomeScreen installed={false} />)

    expect(screen.queryByRole('region', { name: 'À propos de SIMULIFE' })).toBeNull()

    await user.click(screen.getByRole('button', { name: 'À propos' }))
    expect(screen.getByRole('region', { name: 'À propos de SIMULIFE' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Fermer' }).getAttribute('aria-expanded')).toBe('true')

    await user.click(screen.getByRole('button', { name: 'Fermer' }))
    expect(screen.queryByRole('region', { name: 'À propos de SIMULIFE' })).toBeNull()
  })

  it('affiche l’aide à l’installation seulement hors écran d’accueil', () => {
    const { unmount } = render(<HomeScreen installed={false} />)
    expect(screen.getByText(/Sur l’écran d’accueil/)).toBeTruthy()
    unmount()

    render(<HomeScreen installed={true} />)
    expect(screen.queryByText(/Sur l’écran d’accueil/)).toBeNull()
  })
})
