import { useEffect, useRef } from 'react'
import type { ConsentPurpose } from '../../ai/consent.ts'

type Props = {
  purpose: ConsentPurpose
  /** Données exactes qui partiraient maintenant. */
  preview: string
  onOnce: () => void
  onAlways: () => void
  onRefuse: () => void
}

/** Demande d'autorisation explicite, avant tout envoi de données hors de l'appareil. */
export default function ConsentDialog({ purpose, preview, onOnce, onAlways, onRefuse }: Props) {
  // Le focus va au titre : la fenêtre s'ouvre en haut, destinataire et données visibles d'abord.
  const title = useRef<HTMLHeadingElement>(null)
  useEffect(() => title.current?.focus(), [])
  return (
    <div className="sheet-scrim">
      <div className="sheet consent" role="alertdialog" aria-modal="true" aria-labelledby="consent-title">
        <h2 id="consent-title" ref={title} tabIndex={-1}>Autoriser l’envoi ? — {purpose.title}</h2>
        <p>
          <strong>Destinataire :</strong> {purpose.recipient}
        </p>
        <p>
          <strong>Pourquoi :</strong> {purpose.purpose}
        </p>
        <p>
          <strong>Données envoyées :</strong>
        </p>
        <ul className="plain">
          {purpose.data.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
        <p className="consent__label">Envoi prévu maintenant :</p>
        <pre className="consent__preview">{preview}</pre>
        {purpose.policyUrl && (
          <p className="hint">
            <a href={purpose.policyUrl} target="_blank" rel="noreferrer">
              Politique de confidentialité du destinataire
            </a>
          </p>
        )}
        <button type="button" className="btn btn--primary" onClick={onOnce}>
          Autoriser cette fois
        </button>
        <button type="button" className="btn btn--secondary" onClick={onAlways}>
          Toujours autoriser (révocable dans Paramètres)
        </button>
        <button type="button" className="link sheet__close" onClick={onRefuse}>
          Refuser
        </button>
      </div>
    </div>
  )
}
