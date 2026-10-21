import { useState } from 'react'
import { checkPin, hasPin, isValidPin, removePin, setPin } from '../../privacy/lock.ts'
import './privacy.css'

type Props = {
  /** Efface toutes les données de l'appareil puis relance l'application. */
  onEraseAll: () => Promise<void>
}

const safeHasPin = () => {
  try {
    return hasPin()
  } catch {
    return false
  }
}

/** Code de verrouillage et effacement des données. */
export default function PrivacyPanel({ onEraseAll }: Props) {
  const [locked, setLocked] = useState(safeHasPin)
  const [current, setCurrent] = useState('')
  const [pin, setPinValue] = useState('')
  const [confirm, setConfirm] = useState('')
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [erasing, setErasing] = useState(false)

  async function guarded(action: () => Promise<string>) {
    setBusy(true)
    setMessage(null)
    try {
      setMessage({ error: false, text: await action() })
    } catch (e) {
      setMessage({ error: true, text: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(false)
    }
  }

  async function verifyCurrent() {
    const r = await checkPin(current)
    if (!r.ok) throw new Error(r.reason === 'blocked' ? `Trop d’essais : réessaie dans ${Math.ceil(r.waitMs / 1000)} s.` : 'Code actuel incorrect.')
  }

  return (
    <>
      <section className="card" aria-labelledby="lock-title">
        <h2 id="lock-title">Code de verrouillage</h2>
        <p className="hint">
          {locked
            ? 'Un code est demandé à l’ouverture et après une minute en arrière-plan.'
            : 'Aucun code : l’application s’ouvre directement.'}{' '}
          Le code protège l’accès à l’écran ; il ne chiffre pas les données enregistrées sur l’iPhone.
        </p>
        <form
          className="pin-form"
          onSubmit={(e) => {
            e.preventDefault()
            void guarded(async () => {
              if (locked) await verifyCurrent()
              if (!isValidPin(pin)) throw new Error('Le nouveau code doit contenir de 4 à 8 chiffres.')
              if (pin !== confirm) throw new Error('Les deux codes ne correspondent pas.')
              await setPin(pin)
              setLocked(true)
              setCurrent('')
              setPinValue('')
              setConfirm('')
              return 'Code enregistré.'
            })
          }}
        >
          {locked && (
            <label>
              Code actuel
              <input type="password" inputMode="numeric" autoComplete="off" value={current} maxLength={8} onChange={(e) => setCurrent(e.target.value.replace(/\D/g, ''))} />
            </label>
          )}
          <label>
            {locked ? 'Nouveau code' : 'Code (4 à 8 chiffres)'}
            <input type="password" inputMode="numeric" autoComplete="off" value={pin} maxLength={8} onChange={(e) => setPinValue(e.target.value.replace(/\D/g, ''))} />
          </label>
          <label>
            Confirmer le code
            <input type="password" inputMode="numeric" autoComplete="off" value={confirm} maxLength={8} onChange={(e) => setConfirm(e.target.value.replace(/\D/g, ''))} />
          </label>
          <button type="submit" className="btn btn--secondary" disabled={busy}>
            {locked ? 'Changer le code' : 'Activer le code'}
          </button>
          {locked && (
            <button
              type="button"
              className="link link--danger"
              disabled={busy}
              onClick={() =>
                void guarded(async () => {
                  await verifyCurrent()
                  removePin()
                  setLocked(false)
                  setCurrent('')
                  return 'Code supprimé.'
                })
              }
            >
              Supprimer le code (code actuel requis)
            </button>
          )}
        </form>
        {message && (
          <p className={message.error ? 'question__error' : 'hint'} role={message.error ? 'alert' : 'status'}>
            {message.text}
          </p>
        )}
      </section>

      <section className="card" aria-labelledby="erase-title">
        <h2 id="erase-title">Effacer mes données</h2>
        <p className="hint">
          Supprime de cet appareil toutes les vies, branches, dossier de vie, réglages, autorisations et le code. Pense à exporter
          ce que tu veux garder. C’est définitif.
        </p>
        {erasing ? (
          <div className="tree-actions__row">
            <button type="button" className="btn btn--danger btn--small" onClick={() => void onEraseAll()}>
              Tout effacer définitivement
            </button>
            <button type="button" className="btn btn--secondary btn--small" onClick={() => setErasing(false)}>
              Annuler
            </button>
          </div>
        ) : (
          <button type="button" className="link link--danger" onClick={() => setErasing(true)}>
            Effacer toutes mes données…
          </button>
        )}
      </section>
    </>
  )
}
