import HomeScreen from '../ui/screens/HomeScreen.tsx'
import { isStandalone } from '../ui/platform.ts'

export default function App() {
  return (
    <>
      <HomeScreen installed={isStandalone()} />
      <div className="rotate-hint">
        <p>Tourne ton iPhone en mode portrait pour jouer.</p>
      </div>
    </>
  )
}
