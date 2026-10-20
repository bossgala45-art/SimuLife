import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import NewLifeScreen from './NewLifeScreen.tsx'

describe('NewLifeScreen', () => {
  it('crée une vie avec la graine saisie', async () => {
    const user = userEvent.setup()
    const onCreate = vi.fn()
    render(<NewLifeScreen onCreate={onCreate} onCancel={() => {}} />)
    const seed = screen.getByLabelText('Graine')
    await user.clear(seed)
    await user.type(seed, 'ma-graine')
    await user.click(screen.getByRole('button', { name: 'Commencer' }))
    expect(onCreate).toHaveBeenCalledOnce()
    expect(onCreate.mock.calls[0][0]).toMatchObject({ seed: 'ma-graine', character: { name: 'Alex' } })
  })

  it('affiche l’erreur explicite du moteur', async () => {
    const user = userEvent.setup()
    const onCreate = vi.fn()
    render(<NewLifeScreen onCreate={onCreate} onCancel={() => {}} />)
    await user.clear(screen.getByLabelText('Prénom'))
    await user.click(screen.getByRole('button', { name: 'Commencer' }))
    expect(onCreate).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toBe('Le prénom doit contenir entre 1 et 40 caractères.')
  })
})
