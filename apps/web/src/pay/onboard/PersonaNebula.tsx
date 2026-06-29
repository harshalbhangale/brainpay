/**
 * PersonaNebula — the "really cool" persona animation.
 * ───────────────────────────────────────────────────────────────────────────
 * A living particle portal on a <canvas>: a rotating 3D point-sphere that
 * densifies + brightens as the persona gains traits, blends toward the user's
 * identity hue, fires a colored supernova burst + shockwave on every new
 * answer, and blooms when complete. Additive blending gives a real glow; it
 * lives inside a dark glass portal so it pops against the light app.
 *
 * Pure Canvas2D — no external assets/keys. (If you later want a designed Rive
 * piece, swap this component out; PersonaChat feeds it the same props.)
 */
import { useEffect, useRef } from 'react'
import { motion } from 'motion/react'

export type Facet = { id: string; label: string; hue: number }

type P = { theta: number; phi: number; r: number; off: number; tw: number; sp: number }
type Spark = { x: number; y: number; vx: number; vy: number; life: number; max: number; hue: number }
type Wave = { r: number; life: number; max: number; hue: number }

const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

export function PersonaNebula({
  facets,
  total,
  identityHue,
  thinking,
  done,
  size = 240,
}: {
  facets: Facet[]
  total: number
  identityHue: number
  thinking?: boolean
  done?: boolean
  size?: number
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // Live values the animation loop reads without re-subscribing.
  const state = useRef({ completeness: 0, hue: identityHue, thinking: false, done: false })
  const sparks = useRef<Spark[]>([])
  const waves = useRef<Wave[]>([])
  const prevCount = useRef(0)
  const prevDone = useRef(false)

  const completeness = Math.min(1, facets.length / total)
  state.current.completeness = completeness
  state.current.hue = identityHue
  state.current.thinking = !!thinking
  state.current.done = !!done

  const ringR = size * 0.5 - 4
  const circ = 2 * Math.PI * ringR

  // Fire a burst whenever a new facet lands or we bloom.
  useEffect(() => {
    const cx = size / 2
    const cy = size / 2
    if (facets.length > prevCount.current) {
      const hue = facets[facets.length - 1]?.hue ?? identityHue
      const n = 46
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + Math.random()
        const sp = 1.6 + Math.random() * 2.6
        // start near the rim, stream inward (gaining information)
        const rr = size * 0.46
        sparks.current.push({ x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr, vx: -Math.cos(a) * sp, vy: -Math.sin(a) * sp, life: 0, max: 46 + Math.random() * 24, hue })
      }
      waves.current.push({ r: size * 0.16, life: 0, max: 42, hue })
    }
    prevCount.current = facets.length
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facets.length])

  useEffect(() => {
    if (done && !prevDone.current) {
      const cx = size / 2
      const cy = size / 2
      const n = 90
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2
        const sp = 2 + Math.random() * 5
        sparks.current.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0, max: 60 + Math.random() * 30, hue: identityHue + (Math.random() * 60 - 30) })
      }
      waves.current.push({ r: size * 0.2, life: 0, max: 64, hue: identityHue })
    }
    prevDone.current = !!done
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const c = ctx
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    canvas.width = size * dpr
    canvas.height = size * dpr
    c.scale(dpr, dpr)
    const cx = size / 2
    const cy = size / 2
    const fov = size * 0.9

    // Build the sphere of particles.
    const MAX = 560
    const pts: P[] = []
    for (let i = 0; i < MAX; i++) {
      // even-ish spherical distribution
      const phi = Math.acos(1 - (2 * (i + 0.5)) / MAX)
      const theta = Math.PI * (1 + Math.sqrt(5)) * i
      pts.push({ theta, phi, r: size * (0.30 + Math.random() * 0.12), off: Math.random() * 70 - 35, tw: Math.random() * Math.PI * 2, sp: 0.5 + Math.random() * 0.8 })
    }

    let raf = 0
    let rot = 0
    let curHue = state.current.hue
    let frame = 0

    function draw() {
      frame++
      const st = state.current
      curHue += (st.hue - curHue) * 0.06
      const speed = (st.thinking ? 0.012 : 0.004) + st.completeness * 0.004
      rot += speed
      const active = Math.floor(MAX * (0.28 + 0.72 * st.completeness))
      const baseR = size * (0.30 + 0.06 * st.completeness)

      c.clearRect(0, 0, size, size)

      // volumetric core glow
      const coreR = baseR * (st.done ? 1.15 : 1) * (1 + (st.thinking ? 0.04 * Math.sin(frame * 0.12) : 0))
      const g = c.createRadialGradient(cx, cy, 0, cx, cy, coreR * 1.7)
      g.addColorStop(0, `hsla(${curHue}, 95%, 70%, ${0.42 + 0.3 * st.completeness})`)
      g.addColorStop(0.5, `hsla(${(curHue + 24) % 360}, 90%, 55%, 0.16)`)
      g.addColorStop(1, 'hsla(0,0%,0%,0)')
      c.globalCompositeOperation = 'lighter'
      c.fillStyle = g
      c.fillRect(0, 0, size, size)

      // sphere points
      const cos = Math.cos(rot)
      const sin = Math.sin(rot)
      for (let i = 0; i < active; i++) {
        const p = pts[i]
        const sx = p.r * Math.sin(p.phi) * Math.cos(p.theta)
        const sy = p.r * Math.cos(p.phi)
        const sz = p.r * Math.sin(p.phi) * Math.sin(p.theta)
        const x = sx * cos - sz * sin
        const z = sx * sin + sz * cos
        const scale = fov / (fov + z)
        const px = cx + x * scale
        const py = cy + sy * scale
        const depth = (z + p.r) / (2 * p.r) // 0 back → 1 front
        const tw = 0.6 + 0.4 * Math.sin(frame * 0.05 * p.sp + p.tw)
        const rad = (0.5 + 1.7 * depth) * scale * tw
        const alpha = (0.15 + 0.7 * depth) * tw
        c.fillStyle = `hsla(${(curHue + p.off + 360) % 360}, 90%, ${58 + 18 * depth}%, ${alpha})`
        c.beginPath()
        c.arc(px, py, Math.max(0.4, rad), 0, Math.PI * 2)
        c.fill()
      }

      // shockwave rings
      for (let i = waves.current.length - 1; i >= 0; i--) {
        const w = waves.current[i]
        w.life++
        const t = w.life / w.max
        if (t >= 1) { waves.current.splice(i, 1); continue }
        const rr = w.r + t * size * 0.34
        c.strokeStyle = `hsla(${w.hue}, 90%, 65%, ${0.5 * (1 - t)})`
        c.lineWidth = 2 * (1 - t)
        c.beginPath()
        c.arc(cx, cy, rr, 0, Math.PI * 2)
        c.stroke()
      }

      // inward/outward sparks (comets with trails)
      for (let i = sparks.current.length - 1; i >= 0; i--) {
        const s = sparks.current[i]
        s.life++
        if (s.life >= s.max) { sparks.current.splice(i, 1); continue }
        const t = s.life / s.max
        s.x += s.vx
        s.y += s.vy
        s.vx *= 0.97
        s.vy *= 0.97
        const a = 1 - t
        c.strokeStyle = `hsla(${s.hue}, 95%, 68%, ${a})`
        c.lineWidth = 1.6 * a
        c.beginPath()
        c.moveTo(s.x, s.y)
        c.lineTo(s.x - s.vx * 3, s.y - s.vy * 3)
        c.stroke()
      }

      c.globalCompositeOperation = 'source-over'
      if (!reduce) raf = requestAnimationFrame(draw)
    }
    draw()
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size])

  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      {/* Dark glass portal so the additive glow reads against the light app. */}
      <div
        className="absolute overflow-hidden rounded-full"
        style={{
          width: size - 14,
          height: size - 14,
          background: 'radial-gradient(circle at 50% 42%, #15131f 0%, #0a0b10 70%)',
          boxShadow: 'inset 0 2px 14px rgba(255,255,255,0.08), inset 0 -10px 40px rgba(0,0,0,0.6), 0 24px 60px -18px rgba(10,8,24,0.55)',
          border: '1px solid rgba(255,255,255,0.12)',
        }}
      >
        <canvas ref={canvasRef} style={{ width: size, height: size, marginLeft: -7, marginTop: -7 }} />
      </div>

      {/* Completeness ring */}
      <svg width={size} height={size} className="absolute -rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={ringR} fill="none" stroke="rgba(11,12,15,0.10)" strokeWidth={3} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={ringR}
          fill="none"
          stroke={`hsl(${identityHue} 85% 55%)`}
          strokeWidth={3}
          strokeLinecap="round"
          strokeDasharray={circ}
          initial={false}
          animate={{ strokeDashoffset: circ * (1 - completeness), stroke: `hsl(${identityHue} 85% 55%)` }}
          transition={{ type: 'spring', stiffness: 90, damping: 18 }}
        />
      </svg>
    </div>
  )
}
