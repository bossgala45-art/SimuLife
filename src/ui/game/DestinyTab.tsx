import { useEffect, useState } from 'react'
import type { BranchSession, DestinyRepository } from '../../storage/destiny.ts'
import TreeScreen from '../destiny/TreeScreen.tsx'

export type DestinyLink = {
  repo: DestinyRepository
  /** Attend la fin des sauvegardes en cours, pour que l'arbre montre la vie à jour. */
  flush: () => Promise<void>
  onOpen: (session: BranchSession) => void
}

/** Onglet Destins : l'arbre des destins de la vie jouée, une fois la sauvegarde à jour. */
export default function DestinyTab({ destiny, branchId }: { destiny?: DestinyLink; branchId: string }) {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    destiny?.flush().then(() => !cancelled && setReady(true))
    return () => {
      cancelled = true
    }
  }, [destiny])

  if (!destiny || !branchId) {
    return (
      <section className="card">
        <h2>Arbre des destins</h2>
        <p className="hint">Cette vie n’est pas sauvegardée sur l’appareil (stockage indisponible) : l’arbre des destins ne peut pas l’enregistrer.</p>
      </section>
    )
  }
  if (!ready) return <p className="hint">Enregistrement de la vie en cours…</p>
  return <TreeScreen repo={destiny.repo} activeBranchId={branchId} onOpen={destiny.onOpen} />
}
