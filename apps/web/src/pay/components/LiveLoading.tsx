/**
 * LiveLoading — the fallback shown while a lazily-imported live surface
 * (LiveSession / RunwayStage) fetches its chunk. A calm branded spinner instead
 * of a blank black screen; if the chunk is stale after a deploy, the surrounding
 * ErrorBoundary reloads once to recover.
 */
export function LiveLoading({ label = 'Starting live session…' }: { label?: string }) {
  return (
    <div
      className="pv fixed inset-0 z-50 flex flex-col items-center justify-center gap-3"
      style={{ background: 'radial-gradient(900px 520px at 50% -8%, var(--pv-accent-soft), transparent 60%), linear-gradient(180deg, var(--pv-bg) 0%, var(--pv-bg-2) 100%)' }}
    >
      <div className="h-10 w-10 animate-spin rounded-full" style={{ border: '3px solid var(--pv-surface-3)', borderTopColor: 'var(--pv-accent)' }} />
      <span className="text-sm font-bold" style={{ color: 'var(--pv-ink-3)' }}>{label}</span>
    </div>
  )
}
