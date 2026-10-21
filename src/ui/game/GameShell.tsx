import { useCallback, useEffect, useMemo, useState } from 'react'
import { disabledAdapter, type NarrativeAiAdapter } from '../../ai/narrativeAi.ts'
import { ageAt, formatDate, formatTime, unreadCount, type SimulationState, type StepResult } from '../../engine/index.ts'
import { loadMapServices, type MapServices } from '../map/osm.ts'
import Conversation from '../narrative/Conversation.tsx'
import { MemoriesPage, MessagesPage } from '../narrative/pages.tsx'
import { sound } from '../audio/sound.ts'
import { eventCards } from './cards.ts'
import DestinyTab, { type DestinyLink } from './DestinyTab.tsx'
import Icon, { type IconName } from './icons.tsx'
import SceneOverlay from './SceneOverlay.tsx'
import { scenesFor, type Scene } from './scenes.ts'
import {
  CarrierePage,
  CompetencesPage,
  EtudesPage,
  FinancesPage,
  JournalPage,
  MondeTab,
  SantePage,
  SocialTab,
  TempsTab,
  VieTab,
} from './screens.tsx'
import { loadSeen, saveSeen, type Seen } from './seen.ts'
import SettingsPage from './SettingsPage.tsx'
import '../life/life.css'
import '../narrative/narrative.css'
import './GameShell.css'

type Tab = 'vie' | 'temps' | 'social' | 'monde' | 'destins'
type Page = 'sante' | 'etudes' | 'carriere' | 'finances' | 'competences' | 'messages' | 'souvenirs' | 'journal' | 'parametres'
type Route = { tab: Tab } | { page: Page; from: Tab; personId?: string }

const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'vie', label: 'Vie', icon: 'vie' },
  { id: 'temps', label: 'Temps', icon: 'temps' },
  { id: 'social', label: 'Social', icon: 'social' },
  { id: 'monde', label: 'Monde', icon: 'monde' },
  { id: 'destins', label: 'Destins', icon: 'destins' },
]

const PAGES: { id: Page; label: string; icon: string }[] = [
  { id: 'sante', label: 'Santé', icon: '❤️' },
  { id: 'etudes', label: 'Études', icon: '🎓' },
  { id: 'carriere', label: 'Carrière', icon: '💼' },
  { id: 'finances', label: 'Finances', icon: '💶' },
  { id: 'competences', label: 'Compétences', icon: '⭐' },
  { id: 'messages', label: 'Messages', icon: '💬' },
  { id: 'souvenirs', label: 'Souvenirs', icon: '📜' },
  { id: 'journal', label: 'Journal', icon: '📖' },
  { id: 'parametres', label: 'Paramètres', icon: '⚙️' },
]

/** Nombre maximal de scènes en attente (les plus récentes sont gardées). */
const MAX_SCENES = 3

type Props = {
  state: SimulationState
  onChange: (state: SimulationState) => void
  onQuit: () => void
  /** Branche jouée ('' si la vie n'est pas sauvegardée). */
  branchId: string
  branchName: string
  saveError?: string | null
  onRetrySave?: () => void
  destiny?: DestinyLink
  /** IA externe facultative (désactivée par défaut). */
  ai?: NarrativeAiAdapter
  /** Configuration des services de carte (remplaçable dans les tests). */
  mapServices?: () => Promise<MapServices>
}

/** Au lancement : scène d'ouverture si la vie (ou la branche) vient de commencer. */
function openingScenes(state: SimulationState, seen: Seen | null): Scene[] {
  if (seen) return []
  const recent = state.log.slice(-5).filter((e) => e.code === 'life_started' || e.code === 'divergence')
  return scenesFor(recent).slice(-1)
}

export default function GameShell({
  state,
  onChange,
  onQuit,
  branchId,
  branchName,
  saveError,
  onRetrySave,
  destiny,
  ai = disabledAdapter,
  mapServices = loadMapServices,
}: Props) {
  const [route, setRoute] = useState<Route>({ tab: 'vie' })
  const [menuOpen, setMenuOpen] = useState(false)
  const [issues, setIssues] = useState<string[]>([])
  const [initialSeen] = useState(() => loadSeen(branchId))
  const [seen, setSeen] = useState<Seen>(() => initialSeen ?? { lastSeq: -1, dismissed: [] })
  const [scenes, setScenes] = useState<Scene[]>(() => openingScenes(state, initialSeen))
  const c = state.character

  const cards = useMemo(() => eventCards(state, seen), [state, seen])

  function remember(next: Seen) {
    setSeen(next)
    saveSeen(branchId, next)
  }

  function apply(result: StepResult) {
    if (!result.ok) {
      setIssues(result.issues.map((i) => i.message))
      sound.play('warning')
      return
    }
    setIssues([])
    const fresh = result.state.log.filter((e) => e.seq >= state.nextLogSeq)
    const found = scenesFor(fresh)
    if (found.length > 0) {
      setScenes((queue) => [...queue, ...found].slice(-MAX_SCENES))
      sound.play(found.at(-1)!.sound)
    } else if (fresh.some((e) => e.kind === 'warning')) sound.play('warning')
    else if (fresh.some((e) => e.kind === 'money')) sound.play('money')
    else if (fresh.some((e) => e.code === 'message_received')) sound.play('page')
    else sound.play('tap')
    onChange(result.state)
  }

  function go(next: Route) {
    setRoute(next)
    setMenuOpen(false)
    setIssues([])
    sound.play('page')
    document.scrollingElement?.scrollTo?.({ top: 0 })
  }

  // Mémorise la première visite de cette branche (la scène d'ouverture ne rejoue pas).
  useEffect(() => {
    if (!initialSeen) saveSeen(branchId, { lastSeq: -1, dismissed: [] })
  }, [initialSeen, branchId])

  // La touche Échap ferme le menu (clavier, VoiceOver).
  useEffect(() => {
    if (!menuOpen) return
    const close = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false)
    document.addEventListener('keydown', close)
    return () => document.removeEventListener('keydown', close)
  }, [menuOpen])

  const currentTab = 'tab' in route ? route.tab : route.from
  const page = 'page' in route ? PAGES.find((p) => p.id === route.page)! : null
  const toMonde = () => go({ tab: 'monde' })
  const onState = useCallback((next: SimulationState) => onChange(next), [onChange])
  const unread = unreadCount(state)
  const openThread = (personId: string) => go({ page: 'messages', from: currentTab, personId })

  return (
    <div className="game">
      <header className="hud">
        <div className="hud__who">
          <p className="hud__name">
            {c.name}, {ageAt(c.birthDate, state.clock)} ans
          </p>
          <p className="hud__date">
            {formatDate(state.clock)} · <span aria-label="Heure">{formatTime(state.clock)}</span>
          </p>
        </div>
        <p className={c.money < 0 ? 'hud__money hud__money--neg' : 'hud__money'} aria-label="Compte courant">
          {c.money} €
        </p>
        <button type="button" className="hud__menu" aria-label="Menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}>
          <Icon name="menu" />
        </button>
      </header>

      <main className="game__content">
        {page && (
          <div className="page-head">
            <button
              type="button"
              className="link"
              onClick={() => go('personId' in route && route.personId ? { page: 'messages', from: currentTab } : { tab: currentTab })}
            >
              ‹ Retour
            </button>
            <h1>{page.label}</h1>
          </div>
        )}
        {saveError && (
          <div className="life__issues" role="alert">
            <p>{saveError}</p>
            {onRetrySave && (
              <button type="button" className="btn btn--secondary btn--small" onClick={onRetrySave}>
                Réessayer
              </button>
            )}
          </div>
        )}
        {!c.alive && (
          <p className="life__banner" role="status">
            {c.name} est décédé·e. Commence une nouvelle vie depuis le menu, ou fais un autre choix dans l’onglet Destins.
          </p>
        )}
        {issues.length > 0 && (
          <ul className="life__issues" role="alert">
            {issues.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        )}

        {'tab' in route && route.tab === 'vie' && (
          <VieTab
            state={state}
            onResult={apply}
            cards={cards}
            onDismiss={(seq) => remember({ ...seen, dismissed: [...seen.dismissed, seq] })}
            onDismissAll={() => remember({ lastSeq: state.nextLogSeq - 1, dismissed: [] })}
          />
        )}
        {'tab' in route && route.tab === 'temps' && <TempsTab state={state} onResult={apply} />}
        {'tab' in route && route.tab === 'social' && <SocialTab state={state} onResult={apply} onTalk={openThread} />}
        {'tab' in route && route.tab === 'monde' && <MondeTab state={state} onResult={apply} onState={onState} loadServices={mapServices} />}
        {'tab' in route && route.tab === 'destins' && <DestinyTab destiny={destiny} branchId={branchId} />}

        {page?.id === 'sante' && <SantePage state={state} onResult={apply} />}
        {page?.id === 'etudes' && <EtudesPage state={state} onResult={apply} onNavigate={toMonde} />}
        {page?.id === 'carriere' && <CarrierePage state={state} onResult={apply} onNavigate={toMonde} />}
        {page?.id === 'finances' && <FinancesPage state={state} onResult={apply} />}
        {page?.id === 'competences' && <CompetencesPage state={state} onResult={apply} />}
        {page?.id === 'messages' &&
          ('personId' in route && route.personId ? (
            <Conversation state={state} personId={route.personId} onResult={apply} onState={onState} ai={ai} />
          ) : (
            <MessagesPage state={state} onOpen={openThread} />
          ))}
        {page?.id === 'souvenirs' && <MemoriesPage state={state} />}
        {page?.id === 'journal' && <JournalPage state={state} />}
        {page?.id === 'parametres' && <SettingsPage ai={ai} />}
      </main>

      <nav className="tabbar" aria-label="Navigation principale">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={currentTab === t.id && !page ? 'tabbar__tab tabbar__tab--on' : 'tabbar__tab'}
            aria-current={currentTab === t.id && !page ? 'page' : undefined}
            onClick={() => go({ tab: t.id })}
          >
            <Icon name={t.icon} />
            <span>{t.label}</span>
            {t.id === 'vie' && cards.length > 0 && <span className="tabbar__badge" aria-label={`${cards.length} nouvelles cartes`}>{cards.length}</span>}
            {t.id === 'social' && unread > 0 && (
              <span className="tabbar__badge" aria-label={`${unread} messages non lus`}>
                {unread}
              </span>
            )}
          </button>
        ))}
      </nav>

      {menuOpen && (
        <div className="sheet-scrim" onClick={() => setMenuOpen(false)}>
          <div className="sheet" role="dialog" aria-modal="true" aria-label="Menu" onClick={(e) => e.stopPropagation()}>
            <div className="sheet__grip" aria-hidden="true" />
            <p className="sheet__branch">Branche : {branchName}</p>
            <ul className="sheet__list">
              {PAGES.map((p) => (
                <li key={p.id}>
                  <button type="button" className="sheet__item" onClick={() => go({ page: p.id, from: currentTab })}>
                    <span aria-hidden="true">{p.icon}</span>
                    {p.label}
                    {p.id === 'messages' && unread > 0 && <span className="badge">{unread}</span>}
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" className="btn btn--secondary" onClick={onQuit}>
              Retour à l’accueil
            </button>
            <button type="button" className="link sheet__close" onClick={() => setMenuOpen(false)}>
              Fermer
            </button>
          </div>
        </div>
      )}

      {scenes.length > 0 && <SceneOverlay scene={scenes[0]} remaining={scenes.length - 1} onClose={() => setScenes((q) => q.slice(1))} />}
    </div>
  )
}
