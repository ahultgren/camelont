/**
 * Relative tempo gap between neighbours, tolerant of half/double time:
 * min(|a − b|, |2a − b|, |a − 2b|) / max(a, b).
 */
export function tempoGap(a: number, b: number): number {
  const max = Math.max(a, b)
  if (max <= 0) return 0
  return Math.min(Math.abs(a - b), Math.abs(2 * a - b), Math.abs(a - 2 * b)) / max
}
