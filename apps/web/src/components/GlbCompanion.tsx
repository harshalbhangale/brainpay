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

    /**
     * Rotate an upper-arm bone so the elbow points downward (+ a slight spread
     * via `outX`), lifting the model out of its exported T-pose. Geometric, so
     * it's correct regardless of the bone's local axes.
     */
    function lowerArm(upperName: string, lowerName: string, outX: number) {
      const upper = bones.get(upperName)
      const lower = bones.get(lowerName)
      if (!upper || !lower) return
      upper.updateWorldMatrix(true, false)
      lower.updateWorldMatrix(true, false)
      const pa = new THREE.Vector3().setFromMatrixPosition(upper.matrixWorld)
      const pb = new THREE.Vector3().setFromMatrixPosition(lower.matrixWorld)
      const curDir = pb.sub(pa).normalize()
      if (curDir.lengthSq() < 1e-6) return
      const target = new THREE.Vector3(outX, -1, 0.08).normalize()
      const qWorld = new THREE.Quaternion().setFromUnitVectors(curDir, target)
      const parentQuat = new THREE.Quaternion()
      upper.parent?.getWorldQuaternion(parentQuat)
      const curWorldQuat = new THREE.Quaternion()
      upper.getWorldQuaternion(curWorldQuat)
      const desiredWorld = qWorld.multiply(curWorldQuat)
      const newLocal = parentQuat.invert().multiply(desiredWorld)
      upper.quaternion.copy(newLocal)
      upper.updateWorldMatrix(true, true)
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
    let nextGlance = 2.5 + Math.random() * 3
    let glance = 0
    let nextGesture = 2 + Math.random() * 3
    let gesture = 0
    const expr = { aa: 0, joy: 0, sorrow: 0, surprised: 0 }

    // Resolved mood morph names (depend on what the model ships).
    let mJoy: string | null = null
    let mSorrow: string | null = null
    let mSurprised: string | null = null
    let mBlink: string | null = null
    let mAa: string | null = null
    let mMouthJoy: string | null = null

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
          if (obj.name) bones.set(obj.name, obj)
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

        scene.add(root)
        // VRM0-exported glTF faces -Z (away from a +Z camera) — that's why the
        // raw model showed the back of the head. Turn it to face the camera.
        root.rotation.y = Math.PI
        root.updateMatrixWorld(true)

        // Bring the arms down out of the T-pose. Geometric (rotate the upper
        // arm so the elbow points downward) so it works regardless of each
        // model's local bone axes.
        lowerArm('J_Bip_L_UpperArm', 'J_Bip_L_LowerArm', -0.18)
        lowerArm('J_Bip_R_UpperArm', 'J_Bip_R_LowerArm', 0.18)
        root.updateMatrixWorld(true)

        // Capture the resting rotation AFTER posing, so idle motion is additive
        // on top of the natural (arms-down) pose.
        for (const [name, b] of bones) baseRot.set(name, b.rotation.clone())

        mBlink = firstMorph('Fcl_EYE_Close')
        mAa = firstMorph('Fcl_MTH_A', 'Fcl_MTH_Large', 'Fcl_MTH_O')
        mJoy = firstMorph('Fcl_EYE_Joy', 'Fcl_ALL_Joy', 'Fcl_ALL_Fun')
        mSorrow = firstMorph('Fcl_EYE_Sorrow', 'Fcl_ALL_Sorrow')
        mSurprised = firstMorph('Fcl_EYE_Surprised', 'Fcl_ALL_Surprised')
        mMouthJoy = firstMorph('Fcl_MTH_Joy', 'Fcl_MTH_Fun')

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

        // Periodic friendly gesture (a little wave / hand-talk).
        nextGesture -= dt
        if (nextGesture <= 0) {
          gesture = 1
          nextGesture = 5 + Math.random() * 4
        }
        gesture = Math.max(0, gesture - dt * 0.7)
        const gWave = Math.sin(Math.min(1, gesture) * Math.PI) // 0→1→0

        // Breathing + lively side-to-side sway through the torso.
        apply('J_Bip_C_Hips', 0, Math.sin(t * 0.5) * 0.05, Math.sin(t * 0.6) * 0.03)
        apply('J_Bip_C_Spine', Math.sin(t * 1.4) * 0.05, Math.sin(t * 0.5) * 0.04, Math.sin(t * 0.55) * 0.06)
        apply('J_Bip_C_Chest', Math.sin(t * 1.4 + 0.5) * 0.04, 0, Math.sin(t * 0.55 + 0.3) * 0.03)

        // Arms: a gentle continuous swing, opposite phase (additive on rest).
        const swing = Math.sin(t * 1.0) * 0.12
        apply('J_Bip_L_UpperArm', swing, 0, -0.03 + Math.sin(t * 0.8) * 0.04)
        apply('J_Bip_R_UpperArm', -swing - gWave * 0.5, 0, 0.03 - Math.sin(t * 0.8) * 0.04)
        // During a gesture the right forearm lifts and waves.
        apply('J_Bip_L_LowerArm', Math.sin(t * 0.9) * 0.05, 0, 0)
        apply('J_Bip_R_LowerArm', -gWave * 0.7, gWave * Math.sin(t * 12) * 0.35, 0)

        // Head: bob + slow turn + occasional bigger glance.
        nextGlance -= dt
        if (nextGlance <= 0) {
          glance = (Math.random() - 0.5) * 0.6
          nextGlance = 2.5 + Math.random() * 4
        }
        glance *= 1 - Math.min(1, dt * 1.2)
        apply('J_Bip_C_Neck', Math.sin(t * 0.9) * 0.03, glance * 0.4, 0)
        apply('J_Bip_C_Head', Math.sin(t * 0.85) * 0.05, Math.sin(t * 0.5) * 0.1 + glance, Math.sin(t * 0.7) * 0.06)

        // Blink.
        blinkTimer -= dt
        if (blinkTimer <= 0) {
          blink = 1
          blinkTimer = 2.2 + Math.random() * 3
        }
        blink = Math.max(0, blink - dt * 7)
        if (mBlink) setMorph(mBlink, blink)

        // Lip-sync (only when audio is flowing).
        const target = Math.min(1, levelRef.current() * 1.2)
        expr.aa += (target - expr.aa) * Math.min(1, dt * 18)
        if (mAa) setMorph(mAa, expr.aa)

        // Mood + a warm baseline smile (eases off while actually speaking).
        const m = moodRef.current
        const approach = (cur: number, to: number) => cur + (to - cur) * Math.min(1, dt * 6)
        expr.joy = approach(expr.joy, m === 'happy' ? 1 : 0.35)
        expr.sorrow = approach(expr.sorrow, m === 'sad' ? 0.85 : 0)
        expr.surprised = approach(expr.surprised, m === 'surprised' ? 0.8 : 0)
        if (mJoy) setMorph(mJoy, expr.joy * 0.8)
        if (mSorrow) setMorph(mSorrow, expr.sorrow)
        if (mSurprised) setMorph(mSurprised, expr.surprised)
        if (mMouthJoy) setMorph(mMouthJoy, Math.max(0, expr.joy * (1 - expr.aa)))
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
