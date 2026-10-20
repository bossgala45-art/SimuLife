import { buildTimeline, QUESTIONNAIRE, type CoherenceIssue, type Dossier } from '../../dossier/index.ts'

type Props = {
  dossier: Dossier
  issues: CoherenceIssue[]
  onEdit: (questionId: string) => void
  onBack: () => void
}

export default function TimelineView({ dossier, issues, onEdit, onBack }: Props) {
  const timeline = buildTimeline(QUESTIONNAIRE, dossier)
  const sorted = [...issues].sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1))

  return (
    <main className="dossier">
      <header className="dossier__bar">
        <button type="button" className="link" onClick={onBack}>
          ‹ Dossier
        </button>
      </header>
      <h1 className="dossier__title">Chronologie</h1>

      {sorted.length > 0 && (
        <section className="card" aria-labelledby="issues-title">
          <h2 id="issues-title">À vérifier</h2>
          <ul className="issues">
            {sorted.map((i) => (
              <li key={`${i.questionId}-${i.code}`} className={`issue issue--${i.severity}`}>
                <button type="button" className="link" onClick={() => onEdit(i.questionId)}>
                  {QUESTIONNAIRE.byId.get(i.questionId)?.prompt}
                </button>
                <span>{i.message}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <ol className="timeline">
        {timeline.map((e) => (
          <li key={e.key} className={`timeline__entry timeline__entry--${e.kind}`}>
            <span className="timeline__when">{e.when}</span>
            <span className="timeline__label">
              {e.label}
              {e.detail && <span className="timeline__detail"> — {e.detail}</span>}
            </span>
          </li>
        ))}
      </ol>
      <p className="hint">Seuls les faits déclarés avec une date apparaissent ici.</p>
    </main>
  )
}
