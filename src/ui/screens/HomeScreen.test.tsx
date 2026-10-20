import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import HomeScreen from './HomeScreen.tsx'

const noop = () => {}

describe('HomeScreen', () => {
  it('affiche le titre SIMULIFE', () => {
    render(<HomeScreen installed={false} onNewLife={noop} onContinue={noop} />)
    expect(screen.getByRole('heading', { level: 1, name: 'SIMULIFE' })).toBeTruthy()
  })

  it('lance une nouvelle vie', async () => {
    const onNewLife = vi.fn()
    render(<HomeScreen installed={false} onNewLife={onNewLife} onContinue={noop} />)
    expect(screen.queryByRole('button', { name: 'Continuer' })).toBeNull()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Nouvelle vie' }))
    expect(onNewLife).toHaveBeenCalledOnce()
  })

  it('propose de continuer une partie sauvegardée', async () => {
    const onContinue = vi.fn()
    render(<HomeScreen installed={false} savedLife="Léa, 24 ans" onNewLife={noop} onContinue={onContinue} />)
    expect(screen.getByText('Léa, 24 ans')).toBeTruthy()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Continuer' }))
    expect(onContinue).toHaveBeenCalledOnce()
  })

  it('ouvre et ferme le panneau « À propos »', async () => {
    const user = userEvent.setup()
    render(<HomeScreen installed={false} onNewLife={noop} onContinue={noop} />)

    expect(screen.queryByRole('region', { name: 'À propos de SIMULIFE' })).toBeNull()

    await user.click(screen.getByRole('button', { name: 'À propos' }))
    expect(screen.getByRole('region', { name: 'À propos de SIMULIFE' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Fermer' }).getAttribute('aria-expanded')).toBe('true')

    await user.click(screen.getByRole('button', { name: 'Fermer' }))
    expect(screen.queryByRole('region', { name: 'À propos de SIMULIFE' })).toBeNull()
  })

  it('affiche l’aide à l’installation seulement hors écran d’accueil', () => {
    const { unmount } = render(<HomeScreen installed={false} onNewLife={noop} onContinue={noop} />)
    expect(screen.getByText(/Sur l’écran d’accueil/)).toBeTruthy()
    unmount()

    render(<HomeScreen installed={true} onNewLife={noop} onContinue={noop} />)
    expect(screen.queryByText(/Sur l’écran d’accueil/)).toBeNull()
  })
})
