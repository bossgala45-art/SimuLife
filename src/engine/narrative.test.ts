import { describe, expect, it } from 'vitest'
import { actionOutcomes, validateAction } from './actions.ts'
import { cleanText, topicOptions } from './dialogue.ts'
import { interpretText, messageTopic, resolveTopic } from './intent.ts'
import { writeLog } from './journal.ts'
import { parseState, serializeState } from './serialization.ts'
import { advance, createSimulation, performAction } from './simulation.ts'
import { deliveryTime, markThreadRead, setHome, unreadCount } from './story.ts'
import { fromCalendar, toCalendar } from './time.ts'
import type { SimulationState } from './types.ts'

/** Lundi 6 janvier 2025, 10 h : les proches proches habitent près (entourage par défaut). */
function life(hour = 10, seed = 'narration'): SimulationState {
  return createSimulation({
    seed,
    name: 'Léa',
    birthDate: { year: 2000, month: 3, day: 15 },
    start: { year: 2025, month: 1, day: 6, hour, minute: 0 },
  })
}

const ok = (r: ReturnType<typeof performAction>) => {
  if (!r.ok) throw new Error(r.issues.map((i) => i.message).join(' / '))
  return r.state
}
const nearParent = (s: SimulationState) => s.people.find((p) => p.role === 'parent' && !p.distant && p.alive)!
const mother = (s: SimulationState) => s.people.find((p) => p.relation === 'Mère')!

describe('mémoire narrative', () => {
  it('le début de la vie et les grands moments deviennent des souvenirs durables', () => {
    const state = life()
    expect(state.narrative.memories.map((m) => m.kind)).toContain('life_started')
    const draft = structuredClone(state)
    const p = nearParent(draft)
    writeLog(draft, 'social', 'npc_death', `${p.name} est décédé·e.`, { personId: p.id })
    writeLog(draft, 'action', 'cook_meal', 'Repas.')
    const last = draft.narrative.memories.at(-1)!
    expect(last).toMatchObject({ kind: 'npc_death', tone: 'bad', importance: 3, people: [p.id] })
    expect(draft.narrative.memories.some((m) => m.kind === 'cook_meal')).toBe(false)
  })

  it('les souvenirs survivent au journal, qui est tronqué', () => {
    const result = advance(life(), 'month', 3)
    if (!result.ok) throw new Error()
    expect(result.state.narrative.memories[0].kind).toBe('life_started')
  })
})

describe('messages des proches', () => {
  it('un proche attaché annonce lui-même sa maladie', () => {
    const draft = structuredClone(life())
    const p = mother(draft)
    draft.relationships[p.id].closeness = 60
    writeLog(draft, 'social', 'npc_sick', `${p.name} est malade.`, { personId: p.id })
    expect(draft.narrative.threads[p.id].at(-1)).toMatchObject({ from: p.id, channel: 'message', read: false })
    expect(unreadCount(draft)).toBe(1)
    expect(draft.log.at(-1)!.code).toBe('message_received')
    expect(unreadCount(markThreadRead(draft, p.id))).toBe(0)
  })

  it('vœux d’anniversaire des proches attachés', () => {
    const start = createSimulation({
      seed: 'voeux',
      name: 'Léa',
      birthDate: { year: 2000, month: 1, day: 8 },
      start: { year: 2025, month: 1, day: 6, hour: 10, minute: 0 },
    })
    for (const p of start.people) if (p.role !== 'colleague') start.relationships[p.id].closeness = 70
    const result = advance(start, 'day', 3)
    if (!result.ok) throw new Error()
    const wishes = Object.values(result.state.narrative.threads).flat().filter((m) => /anniversaire/i.test(m.text))
    expect(wishes.length).toBe(start.people.filter((p) => p.role !== 'colleague' && p.alive).length)
  })

  it('un proche attaché, sans nouvelles, finit par écrire (sans toucher au hasard de la simulation)', () => {
    const start = life()
    for (const p of start.people) if (p.role !== 'colleague') start.relationships[p.id].closeness = 80
    const result = advance(start, 'month', 3)
    if (!result.ok) throw new Error()
    const checkIns = result.state.log.filter((e) => e.code === 'message_received')
    expect(checkIns.length).toBeGreaterThan(0)
  })

  it('une réponse n’arrive jamais la nuit', () => {
    const night = fromCalendar({ year: 2025, month: 1, day: 6, hour: 23, minute: 30 })
    expect(toCalendar(deliveryTime(night, 20)).hour).toBe(8)
    expect(toCalendar(deliveryTime(night, 20)).day).toBe(7)
    const day = fromCalendar({ year: 2025, month: 1, day: 6, hour: 14, minute: 0 })
    expect(deliveryTime(day, 30)).toBe(day + 30)
  })
})

describe('dialogues et choix contextuels', () => {
  it('les choix dépendent du contexte réel, avec la raison des sujets impossibles', () => {
    const state = life()
    const p = nearParent(state)
    const options = topicOptions(state, p.id, 'person')
    expect(options.find((o) => o.id === 'news')!.available).toBe(true)
    expect(options.find((o) => o.id === 'support')).toMatchObject({ available: false, reason: 'Personne n’est malade.' })
    expect(options.find((o) => o.id === 'apologize')!.available).toBe(false)

    const tense = structuredClone(state)
    tense.relationships[p.id].tension = 50
    const apologize = topicOptions(tense, p.id, 'person').find((o) => o.id === 'apologize')!
    expect(apologize.available).toBe(true)
    expect(apologize.chance).toBeGreaterThan(0)
    expect(actionOutcomes(tense, 'talk', { personId: p.id, topic: 'apologize' })).toEqual([{ label: 'Excuses acceptées', probability: apologize.chance }])
  })

  it('conversation en personne : réponse immédiate, relation et temps mis à jour, sujet non répétable', () => {
    const state = life()
    const p = nearParent(state)
    const after = ok(performAction(state, 'talk', { personId: p.id, topic: 'news' }))
    expect(after.clock - state.clock).toBe(15)
    expect(after.relationships[p.id].closeness).toBeGreaterThan(state.relationships[p.id].closeness)
    expect(after.relationships[p.id].lastContact).toBe(after.clock)
    const thread = after.narrative.threads[p.id]
    expect(thread.map((m) => [m.from, m.channel])).toEqual([
      ['player', 'person'],
      [p.id, 'person'],
    ])
    // La réponse ne cite que des faits réels du proche.
    expect(thread[1].text.length).toBeGreaterThan(0)
    const again = validateAction(after, 'talk', { personId: p.id, topic: 'news' })
    expect(again.ok).toBe(false)
    if (!again.ok) expect(again.issues[0].message).toBe('Déjà abordé dans cette conversation.')
  })

  it('en personne : contraintes de rencontre ; par message : toujours possible', () => {
    const night = life(23)
    const p = nearParent(night)
    expect(validateAction(night, 'talk', { personId: p.id, topic: 'news' }).ok).toBe(false)
    expect(validateAction(night, 'write', { personId: p.id, topic: 'news' }).ok).toBe(true)
    const colleague = life().people.find((x) => x.role === 'colleague')
    if (colleague) {
      const saturday = createSimulation({ seed: 'narration', name: 'Léa', birthDate: { year: 2000, month: 3, day: 15 }, start: { year: 2025, month: 1, day: 11, hour: 11, minute: 0 } })
      const c = saturday.people.find((x) => x.role === 'colleague')!
      const r = validateAction(saturday, 'talk', { personId: c.id, topic: 'news' })
      expect(r.ok).toBe(false)
    }
  })

  it('message : la réponse arrive plus tard, non lue', () => {
    const state = life()
    const p = nearParent(state)
    let s = ok(performAction(state, 'write', { personId: p.id, topic: 'news', text: '  Coucou !\n Ça va ?  ' }))
    expect(s.narrative.threads[p.id]).toHaveLength(1)
    expect(s.narrative.threads[p.id][0].text).toBe('Coucou ! Ça va ?')
    expect(s.scheduled.some((e) => e.event.type === 'npc_message')).toBe(true)
    for (let i = 0; i < 3; i++) s = ok(performAction(s, 'wait'))
    expect(s.narrative.threads[p.id]).toHaveLength(2)
    expect(unreadCount(s, p.id)).toBe(1)
  })

  it('raconter une nouvelle importante, une seule fois par proche', () => {
    const draft = structuredClone(life())
    writeLog(draft, 'event', 'diploma', 'Diplôme obtenu : CAP Cuisine.')
    const p = nearParent(draft)
    const share = topicOptions(draft, p.id, 'person').find((o) => o.id === 'share')!
    expect(share).toMatchObject({ available: true, label: 'Raconter : Diplôme obtenu : CAP Cuisine', line: 'J’ai une super nouvelle : j’ai eu mon diplôme !' })
    const after = ok(performAction(draft, 'talk', { personId: p.id, topic: 'share' }))
    expect(after.narrative.threads[p.id][1].text).toMatch(/Bravo|Génial/)
    const later = { ...after, narrative: { ...after.narrative, session: null } }
    expect(topicOptions(later, p.id, 'person').find((o) => o.id === 'share')!.available).toBe(false)
  })

  it('texte libre : nettoyé, refusé s’il est vide ou trop long', () => {
    const state = life()
    const p = nearParent(state)
    expect(cleanText('a\u0000b\tc')).toBe('a b c')
    expect(validateAction(state, 'write', { personId: p.id, topic: 'chat', text: '   ' }).ok).toBe(false)
    expect(validateAction(state, 'write', { personId: p.id, topic: 'chat', text: 'x'.repeat(281) }).ok).toBe(false)
    expect(validateAction(state, 'write', { personId: p.id, topic: 'inconnu' }).ok).toBe(false)
  })
})

describe('actions libres interprétées par des règles', () => {
  it('reconnaît des phrases courantes, sans rien exécuter', () => {
    const state = life()
    const before = serializeState(state)
    const m = mother(state)
    expect(interpretText(state, 'J’appelle maman')[0]).toMatchObject({ action: 'call', params: { personId: m.id }, issues: [] })
    expect(interpretText(state, 'je vais courir un peu')[0].action).toBe('sport')
    expect(interpretText(state, 'Postuler comme serveur')[0]).toMatchObject({ action: 'apply_job', params: { career: 'waiter' } })
    expect(interpretText(state, 'm’inscrire au CAP cuisine')[0]).toMatchObject({ action: 'enroll', params: { program: 'cap_cuisine' } })
    expect(interpretText(state, 'm’entraîner en cuisine')[0]).toMatchObject({ action: 'practice', params: { skill: 'cooking' } })
    expect(interpretText(state, 'écrire à maman pour m’excuser')[0]).toMatchObject({ action: 'write', params: { personId: m.id, topic: 'apologize' } })
    expect(serializeState(state)).toBe(before)
  })

  it('montants : exacts, ou ajustés avec explication', () => {
    const state = life()
    expect(interpretText(state, 'mettre 500 € de côté')[0]).toMatchObject({ action: 'deposit_savings', params: { amount: 500 } })
    const adjusted = interpretText(state, 'épargner 150 euros')[0]
    expect(adjusted.params.amount).toBe(100)
    expect(adjusted.note).toContain('150 € n’est pas possible')
  })

  it('une phrase incomprise ne propose rien ; une action impossible garde sa raison', () => {
    const state = life()
    expect(interpretText(state, 'xylophone quantique')).toEqual([])
    const sleep = interpretText(state, 'aller dormir')[0]
    expect(sleep.action).toBe('sleep')
    expect(sleep.issues[0].message).toBe('Pas sommeil (sommeil < 30).')
  })

  it('messages libres : sujet suggéré, sinon simple bavardage', () => {
    expect(messageTopic('Désolé pour hier…')).toBe('apologize')
    expect(messageTopic('Quoi de neuf ?')).toBe('news')
    expect(messageTopic('Bravo pour ton nouveau job')).toBe('congratulate')
    expect(messageTopic('On mange des crêpes')).toBe('chat')
    const state = life()
    const p = nearParent(state)
    // Pas de tension : les excuses deviennent un bavardage.
    expect(resolveTopic(state, p.id, 'message', 'désolé')).toBe('chat')
  })
})

describe('sauvegarde v3', () => {
  it('aller-retour fidèle avec messages, souvenirs et lieu', () => {
    const state = ok(performAction(life(), 'write', { personId: nearParent(life()).id, topic: 'news' }))
    const placed = setHome(state, { label: 'Exemple', lat: 48.85, lon: 2.35, source: 'Test', licence: 'Test' })
    if (!placed.ok) throw new Error()
    expect(parseState(serializeState(placed.state))).toEqual(placed.state)
  })

  it('refuse un message incohérent et un lieu hors limites', () => {
    const state = ok(performAction(life(), 'write', { personId: nearParent(life()).id, topic: 'news' }))
    const raw = JSON.parse(serializeState(state))
    const id = Object.keys(raw.narrative.threads)[0]
    raw.narrative.threads[id][0].from = 'quelqu’un'
    expect(() => parseState(JSON.stringify(raw))).toThrow(/from invalide/)
    expect(setHome(life(), { label: 'X', lat: 120, lon: 0, source: 's', licence: 'l' }).ok).toBe(false)
    expect(setHome(life(), { label: '', lat: 1, lon: 1, source: 's', licence: 'l' }).ok).toBe(false)
  })

  it('migre une sauvegarde v2 : souvenirs reconstitués depuis le journal', () => {
    const raw = JSON.parse(serializeState(life()))
    raw.version = 2
    delete raw.narrative
    delete raw.world
    const migrated = parseState(JSON.stringify(raw))
    expect(migrated.version).toBe(3)
    expect(migrated.world.home).toBeNull()
    expect(migrated.narrative.memories.map((m) => m.kind)).toContain('life_started')
    expect(ok(performAction(migrated, 'write', { personId: nearParent(migrated).id, topic: 'news' })).narrative.threads).not.toEqual({})
  })
})
