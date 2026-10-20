/**
 * Sauvegarde du dossier : JSON vérifié au chargement.
 * Une réponse à une question retirée du catalogue est conservée (et ignorée)
 * pour ne rien perdre si la question revient dans une version ultérieure.
 */
import { validateFuzzyDate } from './dates.ts'
import { DossierError } from './errors.ts'
import type { AnswerValue, Dossier, FuzzyDate } from './types.ts'

export function serializeDossier(d: Dossier): string {
  return JSON.stringify(d)
}

const invalid = (detail: string) => new DossierError('INVALID_SAVE', `Dossier illisible : ${detail}.`)
type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)

function assertFuzzyDate(v: unknown, path: string): asserts v is FuzzyDate {
  if (!isObj(v) || (v.kind !== 'calendar' && v.kind !== 'age') || typeof v.approximate !== 'boolean') {
    throw invalid(`${path} n’est pas une date`)
  }
  const error = validateFuzzyDate(v as FuzzyDate)
  if (error) throw invalid(`${path} : ${error}`)
}

function assertAnswer(v: unknown, path: string): asserts v is AnswerValue {
  if (!isObj(v)) throw invalid(`${path} doit être un objet`)
  switch (v.kind) {
    case 'unknown':
    case 'declined':
      return
    case 'text':
      if (typeof v.text !== 'string') throw invalid(`${path}.text doit être un texte`)
      return
    case 'choice':
      if (typeof v.option !== 'string') throw invalid(`${path}.option doit être un texte`)
      return
    case 'choices':
      if (!Array.isArray(v.options) || !v.options.every((o) => typeof o === 'string')) {
        throw invalid(`${path}.options doit être une liste de textes`)
      }
      return
    case 'number':
      if (!Number.isFinite(v.value)) throw invalid(`${path}.value doit être un nombre`)
      return
    case 'date':
      return assertFuzzyDate(v.date, `${path}.date`)
    default:
      throw invalid(`${path}.kind inconnu (${String(v.kind)})`)
  }
}

export function parseDossier(json: string): Dossier {
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    throw invalid('le contenu n’est pas du JSON valide')
  }
  if (!isObj(raw)) throw invalid('objet attendu')
  if (raw.version !== 1) throw invalid(`version ${String(raw.version)} non prise en charge`)
  if (typeof raw.seed !== 'string' || raw.seed.length === 0) throw invalid('graine manquante')
  if (raw.birth !== null) {
    assertFuzzyDate(raw.birth, 'birth')
    if (raw.birth.kind !== 'calendar') throw invalid('birth doit être une date du calendrier')
  }
  if (raw.startAge !== null && !Number.isInteger(raw.startAge)) throw invalid('startAge doit être un entier')
  if (!isObj(raw.answers)) throw invalid('answers doit être un objet')
  for (const [id, record] of Object.entries(raw.answers)) {
    if (!isObj(record) || !Number.isInteger(record.revision)) throw invalid(`answers.${id} incomplet`)
    assertAnswer(record.value, `answers.${id}.value`)
  }
  return raw as unknown as Dossier
}
