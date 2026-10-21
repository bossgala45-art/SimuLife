import { useCallback, useEffect, useRef, useState } from 'react'
import { ancestry, buildTree, childrenOf, flatten } from '../../destiny/tree.ts'
import type { BranchRecord, TreeRecord } from '../../destiny/types.ts'
import { formatDate } from '../../engine/index.ts'
import type { BranchSession, DestinyRepository, SnapshotInfo } from '../../storage/destiny.ts'
import { decryptText, encryptText, isEncrypted, MIN_PASSPHRASE } from '../../privacy/crypto.ts'
import '../privacy/privacy.css'
import { downloadText, errorText } from './download.ts'
import ForkView from './ForkView.tsx'
import './TreeScreen.css'

type Props = {
  repo: DestinyRepository
  /** Branche actuellement jouée (mise en évidence). */
  activeBranchId: string | null
  onOpen: (session: BranchSession) => void
  /** Absent quand l'arbre est affiché dans le jeu (onglet Destins). */
  onBack?: () => void
}

type Message = { kind: 'error' | 'info'; text: string }

export default function TreeScreen({ repo, activeBranchId, onOpen, onBack }: Props) {
  const [trees, setTrees] = useState<TreeRecord[] | null>(null)
  const [treeId, setTreeId] = useState<string | null>(null)
  const [branches, setBranches] = useState<BranchRecord[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [snapshots, setSnapshots] = useState<SnapshotInfo[]>([])
  const [forkFrom, setForkFrom] = useState<{ snapshotId: string; branchName: string } | null>(null)
  const [message, setMessage] = useState<Message | null>(null)
  const [confirm, setConfirm] = useState<'branch' | 'tree' | null>(null)
  const [nameDraft, setNameDraft] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  /** Export en cours de préparation : chiffré ou non. */
  const [exporting, setExporting] = useState<{ encrypt: boolean; pass: string; confirm: string } | null>(null)
  /** Fichier chiffré en attente de sa phrase de passe. */
  const [sealed, setSealed] = useState<{ text: string; pass: string } | null>(null)

  const tree = trees?.find((t) => t.id === treeId) ?? null
  const selected = branches.find((b) => b.id === selectedId) ?? null
  /** Dans le jeu, la vie en cours ne peut pas être supprimée sous les pieds du joueur. */
  const playing = !onBack

  /** Lit les vies et les branches de la vie choisie (sans toucher à l'affichage). */
  const fetchView = useCallback(
    async (preferTree?: string, preferBranch?: string) => {
      const all = await repo.listTrees()
      const chosen = all.find((t) => t.id === preferTree) ?? all[0] ?? null
      const list = chosen ? await repo.listBranches(chosen.id) : []
      const pick = [preferBranch, activeBranchId, chosen?.currentBranchId].find((id) => id && list.some((b) => b.id === id))
      return { all, treeId: chosen?.id ?? null, list, selected: pick ?? chosen?.rootBranchId ?? null }
    },
    [repo, activeBranchId],
  )

  const show = useCallback((view: Awaited<ReturnType<typeof fetchView>>) => {
    setTrees(view.all)
    setTreeId(view.treeId)
    setBranches(view.list)
    setSelectedId(view.selected)
  }, [])

  async function load(preferTree?: string, preferBranch?: string) {
    try {
      show(await fetchView(preferTree, preferBranch))
    } catch (e) {
      setMessage({ kind: 'error', text: errorText(e) })
    }
  }

  useEffect(() => {
    let cancelled = false
    fetchView()
      .then((view) => !cancelled && show(view))
      .catch((e) => !cancelled && setMessage({ kind: 'error', text: errorText(e) }))
    return () => {
      cancelled = true
    }
  }, [fetchView, show])

  useEffect(() => {
    if (!selectedId) return
    let cancelled = false
    repo
      .listSnapshots(selectedId)
      .then((list) => !cancelled && setSnapshots(list))
      .catch((e) => !cancelled && setMessage({ kind: 'error', text: errorText(e) }))
    return () => {
      cancelled = true
    }
  }, [repo, selectedId, branches])

  /** Exécute une opération et affiche son erreur éventuelle. */
  async function run(action: () => Promise<void>) {
    setMessage(null)
    try {
      await action()
    } catch (e) {
      setMessage({ kind: 'error', text: errorText(e) })
    }
  }

  if (forkFrom) {
    return (
      <ForkView
        repo={repo}
        from={forkFrom}
        onCreated={(session) => {
          setForkFrom(null)
          onOpen(session)
        }}
        onCancel={() => setForkFrom(null)}
      />
    )
  }

  const nodes = tree ? flatten(buildTree(tree.rootBranchId, branches)) : []
  const pastMoments = snapshots.filter((s) => s.kind !== 'head')

  return (
    <main className={onBack ? 'dossier tree-screen' : 'tree-screen tree-screen--embedded'}>
      {onBack && (
        <header className="dossier__bar">
          <button type="button" className="link" onClick={onBack}>
            ‹ Menu
          </button>
        </header>
      )}
      <h1 className="dossier__title">Arbre des destins</h1>

      {message && (
        <p className={message.kind === 'error' ? 'question__error' : 'hint'} role={message.kind === 'error' ? 'alert' : 'status'}>
          {message.text}
        </p>
      )}

      {trees && trees.length === 0 && <p className="hint">Aucune vie pour l’instant : commence une nouvelle vie ou importe-en une.</p>}

      {trees && trees.length > 1 && (
        <label className="field">
          <span>Vie</span>
          <select value={treeId ?? ''} onChange={(e) => void load(e.target.value)}>
            {trees.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {tree && tree.declaredPast.length > 0 && (
        <details className="card past">
          <summary>Passé déclaré ({tree.declaredPast.length} faits)</summary>
          <ol className="past__list">
            {tree.declaredPast.map((e, i) => (
              <li key={i}>
                <span className="hint">{e.when}</span> {e.label}
                {e.detail && <span className="hint"> — {e.detail}</span>}
              </li>
            ))}
          </ol>
        </details>
      )}

      {tree && (
        <ul className="branches" role="tree" aria-label={`Branches de ${tree.name}`}>
          {nodes.map(({ branch, depth }) => (
            <li
              key={branch.id}
              role="treeitem"
              aria-level={depth + 1}
              aria-selected={branch.id === selectedId}
              className="branch"
              style={{ '--depth': depth } as React.CSSProperties}
            >
              <button type="button" className={branch.id === selectedId ? 'node node--on' : 'node'} onClick={() => setSelectedId(branch.id)}>
                <span className="node__name">
                  {branch.name}
                  {branch.id === activeBranchId && <span className="badge badge--live">En cours</span>}
                  {branch.locked && <span className="badge">Protégée</span>}
                  {!branch.summary.alive && <span className="badge">Décès</span>}
                </span>
                <span className="node__meta">
                  {branch.divergence ? `Diverge le ${formatDate(branch.divergence.at)}` : 'Origine'}
                </span>
                <span className="node__meta">
                  {formatDate(branch.summary.clock)} · {branch.summary.age} ans · {branch.summary.occupation} · {branch.summary.money} €
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {tree && selected && (
        <section className="card" aria-label="Branche sélectionnée">
          <p className="hint">{ancestry(branches, selected.id).map((b) => b.name).join(' › ')}</p>
          {nameDraft === null ? (
            <h2>{selected.name}</h2>
          ) : (
            <form
              className="rename"
              onSubmit={(e) => {
                e.preventDefault()
                void run(async () => {
                  await repo.rename(selected.id, nameDraft)
                  setNameDraft(null)
                  await load(tree.id, selected.id)
                })
              }}
            >
              <input aria-label="Nouveau nom" value={nameDraft} maxLength={60} onChange={(e) => setNameDraft(e.target.value)} />
              <button type="submit" className="btn btn--secondary btn--small">
                OK
              </button>
            </form>
          )}
          {selected.divergence && (
            <p className="hint">
              Décision au {formatDate(selected.divergence.at)} : {selected.divergence.label}
            </p>
          )}

          <div className="tree-actions">
            <button type="button" className="btn btn--primary" onClick={() => void run(async () => onOpen(await repo.openBranch(selected.id)))}>
              {selected.id === activeBranchId ? 'Revenir à cette vie' : 'Reprendre cette vie'}
            </button>
            <button
              type="button"
              className="btn btn--secondary"
              disabled={!selected.summary.alive}
              onClick={() => setForkFrom({ snapshotId: selected.headSnapshotId, branchName: selected.name })}
            >
              Faire un autre choix maintenant
            </button>
            <div className="tree-actions__row">
              <button type="button" className="btn btn--secondary btn--small" onClick={() => setNameDraft(selected.name)}>
                Renommer
              </button>
              <button
                type="button"
                className="btn btn--secondary btn--small"
                onClick={() =>
                  void run(async () => {
                    await repo.setLocked(selected.id, !selected.locked)
                    await load(tree.id, selected.id)
                  })
                }
              >
                {selected.locked ? 'Déverrouiller' : 'Protéger'}
              </button>
              {selected.parentId !== null && childrenOf(branches, selected.id).length === 0 && !(playing && selected.id === activeBranchId) && (
                <button type="button" className="btn btn--secondary btn--small" onClick={() => setConfirm('branch')}>
                  Supprimer
                </button>
              )}
            </div>
            {confirm === 'branch' && (
              <div className="tree-actions__row">
                <button
                  type="button"
                  className="btn btn--danger btn--small"
                  onClick={() =>
                    void run(async () => {
                      await repo.deleteBranch(selected.id)
                      setConfirm(null)
                      await load(tree.id, selected.parentId ?? undefined)
                    })
                  }
                >
                  Confirmer la suppression
                </button>
                <button type="button" className="btn btn--secondary btn--small" onClick={() => setConfirm(null)}>
                  Annuler
                </button>
              </div>
            )}
          </div>

          {pastMoments.length > 0 && (
            <>
              <h3 className="subtitle">Revenir à un instant passé</h3>
              <ul className="moments">
                {pastMoments.map((s) => (
                  <li key={s.id}>
                    <button type="button" className="action" onClick={() => setForkFrom({ snapshotId: s.id, branchName: selected.name })}>
                      <span className="action__label">{formatDate(s.clock)}</span>
                      <span className="action__meta">{s.kind === 'origin' ? 'origine' : 'instantané'}</span>
                      <span className="action__chance">Faire un autre choix à ce moment</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      <section className="card" aria-label="Sauvegardes">
        <h2>Sauvegardes</h2>
        <div className="tree-actions">
          {tree && !exporting && (
            <button type="button" className="btn btn--secondary" onClick={() => setExporting({ encrypt: true, pass: '', confirm: '' })}>
              Exporter cette vie…
            </button>
          )}
          {tree && exporting && (
            <form
              className="export-form"
              aria-label="Export"
              onSubmit={(e) => {
                e.preventDefault()
                void run(async () => {
                  if (exporting.encrypt && exporting.pass !== exporting.confirm) throw new Error('Les deux phrases de passe ne correspondent pas.')
                  const json = await repo.exportTree(tree.id)
                  const base = `simulife-${tree.name.replace(/\W+/g, '-').toLowerCase()}`
                  if (exporting.encrypt) downloadText(`${base}.chiffre.json`, await encryptText(json, exporting.pass))
                  else downloadText(`${base}.json`, json)
                  setExporting(null)
                  setMessage({
                    kind: 'info',
                    text: exporting.encrypt
                      ? 'Export chiffré prêt (AES-256-GCM). Sans la phrase de passe, il est illisible : elle n’est enregistrée nulle part.'
                      : 'Fichier d’export prêt, NON chiffré : toute personne qui l’obtient peut le lire.',
                  })
                })
              }}
            >
              <label className="toggle">
                <input type="checkbox" checked={exporting.encrypt} onChange={(e) => setExporting({ ...exporting, encrypt: e.target.checked })} />
                Chiffrer avec une phrase de passe (recommandé)
              </label>
              {exporting.encrypt && (
                <>
                  <label>
                    Phrase de passe ({MIN_PASSPHRASE} caractères au moins)
                    <input type="password" autoComplete="new-password" value={exporting.pass} onChange={(e) => setExporting({ ...exporting, pass: e.target.value })} />
                  </label>
                  <label>
                    Confirmer la phrase de passe
                    <input type="password" autoComplete="new-password" value={exporting.confirm} onChange={(e) => setExporting({ ...exporting, confirm: e.target.value })} />
                  </label>
                </>
              )}
              <button type="submit" className="btn btn--secondary" disabled={exporting.encrypt && exporting.pass.length < MIN_PASSPHRASE}>
                {exporting.encrypt ? 'Exporter chiffré' : 'Exporter sans chiffrement'}
              </button>
              <button type="button" className="link" onClick={() => setExporting(null)}>
                Annuler
              </button>
            </form>
          )}
          {sealed && (
            <form
              className="export-form"
              aria-label="Fichier chiffré"
              onSubmit={(e) => {
                e.preventDefault()
                void run(async () => {
                  const imported = await repo.importTree(await decryptText(sealed.text, sealed.pass))
                  setSealed(null)
                  await load(imported.id)
                  setMessage({ kind: 'info', text: `Vie importée (fichier chiffré) : ${imported.name}.` })
                })
              }}
            >
              <label>
                Phrase de passe du fichier chiffré
                <input type="password" autoComplete="current-password" value={sealed.pass} onChange={(e) => setSealed({ ...sealed, pass: e.target.value })} />
              </label>
              <button type="submit" className="btn btn--secondary" disabled={!sealed.pass}>
                Déchiffrer et importer
              </button>
              <button type="button" className="link" onClick={() => setSealed(null)}>
                Annuler
              </button>
            </form>
          )}
          <button type="button" className="btn btn--secondary" onClick={() => fileInput.current?.click()}>
            Importer une vie
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            hidden
            aria-label="Fichier à importer"
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (!file) return
              void run(async () => {
                const text = await file.text()
                if (isEncrypted(text)) {
                  setSealed({ text, pass: '' })
                  setMessage({ kind: 'info', text: 'Fichier chiffré : saisis sa phrase de passe.' })
                  return
                }
                const imported = await repo.importTree(text)
                await load(imported.id)
                setMessage({ kind: 'info', text: `Vie importée : ${imported.name}.` })
              })
            }}
          />
          {tree && (
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() =>
                void run(async () => {
                  const issues = await repo.verifyTree(tree.id)
                  setMessage(
                    issues.length === 0
                      ? { kind: 'info', text: 'Intégrité vérifiée : toutes les branches et tous les instantanés sont intacts.' }
                      : { kind: 'error', text: `Problèmes détectés : ${issues.join(' ; ')}` },
                  )
                })
              }
            >
              Vérifier l’intégrité
            </button>
          )}
          {tree &&
            !(playing && branches.some((b) => b.id === activeBranchId)) &&
            (confirm === 'tree' ? (
              <div className="tree-actions__row">
                <button
                  type="button"
                  className="btn btn--danger btn--small"
                  onClick={() =>
                    void run(async () => {
                      await repo.deleteTree(tree.id)
                      setConfirm(null)
                      await load()
                    })
                  }
                >
                  Supprimer toute cette vie
                </button>
                <button type="button" className="btn btn--secondary btn--small" onClick={() => setConfirm(null)}>
                  Annuler
                </button>
              </div>
            ) : (
              <button type="button" className="link link--danger" onClick={() => setConfirm('tree')}>
                Supprimer cette vie…
              </button>
            ))}
        </div>
      </section>
    </main>
  )
}
