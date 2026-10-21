import { useEffect, useRef, useState } from 'react'
import { checkPin } from '../../privacy/lock.ts'
import './privacy.css'

type Props = {
  onUnlock: () => void
  onEraseAll: () => Promise<void>
}

/** Écran de verrouillage : rien de la partie n'est affiché tant que le code n'est pas saisi. */
export default function LockScreen({ onUnlock, onEraseAll }: Props) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [forgot, setForgot] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => input.current?.focus(), [])

  async function submit() {
    setBusy(true)
    const r = await checkPin(pin)
    setBusy(false)
    setPin('')
    if (r.ok) onUnlock()
    else if (r.reason === 'blocked') setError(`Trop d’essais. Réessaie dans ${Math.ceil(r.waitMs / 1000)} s.`)
    else setError(r.remaining > 0 ? `Code incorrect. Encore ${r.remaining} essai${r.remaining > 1 ? 's' : ''} avant une attente.` : 'Code incorrect. Une attente est imposée avant le prochain essai.')
  }

  return (
    <main className="lock">
      <h1>SIMULIFE</h1>
      <form
        className="lock__form"
        onSubmit={(e) => {
          e.preventDefault()
          if (pin) void submit()
        }}
      >
        <label htmlFor="lock-pin">Code de verrouillage</label>
        <input
          ref={input}
          id="lock-pin"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={8}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
        />
        <button type="submit" className="btn btn--primary" disabled={busy || pin.length < 4}>
          Déverrouiller
        </button>
      </form>
      {error && (
        <p className="question__error" role="alert">
          {error}
        </p>
      )}
      {forgot ? (
        <div className="lock__forgot">
          <p>Sans le code, la seule solution est d’effacer toutes les données de SIMULIFE sur cet appareil.</p>
          <button type="button" className="btn btn--danger" onClick={() => void onEraseAll()}>
            Tout effacer et recommencer
          </button>
          <button type="button" className="link" onClick={() => setForgot(false)}>
            Annuler
          </button>
        </div>
      ) : (
        <button type="button" className="link" onClick={() => setForgot(true)}>
          Code oublié ?
        </button>
      )}
    </main>
  )
}
