import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/global.css'
import App from './app/App.tsx'
import { registerServiceWorker } from './pwa/register.ts'
import SettingsProvider from './ui/SettingsProvider.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SettingsProvider>
      <App />
    </SettingsProvider>
  </StrictMode>,
)

if (import.meta.env.PROD) registerServiceWorker()
