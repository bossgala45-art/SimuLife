/**
 * Service worker (version de production uniquement) : l'application installée
 * s'ouvre sans connexion et se met à jour d'elle-même.
 *
 * - Une nouvelle version est cherchée au lancement et à chaque retour dans l'application.
 * - Quand elle est prête, l'application est prévenue (`onUpdateReady`) et décide du
 *   moment : tout de suite à l'accueil, sinon après accord du joueur (rien n'est perdu :
 *   les sauvegardes en cours sont terminées avant de recharger).
 */

type Listener = () => void

let waiting: ServiceWorker | null = null
let applying = false
const listeners = new Set<Listener>()

function announce(worker: ServiceWorker): void {
  waiting = worker
  listeners.forEach((l) => l())
}

/** Prévenir quand une mise à jour est prête ; renvoie la fonction de désabonnement. */
export function onUpdateReady(listener: Listener): () => void {
  listeners.add(listener)
  if (waiting) listener()
  return () => listeners.delete(listener)
}

/** Active la nouvelle version puis recharge l'application. */
export function applyUpdate(): void {
  if (!waiting || applying) return
  applying = true
  waiting.postMessage('SKIP_WAITING')
}

export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return
  // Recharger seulement quand c'est nous qui avons demandé la mise à jour
  // (pas lors de la toute première installation).
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (applying) window.location.reload()
  })
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
      const watch = (worker: ServiceWorker | null) => {
        if (!worker) return
        const check = () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) announce(worker)
        }
        check()
        worker.addEventListener('statechange', check)
      }
      watch(registration.waiting)
      registration.addEventListener('updatefound', () => watch(registration.installing))
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') registration.update().catch(() => {})
      })
    } catch {
      // Sans service worker, l'application fonctionne en ligne comme avant.
    }
  })
}
