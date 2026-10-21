/**
 * Enregistre le service worker (version de production uniquement) :
 * l'application installée s'ouvre ensuite sans connexion.
 */
export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL }).catch(() => {
      // Sans service worker, l'application fonctionne en ligne comme avant.
    })
  })
}
