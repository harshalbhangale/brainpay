import { useState } from 'react'
import { X, Mic } from 'lucide-react'
import { loadVoiceHistory, clearVoiceHistory, type VoiceLine } from '../lib/voiceHistory'

/** Full-screen viewer of the user's spoken (camera/voice) conversations with the companion. */
export function ConversationHistory({ onClose }: { onClose: () => void }) {
  const [lines, setLines] = useState<VoiceLine[]>(() => loadVoiceHistory())

  const groups: { day: string; items: VoiceLine[] }[] = []
  for (const l of lines) {
    const day = new Date(l.at).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
    const last = groups[groups.length - 1]
    if (last && last.day === day) last.items.push(l)
    else groups.push({ day, items: [l] })
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-canvas">
      <div
        className="flex items-center justify-between border-b border-border px-4 py-3"
        style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
      >
        <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full bg-surface2 text-muted active:scale-95" aria-label="Back">
          <X size={18} />
        </button>
        <h1 className="flex items-center gap-2 text-base font-extrabold text-ink">
          <Mic size={16} className="text-accent" /> Voice history
        </h1>
        <button
          onClick={() => {
            clearVoiceHistory()
            setLines([])
          }}
          className="text-sm font-semibold text-danger disabled:opacity-40"
          disabled={lines.length === 0}
        >
          Clear
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {lines.length === 0 ? (
          <div className="mt-16 text-center text-sm text-muted">
            No voice conversations yet.
            <br />
            Tap the camera or voice button and talk to your companion — it'll show up here.
          </div>
        ) : (
          groups.map((g, gi) => (
            <div key={gi} className="mb-5">
              <div className="mb-2 text-center text-[11px] font-bold uppercase tracking-wide text-muted">{g.day}</div>
              <div className="space-y-2">
                {g.items.map((l, i) => (
                  <div key={i} className={l.role === 'you' ? 'text-right' : ''}>
                    <span
                      className={`inline-block max-w-[85%] rounded-2xl px-3.5 py-2 text-sm ${
                        l.role === 'you' ? 'bg-accent text-on-accent' : 'bg-surface text-ink ring-1 ring-border'
                      }`}
                    >
                      {l.text}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
        <div className="h-[env(safe-area-inset-bottom)]" />
      </div>
    </div>
  )
}
