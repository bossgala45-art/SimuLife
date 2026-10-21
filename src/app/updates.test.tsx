import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { newId } from '../destiny/checksum.ts'
import { DestinyRepository } from '../storage/destiny.ts'
import App, { type Updates } from './App.tsx'

let repos: DestinyRepository[] = []
beforeEach(() => localStorage.clear())
afterEach(() => {
  repos.forEach((r) => r.close())
  repos = []
})

/** Faux service worker : on décide quand une nouvelle version est prête. */
function fakeUpdates() {
  const listeners = new Set<() => void>()
  const updates: Updates = {
    onUpdateReady: (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    applyUpdate: vi.fn(),
  }
  return { updates, announce: () => listeners.forEach((l) => l()) }
}

function start(updates: Updates) {
  const repo = new DestinyRepository(`maj-${newId()}`)
  repos.push(repo)
  render(<App repository={repo} updates={updates} />)
  return userEvent.setup()
}

describe('mises à jour automatiques', () => {
  it('à l’accueil, la nouvelle version s’installe d’elle-même', async () => {
    const { updates, announce } = fakeUpdates()
    start(updates)
    await screen.findByRole('button', { name: 'Nouvelle vie' })
    announce()
    await waitFor(() => expect(updates.applyUpdate).toHaveBeenCalledTimes(1))
  })

  it('pendant une partie : rien n’est interrompu, le joueur choisit le moment', async () => {
    const { updates, announce } = fakeUpdates()
    const user = start(updates)
    await user.click(await screen.findByRole('button', { name: 'Nouvelle vie' }))
    await user.click(screen.getByRole('button', { name: 'Commencer' }))
    await screen.findByRole('dialog', { name: 'Une vie commence' })
    announce()
    const banner = await screen.findByText('Une nouvelle version de SIMULIFE est prête.')
    expect(updates.applyUpdate).not.toHaveBeenCalled()
    await user.click(banner.parentElement!.querySelector('button')!)
    await waitFor(() => expect(updates.applyUpdate).toHaveBeenCalledTimes(1))
  })
})
