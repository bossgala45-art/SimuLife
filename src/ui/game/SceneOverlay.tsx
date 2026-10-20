import { useEffect, useRef } from 'react'
import type { Scene, SceneKind } from './scenes.ts'

/** Emblème de chaque scène ; le décor (étincelles) est animé en CSS et suit le réglage des animations. */
const ART: Record<SceneKind, string> = {
  diploma: '🎓',
  hired: '💼',
  birthday: '🎂',
  raise: '📈',
  layoff: '📦',
  loss: '🕯️',
  death: '🕊️',
  branch: '🌱',
  start: '🌅',
}

type Props = { scene: Scene; remaining: number; onClose: () => void }

/** Scène plein écran d'un moment important de la vie. */
export default function SceneOverlay({ scene, remaining, onClose }: Props) {
  const button = useRef<HTMLButtonElement>(null)
  useEffect(() => button.current?.focus(), [scene.seq])

  return (
    <div className={`scene scene--${scene.tone}`} role="dialog" aria-modal="true" aria-labelledby="scene-title">
      <div className="scene__sky" aria-hidden="true">
        {Array.from({ length: 12 }, (_, i) => (
          <span key={i} className="scene__spark" style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i % 6) * 0.35}s` }} />
        ))}
      </div>
      <div className="scene__body">
        <p className="scene__art" aria-hidden="true">
          {ART[scene.kind]}
        </p>
        <h2 id="scene-title">{scene.title}</h2>
        <p>{scene.message}</p>
        <button ref={button} type="button" className="btn btn--primary" onClick={onClose}>
          {remaining > 0 ? `Continuer (${remaining})` : 'Continuer'}
        </button>
      </div>
    </div>
  )
}
