import { Component, lazy, Suspense, useState, type ReactNode } from 'react'
import type { SimulationState } from '../../engine/index.ts'
import { prefersReducedMotion } from '../settings.ts'
import { useSettings } from '../settingsContext.ts'
import AvatarSvg from './AvatarSvg.tsx'
import { avatarLook } from './look.ts'
import { avatar3dFailed, avatarMode, markAvatar3dFailed } from './webgl.ts'
import './Avatar.css'

const Avatar3D = lazy(() => import('./Avatar3D.tsx'))

/** Toute erreur du rendu 3D bascule sur l'avatar 2D, sans casser l'écran. */
class Fallback3D extends Component<{ children: ReactNode; fallback: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch() {
    this.props.onError()
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

export default function Avatar({ state }: { state: SimulationState }) {
  const { settings } = useSettings()
  const [failed, setFailed] = useState(avatar3dFailed)
  const fail = () => {
    markAvatar3dFailed()
    setFailed(true)
  }
  const look = avatarLook(state)
  const flat = <AvatarSvg look={look} />
  const mode = avatarMode(settings.avatar3d, failed)

  return (
    <div className="avatar" role="img" aria-label={look.label} data-mode={mode}>
      {mode === '3d' ? (
        <Fallback3D fallback={flat} onError={fail}>
          <Suspense fallback={flat}>
            <Avatar3D look={look} animate={!prefersReducedMotion(settings) && look.alive} onContextLost={fail} />
          </Suspense>
        </Fallback3D>
      ) : (
        flat
      )}
    </div>
  )
}
