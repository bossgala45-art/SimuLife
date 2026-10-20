import { useEffect, useState } from 'react'
import { sound } from '../audio/sound.ts'
import { avatar3dFailed, avatarMode } from '../avatar/webgl.ts'
import type { Settings } from '../settings.ts'
import { useSettings } from '../settingsContext.ts'

const THEMES: { id: Settings['theme']; label: string }[] = [
  { id: 'auto', label: 'Automatique' },
  { id: 'light', label: 'Clair' },
  { id: 'dark', label: 'Sombre' },
]

const MOTIONS: { id: Settings['motion']; label: string }[] = [
  { id: 'auto', label: 'Selon l’iPhone' },
  { id: 'reduced', label: 'Réduites' },
  { id: 'full', label: 'Complètes' },
]

const AVATAR_MODES: Record<ReturnType<typeof avatarMode>, string> = {
  '3d': 'Avatar 3D actif.',
  '2d-disabled': 'Avatar 2D (3D désactivée).',
  '2d-no-webgl': 'Avatar 2D : WebGL n’est pas disponible sur cet appareil.',
  '2d-error': 'Avatar 2D : le rendu 3D a échoué.',
}

type Storage = { usage: number; quota: number; persisted: boolean | null } | 'unavailable' | null

function Choice<T extends string>({ legend, value, options, onChange }: { legend: string; value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <fieldset className="choice">
      <legend>{legend}</legend>
      <div className="segmented">
        {options.map((o) => (
          <label key={o.id} className={o.id === value ? 'segmented__option segmented__option--on' : 'segmented__option'}>
            <input type="radio" name={legend} value={o.id} checked={o.id === value} onChange={() => onChange(o.id)} />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

function Volume({ label, value, disabled, onChange }: { label: string; value: number; disabled: boolean; onChange: (v: number) => void }) {
  return (
    <label className="volume">
      <span>{label}</span>
      <input type="range" min={0} max={100} step={5} value={Math.round(value * 100)} disabled={disabled} onChange={(e) => onChange(Number(e.target.value) / 100)} />
      <span className="volume__value">{Math.round(value * 100)} %</span>
    </label>
  )
}

/** Réglages réels : thème, animations, avatar, musique, effets, stockage. */
export default function SettingsPage() {
  const { settings, update, persisted } = useSettings()
  const [storage, setStorage] = useState<Storage>(null)

  useEffect(() => {
    const api = typeof navigator !== 'undefined' ? navigator.storage : undefined
    if (!api?.estimate) {
      Promise.resolve().then(() => setStorage('unavailable'))
      return
    }
    Promise.all([api.estimate(), api.persisted ? api.persisted() : Promise.resolve(null)])
      .then(([e, p]) => setStorage({ usage: e.usage ?? 0, quota: e.quota ?? 0, persisted: p }))
      .catch(() => setStorage('unavailable'))
  }, [])

  const mode = avatarMode(settings.avatar3d, avatar3dFailed())
  const mb = (n: number) => `${(n / 1024 / 1024).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} Mo`

  return (
    <>
      {!persisted && (
        <p className="life__issues" role="alert">
          Les réglages ne peuvent pas être enregistrés sur cet appareil : ils seront perdus à la fermeture.
        </p>
      )}
      <section className="card" aria-labelledby="look-title">
        <h2 id="look-title">Affichage</h2>
        <Choice legend="Thème" value={settings.theme} options={THEMES} onChange={(theme) => update({ theme })} />
        <Choice legend="Animations" value={settings.motion} options={MOTIONS} onChange={(motion) => update({ motion })} />
        <label className="switch">
          <input type="checkbox" checked={settings.avatar3d} onChange={(e) => update({ avatar3d: e.target.checked })} />
          <span>Avatar en 3D</span>
        </label>
        <p className="hint" data-testid="avatar-mode">
          {AVATAR_MODES[mode]}
        </p>
      </section>

      <section className="card" aria-labelledby="sound-title">
        <h2 id="sound-title">Son</h2>
        {!sound.available && <p className="hint">Le son n’est pas disponible sur ce navigateur.</p>}
        <label className="switch">
          <input type="checkbox" checked={settings.music} onChange={(e) => update({ music: e.target.checked })} />
          <span>Musique</span>
        </label>
        <Volume label="Volume de la musique" value={settings.musicVolume} disabled={!settings.music} onChange={(musicVolume) => update({ musicVolume })} />
        <label className="switch">
          <input type="checkbox" checked={settings.sfx} onChange={(e) => update({ sfx: e.target.checked })} />
          <span>Effets sonores</span>
        </label>
        <Volume label="Volume des effets" value={settings.sfxVolume} disabled={!settings.sfx} onChange={(sfxVolume) => update({ sfxVolume })} />
        <button
          type="button"
          className="btn btn--secondary"
          disabled={!sound.available || !settings.sfx}
          onClick={() => {
            sound.unlock()
            sound.play('success')
          }}
        >
          Tester les effets
        </button>
        <p className="hint">Musique et effets sont synthétisés par l’application (aucun fichier audio). Sur iPhone, le mode silencieux peut couper le son.</p>
      </section>

      <section className="card" aria-labelledby="storage-title">
        <h2 id="storage-title">Stockage sur l’appareil</h2>
        {storage === null && <p className="hint">Mesure en cours…</p>}
        {storage === 'unavailable' && <p className="hint">Le navigateur ne donne pas d’estimation de l’espace utilisé.</p>}
        {storage !== null && storage !== 'unavailable' && (
          <dl className="facts-list">
            <div>
              <dt>Espace utilisé</dt>
              <dd>{mb(storage.usage)}</dd>
            </div>
            <div>
              <dt>Espace disponible (estimation du navigateur)</dt>
              <dd>{mb(storage.quota)}</dd>
            </div>
            {storage.persisted !== null && (
              <div>
                <dt>Stockage protégé du nettoyage automatique</dt>
                <dd>{storage.persisted ? 'Oui' : 'Non'}</dd>
              </div>
            )}
          </dl>
        )}
        <p className="hint">Tes vies restent sur cet iPhone. Exporte-les depuis l’onglet Destins pour en garder une copie.</p>
      </section>
    </>
  )
}
