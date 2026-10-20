import { skinTone, type AvatarLook } from './look.ts'

/** Avatar 2D (SVG) : repli quand WebGL est indisponible ou désactivé. Même apparence que l'avatar 3D. */
export default function AvatarSvg({ look }: { look: AvatarLook }) {
  const eyeRy = 7 * look.eyeOpen
  const mouth =
    look.expression === 'happy' ? 'M 88 112 Q 100 124 112 112' : look.expression === 'sad' ? 'M 88 118 Q 100 108 112 118' : 'M 89 115 L 111 115'
  const tilt = look.droop * 8
  return (
    <svg viewBox="0 0 200 220" className={look.alive ? 'avatar-svg avatar-svg--alive' : 'avatar-svg'} aria-hidden="true">
      <ellipse cx="100" cy="208" rx="52" ry="8" fill="currentColor" opacity="0.12" />
      <path d="M 52 205 Q 52 140 100 140 Q 148 140 148 205 Z" fill={look.outfit} />
      <g transform={`rotate(${tilt} 100 135)`}>
        <circle cx="100" cy="92" r="46" fill={skinTone(look)} />
        <path d="M 54 88 Q 56 40 100 42 Q 144 40 146 88 Q 130 64 100 64 Q 70 64 54 88 Z" fill={look.hair} />
        <ellipse cx="84" cy="94" rx="5.5" ry={eyeRy} fill="#1e1b2e" />
        <ellipse cx="116" cy="94" rx="5.5" ry={eyeRy} fill="#1e1b2e" />
        <path d={mouth} stroke="#5a2a2a" strokeWidth="4" fill="none" strokeLinecap="round" />
      </g>
    </svg>
  )
}
