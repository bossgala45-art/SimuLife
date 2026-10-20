import { describe, expect, it } from 'vitest'
import { lifeTitle } from './summary.ts'
import { ancestry, buildTree, flatten, structureIssues } from './tree.ts'
import type { BranchRecord, SnapshotRecord, TreeRecord } from './types.ts'

const branch = (id: string, parentId: string | null, at = 0, createdAt = 0): BranchRecord => ({
  id,
  treeId: 't',
  parentId,
  name: id,
  createdAt,
  updatedAt: createdAt,
  divergence: parentId ? { at, fromSnapshotId: `cp-${id}`, decision: { kind: 'reroll' }, label: 'x' } : null,
  headSnapshotId: `head-${id}`,
  revision: 0,
  locked: false,
  summary: { clock: 0, characterName: 'Léa', age: 25, money: 0, occupation: 'x', alive: true },
})
const snaps = (branches: BranchRecord[]): Pick<SnapshotRecord, 'id' | 'branchId' | 'treeId' | 'kind' | 'clock'>[] =>
  branches.flatMap((b) => [
    { id: `origin-${b.id}`, branchId: b.id, treeId: 't', kind: 'origin' as const, clock: b.divergence?.at ?? 0 },
    { id: `head-${b.id}`, branchId: b.id, treeId: 't', kind: 'head' as const, clock: 1000 },
    ...branches
      .filter((c) => c.parentId === b.id)
      .map((c) => ({ id: `cp-${c.id}`, branchId: b.id, treeId: 't', kind: 'checkpoint' as const, clock: c.divergence!.at })),
  ])
const tree: TreeRecord = { id: 't', name: 'Vie', createdAt: 0, updatedAt: 0, rootBranchId: 'r', currentBranchId: 'r', declaredPast: [] }

describe('structure de l’arbre', () => {
  const branches = [branch('r', null), branch('b', 'r', 200, 2), branch('a', 'r', 100, 3), branch('c', 'a', 150, 4)]

  it('ordonne les branches par date de divergence', () => {
    expect(flatten(buildTree('r', branches)).map((n) => `${'-'.repeat(n.depth)}${n.branch.id}`)).toEqual(['r', '-a', '--c', '-b'])
    expect(ancestry(branches, 'c').map((b) => b.id)).toEqual(['r', 'a', 'c'])
  })

  it('accepte un arbre cohérent', () => {
    expect(structureIssues(tree, branches, snaps(branches))).toEqual([])
  })

  it('détecte parent manquant, cycle, divergence hors du parent', () => {
    const missingParent = [...branches.slice(0, 3), { ...branches[3], parentId: 'z' }]
    expect(structureIssues(tree, missingParent, snaps(branches))).toContain('Branche « c » : parent introuvable.')

    const cycle = [branches[0], { ...branches[1], parentId: 'a' }, { ...branches[2], parentId: 'b' }]
    expect(structureIssues(tree, cycle, snaps(branches)).some((i) => i.includes('cycle'))).toBe(true)

    const wrongAnchor = snaps(branches).map((s) => (s.id === 'cp-c' ? { ...s, branchId: 'r' } : s))
    expect(structureIssues(tree, branches, wrongAnchor)).toContain('Branche « c » : divergence hors de la branche parent.')
  })
})

describe('nom des vies', () => {
  it('élide devant une voyelle', () => {
    expect(lifeTitle('Alex')).toBe('Vie d’Alex')
    expect(lifeTitle('Élodie')).toBe('Vie d’Élodie')
    expect(lifeTitle('Léa')).toBe('Vie de Léa')
  })
})
