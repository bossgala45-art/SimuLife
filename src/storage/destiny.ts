/**
 * Stockage de l'arbre des destins dans IndexedDB (Dexie).
 *
 * Garanties :
 * - chaque écriture vise UNE branche, identifiée par la session ouverte ;
 * - une sauvegarde est refusée si la branche est protégée, si elle a été
 *   modifiée entre-temps (numéro de révision) ou si elle reculerait dans le temps ;
 * - les instantanés sont vérifiés (empreinte SHA-256 + validité de l'état) à chaque lecture ;
 * - un instantané servant de point de divergence n'est jamais supprimé.
 */
import Dexie, { type Table } from 'dexie'
import { newId, sha256 } from '../destiny/checksum.ts'
import { applyDecision, decisionLabel } from '../destiny/decisions.ts'
import { DestinyError } from '../destiny/errors.ts'
import { EXPORT_FORMAT, EXPORT_VERSION, validateExport, withNewIds, type TreeExport } from '../destiny/exchange.ts'
import { lifeTitle, summarize } from '../destiny/summary.ts'
import { structureIssues } from '../destiny/tree.ts'
import type {
  BranchRecord,
  Decision,
  DeclaredEvent,
  HistoryRecord,
  HistoryType,
  SnapshotKind,
  SnapshotRecord,
  TreeRecord,
} from '../destiny/types.ts'
import { parseState, serializeState } from '../engine/serialization.ts'
import { MINUTES_PER_DAY } from '../engine/time.ts'
import type { SimulationState } from '../engine/types.ts'
import type { LoadResult } from './savegame.ts'

export const DB_NAME = 'simulife'
/** Un instantané intermédiaire au plus tous les 30 jours simulés. */
export const CHECKPOINT_INTERVAL_DAYS = 30
/** Instantanés intermédiaires gardés par branche (hors origine et points de divergence). */
export const MAX_CHECKPOINTS = 12
/**
 * Un instantané intermédiaire ne garde que la fin du journal : l'état (argent, relations,
 * souvenirs, diplômes, dettes, événements à venir) est complet, seul l'historique ancien est allégé.
 */
export const CHECKPOINT_LOG_SIZE = 300

const KIND_ORDER: Record<SnapshotKind, number> = { origin: 0, checkpoint: 1, head: 2 }

class DestinyDatabase extends Dexie {
  trees!: Table<TreeRecord, string>
  branches!: Table<BranchRecord, string>
  snapshots!: Table<SnapshotRecord, string>
  history!: Table<HistoryRecord, number>

  constructor(name: string) {
    super(name)
    this.version(1).stores({
      trees: 'id, updatedAt',
      branches: 'id, treeId, parentId',
      snapshots: 'id, treeId, branchId, [branchId+kind]',
      history: '++id, treeId, branchId',
    })
  }
}

/** Branche ouverte : seule cette session peut écrire dans sa branche, à sa révision. */
export interface BranchSession {
  readonly treeId: string
  readonly branchId: string
  readonly revision: number
  readonly state: SimulationState
}

export type SnapshotInfo = Omit<SnapshotRecord, 'data'>

/** Traduit les erreurs du navigateur en erreurs explicites. */
function storageError(e: unknown): DestinyError {
  if (e instanceof DestinyError) return e
  const name = (e as { name?: string })?.name ?? ''
  const inner = (e as { inner?: { name?: string } })?.inner?.name ?? ''
  if (name === 'QuotaExceededError' || inner === 'QuotaExceededError') {
    return new DestinyError('QUOTA', 'Espace de stockage plein : supprime ou exporte des branches anciennes.', { cause: e })
  }
  if (['MissingAPIError', 'OpenFailedError', 'DatabaseClosedError', 'InvalidStateError'].includes(name)) {
    return new DestinyError('STORAGE_UNAVAILABLE', 'Stockage local indisponible (navigation privée ou stockage désactivé).', { cause: e })
  }
  return new DestinyError('STORAGE', `Erreur de stockage : ${e instanceof Error ? e.message : String(e)}`, { cause: e })
}

async function guard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (e) {
    throw storageError(e)
  }
}

export class DestinyRepository {
  private readonly db: DestinyDatabase
  private readonly now: () => number

  constructor(name = DB_NAME, now: () => number = Date.now) {
    this.db = new DestinyDatabase(name)
    this.now = now
  }

  close(): void {
    this.db.close()
  }

  // ——— Lecture ———

  listTrees(): Promise<TreeRecord[]> {
    return guard(() => this.db.trees.orderBy('updatedAt').reverse().toArray())
  }

  getTree(id: string): Promise<TreeRecord> {
    return guard(async () => (await this.db.trees.get(id)) ?? notFound('Vie introuvable.'))
  }

  listBranches(treeId: string): Promise<BranchRecord[]> {
    return guard(() => this.db.branches.where('treeId').equals(treeId).toArray())
  }

  getBranch(id: string): Promise<BranchRecord> {
    return guard(async () => (await this.db.branches.get(id)) ?? notFound('Branche introuvable.'))
  }

  /** Instantanés d'une branche, du plus ancien au plus récent (sans le contenu). */
  listSnapshots(branchId: string): Promise<SnapshotInfo[]> {
    return guard(async () => {
      const all = await this.db.snapshots.where('branchId').equals(branchId).toArray()
      return all.sort((a, b) => a.clock - b.clock || KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.createdAt - b.createdAt).map(withoutData)
    })
  }

  history(treeId: string): Promise<HistoryRecord[]> {
    return guard(() => this.db.history.where('treeId').equals(treeId).sortBy('id'))
  }

  /** Lit et vérifie un instantané (empreinte, puis validité de l'état). */
  async readSnapshot(id: string): Promise<{ record: SnapshotRecord; state: SimulationState }> {
    const record = await guard(async () => (await this.db.snapshots.get(id)) ?? notFound('Instantané introuvable.'))
    if ((await sha256(record.data)) !== record.checksum) {
      throw new DestinyError('INTEGRITY', 'Instantané abîmé : son empreinte ne correspond plus à son contenu.')
    }
    try {
      return { record, state: parseState(record.data) }
    } catch (e) {
      throw new DestinyError('INTEGRITY', `Instantané illisible : ${e instanceof Error ? e.message : String(e)}`, { cause: e })
    }
  }

  // ——— Création et reprise ———

  /** Nouvelle vie : une racine avec son origine et son état courant. */
  async createTree(input: { name: string; state: SimulationState; declaredPast?: DeclaredEvent[]; branchName?: string }): Promise<BranchSession> {
    const time = this.now()
    const tree: TreeRecord = {
      id: newId(),
      name: input.name,
      createdAt: time,
      updatedAt: time,
      rootBranchId: newId(),
      currentBranchId: '',
      declaredPast: input.declaredPast ?? [],
    }
    tree.currentBranchId = tree.rootBranchId
    const snaps = await this.makeSnapshots(tree.id, tree.rootBranchId, input.state, ['origin', 'head'])
    const branch: BranchRecord = {
      id: tree.rootBranchId,
      treeId: tree.id,
      parentId: null,
      name: input.branchName ?? 'Vie d’origine',
      createdAt: time,
      updatedAt: time,
      divergence: null,
      headSnapshotId: snaps[1].id,
      revision: 0,
      locked: false,
      summary: summarize(input.state),
    }
    await guard(() =>
      this.db.transaction('rw', [this.db.trees, this.db.branches, this.db.snapshots, this.db.history], async () => {
        await this.db.trees.add(tree)
        await this.db.branches.add(branch)
        await this.db.snapshots.bulkAdd(snaps)
        await this.log(tree.id, branch.id, 'tree_created', `Nouvelle vie : ${tree.name}.`)
      }),
    )
    return { treeId: tree.id, branchId: branch.id, revision: 0, state: input.state }
  }

  /** Reprend une branche : son propre état, vérifié, et elle devient la branche courante. */
  async openBranch(branchId: string): Promise<BranchSession> {
    const branch = await this.getBranch(branchId)
    const { state } = await this.readSnapshot(branch.headSnapshotId)
    await guard(() =>
      this.db.transaction('rw', [this.db.trees, this.db.history], async () => {
        await this.db.trees.update(branch.treeId, { currentBranchId: branch.id, updatedAt: this.now() })
        await this.log(branch.treeId, branch.id, 'resumed', `Reprise de « ${branch.name} ».`)
      }),
    )
    return { treeId: branch.treeId, branchId: branch.id, revision: branch.revision, state }
  }

  /**
   * Enregistre l'état courant de la branche de la session.
   * Crée un instantané intermédiaire tous les 30 jours simulés.
   */
  async save(session: BranchSession, state: SimulationState): Promise<BranchSession> {
    const data = serializeState(state)
    const checksum = await sha256(data)
    const light = serializeState({ ...state, log: state.log.slice(-CHECKPOINT_LOG_SIZE) })
    const lightChecksum = await sha256(light)
    let revision = session.revision
    await guard(() =>
      this.db.transaction('rw', [this.db.trees, this.db.branches, this.db.snapshots, this.db.history], async () => {
        const branch = await this.db.branches.get(session.branchId)
        if (!branch || branch.treeId !== session.treeId) throw new DestinyError('NOT_FOUND', 'Cette branche n’existe plus.')
        if (branch.locked) throw new DestinyError('LOCKED', `« ${branch.name} » est protégée : déverrouille-la pour continuer à la modifier.`)
        if (branch.revision !== session.revision) {
          throw new DestinyError('CONFLICT', `« ${branch.name} » a été modifiée ailleurs (autre onglet ?). Recharge-la avant de continuer.`)
        }
        const head = await this.db.snapshots.get(branch.headSnapshotId)
        if (!head) throw new DestinyError('INTEGRITY', 'Instantané courant manquant.')
        if (state.clock < head.clock) {
          throw new DestinyError('TIME_TRAVEL', 'Cet état est antérieur à la branche : pour revenir en arrière, crée une nouvelle branche depuis un instantané.')
        }
        const time = this.now()
        await this.db.snapshots.put({ ...head, clock: state.clock, createdAt: time, data, checksum })

        const others = await this.db.snapshots.where('branchId').equals(branch.id).toArray()
        const lastKept = Math.max(...others.filter((s) => s.kind !== 'head').map((s) => s.clock))
        if (state.clock - lastKept >= CHECKPOINT_INTERVAL_DAYS * MINUTES_PER_DAY) {
          await this.db.snapshots.add({
            id: newId(),
            treeId: branch.treeId,
            branchId: branch.id,
            kind: 'checkpoint',
            clock: state.clock,
            createdAt: time,
            data: light,
            checksum: lightChecksum,
          })
          await this.pruneCheckpoints(branch.id)
        }
        revision = branch.revision + 1
        await this.db.branches.update(branch.id, { revision, updatedAt: time, summary: summarize(state) })
        await this.db.trees.update(branch.treeId, { updatedAt: time, currentBranchId: branch.id })
      }),
    )
    return { ...session, revision, state }
  }

  /**
   * Nouvelle branche à partir d'un instantané (de n'importe quelle branche de l'arbre) et d'une décision.
   * Si l'instantané est l'état courant, il est d'abord figé en instantané intermédiaire.
   */
  async fork(input: { fromSnapshotId: string; decision: Decision; name?: string }): Promise<BranchSession> {
    const { record: source, state } = await this.readSnapshot(input.fromSnapshotId)
    const parent = await this.getBranch(source.branchId)
    const branchId = newId()
    const forked = applyDecision(state, input.decision, branchId)
    const label = decisionLabel(state, input.decision)

    let anchor = source
    if (source.kind === 'head') {
      anchor = { ...source, id: newId(), kind: 'checkpoint', createdAt: this.now() }
    }
    const snaps = await this.makeSnapshots(parent.treeId, branchId, forked, ['origin', 'head'])
    const time = this.now()
    const branch: BranchRecord = {
      id: branchId,
      treeId: parent.treeId,
      parentId: parent.id,
      name: input.name?.trim() || label,
      createdAt: time,
      updatedAt: time,
      divergence: { at: anchor.clock, fromSnapshotId: anchor.id, decision: input.decision, label },
      headSnapshotId: snaps[1].id,
      revision: 0,
      locked: false,
      summary: summarize(forked),
    }
    await guard(() =>
      this.db.transaction('rw', [this.db.trees, this.db.branches, this.db.snapshots, this.db.history], async () => {
        if (anchor !== source) await this.db.snapshots.add(anchor)
        await this.db.branches.add(branch)
        await this.db.snapshots.bulkAdd(snaps)
        await this.db.trees.update(parent.treeId, { currentBranchId: branchId, updatedAt: time })
        await this.log(parent.treeId, branchId, 'branch_created', `Nouvelle branche « ${branch.name} » depuis « ${parent.name} ».`)
      }),
    )
    return { treeId: parent.treeId, branchId, revision: 0, state: forked }
  }

  /** Branche depuis l'état courant d'une branche. */
  async forkFromHead(branchId: string, decision: Decision, name?: string): Promise<BranchSession> {
    const branch = await this.getBranch(branchId)
    return this.fork({ fromSnapshotId: branch.headSnapshotId, decision, name })
  }

  // ——— Gestion ———

  async rename(branchId: string, name: string): Promise<void> {
    const clean = name.trim()
    if (clean.length === 0 || clean.length > 60) throw new DestinyError('FORBIDDEN', 'Le nom doit contenir entre 1 et 60 caractères.')
    const branch = await this.getBranch(branchId)
    await guard(async () => {
      await this.db.branches.update(branchId, { name: clean })
      await this.log(branch.treeId, branchId, 'renamed', `« ${branch.name} » renommée « ${clean} ».`)
    })
  }

  async setLocked(branchId: string, locked: boolean): Promise<void> {
    const branch = await this.getBranch(branchId)
    await guard(async () => {
      await this.db.branches.update(branchId, { locked })
      await this.log(branch.treeId, branchId, locked ? 'locked' : 'unlocked', `« ${branch.name} » ${locked ? 'protégée' : 'déverrouillée'}.`)
    })
  }

  /** Supprime une branche sans descendance (jamais la racine). */
  async deleteBranch(branchId: string): Promise<void> {
    const branch = await this.getBranch(branchId)
    if (branch.parentId === null) throw new DestinyError('FORBIDDEN', 'La branche d’origine ne peut pas être supprimée : supprime la vie entière.')
    if (branch.locked) throw new DestinyError('LOCKED', `« ${branch.name} » est protégée.`)
    const children = await guard(() => this.db.branches.where('parentId').equals(branchId).count())
    if (children > 0) throw new DestinyError('FORBIDDEN', `« ${branch.name} » a des branches issues d’elle : supprime-les d’abord.`)
    await guard(() =>
      this.db.transaction('rw', [this.db.trees, this.db.branches, this.db.snapshots, this.db.history], async () => {
        await this.db.snapshots.where('branchId').equals(branchId).delete()
        await this.db.branches.delete(branchId)
        const tree = await this.db.trees.get(branch.treeId)
        if (tree?.currentBranchId === branchId) await this.db.trees.update(tree.id, { currentBranchId: branch.parentId! })
        await this.log(branch.treeId, null, 'deleted', `Branche « ${branch.name} » supprimée.`)
      }),
    )
  }

  async deleteTree(treeId: string): Promise<void> {
    await guard(() =>
      this.db.transaction('rw', [this.db.trees, this.db.branches, this.db.snapshots, this.db.history], async () => {
        await this.db.snapshots.where('treeId').equals(treeId).delete()
        await this.db.branches.where('treeId').equals(treeId).delete()
        await this.db.history.where('treeId').equals(treeId).delete()
        await this.db.trees.delete(treeId)
      }),
    )
  }

  /** Contrôle complet : structure de l'arbre, empreintes et validité de chaque instantané. */
  async verifyTree(treeId: string): Promise<string[]> {
    const tree = await this.getTree(treeId)
    const branches = await this.listBranches(treeId)
    const snapshots = await guard(() => this.db.snapshots.where('treeId').equals(treeId).toArray())
    const issues = structureIssues(tree, branches, snapshots)
    for (const s of snapshots) {
      try {
        await this.readSnapshot(s.id)
      } catch (e) {
        const name = branches.find((b) => b.id === s.branchId)?.name ?? '?'
        issues.push(`« ${name} » : ${e instanceof DestinyError ? e.detail : String(e)}`)
      }
    }
    return issues
  }

  /** Restaure l'état courant depuis le plus récent instantané intact (après une corruption). */
  async restoreLatestValid(branchId: string): Promise<BranchSession> {
    const branch = await this.getBranch(branchId)
    const candidates = (await this.listSnapshots(branchId)).filter((s) => s.kind !== 'head').reverse()
    for (const c of candidates) {
      try {
        const { record } = await this.readSnapshot(c.id)
        await guard(() =>
          this.db.transaction('rw', [this.db.branches, this.db.snapshots], async () => {
            await this.db.snapshots.put({ ...record, id: branch.headSnapshotId, kind: 'head', createdAt: this.now() })
            await this.db.branches.update(branchId, { revision: branch.revision + 1, summary: summarize(parseState(record.data)) })
          }),
        )
        return this.openBranch(branchId)
      } catch (e) {
        if (!(e instanceof DestinyError) || e.code !== 'INTEGRITY') throw e
      }
    }
    throw new DestinyError('INTEGRITY', 'Aucun instantané intact pour cette branche.')
  }

  // ——— Import / export ———

  async exportTree(treeId: string): Promise<string> {
    const tree = await this.getTree(treeId)
    const exp: TreeExport = {
      format: EXPORT_FORMAT,
      version: EXPORT_VERSION,
      exportedAt: new Date(this.now()).toISOString(),
      tree,
      branches: await this.listBranches(treeId),
      snapshots: await guard(() => this.db.snapshots.where('treeId').equals(treeId).toArray()),
      history: await this.history(treeId),
    }
    return JSON.stringify(exp)
  }

  /** Importe une vie exportée, entièrement vérifiée, sous de nouveaux identifiants. */
  async importTree(json: string): Promise<TreeRecord> {
    const exp = withNewIds(await validateExport(json))
    const time = this.now()
    const taken = new Set((await this.listTrees()).map((t) => t.name))
    const tree = { ...exp.tree, updatedAt: time, name: taken.has(exp.tree.name) ? `${exp.tree.name} (importée)` : exp.tree.name }
    await guard(() =>
      this.db.transaction('rw', [this.db.trees, this.db.branches, this.db.snapshots, this.db.history], async () => {
        await this.db.trees.add(tree)
        await this.db.branches.bulkAdd(exp.branches)
        await this.db.snapshots.bulkAdd(exp.snapshots)
        await this.db.history.bulkAdd(exp.history.map((h) => ({ treeId: h.treeId, branchId: h.branchId, at: h.at, type: h.type, message: h.message })))
        await this.log(tree.id, null, 'imported', `Vie importée : ${tree.name}.`)
      }),
    )
    return tree
  }

  // ——— Interne ———

  private async makeSnapshots(treeId: string, branchId: string, state: SimulationState, kinds: SnapshotKind[]): Promise<SnapshotRecord[]> {
    const data = serializeState(state)
    const checksum = await sha256(data)
    const time = this.now()
    return kinds.map((kind) => ({ id: newId(), treeId, branchId, kind, clock: state.clock, createdAt: time, data, checksum }))
  }

  /** Garde les derniers instantanés intermédiaires, et toujours ceux qui servent de point de divergence. */
  private async pruneCheckpoints(branchId: string): Promise<void> {
    const anchors = new Set(
      (await this.db.branches.where('parentId').equals(branchId).toArray()).map((b) => b.divergence?.fromSnapshotId),
    )
    const checkpoints = (await this.db.snapshots.where('[branchId+kind]').equals([branchId, 'checkpoint']).toArray())
      .filter((s) => !anchors.has(s.id))
      .sort((a, b) => a.clock - b.clock)
    const excess = checkpoints.length - MAX_CHECKPOINTS
    if (excess > 0) await this.db.snapshots.bulkDelete(checkpoints.slice(0, excess).map((s) => s.id))
  }

  private async log(treeId: string, branchId: string | null, type: HistoryType, message: string): Promise<void> {
    await this.db.history.add({ treeId, branchId, at: this.now(), type, message })
  }
}

function withoutData(s: SnapshotRecord): SnapshotInfo {
  const info: Partial<SnapshotRecord> = { ...s }
  delete info.data
  return info as SnapshotInfo
}

function notFound(detail: string): never {
  throw new DestinyError('NOT_FOUND', detail)
}

/**
 * Ancienne sauvegarde unique (missions 2 à 4, localStorage) → nouvelle vie de l'arbre.
 * L'ancienne clé n'est effacée qu'une fois la vie créée.
 */
export async function migrateLegacyGame(
  repo: DestinyRepository,
  legacy: { load: () => LoadResult; clear: () => void },
): Promise<BranchSession | null> {
  const old = legacy.load()
  if (old.status !== 'loaded') return null
  const session = await repo.createTree({
    name: lifeTitle(old.state.character.name),
    state: old.state,
    branchName: 'Vie d’origine (sauvegarde importée)',
  })
  legacy.clear()
  return session
}
