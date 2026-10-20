import { useState } from 'react'
import { CATALOG, CATALOG_TARGET, CATEGORIES, formatFuzzyDate, progress, QUESTIONNAIRE, type CategoryId, type Dossier } from '../../dossier/index.ts'

type Props = {
  dossier: Dossier & { birth: NonNullable<Dossier['birth']>; startAge: number }
  issueCount: { errors: number; warnings: number }
  onOpenCategory: (id: CategoryId) => void
  onTimeline: () => void
  onProfile: () => void
  onSetup: () => void
  onErase: () => void
  onBack: () => void
}

export default function OverviewView({ dossier, issueCount, onOpenCategory, onTimeline, onProfile, onSetup, onErase, onBack }: Props) {
  const [confirmErase, setConfirmErase] = useState(false)
  const total = progress(QUESTIONNAIRE, dossier)

  return (
    <main className="dossier">
      <header className="dossier__bar">
        <button type="button" className="link" onClick={onBack}>
          ‹ Menu
        </button>
      </header>
      <h1 className="dossier__title">Dossier de vie</h1>
      <p className="dossier__summary">
        Né·e : {formatFuzzyDate(dossier.birth)} · Vie alternative à partir de {dossier.startAge} ans{' '}
        <button type="button" className="link" onClick={onSetup}>
          Modifier
        </button>
      </p>
      <p className="dossier__summary">
        {total.done} réponses sur {total.total} questions de ton parcours.
      </p>

      <ul className="categories">
        {CATEGORIES.map((c) => {
          const p = progress(QUESTIONNAIRE, dossier, c.id)
          return (
            <li key={c.id}>
              <button type="button" className="category" onClick={() => onOpenCategory(c.id)}>
                <span>{c.label}</span>
                <span className={p.done === p.total ? 'category__count category__count--done' : 'category__count'}>
                  {p.done}/{p.total}
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      <div className="dossier__actions">
        <button type="button" className="btn btn--secondary" onClick={onTimeline}>
          Chronologie
          {issueCount.errors + issueCount.warnings > 0 &&
            ` (${issueCount.errors > 0 ? `${issueCount.errors} incohérence${issueCount.errors > 1 ? 's' : ''}` : `${issueCount.warnings} alerte${issueCount.warnings > 1 ? 's' : ''}`})`}
        </button>
        <button type="button" className="btn btn--primary" onClick={onProfile}>
          Profil et nouvelle vie
        </button>
      </div>

      <section className="dossier__privacy">
        <p>
          Ton dossier reste sur cet appareil. Chaque question est facultative. Catalogue actuel : {CATALOG.length}{' '}
          questions (objectif : {CATALOG_TARGET}).
        </p>
        {confirmErase ? (
          <div className="dossier__erase">
            <button type="button" className="btn btn--danger" onClick={onErase}>
              Confirmer l’effacement
            </button>
            <button type="button" className="btn btn--secondary" onClick={() => setConfirmErase(false)}>
              Annuler
            </button>
          </div>
        ) : (
          <button type="button" className="link link--danger" onClick={() => setConfirmErase(true)}>
            Effacer mon dossier
          </button>
        )}
      </section>
    </main>
  )
}
