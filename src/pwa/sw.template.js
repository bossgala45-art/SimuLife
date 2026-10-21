/* Service worker de SIMULIFE (généré au build : liste des fichiers et version insérées).
 *
 * - Fichiers de l'application : mis en cache à l'installation, servis hors ligne.
 * - Pages : réseau d'abord, puis copie locale si l'appareil est hors ligne.
 * - services.json : réseau d'abord (la carte peut être coupée sans mise à jour).
 * - Autres sites (cartes OpenStreetMap…) : jamais interceptés ni stockés par l'application.
 * Une nouvelle version attend l'accord de l'application (message SKIP_WAITING), qui choisit
 * un moment sans risque pour recharger, ou s'active quand toutes ses fenêtres sont fermées.
 */
const VERSION = '__VERSION__'
const CACHE = `simulife-${VERSION}`
const PRECACHE = __PRECACHE__

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)))
})

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('simulife-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

async function networkFirst(request, fallback) {
  try {
    const response = await fetch(request)
    if (response.ok) (await caches.open(CACHE)).put(fallback ?? request, response.clone())
    return response
  } catch (error) {
    const cached = await caches.match(fallback ?? request)
    if (cached) return cached
    throw error
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, new URL('./', self.registration.scope).href))
    return
  }
  if (url.pathname.endsWith('/services.json')) {
    event.respondWith(networkFirst(request))
    return
  }
  event.respondWith(caches.match(request).then((hit) => hit ?? fetch(request)))
})
