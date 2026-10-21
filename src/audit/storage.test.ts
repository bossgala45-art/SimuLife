/**
 * Sauvegardes et branches sur une longue vie : sauvegarde chaque mois, points de
 * reprise limités, intégrité, branche depuis le passé, export puis import fidèles,
 * reprise après fermeture.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { newId } from '../destiny/checksum.ts'
import { advance, createSimulation, serializeState } from '../engine/index.ts'
import { checkInvariants } from '../engine/invariants.ts'
import { DestinyRepository, MAX_CHECKPOINTS } from '../storage/destiny.ts'

const LONG = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.SIMULIFE_AUDIT === '1'
let repos: DestinyRepository[] = []
afterEach(() => {
  repos.forEach((r) => r.close())
  repos = []
})
const open = (name: string) => {
  const r = new DestinyRepository(name)
  repos.push(r)
  return r
}

describe('sauvegardes et branches sur une longue vie', () => {
  it(`${LONG ? 10 : 3} ans sauvegardés mois par mois, puis branche, export, import, reprise`, async () => {
    const name = `audit-${newId()}`
    const repo = open(name)
    let session = await repo.createTree({ name: 'Audit', state: createSimulation({ seed: 'audit-sauvegarde', name: 'Léa', birthDate: { year: 1995, month: 6, day: 1 } }) })
    const months = (LONG ? 10 : 3) * 12
    const t0 = performance.now()
    for (let m = 0; m < months; m++) {
      const r = advance(session.state, 'month')
      if (!r.ok) break
      session = await repo.save(session, r.state)
    }
    const saveMs = Math.round((performance.now() - t0) / months)

    const snapshots = await repo.listSnapshots(session.branchId)
    expect(snapshots.filter((s) => s.kind === 'checkpoint').length).toBeLessThanOrEqual(MAX_CHECKPOINTS)
    expect(await repo.verifyTree(session.treeId)).toEqual([])

    // Reprise après « fermeture » : même état, à l'octet près.
    repo.close()
    const reopened = open(name)
    const resumed = await reopened.openBranch(session.branchId)
    expect(serializeState(resumed.state)).toBe(serializeState(session.state))
    expect(checkInvariants(resumed.state, { roundTrip: true })).toEqual([])

    // Branche depuis un instant passé, vécue un an.
    const past = (await reopened.listSnapshots(session.branchId)).find((s) => s.kind === 'checkpoint')!
    let fork = await reopened.fork({ fromSnapshotId: past.id, decision: { kind: 'reroll' } })
    for (let m = 0; m < 12; m++) {
      const r = advance(fork.state, 'month')
      if (!r.ok) break
      fork = await reopened.save(fork, r.state)
    }
    // Le journal a tourné en un an ; la divergence reste dans la mémoire narrative.
    expect(fork.state.narrative.memories.some((m) => m.kind === 'divergence')).toBe(true)
    expect(await reopened.verifyTree(session.treeId)).toEqual([])

    // Export, import : mêmes branches, mêmes états, intégrité intacte.
    const json = await reopened.exportTree(session.treeId)
    const imported = await reopened.importTree(json)
    expect(await reopened.verifyTree(imported.id)).toEqual([])
    const original = await reopened.listBranches(session.treeId)
    const copy = await reopened.listBranches(imported.id)
    expect(copy.map((b) => b.name).sort()).toEqual(original.map((b) => b.name).sort())
    const copyRoot = copy.find((b) => b.parentId === null)!
    expect(serializeState((await reopened.openBranch(copyRoot.id)).state)).toBe(serializeState(resumed.state))

    console.info(JSON.stringify({ months, saveMsPerMonth: saveMs, exportBytes: json.length, snapshots: snapshots.length }))
  }, 600_000)
})
