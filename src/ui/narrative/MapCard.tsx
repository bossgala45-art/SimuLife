import { useEffect, useMemo, useRef, useState } from 'react'
import { CONSENT_PURPOSES, ConsentRequiredError, grantConsent, hasConsent, withConsent } from '../../ai/consent.ts'
import { setHome, type SimulationState } from '../../engine/index.ts'
import { Geocoder, MAX_ZOOM, MIN_ZOOM, toPlace, visibleTiles, type MapServices, type PlaceResult } from '../map/osm.ts'
import ConsentDialog from './ConsentDialog.tsx'

type Props = {
  state: SimulationState
  onState: (state: SimulationState) => void
  loadServices: () => Promise<MapServices>
}

const HEIGHT = 240

/**
 * Carte du lieu de vie. Sans lieu choisi par le joueur, rien n'est affiché :
 * aucune position n'est inventée. Recherche et affichage demandent une autorisation.
 */
export default function MapCard({ state, onState, loadServices }: Props) {
  const [services, setServices] = useState<MapServices | null>(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PlaceResult[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [consentFor, setConsentFor] = useState<'search' | 'tiles' | null>(null)
  const [showTiles, setShowTiles] = useState(() => hasConsent('openstreetmap'))
  const [zoom, setZoom] = useState(12)
  const [width, setWidth] = useState(320)
  const box = useRef<HTMLDivElement>(null)
  const geocoder = useMemo(() => (services ? new Geocoder(services) : null), [services])
  const home = state.world.home

  useEffect(() => {
    let alive = true
    loadServices().then((s) => alive && setServices(s))
    return () => {
      alive = false
    }
  }, [loadServices])

  useEffect(() => {
    const el = box.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)))
    observer.observe(el)
    return () => observer.disconnect()
  }, [showTiles, home])

  async function search(once: boolean) {
    if (!geocoder) return
    setConsentFor(null)
    setError(null)
    setBusy(true)
    try {
      setResults(await withConsent('openstreetmap', () => geocoder.search(query), { once }))
    } catch (e) {
      if (e instanceof ConsentRequiredError) setConsentFor('search')
      else setError(e instanceof Error ? e.message : 'Recherche impossible.')
    } finally {
      setBusy(false)
    }
  }

  function choose(r: PlaceResult) {
    const placed = setHome(state, toPlace(r))
    if (placed.ok) {
      onState(placed.state)
      setResults(null)
      setQuery('')
    } else setError(placed.message)
  }

  if (!services) return null

  return (
    <section className="card" aria-labelledby="map-title">
      <h2 id="map-title">Carte</h2>
      {!services.enabled ? (
        <p className="hint">Carte indisponible : {services.reason}</p>
      ) : !home ? (
        <>
          <p className="hint">Aucun lieu n’est associé à cette vie : la carte n’affiche rien d’inventé. Tu peux en choisir un (facultatif).</p>
          <form
            className="free"
            onSubmit={(e) => {
              e.preventDefault()
              void search(false)
            }}
          >
            <input aria-label="Ville ou quartier" value={query} maxLength={100} placeholder="Une ville, pas ton adresse" onChange={(e) => setQuery(e.target.value)} />
            <button type="submit" className="btn btn--secondary" disabled={busy || query.trim().length < 2}>
              Chercher
            </button>
          </form>
          {error && <p className="question__error">{error}</p>}
          {results && results.length === 0 && <p className="hint">Aucun résultat.</p>}
          {results && results.length > 0 && (
            <ul className="actions">
              {results.map((r) => (
                <li key={`${r.lat},${r.lon}`}>
                  <button type="button" className="action" onClick={() => choose(r)}>
                    <span className="action__label">{r.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="hint">Recherche : Nominatim (OpenStreetMap), données © les contributeurs d’OpenStreetMap (ODbL).</p>
        </>
      ) : (
        <>
          <p>{home.label}</p>
          {showTiles ? (
            <>
              <div className="map" ref={box} style={{ height: HEIGHT }}>
                {visibleTiles(services, home.lat, home.lon, zoom, width, HEIGHT).map((t) => (
                  <img key={t.key} src={t.url} alt="" width={256} height={256} style={{ left: t.left, top: t.top }} draggable={false} />
                ))}
                <span className="map__pin" aria-hidden="true" />
                <div className="map__zoom">
                  <button type="button" aria-label="Zoomer" disabled={zoom >= MAX_ZOOM} onClick={() => setZoom((z) => z + 1)}>
                    +
                  </button>
                  <button type="button" aria-label="Dézoomer" disabled={zoom <= MIN_ZOOM} onClick={() => setZoom((z) => z - 1)}>
                    −
                  </button>
                </div>
                <a className="map__credit" href={services.copyright} target="_blank" rel="noreferrer">
                  © contributeurs d’OpenStreetMap
                </a>
              </div>
            </>
          ) : (
            <button type="button" className="btn btn--secondary" onClick={() => (hasConsent('openstreetmap') ? setShowTiles(true) : setConsentFor('tiles'))}>
              Afficher la carte
            </button>
          )}
          <p className="hint">
            Coordonnées : {home.lat.toFixed(4)}, {home.lon.toFixed(4)} · Source : {home.source} · {home.licence}
          </p>
          <button
            type="button"
            className="link link--danger"
            onClick={() => {
              const cleared = setHome(state, null)
              if (cleared.ok) onState(cleared.state)
            }}
          >
            Retirer ce lieu
          </button>
        </>
      )}

      {consentFor && (
        <ConsentDialog
          purpose={CONSENT_PURPOSES.openstreetmap}
          preview={consentFor === 'search' ? `Recherche : « ${query.trim()} »` : `Images de carte autour de : ${home?.label ?? ''}`}
          onOnce={() => (consentFor === 'search' ? void search(true) : (setConsentFor(null), setShowTiles(true)))}
          onAlways={() => {
            grantConsent('openstreetmap')
            if (consentFor === 'search') void search(false)
            else {
              setConsentFor(null)
              setShowTiles(true)
            }
          }}
          onRefuse={() => setConsentFor(null)}
        />
      )}
    </section>
  )
}
