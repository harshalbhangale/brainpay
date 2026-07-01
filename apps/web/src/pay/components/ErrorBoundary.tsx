/**
 * ErrorBoundary — the app's safety net (scoped to `.pv`).
 * ───────────────────────────────────────────────────────────────────────────
 * BrainPal had NO error boundaries, so any runtime throw — a WebGL hiccup in an
 * avatar, an unexpected data shape, or (most commonly) a *stale lazy chunk*
 * after a fresh deploy — unmounted the whole React tree to a blank white screen.
 * That is exactly what "MoneyPal is always empty" and "the camera gives a blank
 * screen" looked like.
 *
 * This boundary:
 *   1. Catches render/runtime errors in its subtree and shows a calm, on-brand
 *      fallback with a "Try again" (soft reset) and "Reload app" — never a blank.
 *   2. Detects *dynamic import* failures (stale chunk hashes after a redeploy)
 *      and reloads the page ONCE automatically so the user silently recovers.
 *   3. Resets itself when `resetKey` changes (e.g. switching Pal/section), so a
 *      crash in one surface never sticks to the next.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

/** True for the classic "stale chunk after deploy" dynamic-import failures. */
function isChunkLoadError(err: unknown): boolean {
  const msg = err instanceof Error ? `${err.name} ${err.message}` : String(err)
  return /dynamically imported module|Loading chunk|ChunkLoadError|Importing a module script failed|error loading dynamically imported/i.test(msg)
}

const RELOAD_FLAG = 'brainpal.chunk-reload'

type Props = {
  children: ReactNode
  /** When this value changes, the boundary clears any caught error. */
  resetKey?: string | number
  /** Optional label shown in the fallback ("MoneyPal", "the camera", …). */
  label?: string
}
type State = { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidUpdate(prev: Props) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null })
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // A stale lazy chunk (common right after a deploy): reload once to fetch the
    // new manifest, guarding against a reload loop with a session flag.
    if (isChunkLoadError(error) && !sessionStorage.getItem(RELOAD_FLAG)) {
      sessionStorage.setItem(RELOAD_FLAG, '1')
      window.location.reload()
      return
    }
    // eslint-disable-next-line no-console
    console.error('[BrainPal] Uncaught error in', this.props.label ?? 'app', error, info.componentStack)
  }

  private reset = () => {
    sessionStorage.removeItem(RELOAD_FLAG)
    this.setState({ error: null })
  }

  private reload = () => {
    sessionStorage.removeItem(RELOAD_FLAG)
    window.location.reload()
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    // A chunk error mid-reload: show a neutral loading state, not an alarm.
    if (isChunkLoadError(error)) {
      return (
        <div className="pv flex min-h-0 flex-1 items-center justify-center p-8">
          <div className="h-10 w-10 animate-spin rounded-full" style={{ border: '3px solid var(--pv-surface-3)', borderTopColor: 'var(--pv-accent)' }} />
        </div>
      )
    }

    const what = this.props.label ? `${this.props.label} hit a snag` : 'Something went wrong'
    return (
      <div className="pv flex min-h-0 flex-1 items-center justify-center p-6">
        <div className="pv-glass pv-hairline pv-pop flex w-full max-w-sm flex-col items-center gap-3 rounded-[var(--pv-r-lg)] p-6 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full" style={{ background: 'var(--pv-neg-soft)', color: 'var(--pv-neg)' }}>
            <AlertTriangle size={24} strokeWidth={2.4} />
          </span>
          <div className="pv-title text-base">{what}</div>
          <p className="text-sm font-semibold" style={{ color: 'var(--pv-ink-3)' }}>
            It's not you — something didn't load right. Give it another go.
          </p>
          <div className="mt-1 flex w-full gap-2">
            <button onClick={this.reset} className="pv-press pv-glass-soft flex-1 rounded-full py-2.5 text-sm font-bold">Try again</button>
            <button onClick={this.reload} className="pv-press-lg pv-sheen flex flex-1 items-center justify-center gap-1.5 rounded-full py-2.5 text-sm font-extrabold" style={{ backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)', boxShadow: 'var(--pv-shadow-pop)' }}>
              <RefreshCw size={15} /> Reload
            </button>
          </div>
        </div>
      </div>
    )
  }
}
