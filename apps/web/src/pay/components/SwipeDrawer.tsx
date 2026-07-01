/**
 * SwipeDrawer — a left-edge swipe navigation drawer for the `.pv` app.
 * ───────────────────────────────────────────────────────────────────────────
 * Headline gesture: a swipe from the left edge pulls the panel in, following
 * the finger 1:1; releasing settles open/closed on a spring (distance OR
 * velocity decides). It can also be opened via a button (`open` prop) and
 * closed by tapping the scrim, dragging the grab-handle, or pressing Escape.
 *
 * Motion lives in theme.css (`.pv-drawer-*`); while dragging we drive transform
 * and scrim opacity inline (transition off) so the panel tracks the finger,
 * then hand back to the CSS spring on release. Honors prefers-reduced-motion
 * via the global `.pv` reduced-motion rule.
 *
 * A11y: role="dialog" + aria-modal, focus moves into the panel on open, Tab is
 * trapped, Escape closes, and focus returns to the opener on close. Pointer
 * tracking uses setPointerCapture, so a drag keeps following the finger even if
 * it leaves the small edge/handle hit-zones.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

type DragMode = 'open' | 'close'

export function SwipeDrawer({
  open,
  onOpenChange,
  children,
  ariaLabel = 'Navigation',
  width = 312,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: ReactNode
  ariaLabel?: string
  width?: number
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const restoreFocusRef = useRef<HTMLElement | null>(null)

  // 0..1 while a drag is in progress (1 = fully open); null when idle.
  const [dragRatio, setDragRatio] = useState<number | null>(null)
  const dragging = dragRatio !== null

  // Re-keys the panel content so the staggered entrance replays on every open.
  const [openSeq, setOpenSeq] = useState(0)
  const prevOpen = useRef(open)
  useEffect(() => {
    if (open && !prevOpen.current) setOpenSeq((s) => s + 1)
    prevOpen.current = open
  }, [open])

  const drag = useRef<{ mode: DragMode; startX: number; w: number; lastX: number; lastT: number; vx: number } | null>(null)

  const onPointerDown = useCallback((e: React.PointerEvent, mode: DragMode) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const w = panelRef.current?.getBoundingClientRect().width || width
    drag.current = { mode, startX: e.clientX, w, lastX: e.clientX, lastT: e.timeStamp || performance.now(), vx: 0 }
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId) } catch { /* unsupported */ }
    setDragRatio(mode === 'open' ? 0 : 1)
  }, [width])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const now = e.timeStamp || performance.now()
    const dt = now - d.lastT
    if (dt > 0) d.vx = (e.clientX - d.lastX) / dt
    d.lastX = e.clientX
    d.lastT = now
    const base = d.mode === 'close' ? 1 : 0
    setDragRatio(clamp01((e.clientX - d.startX) / d.w + base))
  }, [])

  const onPointerUp = useCallback(() => {
    const d = drag.current
    if (!d) return
    const base = d.mode === 'close' ? 1 : 0
    const ratio = clamp01((d.lastX - d.startX) / d.w + base)
    // A fast flick beats raw distance.
    let target: boolean
    if (d.vx > 0.45) target = true
    else if (d.vx < -0.45) target = false
    else target = ratio > 0.5
    drag.current = null
    setDragRatio(null)
    onOpenChange(target)
  }, [onOpenChange])

  // Focus management: capture opener, move focus in on open, restore on close.
  useEffect(() => {
    if (open) {
      restoreFocusRef.current = (document.activeElement as HTMLElement) ?? null
      const id = requestAnimationFrame(() => {
        const first = panelRef.current?.querySelector<HTMLElement>('[data-drawer-autofocus]')
        ;(first ?? panelRef.current)?.focus()
      })
      return () => cancelAnimationFrame(id)
    }
    restoreFocusRef.current?.focus?.()
  }, [open])

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.stopPropagation(); onOpenChange(false); return }
    if (e.key !== 'Tab') return
    const nodes = panelRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]),[href],input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])',
    )
    if (!nodes || nodes.length === 0) return
    const first = nodes[0]
    const last = nodes[nodes.length - 1]
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
  }, [onOpenChange])

  // Derived transform / opacity. Inline (transition off) while dragging; the
  // CSS spring takes over when idle.
  const panelStyle = dragging
    ? { maxWidth: '92vw', width, transform: `translateX(${(dragRatio - 1) * width}px)`, transition: 'none' as const }
    : { maxWidth: '92vw', width, transform: open ? 'translateX(0)' : 'translateX(-100%)' }

  const scrimVisible = open || dragging
  const scrimStyle = dragging
    ? { opacity: dragRatio ?? 0, transition: 'none' as const, pointerEvents: 'auto' as const }
    : { opacity: open ? 1 : 0, pointerEvents: scrimVisible ? ('auto' as const) : ('none' as const) }

  return (
    <>
      {/* Edge catcher — only live when closed, so it never blocks the open panel. */}
      <div
        className="pv-drawer-edge"
        aria-hidden="true"
        style={{ pointerEvents: scrimVisible ? 'none' : 'auto' }}
        onPointerDown={(e) => onPointerDown(e, 'open')}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />

      <div
        className="pv-drawer-scrim"
        aria-hidden="true"
        style={scrimStyle}
        onClick={() => onOpenChange(false)}
      />

      <aside
        ref={panelRef}
        className="pv-drawer-panel"
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        aria-hidden={scrimVisible ? undefined : true}
        tabIndex={-1}
        style={panelStyle}
        onKeyDown={onKeyDown}
      >
        {/* Grab-handle: press + drag left to close. */}
        <div
          className="pv-drawer-handle"
          aria-hidden="true"
          style={{ touchAction: 'none', cursor: 'grab' }}
          onPointerDown={(e) => onPointerDown(e, 'close')}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
        <div key={openSeq} className="pv-drawer-content pv-no-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto">
          {children}
        </div>
      </aside>
    </>
  )
}

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n
}
