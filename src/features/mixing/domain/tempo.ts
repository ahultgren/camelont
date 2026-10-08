/**
 * Relative tempo gap between neighbours' saved BPMs: |a − b| / max(a, b). Half and
 * double time are never matched; the user halves or doubles a BPM with an override.
 */
export function tempoGap(a: number, b: number): number {
  const max = Math.max(a, b)
  return max <= 0 ? 0 : Math.abs(a - b) / max
}
