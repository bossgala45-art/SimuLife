/**
 * Invariants de l'état de simulation, vérifiés par les tests et l'audit des
 * simulations longues. Chaque anomalie est décrite en clair ; liste vide = état sain.
 */
import { LOG_LIMIT } from './journal.ts'
import { NEED_IDS } from './needs.ts'
import { MEMORY_LIMIT } from './relationships.ts'
import { serializeState, parseState } from './serialization.ts'
import { STORY_LIMIT, THREAD_LIMIT } from './story.ts'
import type { GameEvent, SimulationState } from './types.ts'

const inRange = (v: number, min = 0, max = 100) => Number.isFinite(v) && v >= min && v <= max

export function checkInvariants(state: SimulationState, options: { roundTrip?: boolean } = {}): string[] {
  const issues: string[] = []
  const fail = (message: string) => issues.push(message)
  const c = state.character

  if (state.version !== 3) fail(`version ${state.version}`)
  if (!Number.isSafeInteger(state.clock)) fail('horloge non entière')
  if (!Number.isSafeInteger(c.money)) fail(`argent non entier : ${c.money}`)
  for (const id of NEED_IDS) if (!inRange(c.needs[id])) fail(`besoin ${id} hors bornes : ${c.needs[id]}`)
  for (const [id, v] of Object.entries(c.attributes)) if (!inRange(v)) fail(`caractéristique ${id} hors bornes : ${v}`)
  if (new Set(c.statuses).size !== c.statuses.length) fail('statut en double')

  // ——— Événements différés ———
  const events = state.scheduled
  for (let i = 0; i < events.length; i++) {
    const e = events[i]
    if (!Number.isSafeInteger(e.at)) fail(`événement ${e.event.type} à une date non entière`)
    if (e.at <= state.clock && c.alive) fail(`événement ${e.event.type} échu non traité (${e.at} ≤ ${state.clock})`)
    if (i > 0 && (events[i - 1].at > e.at || (events[i - 1].at === e.at && events[i - 1].id > e.id))) fail('file des événements mal triée')
    if (e.id >= state.nextEventId) fail(`identifiant d'événement ${e.id} ≥ nextEventId`)
  }
  const count = (type: GameEvent['type'], match: (e: GameEvent) => boolean = () => true) =>
    events.filter((s) => s.event.type === type && match(s.event)).length
  if (c.alive) {
    for (const type of ['rent_due', 'birthday', 'payday', 'bills_due'] as const) {
      if (count(type) !== 1) fail(`${count(type)} échéance(s) « ${type} » au lieu d'une`)
    }
  }
  for (const debt of state.finances.debts) {
    const n = count('debt_payment', (e) => e.type === 'debt_payment' && e.debtId === debt.id)
    if (c.alive && n !== 1) fail(`dette ${debt.id} : ${n} échéance(s) de remboursement`)
    if (!Number.isSafeInteger(debt.remaining) || debt.remaining <= 0) fail(`dette ${debt.id} : reste dû invalide (${debt.remaining})`)
  }
  for (const s of events) {
    if (s.event.type === 'debt_payment') {
      const id = s.event.debtId
      if (!state.finances.debts.some((d) => d.id === id)) fail(`remboursement programmé pour une dette inexistante (${id})`)
    }
  }
  const applications = events.flatMap((s) => (s.event.type === 'job_application_result' ? [s.event.career] : []))
  if (new Set(applications).size !== applications.length) fail('candidature en double pour un même métier')
  const exams = count('exam')
  if (exams > 1 || (exams === 1 && !state.education.enrollment)) fail(`${exams} examen(s) programmé(s) pour ${state.education.enrollment ? 'une' : 'aucune'} formation`)
  if (c.alive && state.education.enrollment && exams !== 1) fail('formation en cours sans examen programmé')
  if (c.alive && c.statuses.includes('sick') !== (count('illness_recovered') === 1)) fail('maladie et guérison programmée incohérentes')
  if (c.alive && c.statuses.includes('injured') !== (count('injury_recovered') === 1)) fail('blessure et guérison programmée incohérentes')
  if (count('illness_recovered') > 1 || count('injury_recovered') > 1) fail('guérison programmée en double')

  // ——— Proches et relations ———
  const ids = new Set(state.people.map((p) => p.id))
  if (ids.size !== state.people.length) fail('identifiant de proche en double')
  for (const p of state.people) {
    const rel = state.relationships[p.id]
    if (!rel) {
      fail(`${p.name} sans relation`)
      continue
    }
    for (const k of ['closeness', 'trust', 'tension'] as const) if (!inRange(rel[k])) fail(`${p.name} : ${k} hors bornes (${rel[k]})`)
    if (rel.memories.length > MEMORY_LIMIT) fail(`${p.name} : trop de souvenirs relationnels`)
    if (rel.lastContact !== null && rel.lastContact > state.clock) fail(`${p.name} : dernier contact dans le futur`)
    if (!inRange(p.health)) fail(`${p.name} : santé hors bornes (${p.health})`)
    const sickEvents = count('npc_recovered', (e) => e.type === 'npc_recovered' && e.personId === p.id)
    if (p.alive && p.sickSince !== null && sickEvents !== 1) fail(`${p.name} malade avec ${sickEvents} guérison(s) programmée(s)`)
    if (p.sickSince === null && sickEvents > 0 && p.alive) fail(`${p.name} : guérison programmée sans maladie`)
  }
  for (const id of Object.keys(state.relationships)) if (!ids.has(id)) fail(`relation orpheline ${id}`)
  for (const d of state.finances.debts) if (d.lender !== 'bank' && !ids.has(d.lender)) fail(`prêteur inconnu ${d.lender}`)

  // ——— Journal et narration ———
  if (state.log.length > LOG_LIMIT) fail('journal au-delà de sa limite')
  for (let i = 1; i < state.log.length; i++) {
    if (state.log[i].seq <= state.log[i - 1].seq) fail('numéros du journal non croissants')
    if (state.log[i].at < state.log[i - 1].at) fail('journal non chronologique')
  }
  if (state.log.length && state.log.at(-1)!.seq >= state.nextLogSeq) fail('nextLogSeq en retard sur le journal')
  const messageIds = new Set<number>()
  for (const [id, thread] of Object.entries(state.narrative.threads)) {
    if (!ids.has(id)) fail(`fil de messages orphelin ${id}`)
    if (thread.length > THREAD_LIMIT) fail(`fil ${id} au-delà de sa limite`)
    for (const m of thread) {
      if (messageIds.has(m.id) || m.id >= state.narrative.nextMessageId) fail(`identifiant de message invalide ${m.id}`)
      messageIds.add(m.id)
      if (m.at > state.clock) fail('message daté du futur')
    }
  }
  if (state.narrative.memories.length > STORY_LIMIT) fail('trop de souvenirs narratifs')
  const memoryIds = state.narrative.memories.map((m) => m.id)
  if (new Set(memoryIds).size !== memoryIds.length || memoryIds.some((id) => id >= state.narrative.nextMemoryId)) fail('identifiants de souvenirs invalides')
  if (!inRange(state.finances.savings, 0, Number.MAX_SAFE_INTEGER)) fail(`épargne invalide : ${state.finances.savings}`)

  if (options.roundTrip) {
    try {
      if (serializeState(parseState(serializeState(state))) !== serializeState(state)) fail('sauvegarde non fidèle')
    } catch (e) {
      fail(`sauvegarde illisible : ${(e as Error).message}`)
    }
  }
  return issues
}
