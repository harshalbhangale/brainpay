import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { VRMLoaderPlugin, VRMUtils, type VRM } from '@pixiv/three-vrm'

export type CompanionMood = 'neutral' | 'happy' | 'sad' | 'surprised'

/**
 * Mika — the BrainPal anime companion, rendered as a live VRM avatar.
 *
 * - Idle life: breathing sway, auto-blink, spring-bone hair physics.
 * - Lip-sync: the mouth ('aa' viseme) follows PAL's speaking level via getLevel().
 * - Reactions: `mood` maps to VRM expression presets (happy on a great pick,
 *   sad/surprised on "think twice").
 *
 * `compact` renders a tight face/bust framing for the chat dock; otherwise a
 * fuller upper-body framing for the camera overlay.
 */
export function VrmCompanion({
  getLevel,
  mood = 'neutral',
  compact = false,
  className,
}: {
  getLevel?: () => number
  mood?: CompanionMood
  compact?: boolean
  className?: string
}) {
  const mountRef = useRef<HTMLDivElement>(null)
  const moodRef = useRef<CompanionMood>(mood)
  const levelRef = useRef<() => number>(getLevel ?? (() => 0))
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    moodRef.current = mood
  }, [mood])
  useEffect(() => {
    levelRef.current = getLevel ?? (() => 0)
  }, [getLevel])

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    let disposed = false
    let raf = 0
    let vrm: VRM | null = null

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    mount.appendChild(renderer.domElement)
    renderer.domElement.style.width = '100%'
    renderer.domElement.style.height = '100%'

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 20)

    // Soft, flattering light for the toon shading.
    const key = new THREE.DirectionalLight(0xffffff, 2.2)
    key.position.set(1, 2, 2.5)
    scene.add(key)
    scene.add(new THREE.AmbientLight(0xffffff, 1.4))

    function resize() {
      const w = mount!.clientWidth || 1
      const h = mount!.clientHeight || 1
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }

    // Framing: head+bust for compact, upper body otherwise.
    function frame() {
      if (compact) {
        camera.position.set(0, 1.33, 0.78)
        camera.lookAt(0, 1.32, 0)
      } else {
        camera.position.set(0, 1.18, 1.15)
        camera.lookAt(0, 1.1, 0)
      }
    }

    const loader = new GLTFLoader()
    loader.register((parser) => new VRMLoaderPlugin(parser))

    const clock = new THREE.Clock()
    let blinkTimer = 1 + Math.random() * 3
    let blink = 0
    const expr: Record<string, number> = { happy: 0, sad: 0, surprised: 0, aa: 0 }

    loader.load(
      '/mika.vrm',
      (gltf) => {
        if (disposed) return
        vrm = gltf.userData.vrm as VRM
        VRMUtils.removeUnnecessaryVertices(gltf.scene)
        VRMUtils.combineSkeletons(gltf.scene)
        // VRM 1.0 already faces +Z (toward camera); no rotation needed.
        vrm.scene.rotation.y = 0
        scene.add(vrm.scene)
        resize()
        frame()
        setLoading(false)
      },
      undefined,
      (err) => {
        // eslint-disable-next-line no-console
        console.error('VRM load failed', err)
      },
    )

    const tick = () => {
      raf = requestAnimationFrame(tick)
      const dt = clock.getDelta()
      const t = clock.elapsedTime

      if (vrm) {
        // Gentle breathing + idle sway.
        const spine = vrm.humanoid?.getNormalizedBoneNode('spine')
        if (spine) {
          spine.rotation.x = Math.sin(t * 1.1) * 0.02
          spine.rotation.y = Math.sin(t * 0.5) * 0.03
        }
        const head = vrm.humanoid?.getNormalizedBoneNode('head')
        if (head) head.rotation.z = Math.sin(t * 0.7) * 0.02

        // Auto-blink.
        blinkTimer -= dt
        if (blinkTimer <= 0) {
          blink = 1
          blinkTimer = 2.5 + Math.random() * 3.5
        }
        blink = Math.max(0, blink - dt * 7)

        // Lip-sync from speaking level.
        const target = Math.min(1, levelRef.current() * 1.2)
        expr.aa += (target - expr.aa) * Math.min(1, dt * 18)

        // Mood → expression presets (smoothed).
        const m = moodRef.current
        const approach = (cur: number, to: number) => cur + (to - cur) * Math.min(1, dt * 6)
        expr.happy = approach(expr.happy, m === 'happy' ? 0.9 : 0)
        expr.sad = approach(expr.sad, m === 'sad' ? 0.85 : 0)
        expr.surprised = approach(expr.surprised, m === 'surprised' ? 0.8 : 0)

        const em = vrm.expressionManager
        if (em) {
          em.setValue('blink', blink)
          em.setValue('aa', expr.aa)
          em.setValue('happy', expr.happy)
          em.setValue('sad', expr.sad)
          em.setValue('surprised', expr.surprised)
        }

        vrm.update(dt)
      }

      renderer.render(scene, camera)
    }
    tick()

    const ro = new ResizeObserver(() => {
      resize()
      frame()
    })
    ro.observe(mount)

    return () => {
      disposed = true
      cancelAnimationFrame(raf)
      ro.disconnect()
      if (vrm) {
        scene.remove(vrm.scene)
        VRMUtils.deepDispose(vrm.scene)
      }
      renderer.dispose()
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement)
    }
  }, [compact])

  return (
    <div ref={mountRef} className={className ?? 'relative h-full w-full'}>
      {loading && (
        <div className="absolute inset-0 flex items-end justify-center pb-6">
          <div className="flex items-center gap-1.5 rounded-full bg-black/40 px-3 py-1.5 text-xs text-white backdrop-blur">
            <span className="dot h-1.5 w-1.5 rounded-full bg-white" style={{ animationDelay: '0ms' }} />
            <span className="dot h-1.5 w-1.5 rounded-full bg-white" style={{ animationDelay: '160ms' }} />
            <span className="dot h-1.5 w-1.5 rounded-full bg-white" style={{ animationDelay: '320ms' }} />
            <span className="ml-1">waking Mika…</span>
          </div>
        </div>
      )}
    </div>
  )
}
