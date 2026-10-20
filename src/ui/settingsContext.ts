import { createContext, useContext } from 'react'
import { DEFAULT_SETTINGS, type Settings } from './settings.ts'

export interface SettingsValue {
  settings: Settings
  update: (patch: Partial<Settings>) => void
  /** `false` si les réglages ne peuvent pas être enregistrés sur cet appareil. */
  persisted: boolean
}

export const SettingsContext = createContext<SettingsValue>({ settings: DEFAULT_SETTINGS, update: () => {}, persisted: false })

export const useSettings = () => useContext(SettingsContext)
