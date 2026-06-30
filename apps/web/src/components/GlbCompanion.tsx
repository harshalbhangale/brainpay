import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { CompanionMood } from './VrmCompanion'

/**
 * GlbCompanion — renders a VRoid character exported as plain glTF (.glb).
 *
 * These files carry the VRoid rig (J_Bip_* bones) and the VRoid facial
 * blendshapes (Fcl_*), but NOT the VRM extension — so we drive them directly
 * with three.js instead of @pixiv/three-vrm:
 *   - Idle:     subtle ADDITIVE motion on top of the model's natural pose
 *               (breathing, weight-shift, head sway/glance) — additive because
 *               raw glTF bone axes differ from VRM's normalised humanoid bones,
 *               so we never force an absolute pose.
 *   - Blink:    Fcl_EYE_Close.
 *   - Lip-sync: Fcl_MTH_A follows the speaking level via getLevel().
 *   - Mood:     expressive eyes (Fcl_EYE_Joy / _Sorrow / _Surprised) so they
 *               never fight the mouth lip-sync.
 *
 * Textures are WebP/≤1024px (see public/avatars), so these load far faster than
 * the legacy 16 MB VRMs.
 */
export function GlbCompanion({
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
    let root: THREE.Object3D | null = null
    setLoading(true)

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    mount.appendChild(renderer.domElement)
    renderer.domElement.style.width = '100%'
    renderer.domElement.style.height = '100%'

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50)

    const key = new THREE.DirectionalLight(0xffffff, 2.2)
    key.position.set(0.5, 2, 2.5)
    scene.add(key)
    const rim = new THREE.DirectionalLight(0xcfe9ff, 0.7)
    rim.position.set(-1.5, 1.5, -1.5)
    scene.add(rim)
    scene.add(new THREE.AmbientLight(0xffffff, 1.6))

    // ── Bone + morph maps, filled on load ───────────────────────────────
    const bones = new Map<string, THREE.Object3D>()
    const baseRot = new Map<string, THREE.Euler>()
    // morph name → list of [mesh, index] (a name can appear on several meshes)
    const morphs = new Map<string, Array<[THREE.Mesh, number]>>()

    const bone = (name: string) => bones.get(name) ?? null

    /** Set a morph influence by name across every mesh that has it. */
    function setMorph(name: string, value: number) {
      const targets = morphs.get(name)
      if (!targets) return
      for (const [mesh, idx] of targets) {
        if (mesh.morphTargetInfluences) mesh.morphTargetInfluences[idx] = value
      }
    }
    /** First morph name present in the model, from a candidate list. */
    function firstMorph(...names: string[]): string | null {
      for (const n of names) if (morphs.has(n)) return n
      return null
    }

    function frameView(target: THREE.Object3D) {
      target.updateMatrixWorld(true)
      const box = new THREE.Box3().setFromObject(target)
      const size = new THREE.Vector3()
      box.getSize(size)
      const head = bone('J_Bip_C_Head')
      const hips = bone('J_Bip_C_Hips')
      const topY = box.max.y
      const hipsY = hips ? hips.getWorldPosition(new THREE.Vector3()).y : box.min.y + size.y * 0.45
      const viewTop = topY + size.y * 0.04
      const viewBottom = hipsY - size.y * 0.02
      const viewHeight = Math.max(0.4, viewTop - viewBottom)
      const fov = (camera.fov * Math.PI) / 180
      const dist = (viewHeight / 2 / Math.tan(fov / 2)) * 1.05
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
      if (root) frameView(root)
    }

    const clock = new THREE.Clock()
    let blinkTimer = 1 + Math.random() * 3
    let blink = 0
    let nextGlance = 3 + Math.random() * 4
    let glance = 0
    const expr = { aa: 0, joy: 0, sorrow: 0, surprised: 0 }

    // Resolved mood morph names (depend on what the model ships).
    let mJoy: string | null = null
    let mSorrow: string | null = null
    let mSurprised: string | null = null
    let mBlink: string | null = null
    let mAa: string | null = null

    const loader = new GLTFLoader()
    loader.load(
      src,
      (gltf) => {
        if (disposed) {
          gltf.scene.traverse((o) => {
            const m = o as THREE.Mesh
            if (m.geometry) m.geometry.dispose()
          })
          return
        }
        root = gltf.scene
        root.traverse((obj) => {
          if (obj.name) {
            bones.set(obj.name, obj)
            baseRot.set(obj.name, obj.rotation.clone())
          }
          const mesh = obj as THREE.Mesh
          if (mesh.isMesh) {
            // Skinned meshes shrink their bounding box as bones move; keep them
            // from being frustum-culled mid-animation.
            mesh.frustumCulled = false
            const dict = mesh.morphTargetDictionary
            if (dict) {
              for (const [mname, idx] of Object.entries(dict)) {
                const list = morphs.get(mname) ?? []
                list.push([mesh, idx])
                morphs.set(mname, list)
              }
            }
          }
        })

        mBlink = firstMorph('Fcl_EYE_Close')
        mAa = firstMorph('Fcl_MTH_A', 'Fcl_MTH_Large', 'Fcl_MTH_O')
        mJoy = firstMorph('Fcl_EYE_Joy', 'Fcl_ALL_Joy', 'Fcl_ALL_Fun')
        mSorrow = firstMorph('Fcl_EYE_Sorrow', 'Fcl_ALL_Sorrow')
        mSurprised = firstMorph('Fcl_EYE_Surprised', 'Fcl_ALL_Surprised')

        scene.add(root)
        resize()
        setLoading(false)
      },
      undefined,
      (err) => {
        // eslint-disable-next-line no-console
        console.error('GLB companion load failed', src, err)
      },
    )

    // ~30fps cap + pause when hidden — same budget as VrmCompanion.
    const FRAME_MS = 1000 / 30
    let lastFrame = 0
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      if (typeof document !== 'undefined' && document.hidden) return
      if (now - lastFrame < FRAME_MS) return
      lastFrame = now
      const dt = Math.min(clock.getDelta(), 0.05)
      const t = clock.elapsedTime

      if (root) {
        const apply = (name: string, dx: number, dy: number, dz: number) => {
          const b = bone(name)
          const base = baseRot.get(name)
          if (!b || !base) return
          b.rotation.set(base.x + dx, base.y + dy, base.z + dz)
        }

        // Breathing + slow weight-shift on the spine/chest.
        apply('J_Bip_C_Spine', Math.sin(t * 1.6) * 0.025, 0, Math.sin(t * 0.45) * 0.03)
        apply('J_Bip_C_Chest', Math.sin(t * 1.6 + 0.5) * 0.02, 0, 0)

        // Gentle arm sway (additive — never forces a pose).
        const sway = Math.sin(t * 1.1) * 0.05
        apply('J_Bip_L_UpperArm', 0, 0, -sway)
        apply('J_Bip_R_UpperArm', 0, 0, sway)

        // Head: subtle motion + occasional glance.
        nextGlance -= dt
        if (nextGlance <= 0) {
          glance = (Math.random() - 0.5) * 0.4
          nextGlance = 3 + Math.random() * 5
        }
        glance *= 1 - Math.min(1, dt * 1.5)
        apply('J_Bip_C_Head', Math.sin(t * 0.9) * 0.02, glance, Math.sin(t * 0.7) * 0.03)

        // Blink.
        blinkTimer -= dt
        if (blinkTimer <= 0) {
          blink = 1
          blinkTimer = 2.5 + Math.random() * 3.5
        }
        blink = Math.max(0, blink - dt * 7)
        if (mBlink) setMorph(mBlink, blink)

        // Lip-sync.
        const target = Math.min(1, levelRef.current() * 1.2)
        expr.aa += (target - expr.aa) * Math.min(1, dt * 18)
        if (mAa) setMorph(mAa, expr.aa)

        // Mood (eyes — keeps mouth free for lip-sync).
        const m = moodRef.current
        const approach = (cur: number, to: number) => cur + (to - cur) * Math.min(1, dt * 6)
        expr.joy = approach(expr.joy, m === 'happy' ? 0.9 : 0)
        expr.sorrow = approach(expr.sorrow, m === 'sad' ? 0.85 : 0)
        expr.surprised = approach(expr.surprised, m === 'surprised' ? 0.8 : 0)
        if (mJoy) setMorph(mJoy, expr.joy)
        if (mSorrow) setMorph(mSorrow, expr.sorrow)
        if (mSurprised) setMorph(mSurprised, expr.surprised)
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
      if (root) {
        scene.remove(root)
        root.traverse((obj) => {
          const mesh = obj as THREE.Mesh
          if (mesh.geometry) mesh.geometry.dispose()
          const mat = (mesh as THREE.Mesh).material
          if (Array.isArray(mat)) mat.forEach((mm) => mm.dispose())
          else if (mat) (mat as THREE.Material).dispose()
        })
      }
      renderer.dispose()
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement)
    }
  }, [src])

  return (
    <div ref={mountRef} className={className ?? 'relative h-full w-full'}>
      {loading && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="flex items-center gap-1.5 rounded-full bg-black/30 px-3 py-1.5 text-xs text-white backdrop-blur">
            <span className="dot h-1.5 w-1.5 rounded-full bg-white" style={{ animationDelay: '0ms' }} />
            <span className="dot h-1.5 w-1.5 rounded-full bg-white" style={{ animationDelay: '160ms' }} />
            <span className="dot h-1.5 w-1.5 rounded-full bg-white" style={{ animationDelay: '320ms' }} />
          </div>
        </div>
      )}
    </div>
  )
}
