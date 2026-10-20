import {
  CAREERS,
  careerEligibility,
  enrollmentReasons,
  examProbability,
  findCareer,
  findDiploma,
  findProgram,
  formatDate,
  levelOf,
  levelProgress,
  MAX_LEVEL,
  pendingApplication,
  percent,
  PROGRAMS,
  SKILLS,
  type SimulationState,
  type StepResult,
} from '../../engine/index.ts'
import ActionButton from './ActionButton.tsx'

type Props = {
  state: SimulationState
  onResult: (result: StepResult) => void
}

const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']
const DAY = 24 * 60

export default function PathPanel({ state, onResult }: Props) {
  const job = state.career.job
  const enrollment = state.education.enrollment
  const program = enrollment ? findProgram(enrollment.program)! : null

  return (
    <>
      <section className="card" aria-labelledby="job-title">
        <h2 id="job-title">Emploi</h2>
        {job ? (
          <>
            <p className="big">{findCareer(job.career)!.label}</p>
            <dl className="facts-list">
              <div>
                <dt>Salaire net</dt>
                <dd>≈ {job.salary} € / mois</dd>
              </div>
              <div>
                <dt>Jours travaillés ce mois-ci</dt>
                <dd>{job.daysWorked}</dd>
              </div>
              <div>
                <dt>Appréciation</dt>
                <dd>{Math.round(job.performance)}/100</dd>
              </div>
              <div>
                <dt>Ancienneté</dt>
                <dd>{Math.floor((state.clock - job.since) / DAY)} jours</dd>
              </div>
            </dl>
            <ActionButton state={state} action="quit_job" onResult={onResult} />
          </>
        ) : (
          <p>
            Sans emploi.
            {state.career.benefit && ` Allocation chômage ≈ ${state.career.benefit.amount} € / mois (${state.career.benefit.remaining} versements restants).`}
          </p>
        )}
      </section>

      <section className="card" aria-labelledby="study-title">
        <h2 id="study-title">Études</h2>
        {enrollment && program ? (
          <>
            <p className="big">{program.label}</p>
            <div className="gauge">
              <span>Heures d’étude</span>
              <span className="gauge__bar" role="meter" aria-label="Heures d’étude" aria-valuemin={0} aria-valuemax={program.studyHours} aria-valuenow={enrollment.studyHours}>
                <span style={{ width: `${Math.min(100, (enrollment.studyHours / program.studyHours) * 100)}%` }} />
              </span>
              <span className="gauge__value">
                {enrollment.studyHours}/{program.studyHours}
              </span>
            </div>
            <p className="hint">
              Examen le {formatDate(enrollment.endsAt)} · chance de réussite estimée aujourd’hui : {percent(examProbability(state))}
            </p>
            <ActionButton state={state} action="drop_out" onResult={onResult} />
          </>
        ) : (
          <p className="hint">Aucune formation en cours.</p>
        )}
        <h3 className="subtitle">Diplômes</h3>
        {state.education.diplomas.length > 0 ? (
          <ul className="plain">
            {state.education.diplomas.map((d) => (
              <li key={d.id}>
                {findDiploma(d.id)!.label}
                {d.at !== null && <span className="hint"> · obtenu le {formatDate(d.at)}</span>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="hint">Aucun diplôme reconnu.</p>
        )}
      </section>

      <section className="card" aria-labelledby="skills-title">
        <h2 id="skills-title">Compétences</h2>
        <ul className="skills">
          {SKILLS.map((skill) => {
            const xp = state.skills[skill.id]
            const level = levelOf(xp)
            return (
              <li key={skill.id}>
                <div className="gauge">
                  <span>
                    {skill.label} · niv. {level}
                  </span>
                  <span className="gauge__bar" role="meter" aria-label={`Progression ${skill.label}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(levelProgress(xp) * 100)}>
                    <span style={{ width: `${level >= MAX_LEVEL ? 100 : levelProgress(xp) * 100}%` }} />
                  </span>
                </div>
                <ActionButton state={state} action="practice" params={{ skill: skill.id }} label={`S’entraîner : ${skill.label}`} onResult={onResult} />
              </li>
            )
          })}
        </ul>
      </section>

      <section className="card" aria-labelledby="careers-title">
        <h2 id="careers-title">Métiers</h2>
        <p className="hint">Salaires nets approximatifs (ordres de grandeur non vérifiés). La réponse à une candidature arrive après 3 à 10 jours.</p>
        <ul className="catalog">
          {CAREERS.map((career) => {
            const eligibility = careerEligibility(state, career)
            return (
              <li key={career.id} className="catalog__item">
                <div className="catalog__head">
                  <strong>{career.label}</strong>
                  <span className="hint">
                    ≈ {career.salary.min}–{career.salary.max} €
                  </span>
                </div>
                <p className={eligibility.ok ? 'catalog__ok' : 'catalog__ko'}>
                  {eligibility.ok ? 'Accessible' : eligibility.reasons.join(' ; ')}
                </p>
                {pendingApplication(state, career.id) ? (
                  <p className="hint">Candidature envoyée : réponse en attente.</p>
                ) : (
                  eligibility.ok &&
                  job?.career !== career.id && (
                    <ActionButton state={state} action="apply_job" params={{ career: career.id }} onResult={onResult} />
                  )
                )}
              </li>
            )
          })}
        </ul>
      </section>

      <section className="card" aria-labelledby="programs-title">
        <h2 id="programs-title">Formations</h2>
        <ul className="catalog">
          {PROGRAMS.map((p) => {
            const reasons = enrollmentReasons(state, p)
            return (
              <li key={p.id} className="catalog__item">
                <div className="catalog__head">
                  <strong>{p.label}</strong>
                  <span className="hint">{p.durationMonths} mois</span>
                </div>
                <p className="hint">
                  Frais ≈ {p.tuition.value} € · rentrée : {p.startMonths.length ? p.startMonths.map((m) => MONTHS[m - 1]).join(', ') : 'toute l’année'} ·{' '}
                  {p.studyHours} h d’étude conseillées
                </p>
                {reasons.length > 0 && <p className="catalog__ko">{reasons.join(' ; ')}</p>}
                {!enrollment && reasons.length === 0 && (
                  <ActionButton state={state} action="enroll" params={{ program: p.id }} onResult={onResult} />
                )}
              </li>
            )
          })}
        </ul>
      </section>
    </>
  )
}
