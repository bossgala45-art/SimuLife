import { useId, useState } from 'react'
import { monthName, type FuzzyDate } from '../../dossier/index.ts'

type Precision = 'day' | 'month' | 'year' | 'age'

const PRECISIONS: { id: Precision; label: string }[] = [
  { id: 'day', label: 'Date précise' },
  { id: 'month', label: 'Mois et année' },
  { id: 'year', label: 'Année' },
  { id: 'age', label: 'Âge' },
]

type Props = {
  initial?: FuzzyDate
  /** La naissance ne peut pas s'exprimer en âge. */
  allowAge: boolean
  /** Date complète, ou `null` tant qu'un champ obligatoire manque. */
  onChange: (date: FuzzyDate | null) => void
}

const int = (s: string) => (/^\d+$/.test(s.trim()) ? Number(s) : NaN)

export default function FuzzyDateInput({ initial, allowAge, onChange }: Props) {
  const id = useId()
  const [precision, setPrecision] = useState<Precision>(() =>
    !initial ? 'year' : initial.kind === 'age' ? 'age' : initial.day ? 'day' : initial.month ? 'month' : 'year',
  )
  const [year, setYear] = useState(initial?.kind === 'calendar' ? String(initial.year) : '')
  const [month, setMonth] = useState(initial?.kind === 'calendar' && initial.month ? String(initial.month) : '')
  const [day, setDay] = useState(initial?.kind === 'calendar' && initial.day ? String(initial.day) : '')
  const [age, setAge] = useState(initial?.kind === 'age' ? String(initial.age) : '')
  const [approximate, setApproximate] = useState(initial?.approximate ?? false)

  function emit(next: Partial<{ precision: Precision; year: string; month: string; day: string; age: string; approximate: boolean }>) {
    const s = { precision, year, month, day, age, approximate, ...next }
    if (s.precision === 'age') {
      const a = int(s.age)
      onChange(Number.isNaN(a) ? null : { kind: 'age', age: a, approximate: s.approximate })
      return
    }
    const y = int(s.year)
    const m = int(s.month)
    const d = int(s.day)
    if (Number.isNaN(y) || (s.precision !== 'year' && Number.isNaN(m)) || (s.precision === 'day' && Number.isNaN(d))) {
      onChange(null)
      return
    }
    onChange({
      kind: 'calendar',
      year: y,
      month: s.precision === 'year' ? undefined : m,
      day: s.precision === 'day' ? d : undefined,
      approximate: s.approximate,
    })
  }

  const precisions = PRECISIONS.filter((p) => allowAge || p.id !== 'age')

  return (
    <div className="fuzzy-date">
      <div className="segmented" role="radiogroup" aria-label="Précision de la date">
        {precisions.map((p) => (
          <label key={p.id} className={precision === p.id ? 'segmented__item segmented__item--on' : 'segmented__item'}>
            <input
              type="radio"
              name={`${id}-precision`}
              checked={precision === p.id}
              onChange={() => {
                setPrecision(p.id)
                emit({ precision: p.id })
              }}
            />
            {p.label}
          </label>
        ))}
      </div>

      {precision === 'age' ? (
        <label className="field">
          <span>Âge (en années)</span>
          <input
            inputMode="numeric"
            value={age}
            onChange={(e) => {
              setAge(e.target.value)
              emit({ age: e.target.value })
            }}
          />
        </label>
      ) : (
        <div className="fuzzy-date__row">
          {precision === 'day' && (
            <label className="field fuzzy-date__day">
              <span>Jour</span>
              <input
                inputMode="numeric"
                value={day}
                onChange={(e) => {
                  setDay(e.target.value)
                  emit({ day: e.target.value })
                }}
              />
            </label>
          )}
          {precision !== 'year' && (
            <label className="field fuzzy-date__month">
              <span>Mois</span>
              <select
                value={month}
                onChange={(e) => {
                  setMonth(e.target.value)
                  emit({ month: e.target.value })
                }}
              >
                <option value="">—</option>
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>
                    {monthName(i + 1)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="field fuzzy-date__year">
            <span>Année</span>
            <input
              inputMode="numeric"
              value={year}
              onChange={(e) => {
                setYear(e.target.value)
                emit({ year: e.target.value })
              }}
            />
          </label>
        </div>
      )}

      <label className="check">
        <input
          type="checkbox"
          checked={approximate}
          onChange={(e) => {
            setApproximate(e.target.checked)
            emit({ approximate: e.target.checked })
          }}
        />
        Environ (date approximative)
      </label>
    </div>
  )
}
