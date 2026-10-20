/**
 * Sauvegarde : l'état complet (dont la graine et l'état du générateur) est
 * converti en JSON. Le chargement vérifie chaque champ et signale précisément
 * la première anomalie rencontrée.
 */
import { SimulationError } from './errors.ts'
import { EVENT_TYPES } from './events.ts'
import { NEED_IDS } from './needs.ts'
import { isValidDate } from './time.ts'
import type { AttributeId, GameEvent, LogKind, SimulationState } from './types.ts'

const ATTRIBUTE_IDS: AttributeId[] = ['health', 'fitness', 'intelligence', 'sociability']
const LOG_KINDS: LogKind[] = ['action', 'event', 'warning', 'day', 'system']

export function serializeState(state: SimulationState): string {
  return JSON.stringify(state)
}

export function parseState(json: string): SimulationState {
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    throw invalid('le contenu n’est pas du JSON valide')
  }
  assertState(raw)
  return raw
}

function invalid(detail: string): SimulationError {
  return new SimulationError('INVALID_SAVE', `Sauvegarde invalide : ${detail}.`)
}

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)

function int(v: unknown, path: string): void {
  if (!Number.isSafeInteger(v)) throw invalid(`${path} doit être un entier`)
}
function num(v: unknown, path: string, min = -Infinity, max = Infinity): void {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) {
    throw invalid(`${path} doit être un nombre entre ${min} et ${max}`)
  }
}
function obj(v: unknown, path: string): Obj {
  if (!isObj(v)) throw invalid(`${path} doit être un objet`)
  return v
}

function assertEvent(v: unknown, path: string): asserts v is GameEvent {
  const e = obj(v, path)
  if (!EVENT_TYPES.includes(e.type as GameEvent['type'])) throw invalid(`${path}.type inconnu (${String(e.type)})`)
  if (e.type === 'rent_due' || e.type === 'work_bonus') int(e.amount, `${path}.amount`)
}

function assertState(v: unknown): asserts v is SimulationState {
  const s = obj(v, 'état')
  if (s.version !== 1) throw invalid(`version ${String(s.version)} non prise en charge`)
  if (typeof s.seed !== 'string' || s.seed.length === 0) throw invalid('seed manquante')
  int(s.rngState, 'rngState')
  num(s.rngState, 'rngState', 0, 0xffffffff)
  int(s.clock, 'clock')
  int(s.nextEventId, 'nextEventId')
  int(s.nextLogSeq, 'nextLogSeq')

  const c = obj(s.character, 'character')
  if (typeof c.name !== 'string' || c.name.length === 0) throw invalid('character.name manquant')
  if (!isObj(c.birthDate) || !isValidDate(c.birthDate as never)) throw invalid('character.birthDate invalide')
  int(c.money, 'character.money')
  const needs = obj(c.needs, 'character.needs')
  for (const id of NEED_IDS) num(needs[id], `character.needs.${id}`, 0, 100)
  const attributes = obj(c.attributes, 'character.attributes')
  for (const id of ATTRIBUTE_IDS) num(attributes[id], `character.attributes.${id}`, 0, 100)
  if (!Array.isArray(c.statuses) || !c.statuses.every((x) => x === 'injured')) throw invalid('character.statuses invalide')
  if (typeof c.alive !== 'boolean') throw invalid('character.alive doit être un booléen')
  if (c.lastWorkDay !== null) int(c.lastWorkDay, 'character.lastWorkDay')

  if (!Array.isArray(s.scheduled)) throw invalid('scheduled doit être une liste')
  s.scheduled.forEach((item, i) => {
    const e = obj(item, `scheduled[${i}]`)
    int(e.id, `scheduled[${i}].id`)
    int(e.at, `scheduled[${i}].at`)
    assertEvent(e.event, `scheduled[${i}].event`)
  })

  if (!Array.isArray(s.log)) throw invalid('log doit être une liste')
  s.log.forEach((item, i) => {
    const e = obj(item, `log[${i}]`)
    int(e.seq, `log[${i}].seq`)
    int(e.at, `log[${i}].at`)
    if (!LOG_KINDS.includes(e.kind as LogKind)) throw invalid(`log[${i}].kind inconnu`)
    if (typeof e.code !== 'string' || typeof e.message !== 'string') throw invalid(`log[${i}] incomplet`)
  })
}
