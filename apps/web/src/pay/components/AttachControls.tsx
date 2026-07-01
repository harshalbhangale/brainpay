/**
 * AttachControls — the shared "+" attach button and preview tray used by every
 * Pal composer. Accepts images + PDFs, shows image thumbnails and PDF chips,
 * a spinner while a file is being read, and a remove control on each item.
 */
import { useRef } from 'react'
import { Plus, X, FileText, AlertCircle } from 'lucide-react'
import { ACCEPT_ATTACHMENTS, type Attachment } from '../lib/attachments'

/** The round "+" control that opens the native image/PDF picker. */
export function AttachButton({ onFiles, disabled, label = 'Attach photos or PDFs' }: {
  onFiles: (files: FileList | null) => void
  disabled?: boolean
  label?: string
}) {
  const input = useRef<HTMLInputElement>(null)
  return (
    <>
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={disabled}
        aria-label={label}
        className="pv-press flex h-10 w-10 shrink-0 items-center justify-center rounded-full disabled:opacity-40"
        style={{ background: 'var(--pv-surface-2)', color: 'var(--pv-ink-2)' }}
      >
        <Plus size={18} strokeWidth={2.6} />
      </button>
      <input
        ref={input}
        type="file"
        accept={ACCEPT_ATTACHMENTS}
        multiple
        className="hidden"
        onChange={(e) => { onFiles(e.target.files); e.target.value = '' }}
      />
    </>
  )
}

/** The horizontal strip of attached items shown above the composer. */
export function AttachTray({ items, onRemove }: { items: Attachment[]; onRemove: (id: string) => void }) {
  if (items.length === 0) return null
  return (
    <div className="pv-rise pv-no-scrollbar mb-2 flex gap-2 overflow-x-auto">
      {items.map((it) => (
        <div
          key={it.id}
          className="relative flex-none overflow-hidden rounded-2xl"
          style={{ boxShadow: 'var(--pv-shadow-sm)', border: '1px solid var(--pv-line)' }}
        >
          {it.kind === 'image' ? (
            <div className="h-16 w-16">
              {it.dataUrl
                ? <img src={it.dataUrl} alt={it.name} className="h-full w-full object-cover" style={{ opacity: it.status === 'ready' ? 1 : 0.5 }} />
                : <div className="h-full w-full animate-pulse" style={{ background: 'var(--pv-surface-2)' }} />}
            </div>
          ) : (
            <div className="flex h-16 w-40 items-center gap-2 px-2.5" style={{ background: 'var(--pv-surface)' }}>
              <span className="flex h-9 w-9 flex-none items-center justify-center rounded-lg" style={{ background: it.status === 'error' ? 'var(--pv-neg-soft)' : 'var(--pv-lilac)', color: it.status === 'error' ? 'var(--pv-neg)' : 'var(--pv-lilac-ink)' }}>
                {it.status === 'error' ? <AlertCircle size={17} /> : <FileText size={17} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[11px] font-bold" style={{ color: 'var(--pv-ink)' }}>{it.name}</span>
                <span className="block truncate text-[10px] font-semibold" style={{ color: it.status === 'error' ? 'var(--pv-neg)' : 'var(--pv-ink-3)' }}>
                  {it.status === 'loading' ? 'Reading…' : it.status === 'error' ? (it.error ?? 'Unreadable') : `PDF${it.pages ? ` · ${it.pages}p` : ''}`}
                </span>
              </span>
            </div>
          )}

          {it.status === 'loading' && (
            <span className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.35)' }}>
              <span className="h-5 w-5 animate-spin rounded-full" style={{ border: '2px solid var(--pv-surface-3)', borderTopColor: 'var(--pv-accent)' }} />
            </span>
          )}

          <button
            onClick={() => onRemove(it.id)}
            aria-label={`Remove ${it.name}`}
            className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full"
            style={{ background: 'rgba(11,12,15,0.62)', color: '#fff' }}
          >
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  )
}
