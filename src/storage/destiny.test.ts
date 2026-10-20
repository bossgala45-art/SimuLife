/**
 * Tests obligatoires de l'arbre des destins, sur le vrai dépôt Dexie
 * (IndexedDB simulé par fake-indexeddb).
 */
import type Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { newId, sha256 } from '../destiny/checksum.ts'
import { DestinyError } from '../destiny/errors.ts'
import type { SnapshotRecord } from '../destiny/types.ts'
import { advance } from '../engine/simulation.ts'
import { ageAt, toCalendar } from '../engine/time.ts'
import { dt, newLife, ok } from '../engine/testing.ts'
import { DestinyRepository, MAX_CHECKPOINTS, migrateLegacyGame, type BranchSession } from './destiny.ts'

let dbName: string
let repo: DestinyRepository
let time: number

beforeEach(() => {
  dbName = `test-${newId()}`
  time = 1_700_000_000_000
  repo = new DestinyRepository(dbName, () => time++)
})
afterEach(() => repo.close())

/** Accès direct à la base, pour simuler une corruption ou un autre onglet. */
const rawDb = (r: DestinyRepository) => (r as unknown as { db: Dexie & { snapshots: Dexie.Table<SnapshotRecord, string> } }).db

async function expectError(promise: Promise<unknown>, code: DestinyError['code']): Promise<DestinyError> {
  try {
    await promise
  } catch (e) {
    expect(e).toBeInstanceOf(DestinyError)
    expect((e as DestinyError).code).toBe(code)
    return e as DestinyError
  }
  throw new Error(`Erreur ${code} attendue`)
}

/** Joue la branche pendant `months` mois en sauvegardant chaque mois. */
async function play(session: BranchSession, months: number): Promise<BranchSession> {
  let s = session
  for (let i = 0; i < months; i++) s = await repo.save(s, ok(advance(s.state, 'month')))
  return s
}

const life = () => newLife({ seed: 'arbre', start: dt(6, 7), money: 2000 })

describe('création de branches', () => {
  it('crée une vie avec sa racine, son origine et son état courant', async () => {
    const session = await repo.createTree({
      name: 'Ma vie',
      state: life(),
      declaredPast: [{ label: 'Naissance', when: '15 mars 2000' }],
    })
    const tree = await repo.getTree(session.treeId)
    expect(tree).toMatchObject({ name: 'Ma vie', rootBranchId: session.branchId, currentBranchId: session.branchId })
    expect(tree.declaredPast).toEqual([{ label: 'Naissance', when: '15 mars 2000' }])
    expect((await repo.listSnapshots(session.branchId)).map((s) => s.kind)).toEqual(['origin', 'head'])
    expect((await repo.history(session.treeId))[0].type).toBe('tree_created')
    expect(await repo.verifyTree(session.treeId)).toEqual([])
  })

  it('crée une branche datée depuis l’état courant, avec sa décision', async () => {
    const root = await play(await repo.createTree({ name: 'Ma vie', state: life() }), 2)
    const child = await repo.forkFromHead(root.branchId, { kind: 'career', career: 'waiter' })
    const branch = await repo.getBranch(child.branchId)
    expect(branch).toMatchObject({ parentId: root.branchId, name: 'Accepter un poste : Serveur·se', revision: 0, locked: false })
    expect(branch.divergence).toMatchObject({ at: root.state.clock, label: 'Accepter un poste : Serveur·se', decision: { kind: 'career', career: 'waiter' } })
    // Le point de divergence est un instantané figé du parent, pas son état courant (qui continuera d'avancer).
    const anchor = (await repo.listSnapshots(root.branchId)).find((s) => s.id === branch.divergence!.fromSnapshotId)!
    expect(anchor.kind).toBe('checkpoint')
    expect(child.state.career.job!.career).toBe('waiter')
    expect(branch.summary).toMatchObject({ occupation: 'Serveur·se', age: 24, alive: true, clock: root.state.clock })
    expect(child.state.log.at(-1)!.code).toBe('divergence')
    expect((await repo.getTree(root.treeId)).currentBranchId).toBe(child.branchId)
    expect(await repo.verifyTree(root.treeId)).toEqual([])
  })

  it('peut bifurquer depuis un instant passé de n’importe quelle branche', async () => {
    const root = await play(await repo.createTree({ name: 'Ma vie', state: life() }), 3)
    const past = (await repo.listSnapshots(root.branchId)).find((s) => s.kind === 'checkpoint')!
    expect(past.clock).toBeLessThan(root.state.clock)
    const child = await repo.fork({ fromSnapshotId: past.id, decision: { kind: 'reroll' }, name: 'Et si…' })
    expect(child.state.clock).toBe(past.clock)
    expect((await repo.getBranch(child.branchId)).divergence!.at).toBe(past.clock)
  })

  it('refuse une décision impossible sans rien écrire', async () => {
    const root = await repo.createTree({ name: 'Ma vie', state: life() })
    const error = await expectError(repo.forkFromHead(root.branchId, { kind: 'career', career: 'cook' }), 'INVALID_DECISION')
    expect(error.detail).toMatch(/CAP Cuisine/)
    expect(await repo.listBranches(root.treeId)).toHaveLength(1)
  })
})

describe('reprise d’une branche', () => {
  it('reprend chaque branche avec son propre état', async () => {
    const root = await play(await repo.createTree({ name: 'Ma vie', state: life() }), 1)
    const child = await play(await repo.forkFromHead(root.branchId, { kind: 'quit_job' }), 2)

    const resumedRoot = await repo.openBranch(root.branchId)
    expect(resumedRoot.state).toEqual(root.state)
    expect(resumedRoot.revision).toBe(root.revision)
    expect((await repo.getTree(root.treeId)).currentBranchId).toBe(root.branchId)

    const resumedChild = await repo.openBranch(child.branchId)
    expect(resumedChild.state).toEqual(child.state)
    expect(resumedChild.state.log.some((e) => e.message === 'Divergence : Quitter son emploi.')).toBe(true)
    expect((await repo.history(root.treeId)).map((h) => h.type)).toContain('resumed')
  })
})

describe('sauvegarde et rechargement', () => {
  it('retrouve exactement l’état après fermeture de la base', async () => {
    const saved = await play(await repo.createTree({ name: 'Ma vie', state: life() }), 2)
    repo.close()
    const reopened = new DestinyRepository(dbName)
    try {
      const session = await reopened.openBranch(saved.branchId)
      expect(session.state).toEqual(saved.state)
      expect(session.revision).toBe(2)
      expect((await reopened.listTrees()).map((t) => t.name)).toEqual(['Ma vie'])
    } finally {
      reopened.close()
    }
  })

  it('refuse les sauvegardes dangereuses avec une erreur explicite', async () => {
    const first = await repo.createTree({ name: 'Ma vie', state: life() })
    const later = ok(advance(first.state, 'day'))
    const second = await repo.save(first, later)

    // Session périmée (autre onglet, sauvegarde en retard).
    await expectError(repo.save(first, ok(advance(later, 'day'))), 'CONFLICT')
    // Retour dans le passé.
    await expectError(repo.save(second, first.state), 'TIME_TRAVEL')
    // Branche protégée.
    await repo.setLocked(second.branchId, true)
    await expectError(repo.save(second, ok(advance(later, 'day'))), 'LOCKED')
    await repo.setLocked(second.branchId, false)
    expect((await repo.save(second, ok(advance(later, 'day')))).revision).toBe(2)
  })

  it('détecte un instantané abîmé et restaure le dernier instantané intact', async () => {
    const saved = await play(await repo.createTree({ name: 'Ma vie', state: life() }), 2)
    const branch = await repo.getBranch(saved.branchId)
    const head = await rawDb(repo).snapshots.get(branch.headSnapshotId)
    await rawDb(repo).snapshots.put({ ...head!, data: head!.data.replace('"money":', '"money": 999999, "x":') })

    const error = await expectError(repo.openBranch(saved.branchId), 'INTEGRITY')
    expect(error.detail).toMatch(/empreinte/)
    expect((await repo.verifyTree(saved.treeId)).length).toBeGreaterThan(0)

    const restored = await repo.restoreLatestValid(saved.branchId)
    expect(restored.state.clock).toBeLessThanOrEqual(saved.state.clock)
    expect(await repo.verifyTree(saved.treeId)).toEqual([])
  })

  it('migre l’ancienne sauvegarde unique en nouvelle vie', async () => {
    let cleared = false
    const state = life()
    const session = await migrateLegacyGame(repo, { load: () => ({ status: 'loaded', state }), clear: () => (cleared = true) })
    expect(session!.state).toEqual(state)
    expect(cleared).toBe(true)
    expect(await migrateLegacyGame(repo, { load: () => ({ status: 'empty' }), clear: () => {} })).toBeNull()
  })
})

describe('indépendance des branches', () => {
  it('jouer une branche ne modifie jamais une autre', async () => {
    const root = await play(await repo.createTree({ name: 'Ma vie', state: life() }), 1)
    const rootRecord = await repo.getBranch(root.branchId)
    // La création ajoute au parent un instantané figé (le point de divergence), sans toucher à son état.
    const forked = await repo.forkFromHead(root.branchId, { kind: 'reroll' })
    const rootSnapshots = await repo.listSnapshots(root.branchId)

    const child = await play(forked, 3)
    expect(await repo.getBranch(root.branchId)).toEqual(rootRecord)
    expect(await repo.listSnapshots(root.branchId)).toEqual(rootSnapshots)
    expect((await repo.openBranch(root.branchId)).state).toEqual(root.state)

    // Et inversement : la branche parent continue sans toucher à l'enfant.
    const childRecord = await repo.getBranch(child.branchId)
    await play(await repo.openBranch(root.branchId), 2)
    expect(await repo.getBranch(child.branchId)).toEqual(childRecord)
  })

  it('deux branches nées du même instant ont des avenirs différents', async () => {
    const root = await repo.createTree({ name: 'Ma vie', state: life() })
    const a = await play(await repo.forkFromHead(root.branchId, { kind: 'reroll' }, 'A'), 6)
    const b = await play(await repo.forkFromHead(root.branchId, { kind: 'reroll' }, 'B'), 6)
    expect(a.state.clock).toBe(b.state.clock)
    expect(a.state.rngState).not.toBe(b.state.rngState)
    expect(a.state.log.map((e) => e.message)).not.toEqual(b.state.log.map((e) => e.message))
  })

  it('une session ne peut écrire que dans sa propre branche', async () => {
    const root = await repo.createTree({ name: 'Ma vie', state: life() })
    const child = await repo.forkFromHead(root.branchId, { kind: 'reroll' })
    const childRevision = (await repo.getBranch(child.branchId)).revision
    await repo.save(root, ok(advance(root.state, 'day')))
    expect((await repo.getBranch(child.branchId)).revision).toBe(childRevision)
    await repo.deleteBranch(child.branchId)
    await expectError(repo.save(child, ok(advance(child.state, 'day'))), 'NOT_FOUND')
  })

  it('protège la structure : ni racine ni branche avec descendance supprimées', async () => {
    const root = await repo.createTree({ name: 'Ma vie', state: life() })
    const child = await repo.forkFromHead(root.branchId, { kind: 'reroll' })
    await repo.forkFromHead(child.branchId, { kind: 'reroll' })
    await expectError(repo.deleteBranch(root.branchId), 'FORBIDDEN')
    await expectError(repo.deleteBranch(child.branchId), 'FORBIDDEN')
  })
})

describe('import et export', () => {
  async function exampleTree() {
    const root = await play(await repo.createTree({ name: 'Ma vie', state: life(), declaredPast: [{ label: 'Naissance', when: '2000' }] }), 2)
    await play(await repo.forkFromHead(root.branchId, { kind: 'quit_job' }, 'Sans emploi'), 1)
    return root
  }

  it('réimporte une vie exportée sous de nouveaux identifiants', async () => {
    const root = await exampleTree()
    const json = await repo.exportTree(root.treeId)
    expect(JSON.parse(json)).toMatchObject({ format: 'simulife-destiny', version: 1 })

    const imported = await repo.importTree(json)
    expect(imported.id).not.toBe(root.treeId)
    expect(imported.name).toBe('Ma vie (importée)')
    expect(imported.declaredPast).toEqual([{ label: 'Naissance', when: '2000' }])
    const original = await repo.listBranches(root.treeId)
    const copy = await repo.listBranches(imported.id)
    expect(copy.map((b) => b.name).sort()).toEqual(original.map((b) => b.name).sort())
    expect(copy.every((b) => !original.some((o) => o.id === b.id))).toBe(true)
    for (const b of copy) {
      const twin = original.find((o) => o.name === b.name)!
      expect((await repo.openBranch(b.id)).state).toEqual((await repo.openBranch(twin.id)).state)
    }
    expect(await repo.verifyTree(imported.id)).toEqual([])
  })

  it('refuse un fichier invalide sans rien écrire', async () => {
    const root = await exampleTree()
    const json = await repo.exportTree(root.treeId)
    const before = (await repo.listTrees()).length
    const mutate = (fn: (raw: ReturnType<typeof JSON.parse>) => void) => {
      const raw = JSON.parse(json)
      fn(raw)
      return JSON.stringify(raw)
    }
    const cases: [string, RegExp][] = [
      ['pas du json', /pas du JSON/],
      [JSON.stringify({ format: 'autre' }), /pas un export SIMULIFE/],
      [mutate((r) => (r.version = 2)), /version plus récente/],
      [mutate((r) => (r.snapshots[0].data = r.snapshots[0].data.replace('"money":', '"money":1,"y":'))), /empreinte incorrecte/],
      [mutate((r) => (r.branches = r.branches.filter((b: { parentId: string | null }) => b.parentId !== null))), /instantané orphelin|exactement une racine|Instantané orphelin/i],
      [mutate((r) => (r.branches[1].parentId = r.branches[1].id)), /cycle|exactement une racine|parent/],
      [mutate((r) => delete r.tree.name), /tree\.name/],
    ]
    for (const [content, message] of cases) {
      const error = await expectError(repo.importTree(content), 'INVALID_IMPORT')
      expect(error.detail).toMatch(message)
    }
    // Contenu falsifié AVEC empreinte recalculée : l'état lui-même est vérifié.
    const raw = JSON.parse(json)
    raw.snapshots[0].data = JSON.stringify({ ...JSON.parse(raw.snapshots[0].data), clock: 1.5 })
    raw.snapshots[0].checksum = await sha256(raw.snapshots[0].data)
    expect((await expectError(repo.importTree(JSON.stringify(raw)), 'INVALID_IMPORT')).detail).toMatch(/état illisible/)
    expect((await repo.listTrees()).length).toBe(before)
  })
})

describe('simulation de plusieurs années', () => {
  it('trois ans sur la racine, deux ans sur une branche née après un an', async () => {
    let root = await repo.createTree({ name: 'Longue vie', state: life() })
    root = await play(root, 12)
    const anchor = await repo.forkFromHead(root.branchId, { kind: 'move', near: true }, 'Retour près de la famille')
    const anchorId = (await repo.getBranch(anchor.branchId)).divergence!.fromSnapshotId
    root = await play(await repo.openBranch(root.branchId), 24)
    const child = await play(await repo.openBranch(anchor.branchId), 24)

    // Les deux vies arrivent au même jour (6 janvier 2028), par des chemins différents.
    expect(toCalendar(root.state.clock)).toMatchObject({ year: 2028, month: 1, day: 6 })
    expect(child.state.clock).toBe(root.state.clock)
    expect(ageAt(root.state.character.birthDate, root.state.clock)).toBe(27)
    expect(root.state.character.alive && child.state.character.alive).toBe(true)
    // Le journal ne garde que les dernières entrées ; le point de divergence, lui, est conservé dans la branche.
    expect((await repo.getBranch(child.branchId)).divergence!.label).toBe('Se rapprocher de sa famille')

    // Instantanés limités, mais le point de divergence est toujours conservé.
    const rootSnaps = await repo.listSnapshots(root.branchId)
    expect(rootSnaps.filter((s) => s.kind === 'checkpoint').length).toBeLessThanOrEqual(MAX_CHECKPOINTS + 1)
    expect(rootSnaps.some((s) => s.id === anchorId)).toBe(true)

    expect(await repo.verifyTree(root.treeId)).toEqual([])
    repo.close()
    const reopened = new DestinyRepository(dbName)
    try {
      expect((await reopened.openBranch(child.branchId)).state).toEqual(child.state)
      expect((await reopened.openBranch(root.branchId)).state).toEqual(root.state)
    } finally {
      reopened.close()
    }
  }, 60_000)
})

describe('poids des instantanés', () => {
  it('allège le journal des instantanés intermédiaires, pas leur état', async () => {
    const root = await play(await repo.createTree({ name: 'Ma vie', state: life() }), 8)
    const checkpoint = (await repo.listSnapshots(root.branchId)).filter((s) => s.kind === 'checkpoint').at(-1)!
    const { state } = await repo.readSnapshot(checkpoint.id)
    expect(state.log.length).toBeLessThanOrEqual(300)
    expect(root.state.log.length).toBeGreaterThan(300)
    // Tout le reste de l'état est identique à ce qu'il était à cet instant.
    const child = await repo.fork({ fromSnapshotId: checkpoint.id, decision: { kind: 'reroll' } })
    expect(child.state.clock).toBe(checkpoint.clock)
    expect(await repo.verifyTree(root.treeId)).toEqual([])
  })
})
