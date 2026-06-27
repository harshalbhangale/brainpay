/**
 * BottomSheet — the one true sheet for the `.pv` app.
 * ───────────────────────────────────────────────────────────────────────────
 * Why this exists: earlier sheets used `fixed inset-0` *inside* the animated
 * `pv-pal-enter` subtree. A transformed ancestor turns `fixed` into "fixed to
 * that ancestor", so the sheet landed far down the page and you had to scroll
 * to reach it. This component renders through a portal to <body>, so it's
 * always pinned to the viewport, caps its height, scrolls its body internally,
 * and keeps the primary action in a sticky footer that's always on screen.
 *
 *   <BottomSheet title="Add money" onClose={…} footer={<Button…/>}>…body…</BottomSheet>
 *
 * A11y: role=dialog + aria-modal, Escape to close, scrim click to close,
 * background scroll locked while open. Honors reduced-motion via .pv rules.
 */
import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'
import { X } from 'lucide-react'

export function BottomSheet({
  onClose,
  title,
  subtitle,
  children,
  footer,
  showClose = true,
  maxHeight = '90vh',
  ariaLabel,
}: {
  onClose: () => void
  title?: ReactNode
  subtitle?: ReactNode
  children: ReactNode
  footer?: ReactNode
  showClose?: boolean
  maxHeight?: string
  ariaLabel?: string
}) {
  // Lock background scroll + close on Escape while the sheet is mounted.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  return createPortal(
    <div className="pv fixed inset-0 z-[90] flex items-end justify-center" role="dialog" aria-modal="true" aria-label={ariaLabel}>
      <div className="pv-sheet-scrim absolute inset-0" onClick={onClose} />
      <div
        className="pv-sheet-panel pv-no-scrollbar relative flex w-full max-w-[460px] flex-col rounded-t-[var(--pv-r-2xl)]"
        style={{ background: 'var(--pv-surface)', boxShadow: 'var(--pv-shadow-lg)', maxHeight }}
      >
        {/* Header (sticky): grabber + title + close */}
        {(title || showClose) && (
          <div className="flex-none px-6 pt-3" style={{ background: 'var(--pv-surface)' }}>
            <div className="mx-auto mb-4 h-1.5 w-12 rounded-full" style={{ background: 'var(--pv-line-strong)' }} />
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                {title && <h2 className="pv-h2 truncate">{title}</h2>}
                {subtitle && <p className="pv-body mt-1" style={{ color: 'var(--pv-ink-2)' }}>{subtitle}</p>}
              </div>
              {showClose && (
                <button onClick={onClose} aria-label="Close" className="pv-press -mr-1 flex h-9 w-9 flex-none items-center justify-center rounded-full" style={{ background: 'var(--pv-surface-2)', color: 'var(--pv-ink-2)' }}>
                  <X size={18} />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Body (scrolls internally) */}
        <div className="pv-no-scrollbar min-h-0 flex-1 overflow-y-auto px-6 pt-4" style={{ paddingBottom: footer ? 8 : 'max(24px, env(safe-area-inset-bottom))' }}>
          {children}
        </div>

        {/* Footer (sticky, always visible) */}
        {footer && (
          <div className="flex-none px-6 pb-[max(20px,env(safe-area-inset-bottom))] pt-3" style={{ background: 'var(--pv-surface)', boxShadow: '0 -8px 20px -16px rgba(16,18,27,0.4)' }}>
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
