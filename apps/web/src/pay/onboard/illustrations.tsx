/**
 * Bespoke animated illustrations (SVG + Motion) — one cohesive style:
 * rounded forms, ink hairlines, soft pastel fills, gentle spring loops.
 * Each scene fills a square and sits on a soft tinted disc (Stage).
 *
 * LOTTIE/RIVE SEAM: to swap in designed art, replace a scene's <Stage> body
 * with a player; the layout/sizing stays identical.
 */
import type { ReactNode } from 'react'
import { motion } from 'motion/react'

const INK = '#0b0c0f'

function Stage({ hue, children }: { hue: number; children: ReactNode }) {
  return (
    <div className="relative grid place-items-center" style={{ width: 240, height: 240 }}>
      <motion.div
        className="absolute rounded-[64px]"
        style={{ width: 210, height: 210, background: `radial-gradient(circle at 50% 38%, hsl(${hue} 90% 88%), hsl(${hue} 80% 80%))` }}
        animate={{ scale: [1, 1.03, 1] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
      />
      <svg width="240" height="240" viewBox="0 0 240 240" className="relative">
        {children}
      </svg>
    </div>
  )
}

/* ── Save: a jar that fills + a coin arcing in ─────────────────────────────── */
export function SaveScene() {
  const hue = 96
  return (
    <Stage hue={hue}>
      {/* jar */}
      <rect x="78" y="96" width="84" height="96" rx="26" fill="#fff" stroke={INK} strokeWidth="6" />
      <rect x="92" y="84" width="56" height="18" rx="9" fill="#fff" stroke={INK} strokeWidth="6" />
      {/* liquid fill */}
      <clipPath id="jarClip"><rect x="82" y="100" width="76" height="88" rx="22" /></clipPath>
      <motion.rect
        clipPath="url(#jarClip)" x="82" width="76" fill={`hsl(${hue} 85% 60%)`}
        initial={{ y: 188, height: 0 }} animate={{ y: [188, 126], height: [0, 62] }}
        transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1], repeat: Infinity, repeatType: 'reverse', repeatDelay: 0.8 }}
      />
      {/* coin dropping in an arc */}
      <motion.g
        animate={{ x: [-46, 0, 0], y: [-30, 70, 70], opacity: [0, 1, 0] }}
        transition={{ duration: 1.4, ease: 'easeIn', repeat: Infinity, repeatDelay: 0.8, times: [0, 0.7, 1] }}
        style={{ originX: '120px', originY: '120px' }}
      >
        <circle cx="120" cy="60" r="18" fill={`hsl(48 95% 62%)`} stroke={INK} strokeWidth="5" />
        <text x="120" y="67" textAnchor="middle" fontSize="20" fontWeight="800" fill={INK}>$</text>
      </motion.g>
      {/* sparkles */}
      {[[60, 150], [176, 120], [170, 176]].map(([x, y], i) => (
        <motion.circle key={i} cx={x} cy={y} r="4" fill={`hsl(${hue} 90% 55%)`}
          animate={{ scale: [0, 1.2, 0], opacity: [0, 1, 0] }} transition={{ duration: 1.6, repeat: Infinity, delay: i * 0.4 }} />
      ))}
    </Stage>
  )
}

/* ── Learn: a flashcard with a lightbulb spark turning on ──────────────────── */
export function LearnScene() {
  const hue = 262
  return (
    <Stage hue={hue}>
      {/* card */}
      <motion.g animate={{ rotate: [-3, 3, -3] }} transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }} style={{ originX: '120px', originY: '140px' }}>
        <rect x="66" y="104" width="108" height="80" rx="18" fill="#fff" stroke={INK} strokeWidth="6" />
        <line x1="82" y1="130" x2="158" y2="130" stroke={`hsl(${hue} 60% 70%)`} strokeWidth="6" strokeLinecap="round" />
        <line x1="82" y1="148" x2="140" y2="148" stroke={`hsl(${hue} 60% 80%)`} strokeWidth="6" strokeLinecap="round" />
        <line x1="82" y1="166" x2="150" y2="166" stroke={`hsl(${hue} 60% 80%)`} strokeWidth="6" strokeLinecap="round" />
      </motion.g>
      {/* lightbulb */}
      <motion.g animate={{ y: [0, -8, 0] }} transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}>
        <circle cx="120" cy="62" r="24" fill={`hsl(48 95% 64%)`} stroke={INK} strokeWidth="6" />
        <rect x="111" y="82" width="18" height="12" rx="4" fill="#fff" stroke={INK} strokeWidth="5" />
        {/* rays */}
        {[0, 60, 120, 180, 240, 300].map((a, i) => {
          const r = (a * Math.PI) / 180
          return (
            <motion.line key={i}
              x1={120 + Math.cos(r) * 30} y1={62 + Math.sin(r) * 30}
              x2={120 + Math.cos(r) * 40} y2={62 + Math.sin(r) * 40}
              stroke={`hsl(48 95% 55%)`} strokeWidth="5" strokeLinecap="round"
              animate={{ opacity: [0.2, 1, 0.2] }} transition={{ duration: 1.6, repeat: Infinity, delay: i * 0.12 }} />
          )
        })}
      </motion.g>
    </Stage>
  )
}

/* ── Health: a beating heart with pulse rings + streak bars ───────────────── */
export function HealthScene() {
  const hue = 152
  return (
    <Stage hue={hue}>
      {[0, 1].map((i) => (
        <motion.circle key={i} cx="120" cy="112" r="40" fill="none" stroke={`hsl(${hue} 80% 55%)`} strokeWidth="4"
          animate={{ scale: [0.7, 1.8], opacity: [0.5, 0] }} transition={{ duration: 2, repeat: Infinity, delay: i, ease: 'easeOut' }}
          style={{ originX: '120px', originY: '112px' }} />
      ))}
      <motion.path
        d="M120 142 C92 120 92 92 112 92 C120 92 120 100 120 100 C120 100 120 92 128 92 C148 92 148 120 120 142 Z"
        fill={`hsl(${hue} 80% 58%)`} stroke={INK} strokeWidth="6" strokeLinejoin="round"
        animate={{ scale: [1, 1.14, 1] }} transition={{ duration: 1, repeat: Infinity, ease: 'easeInOut' }}
        style={{ originX: '120px', originY: '116px' }}
      />
      {/* streak bars rising */}
      {[[150, 60], [168, 48], [186, 36]].map(([x, h], i) => (
        <motion.rect key={i} x={x} width="12" rx="5" fill={`hsl(${(hue + i * 18) % 360} 80% 55%)`} stroke={INK} strokeWidth="3"
          initial={{ y: 176, height: 0 }} animate={{ y: 176 - h, height: h }} transition={{ duration: 0.7, delay: 0.3 + i * 0.18, ease: [0.22, 1, 0.36, 1] }} />
      ))}
    </Stage>
  )
}

/* ── Control: a shield with a check drawing in + safe rings ───────────────── */
export function ControlScene() {
  const hue = 205
  return (
    <Stage hue={hue}>
      {[0, 1].map((i) => (
        <motion.circle key={i} cx="120" cy="116" r="44" fill="none" stroke={`hsl(${hue} 80% 55%)`} strokeWidth="4"
          animate={{ scale: [0.8, 1.7], opacity: [0.45, 0] }} transition={{ duration: 2.4, repeat: Infinity, delay: i * 1.2, ease: 'easeOut' }}
          style={{ originX: '120px', originY: '116px' }} />
      ))}
      <motion.path
        d="M120 64 L166 82 V120 C166 150 146 166 120 176 C94 166 74 150 74 120 V82 Z"
        fill={`hsl(${hue} 85% 64%)`} stroke={INK} strokeWidth="6" strokeLinejoin="round"
        animate={{ y: [0, -5, 0] }} transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.path d="M100 118 L114 132 L142 100" fill="none" stroke="#fff" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round"
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.8, delay: 0.4, ease: 'easeInOut', repeat: Infinity, repeatDelay: 1.8 }} />
    </Stage>
  )
}

/* ── Family: three friendly dots connected (one home) ─────────────────────── */
export function FamilyScene() {
  const hue = 205
  const dots = [[120, 78, 248], [82, 150, 96], [158, 150, 262]] as const
  return (
    <Stage hue={hue}>
      {/* links */}
      <motion.path d="M120 86 L86 142 M120 86 L154 142 M90 150 L150 150" fill="none" stroke={INK} strokeWidth="4" strokeLinecap="round"
        initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }} transition={{ duration: 1, ease: 'easeInOut' }} />
      {dots.map(([x, y, h], i) => (
        <motion.circle key={i} cx={x} cy={y} r="22" fill={`hsl(${h} 82% 70%)`} stroke={INK} strokeWidth="6"
          initial={{ scale: 0 }} animate={{ scale: [0, 1.15, 1], y: [y, y - 6, y] }}
          transition={{ scale: { duration: 0.5, delay: 0.3 + i * 0.15, ease: [0.34, 1.56, 0.64, 1] }, y: { duration: 3, repeat: Infinity, ease: 'easeInOut', delay: i * 0.3 } }}
          style={{ originX: `${x}px`, originY: `${y}px` }} />
      ))}
    </Stage>
  )
}
