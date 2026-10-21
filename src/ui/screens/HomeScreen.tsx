import { useId, useState } from 'react'
import './HomeScreen.css'

type HomeScreenProps = {
  /** Vrai quand l'app est lancée depuis l'écran d'accueil de l'iPhone. */
  installed: boolean
  /** Résumé de la partie sauvegardée, s'il y en a une. */
  savedLife?: string
  /** Problème rencontré en lisant la sauvegarde. */
  loadError?: string
  onNewLife: () => void
  onContinue: () => void
  onDossier: () => void
  onTree: () => void
  onPrivacy?: () => void
}

export default function HomeScreen({ installed, savedLife, loadError, onNewLife, onContinue, onDossier, onTree, onPrivacy }: HomeScreenProps) {
  const [aboutOpen, setAboutOpen] = useState(false)
  const aboutId = useId()

  return (
    <main className="home">
      <header className="home__hero">
        <img className="home__logo" src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width={96} height={96} />
        <h1 className="home__title">SIMULIFE</h1>
        <p className="home__tagline">Explore les vies que tu aurais pu vivre.</p>
      </header>

      <section className="home__actions" aria-label="Menu principal">
        {savedLife && (
          <>
            <button type="button" className="btn btn--primary" onClick={onContinue}>
              Continuer
            </button>
            <p className="home__note">{savedLife}</p>
          </>
        )}
        {loadError && (
          <p className="home__note home__note--error" role="alert">
            {loadError}
          </p>
        )}
        <button type="button" className={savedLife ? 'btn btn--secondary' : 'btn btn--primary'} onClick={onNewLife}>
          Nouvelle vie
        </button>
        <button type="button" className="btn btn--secondary" onClick={onDossier}>
          Dossier de vie
        </button>
        <button type="button" className="btn btn--secondary" onClick={onTree}>
          Arbre des destins
        </button>

        {onPrivacy && (
          <button type="button" className="btn btn--secondary" onClick={onPrivacy}>
            Confidentialité et données
          </button>
        )}
        <button
          type="button"
          className="btn btn--secondary"
          aria-expanded={aboutOpen}
          aria-controls={aboutId}
          onClick={() => setAboutOpen((open) => !open)}
        >
          {aboutOpen ? 'Fermer' : 'À propos'}
        </button>
      </section>

      {aboutOpen && (
        <section id={aboutId} className="home__about" aria-label="À propos de SIMULIFE">
          <p>
            SIMULIFE simule des vies alternatives. Le dossier de vie te permet de raconter ton histoire ; la
            simulation reprend ensuite à l’âge que tu choisis.
          </p>
          <p>Tes vies, leurs branches et ton dossier sont enregistrés uniquement sur cet appareil.</p>
          <p>
            <a href={`${import.meta.env.BASE_URL}licences-tiers.txt`} target="_blank" rel="noreferrer">
              Licences des bibliothèques utilisées
            </a>
          </p>
          <p className="home__version">
            Version {__APP_VERSION__} du {__APP_BUILT_AT__.split('-').reverse().join('/')} — mise à jour automatique.
          </p>
        </section>
      )}

      {!installed && (
        <footer className="home__install">
          Pour installer : dans Safari, touche <strong>Partager</strong> puis{' '}
          <strong>Sur l’écran d’accueil</strong>.
        </footer>
      )}
    </main>
  )
}
