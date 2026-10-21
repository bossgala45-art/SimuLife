import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { sound } from './audio/sound.ts'
import { applySettings, loadSettings, saveSettings, type Settings } from './settings.ts'
import { SettingsContext } from './settingsContext.ts'

/** Fournit les réglages, les applique (thème, animations, son) et les enregistre. */
export default function SettingsProvider({ children, initial }: { children: ReactNode; initial?: Settings }) {
  const [settings, setSettings] = useState<Settings>(() => initial ?? loadSettings())
  const [persisted, setPersisted] = useState(true)

  useEffect(() => {
    applySettings(settings)
    sound.configure(settings)
  }, [settings])

  // Sur iPhone, le son ne démarre qu'après un premier geste de l'utilisateur.
  useEffect(() => {
    const unlock = () => sound.unlock()
    document.addEventListener('pointerdown', unlock, { once: true })
    return () => document.removeEventListener('pointerdown', unlock)
  }, [])

  const value = useMemo(
    () => ({
      settings,
      persisted,
      update: (patch: Partial<Settings>) => {
        const next = { ...settings, ...patch }
        setSettings(next)
        setPersisted(saveSettings(next))
      },
    }),
    [settings, persisted],
  )
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}
