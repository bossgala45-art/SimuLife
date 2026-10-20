/**
 * Avatar 3D léger (React Three Fiber) : uniquement des formes simples générées
 * par le code (aucun modèle ni texture externe), peu de polygones, pas d'ombres.
 * Chargé à la demande : Three.js n'est téléchargé que si cet avatar est affiché.
 */
import { Canvas, useFrame } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import type { Group } from 'three'
import { skinTone, type AvatarLook } from './look.ts'

type Props = {
  look: AvatarLook
  animate: boolean
  /** Le navigateur a perdu le contexte WebGL (mémoire, mise en arrière-plan…). */
  onContextLost: () => void
}

function Figure({ look, animate }: { look: AvatarLook; animate: boolean }) {
  const body = useRef<Group>(null)
  useFrame(({ clock }) => {
    if (!animate || !body.current) return
    const t = clock.elapsedTime
    // Respiration plus lente quand le personnage est fatigué.
    body.current.position.y = Math.sin(t * (1 + look.energy) * 1.6) * 0.025
    body.current.rotation.y = Math.sin(t * 0.45) * 0.18
  })

  const skin = skinTone(look)
  const smile = look.expression === 'happy'
  return (
    <group ref={body} rotation={[0, 0, look.alive ? 0 : 0.12]}>
      {/* Ombre au sol */}
      <mesh position={[0, -0.12, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.55, 24]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.18} />
      </mesh>
      {/* Corps */}
      <mesh position={[0, 0.42, 0]} scale={[1, 1 - look.droop * 0.06, 1]}>
        <capsuleGeometry args={[0.36, 0.5, 6, 16]} />
        <meshStandardMaterial color={look.outfit} roughness={0.85} />
      </mesh>
      {/* Tête, qui penche avec la fatigue */}
      <group position={[0, 1.13 - look.droop * 0.05, 0]} rotation={[look.droop * 0.3, 0, 0]}>
        <mesh>
          <sphereGeometry args={[0.34, 24, 16]} />
          <meshStandardMaterial color={skin} roughness={0.7} />
        </mesh>
        <mesh position={[0, 0.03, -0.01]}>
          <sphereGeometry args={[0.355, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.48]} />
          <meshStandardMaterial color={look.hair} roughness={0.9} />
        </mesh>
        {[-0.12, 0.12].map((x) => (
          <mesh key={x} position={[x, 0.02, 0.31]} scale={[1, look.eyeOpen, 1]}>
            <sphereGeometry args={[0.045, 12, 8]} />
            <meshStandardMaterial color="#1e1b2e" />
          </mesh>
        ))}
        {look.expression === 'neutral' ? (
          <mesh position={[0, -0.13, 0.32]}>
            <boxGeometry args={[0.13, 0.025, 0.02]} />
            <meshStandardMaterial color="#5a2a2a" />
          </mesh>
        ) : (
          // Arc de tore : sourire vers le bas (∪) ou moue vers le haut (∩).
          <mesh position={[0, smile ? -0.08 : -0.16, 0.31]} rotation={[0, 0, smile ? Math.PI : 0]}>
            <torusGeometry args={[0.08, 0.016, 8, 16, Math.PI]} />
            <meshStandardMaterial color="#5a2a2a" />
          </mesh>
        )}
      </group>
    </group>
  )
}

export default function Avatar3D({ look, animate, onContextLost }: Props) {
  // En quittant l'écran, la bibliothèque libère volontairement le contexte WebGL :
  // ce n'est pas une panne, l'avatar 3D doit rester disponible ensuite.
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ position: [0, 0.85, 3.1], fov: 34 }}
      gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
      frameloop={animate ? 'always' : 'demand'}
      onCreated={({ gl, camera }) => {
        camera.lookAt(0, 0.7, 0)
        gl.domElement.addEventListener('webglcontextlost', (e) => {
          e.preventDefault()
          if (mounted.current && gl.domElement.isConnected) onContextLost()
        })
      }}
    >
      <hemisphereLight args={['#ffffff', '#3b3f5c', 1.3]} />
      <directionalLight position={[2, 3, 2.5]} intensity={1.5} />
      <Figure look={look} animate={animate} />
    </Canvas>
  )
}
