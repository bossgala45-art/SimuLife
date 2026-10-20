/**
 * Import / export versionné d'un arbre (fichier JSON).
 *
 * L'import vérifie tout avant d'écrire quoi que ce soit : format, version,
 * forme des enregistrements, empreinte SHA-256 de chaque instantané,
 * validité de chaque état de simulation, cohérence de l'arbre.
 * Les identifiants sont renouvelés : un import ne remplace jamais une vie existante.
 */
import { parseState } from '../engine/serialization.ts'
import { newId, sha256 } from './checksum.ts'
import { DestinyError } from './errors.ts'
import { structureIssues } from './tree.ts'
import type { BranchRecord, Decision, HistoryRecord, SnapshotRecord, TreeRecord } from './types.ts'

export const EXPORT_FORMAT = 'simulife-destiny'
export const EXPORT_VERSION = 1
/** Garde-fou contre un fichier démesuré (50 Mo). */
export const MAX_IMPORT_BYTES = 50 * 1024 * 1024

export interface TreeExport {
  format: typeof EXPORT_FORMAT
  version: typeof EXPORT_VERSION
  exportedAt: string
  tree: TreeRecord
  branches: BranchRecord[]
  snapshots: SnapshotRecord[]
  history: HistoryRecord[]
}

const fail = (detail: string) => new DestinyError('INVALID_IMPORT', `Fichier invalide : ${detail}.`)
type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown, path: string) => {
  if (typeof v !== 'string' || v.length === 0) throw fail(`${path} doit être un texte`)
}
const int = (v: unknown, path: string) => {
  if (!Number.isSafeInteger(v)) throw fail(`${path} doit être un entier`)
}
const list = (v: unknown, path: string): unknown[] => {
  if (!Array.isArray(v)) throw fail(`${path} doit être une liste`)
  return v
}

const DECISION_KINDS = ['reroll', 'career', 'quit_job', 'study', 'move', 'reconnect']

function checkTree(v: unknown): TreeRecord {
  if (!isObj(v)) throw fail('tree manquant')
  for (const k of ['id', 'name', 'rootBranchId', 'currentBranchId']) str(v[k], `tree.${k}`)
  int(v.createdAt, 'tree.createdAt')
  int(v.updatedAt, 'tree.updatedAt')
  list(v.declaredPast, 'tree.declaredPast').forEach((e, i) => {
    if (!isObj(e)) throw fail(`tree.declaredPast[${i}] invalide`)
    str(e.label, `tree.declaredPast[${i}].label`)
    str(e.when, `tree.declaredPast[${i}].when`)
  })
  return v as unknown as TreeRecord
}

function checkBranch(v: unknown, i: number): BranchRecord {
  const path = `branches[${i}]`
  if (!isObj(v)) throw fail(`${path} invalide`)
  for (const k of ['id', 'treeId', 'name', 'headSnapshotId']) str(v[k], `${path}.${k}`)
  if (v.parentId !== null) str(v.parentId, `${path}.parentId`)
  for (const k of ['createdAt', 'updatedAt', 'revision']) int(v[k], `${path}.${k}`)
  if (typeof v.locked !== 'boolean') throw fail(`${path}.locked doit être un booléen`)
  if (!isObj(v.summary)) throw fail(`${path}.summary manquant`)
  int(v.summary.clock, `${path}.summary.clock`)
  str(v.summary.characterName, `${path}.summary.characterName`)
  if (v.divergence !== null) {
    const d = v.divergence
    if (!isObj(d)) throw fail(`${path}.divergence invalide`)
    int(d.at, `${path}.divergence.at`)
    str(d.fromSnapshotId, `${path}.divergence.fromSnapshotId`)
    str(d.label, `${path}.divergence.label`)
    if (!isObj(d.decision) || !DECISION_KINDS.includes((d.decision as Decision).kind)) {
      throw fail(`${path}.divergence.decision inconnue`)
    }
  }
  return v as unknown as BranchRecord
}

function checkSnapshot(v: unknown, i: number): SnapshotRecord {
  const path = `snapshots[${i}]`
  if (!isObj(v)) throw fail(`${path} invalide`)
  for (const k of ['id', 'treeId', 'branchId', 'data', 'checksum']) str(v[k], `${path}.${k}`)
  if (!['origin', 'checkpoint', 'head'].includes(v.kind as string)) throw fail(`${path}.kind inconnu`)
  int(v.clock, `${path}.clock`)
  int(v.createdAt, `${path}.createdAt`)
  return v as unknown as SnapshotRecord
}

/** Valide entièrement un fichier exporté ; lève `INVALID_IMPORT` avec la première anomalie. */
export async function validateExport(json: string): Promise<TreeExport> {
  if (json.length > MAX_IMPORT_BYTES) throw fail('fichier trop volumineux (50 Mo au plus)')
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    throw fail('le contenu n’est pas du JSON')
  }
  if (!isObj(raw) || raw.format !== EXPORT_FORMAT) throw fail('ce n’est pas un export SIMULIFE')
  if (raw.version !== EXPORT_VERSION) {
    throw fail(
      typeof raw.version === 'number' && raw.version > EXPORT_VERSION
        ? `version ${raw.version} créée par une version plus récente de l’application`
        : `version ${String(raw.version)} non prise en charge`,
    )
  }
  const tree = checkTree(raw.tree)
  const branches = list(raw.branches, 'branches').map(checkBranch)
  const snapshots = list(raw.snapshots, 'snapshots').map(checkSnapshot)
  const history = list(raw.history, 'history') as HistoryRecord[]

  for (const s of snapshots) {
    if ((await sha256(s.data)) !== s.checksum) throw fail(`empreinte incorrecte pour un instantané de « ${branchName(branches, s.branchId)} » (fichier modifié ou abîmé)`)
    let state
    try {
      state = parseState(s.data)
    } catch (e) {
      throw fail(`état illisible dans « ${branchName(branches, s.branchId)} » (${e instanceof Error ? e.message : String(e)})`)
    }
    if (state.clock !== s.clock) throw fail(`date d’instantané incohérente dans « ${branchName(branches, s.branchId)} »`)
  }
  const issues = structureIssues(tree, branches, snapshots)
  if (issues.length > 0) throw fail(issues[0].replace(/\.$/, ''))
  return { format: EXPORT_FORMAT, version: EXPORT_VERSION, exportedAt: String(raw.exportedAt ?? ''), tree, branches, snapshots, history }
}

const branchName = (branches: BranchRecord[], id: string) => branches.find((b) => b.id === id)?.name ?? id

/** Nouveaux identifiants pour tout l'arbre (les liens internes sont conservés). */
export function withNewIds(exp: TreeExport): TreeExport {
  const ids = new Map<string, string>()
  const map = (id: string) => {
    if (!ids.has(id)) ids.set(id, newId())
    return ids.get(id)!
  }
  const treeId = map(exp.tree.id)
  return {
    ...exp,
    tree: { ...exp.tree, id: treeId, rootBranchId: map(exp.tree.rootBranchId), currentBranchId: map(exp.tree.currentBranchId) },
    branches: exp.branches.map((b) => ({
      ...b,
      id: map(b.id),
      treeId,
      parentId: b.parentId === null ? null : map(b.parentId),
      headSnapshotId: map(b.headSnapshotId),
      divergence: b.divergence ? { ...b.divergence, fromSnapshotId: map(b.divergence.fromSnapshotId) } : null,
    })),
    snapshots: exp.snapshots.map((s) => ({ ...s, id: map(s.id), treeId, branchId: map(s.branchId) })),
    history: exp.history.map((h) => ({ ...h, id: undefined, treeId, branchId: h.branchId === null ? null : map(h.branchId) })),
  }
}
