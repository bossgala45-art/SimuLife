import { useEffect, useMemo, useRef, useState } from 'react'
import { eraseAllData } from '../privacy/erase.ts'
import { hasPin, RELOCK_AFTER_MS } from '../privacy/lock.ts'
import { applyUpdate, onUpdateReady } from '../pwa/register.ts'
import { DestinyError } from '../destiny/errors.ts'
import { lifeTitle } from '../destiny/summary.ts'
import type { DeclaredEvent } from '../destiny/types.ts'
import type { SimulationState } from '../engine/index.ts'
import { DestinyRepository, migrateLegacyGame, type BranchSession } from '../storage/destiny.ts'
import { clearGame, loadGame } from '../storage/savegame.ts'
import DossierScreen from '../ui/dossier/DossierScreen.tsx'
import { errorText } from '../ui/destiny/download.ts'
import TreeScreen from '../ui/destiny/TreeScreen.tsx'
import GameShell from '../ui/game/GameShell.tsx'
import HomeScreen from '../ui/screens/HomeScreen.tsx'
import NewLifeScreen from '../ui/screens/NewLifeScreen.tsx'
import { isStandalone } from '../ui/platform.ts'
import LockScreen from '../ui/privacy/LockScreen.tsx'
import PrivacyPanel from '../ui/privacy/PrivacyPanel.tsx'

type Screen = 'loading' | 'home' | 'new' | 'life' | 'dossier' | 'tree' | 'privacy'

const pinConfigured = () => {
  try {
    return hasPin()
  } catch {
    return false
  }
}

function today() {
  const now = new Date()
  return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() }
}

/** Mises à jour de l'application installée (remplaçables dans les tests). */
export interface Updates {
  onUpdateReady: (listener: () => void) => () => void
  applyUpdate: () => void
}
const SERVICE_WORKER_UPDATES: Updates = { onUpdateReady, applyUpdate }

export default function App({
  repository,
  reload = () => window.location.reload(),
  updates = SERVICE_WORKER_UPDATES,
}: {
  repository?: DestinyRepository
  reload?: () => void
  updates?: Updates
}) {
  const [repo] = useState(() => repository ?? new DestinyRepository())
  const [screen, setScreen] = useState<Screen>('loading')
  const [session, setSession] = useState<BranchSession | null>(null)
  const [branchName, setBranchName] = useState('')
  const [resume, setResume] = useState<{ label: string; branchId: string } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  /** Dernière version enregistrée de la branche jouée (sa révision fait foi pour la prochaine sauvegarde). */
  const persisted = useRef<BranchSession | null>(null)
  /** Les sauvegardes passent l'une après l'autre, dans l'ordre des actions. */
  const queue = useRef<Promise<void>>(Promise.resolve())
  /** Verrouillage par code : rien n'est affiché tant qu'il n'est pas levé. */
  const [locked, setLocked] = useState(pinConfigured)
  /** Nouvelle version prête à être installée. */
  const [updateReady, setUpdateReady] = useState(false)
  /** Chaque entrée dans une vie (ou une branche) repart d'une coque neuve. */
  const [entry, setEntry] = useState(0)

  async function describeResume(): Promise<{ label: string; branchId: string } | null> {
    const [latest] = await repo.listTrees()
    if (!latest) return null
    const branch = await repo.getBranch(latest.currentBranchId)
    const s = branch.summary
    return { label: `${s.characterName}, ${s.age} ans — ${branch.name}`, branchId: branch.id }
  }

  useEffect(() => {
    let cancelled = false
    migrateLegacyGame(repo, { load: loadGame, clear: clearGame })
      .then(() => describeResume())
      .then((r) => !cancelled && setResume(r))
      .catch((e) => !cancelled && setNotice(errorText(e)))
      .finally(() => !cancelled && setScreen('home'))
    return () => {
      cancelled = true
    }
    // Chargement initial uniquement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo])

  // Après une minute en arrière-plan, l'application se verrouille de nouveau.
  useEffect(() => {
    let hiddenAt = 0
    const onChange = () => {
      if (document.visibilityState === 'hidden') hiddenAt = Date.now()
      else if (hiddenAt && Date.now() - hiddenAt >= RELOCK_AFTER_MS && pinConfigured()) setLocked(true)
    }
    document.addEventListener('visibilitychange', onChange)
    return () => document.removeEventListener('visibilitychange', onChange)
  }, [])

  useEffect(() => updates.onUpdateReady(() => setUpdateReady(true)), [updates])

  /** Installe la nouvelle version une fois les sauvegardes en cours terminées. */
  const installUpdate = () => void queue.current.catch(() => {}).then(() => updates.applyUpdate())

  // Hors d'une partie (accueil), la mise à jour s'installe d'elle-même.
  useEffect(() => {
    if (updateReady && !locked && (screen === 'home' || screen === 'loading')) void queue.current.catch(() => {}).then(() => updates.applyUpdate())
  }, [updateReady, locked, screen, updates])

  /** Efface tout (après les sauvegardes en cours), puis relance l'application. */
  async function eraseAll() {
    await queue.current.catch(() => {})
    repo.close()
    await eraseAllData({ dbName: repo.name })
    reload()
  }

  async function enter(next: BranchSession) {
    persisted.current = next
    setEntry((n) => n + 1)
    setSession(next)
    setSaveError(null)
    setBranchName(next.branchId ? (await repo.getBranch(next.branchId)).name : 'Sans sauvegarde')
    setScreen('life')
  }

  async function startLife(state: SimulationState, declaredPast?: DeclaredEvent[], rootName?: string) {
    try {
      await enter(await repo.createTree({ name: lifeTitle(state.character.name), state, declaredPast, branchName: rootName }))
    } catch (e) {
      // Sans stockage, la vie reste jouable mais n'est pas sauvegardée.
      if (e instanceof DestinyError && e.code === 'STORAGE_UNAVAILABLE') {
        persisted.current = null
        setEntry((n) => n + 1)
        setSession({ treeId: '', branchId: '', revision: 0, state })
        setBranchName('Sans sauvegarde')
        setSaveError(e.detail)
        setScreen('life')
      } else {
        setNotice(errorText(e))
      }
    }
  }

  function update(state: SimulationState) {
    setSession((s) => s && { ...s, state })
    queue.current = queue.current.then(async () => {
      const base = persisted.current
      if (!base) return
      try {
        persisted.current = await repo.save(base, state)
        setSaveError(null)
      } catch (e) {
        setSaveError(`Sauvegarde impossible : ${errorText(e)}`)
      }
    })
  }

  const destiny = useMemo(
    () => ({ repo, flush: () => queue.current, onOpen: (s: BranchSession) => void enter(s) }),
    // `enter` ne dépend que de `repo` et des setters d'état.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [repo],
  )

  async function leaveLife(to: Screen) {
    await queue.current
    setResume(await describeResume().catch(() => null))
    setScreen(to)
  }

  if (locked) {
    return <LockScreen onUnlock={() => setLocked(false)} onEraseAll={eraseAll} />
  }

  return (
    <>
      {updateReady && screen !== 'home' && screen !== 'loading' && (
        <div className="update-banner" role="status">
          <span>Une nouvelle version de SIMULIFE est prête.</span>
          <button type="button" className="btn btn--primary btn--small" onClick={installUpdate}>
            Mettre à jour
          </button>
        </div>
      )}
      {screen === 'loading' && <p className="loading">Chargement…</p>}
      {screen === 'privacy' && (
        <main className="dossier">
          <header className="dossier__bar">
            <button type="button" className="link" onClick={() => setScreen('home')}>
              ‹ Menu
            </button>
          </header>
          <h1 className="dossier__title">Confidentialité et données</h1>
          <PrivacyPanel onEraseAll={eraseAll} />
        </main>
      )}
      {screen === 'home' && (
        <HomeScreen
          installed={isStandalone()}
          savedLife={resume?.label}
          loadError={notice ?? undefined}
          onNewLife={() => setScreen('new')}
          onDossier={() => setScreen('dossier')}
          onTree={() => setScreen('tree')}
          onPrivacy={() => setScreen('privacy')}
          onContinue={() => {
            if (resume) repo.openBranch(resume.branchId).then(enter, (e) => setNotice(errorText(e)))
          }}
        />
      )}
      {screen === 'tree' && (
        <TreeScreen repo={repo} activeBranchId={session?.branchId || null} onOpen={(s) => void enter(s)} onBack={() => void leaveLife('home')} />
      )}
      {screen === 'dossier' && (
        <DossierScreen today={today()} onBack={() => setScreen('home')} onStartLife={(state, past, name) => void startLife(state, past, name)} />
      )}
      {screen === 'new' && <NewLifeScreen onCreate={(state) => void startLife(state)} onCancel={() => setScreen('home')} />}
      {screen === 'life' && session && (
        <GameShell
          key={entry}
          state={session.state}
          branchId={session.branchId}
          branchName={branchName}
          saveError={saveError}
          onRetrySave={() => update(session.state)}
          onChange={update}
          onQuit={() => void leaveLife('home')}
          destiny={destiny}
          onEraseAll={eraseAll}
        />
      )}
      <div className="rotate-hint">
        <p>Tourne ton iPhone en mode portrait pour jouer.</p>
      </div>
    </>
  )
}
