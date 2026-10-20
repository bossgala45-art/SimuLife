import { useId, useState } from 'react'
import './HomeScreen.css'

type HomeScreenProps = {
  /** Vrai quand l'app est lancée depuis l'écran d'accueil de l'iPhone. */
  installed: boolean
}

export default function HomeScreen({ installed }: HomeScreenProps) {
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
        <button type="button" className="btn btn--primary" disabled aria-describedby={`${aboutId}-soon`}>
          Nouvelle vie
        </button>
        <p id={`${aboutId}-soon`} className="home__note">
          La simulation n’est pas encore disponible.
        </p>

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
            SIMULIFE simulera des vies alternatives réalistes. Cette version ne contient que les
            fondations de l’application.
          </p>
          <p>Tes données resteront stockées sur cet appareil. Aucune donnée n’est encore enregistrée.</p>
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
