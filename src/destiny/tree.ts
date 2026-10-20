/**
 * Structure de l'arbre : construction, ascendance, contrôles de cohérence.
 * Fonctions pures, sans accès au stockage.
 */
import type { BranchRecord, SnapshotRecord, TreeRecord } from './types.ts'

export interface TreeNode {
  branch: BranchRecord
  depth: number
  children: TreeNode[]
}

/** Arbre des branches, enfants triés par date de divergence puis de création. */
export function buildTree(rootId: string, branches: BranchRecord[]): TreeNode | null {
  const byParent = new Map<string, BranchRecord[]>()
  for (const b of branches) {
    if (b.parentId) byParent.set(b.parentId, [...(byParent.get(b.parentId) ?? []), b])
  }
  const root = branches.find((b) => b.id === rootId)
  if (!root) return null
  const visit = (branch: BranchRecord, depth: number, seen: Set<string>): TreeNode => {
    seen.add(branch.id)
    const children = (byParent.get(branch.id) ?? [])
      .filter((c) => !seen.has(c.id))
      .sort((a, b) => (a.divergence?.at ?? 0) - (b.divergence?.at ?? 0) || a.createdAt - b.createdAt)
    return { branch, depth, children: children.map((c) => visit(c, depth + 1, seen)) }
  }
  return visit(root, 0, new Set())
}

/** Liste à plat, dans l'ordre d'affichage (parcours en profondeur). */
export function flatten(node: TreeNode | null): TreeNode[] {
  if (!node) return []
  return [node, ...node.children.flatMap(flatten)]
}

/** Chemin de la racine jusqu'à la branche (incluse). */
export function ancestry(branches: BranchRecord[], id: string): BranchRecord[] {
  const byId = new Map(branches.map((b) => [b.id, b]))
  const path: BranchRecord[] = []
  for (let b = byId.get(id); b && path.length <= branches.length; b = b.parentId ? byId.get(b.parentId) : undefined) {
    path.unshift(b)
  }
  return path
}

export function childrenOf(branches: BranchRecord[], id: string): BranchRecord[] {
  return branches.filter((b) => b.parentId === id)
}

/**
 * Problèmes de structure (liste vide = cohérent) : racine unique, parents existants,
 * absence de cycle, instantanés rattachés à la bonne branche, divergences datées
 * sur un instantané du parent.
 */
export function structureIssues(
  tree: TreeRecord,
  branches: BranchRecord[],
  snapshots: Pick<SnapshotRecord, 'id' | 'branchId' | 'treeId' | 'kind' | 'clock'>[],
): string[] {
  const issues: string[] = []
  const branchById = new Map(branches.map((b) => [b.id, b]))
  const snapById = new Map(snapshots.map((s) => [s.id, s]))

  const roots = branches.filter((b) => b.parentId === null)
  if (roots.length !== 1 || roots[0].id !== tree.rootBranchId) issues.push('L’arbre doit avoir exactement une racine, celle déclarée.')
  if (!branchById.has(tree.currentBranchId)) issues.push('La branche courante n’existe pas.')

  for (const b of branches) {
    if (b.treeId !== tree.id) issues.push(`Branche « ${b.name} » rattachée à un autre arbre.`)
    if (b.parentId !== null && !branchById.has(b.parentId)) issues.push(`Branche « ${b.name} » : parent introuvable.`)
    // Remonter les parents ne doit jamais revenir sur la branche elle-même.
    let steps = 0
    for (let p = b.parentId ? branchById.get(b.parentId) : undefined; p; p = p.parentId ? branchById.get(p.parentId) : undefined) {
      if (p.id === b.id || ++steps > branches.length) {
        issues.push(`Branche « ${b.name} » : cycle dans l’ascendance.`)
        break
      }
    }
    const head = snapById.get(b.headSnapshotId)
    if (!head || head.branchId !== b.id || head.kind !== 'head') issues.push(`Branche « ${b.name} » : instantané courant manquant.`)
    const origin = snapshots.find((s) => s.branchId === b.id && s.kind === 'origin')
    if (!origin) issues.push(`Branche « ${b.name} » : instantané d’origine manquant.`)
    if (head && origin && head.clock < origin.clock) issues.push(`Branche « ${b.name} » : l’état courant précède son origine.`)

    if ((b.parentId === null) !== (b.divergence === null)) issues.push(`Branche « ${b.name} » : point de divergence incohérent.`)
    if (b.divergence && b.parentId) {
      const from = snapById.get(b.divergence.fromSnapshotId)
      if (!from || from.branchId !== b.parentId) issues.push(`Branche « ${b.name} » : divergence hors de la branche parent.`)
      else if (from.clock !== b.divergence.at) issues.push(`Branche « ${b.name} » : date de divergence incohérente.`)
    }
  }
  for (const s of snapshots) {
    if (!branchById.has(s.branchId) || s.treeId !== tree.id) issues.push(`Instantané orphelin (${s.id}).`)
  }
  return issues
}
