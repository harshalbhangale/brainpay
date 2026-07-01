import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { VRMLoaderPlugin, VRMUtils, type VRM } from '@pixiv/three-vrm'

export type CompanionMood = 'neutral' | 'happy' | 'sad' | 'surprised'

/**
 * The BrainPal anime companion, rendered as a live VRM avatar.
 *
 * - Natural idle: arms rest at the sides (out of the default T-pose), with
 *   breathing, weight-shift, gentle arm sway, and head motion.
 * - Lip-sync: the mouth ('aa') follows the speaking level via getLevel().
 * - Reactions: `mood` maps to VRM expression presets.
 * - Framing auto-fits the whole model so the hair is never cropped.
 */
export function VrmCompanion({
  src,
  getLevel,
  mood = 'neutral',
  className,
}: {
  src: string
  getLevel?: () => number
  mood?: CompanionMood
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
    setLoading(true)

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    mount.appendChild(renderer.domElement)
    renderer.domElement.style.width = '100%'
    renderer.domElement.style.height = '100%'

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50)

    const key = new THREE.DirectionalLight(0xffffff, 2.4)
    key.position.set(0.5, 2, 2.5)
    scene.add(key)
    const rim = new THREE.DirectionalLight(0xcfe9ff, 0.8)
    rim.position.set(-1.5, 1.5, -1.5)
    scene.add(rim)
    scene.add(new THREE.AmbientLight(0xffffff, 1.5))

    // Frame the upper body: top of hair → hips, so the face reads clearly
    // while the arms/hands stay in shot for visible movement.
    function fitView() {
      if (!vrm) return
      vrm.scene.updateMatrixWorld(true)
      const box = new THREE.Box3().setFromObject(vrm.scene)
      const size = new THREE.Vector3()
      box.getSize(size)
      const head = vrm.humanoid?.getNormalizedBoneNode('head')
      const hips = vrm.humanoid?.getNormalizedBoneNode('hips')
      const topY = box.max.y
      const hipsY = hips ? hips.getWorldPosition(new THREE.Vector3()).y : box.min.y + size.y * 0.45
      const viewTop = topY + size.y * 0.04
      const viewBottom = hipsY - size.y * 0.02
      const viewHeight = Math.max(0.4, viewTop - viewBottom)
      const fov = (camera.fov * Math.PI) / 180
      const dist = (viewHeight / 2 / Math.tan(fov / 2)) * 1.04
      const cx = head ? head.getWorldPosition(new THREE.Vector3()).x : 0
      const centerY = (viewTop + viewBottom) / 2
      camera.position.set(cx, centerY, dist)
      camera.lookAt(cx, centerY, 0)
      camera.updateProjectionMatrix()
    }

    function resize() {
      const w = mount!.clientWidth || 1
      const h = mount!.clientHeight || 1
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      fitView()
    }

    const loader = new GLTFLoader()
    loader.register((parser) => new VRMLoaderPlugin(parser))

    const clock = new THREE.Clock()
    let blinkTimer = 1 + Math.random() * 3
    let blink = 0
    let nextGlance = 3 + Math.random() * 4
    let glance = 0
    let nextGesture = 3 + Math.random() * 3
    let gesture = 0
    const expr = { happy: 0, sad: 0, surprised: 0, aa: 0 }

    // Rest pose offsets (radians) to bring arms down from the T-pose.
    const REST = {
      upperArmZ: 1.2, // brought to sides
      upperArmX: 0.12,
      lowerArmZ: 0.18,
    }

    loader.load(
      src,
      (gltf) => {
        if (disposed) return
        vrm = gltf.userData.vrm as VRM
        VRMUtils.removeUnnecessaryVertices(gltf.scene)
        VRMUtils.combineSkeletons(gltf.scene)
        vrm.scene.rotation.y = 0
        scene.add(vrm.scene)
        resize()
        setLoading(false)
      },
      undefined,
      (err) => {
        // eslint-disable-next-line no-console
        console.error('VRM load failed', err)
      },
    )

    const bone = (n: Parameters<NonNullable<VRM['humanoid']>['getNormalizedBoneNode']>[0]) =>
      vrm?.humanoid?.getNormalizedBoneNode(n) ?? null

    // Render at ~30fps (plenty for idle motion + lip-sync) and pause entirely
    // when the tab is hidden — halves CPU/GPU vs an unthrottled rAF, which is
    // the main cause of jank while the realtime audio pipeline also runs.
    const FRAME_MS = 1000 / 30
    let lastFrame = 0
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      if (typeof document !== 'undefined' && document.hidden) return
      if (now - lastFrame < FRAME_MS) return
      lastFrame = now
      const dt = Math.min(clock.getDelta(), 0.05)
      const t = clock.elapsedTime

      if (vrm) {
        // ── Periodic gesture: every few seconds raise/relax the forearms ──
        nextGesture -= dt
        if (nextGesture <= 0) {
          gesture = 1
          nextGesture = 5 + Math.random() * 5
        }
        gesture = Math.max(0, gesture - dt * 0.8)
        const gWave = Math.sin(gesture * Math.PI) // 0→1→0 over the gesture

        // ── Arms: rest down + sway + gesture lift ──
        const lUp = bone('leftUpperArm')
        const rUp = bone('rightUpperArm')
        const lLow = bone('leftLowerArm')
        const rLow = bone('rightLowerArm')
        const sway = Math.sin(t * 1.1) * 0.1
        const breathe = Math.sin(t * 1.6) * 0.03
        if (lUp) {
          lUp.rotation.z = -REST.upperArmZ - sway - gWave * 0.25
          lUp.rotation.x = REST.upperArmX + breathe + gWave * 0.15
        }
        if (rUp) {
          rUp.rotation.z = REST.upperArmZ + sway + gWave * 0.25
          rUp.rotation.x = REST.upperArmX + breathe + gWave * 0.15
        }
        // Elbows bend, and bend more during a gesture (hands come up/forward).
        if (lLow) lLow.rotation.z = -REST.lowerArmZ - 0.1 - gWave * 0.7 - Math.max(0, Math.sin(t * 0.8)) * 0.1
        if (rLow) rLow.rotation.z = REST.lowerArmZ + 0.1 + gWave * 0.7 + Math.max(0, Math.sin(t * 0.8 + 1)) * 0.1

        // ── Body: breathing + slow weight shift ──
        const spine = bone('spine')
        if (spine) {
          spine.rotation.x = Math.sin(t * 1.6) * 0.025
          spine.rotation.z = Math.sin(t * 0.45) * 0.04
        }
        const chest = bone('chest')
        if (chest) chest.rotation.x = Math.sin(t * 1.6 + 0.5) * 0.02

        // ── Head: subtle motion + occasional glance ──
        nextGlance -= dt
        if (nextGlance <= 0) {
          glance = (Math.random() - 0.5) * 0.5
          nextGlance = 3 + Math.random() * 5
        }
        glance *= 1 - Math.min(1, dt * 1.5)
        const head = bone('head')
        if (head) {
          head.rotation.z = Math.sin(t * 0.7) * 0.03
          head.rotation.y = glance
          head.rotation.x = Math.sin(t * 0.9) * 0.02
        }

        // ── Blink ──
        blinkTimer -= dt
        if (blinkTimer <= 0) {
          blink = 1
          blinkTimer = 2.5 + Math.random() * 3.5
        }
        blink = Math.max(0, blink - dt * 7)

        // ── Lip-sync + mood ──
        const target = Math.min(1, levelRef.current() * 1.2)
        expr.aa += (target - expr.aa) * Math.min(1, dt * 18)
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
    raf = requestAnimationFrame(tick)

    const ro = new ResizeObserver(() => resize())
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
      // Free the WebGL context now (see GlbCompanion) so switching avatars or
      // opening the camera never leaks contexts until the browser blanks one.
      try { renderer.forceContextLoss() } catch { /* not all browsers */ }
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement)
    }
  }, [src])

  return (
    <div ref={mountRef} className={className ?? 'relative h-full w-full'}>
      {loading && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="flex items-center gap-1.5 rounded-full bg-black/40 px-3 py-1.5 text-xs text-white backdrop-blur">
            <span className="dot h-1.5 w-1.5 rounded-full bg-white" style={{ animationDelay: '0ms' }} />
            <span className="dot h-1.5 w-1.5 rounded-full bg-white" style={{ animationDelay: '160ms' }} />
            <span className="dot h-1.5 w-1.5 rounded-full bg-white" style={{ animationDelay: '320ms' }} />
          </div>
        </div>
      )}
    </div>
  )
}
