/**
 * Indique si l'application tourne depuis l'écran d'accueil (mode « app »)
 * plutôt que dans un onglet Safari.
 */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  // Propriété propriétaire de Safari iOS.
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  const displayStandalone = window.matchMedia?.('(display-mode: standalone)').matches ?? false
  return iosStandalone || displayStandalone
}
