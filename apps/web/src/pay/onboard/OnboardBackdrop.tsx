/**
 * OnboardBackdrop — the shared "Linear-glass" ambience behind every onboarding
 * step. One element paints the drifting pv-mesh field (the cool signature blobs
 * that quietly move), a second lays a soft top tint in the current context's
 * accent (per card / per companion), and a third fades the bottom back to the
 * calm canvas so the controls always sit on quiet ground.
 *
 * Presentational only — no state, no logic. Drop it as the FIRST child of a
 * `relative overflow-hidden` step root; real content goes in a higher z layer.
 */
export function OnboardBackdrop({ accent }: { accent?: string }) {
  return (
    <>
      {/* Signature drifting mesh — the Linear ambient field. */}
      <div className="pv-mesh" aria-hidden />

      {/* Per-context accent bloom at the very top (subtle, ~22% tint). */}
      {accent && (
        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-0 h-1/2"
          aria-hidden
          style={{ background: `radial-gradient(74% 58% at 50% -6%, color-mix(in srgb, ${accent} 22%, transparent), transparent 72%)` }}
        />
      )}

      {/* Bottom settle — controls read on calm canvas, never on a busy blob. */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-2/5"
        aria-hidden
        style={{ background: 'linear-gradient(180deg, transparent, color-mix(in srgb, var(--pv-bg) 90%, transparent) 84%)' }}
      />
    </>
  )
}
