import { useState } from 'react'
import { ageAt, formatDate, type SimulationState } from '../engine/index.ts'
import { clearGame, loadGame, saveGame } from '../storage/savegame.ts'
import DossierScreen from '../ui/dossier/DossierScreen.tsx'
import HomeScreen from '../ui/screens/HomeScreen.tsx'
import LifeScreen from '../ui/screens/LifeScreen.tsx'
import NewLifeScreen from '../ui/screens/NewLifeScreen.tsx'
import { isStandalone } from '../ui/platform.ts'

type Screen = 'home' | 'new' | 'life' | 'dossier'

function today() {
  const now = new Date()
  return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() }
}

export default function App() {
  const [initial] = useState(loadGame)
  const [game, setGame] = useState<SimulationState | null>(initial.status === 'loaded' ? initial.state : null)
  const [screen, setScreen] = useState<Screen>('home')
  const [saveError, setSaveError] = useState<string | null>(null)

  function update(state: SimulationState) {
    setGame(state)
    setSaveError(saveGame(state))
  }

  function startLife(state: SimulationState) {
    clearGame()
    update(state)
    setScreen('life')
  }

  const loadError = initial.status === 'error' && !game ? `Sauvegarde illisible : ${initial.message}` : undefined

  return (
    <>
      {screen === 'home' && (
        <HomeScreen
          installed={isStandalone()}
          savedLife={
            game
              ? `${game.character.name}, ${ageAt(game.character.birthDate, game.clock)} ans — ${formatDate(game.clock)}`
              : undefined
          }
          loadError={saveError ?? loadError}
          onNewLife={() => setScreen('new')}
          onDossier={() => setScreen('dossier')}
          onContinue={() => setScreen('life')}
        />
      )}
      {screen === 'dossier' && (
        <DossierScreen today={today()} onBack={() => setScreen('home')} onStartLife={startLife} />
      )}
      {screen === 'new' && <NewLifeScreen onCreate={startLife} onCancel={() => setScreen('home')} />}
      {screen === 'life' && game && <LifeScreen state={game} onChange={update} onQuit={() => setScreen('home')} />}
      <div className="rotate-hint">
        <p>Tourne ton iPhone en mode portrait pour jouer.</p>
      </div>
    </>
  )
}
