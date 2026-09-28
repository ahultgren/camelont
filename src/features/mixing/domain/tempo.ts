/**
 * How the tempo comparison matches `b` to `a`: as is, halved or doubled, and the
 * resulting relative gap min(|a − b|, |2a − b|, |a − 2b|) / max(a, b).
 */
function tempoMatch(a: number, b: number): { factor: 1 | 0.5 | 2; gap: number } {
  const max = Math.max(a, b)
  if (max <= 0) return { factor: 1, gap: 0 }
  const same = Math.abs(a - b)
  const halved = Math.abs(2 * a - b)
  const doubled = Math.abs(a - 2 * b)
  const min = Math.min(same, halved, doubled)
  const factor = min === same ? 1 : min === halved ? 0.5 : 2
  return { factor, gap: min / max }
}

/** Relative tempo gap between neighbours, tolerant of half/double time. */
export const tempoGap = (a: number, b: number): number => tempoMatch(a, b).gap

/**
 * BPM per position as the tempo comparison saw it: each track halved or doubled the way
 * it was matched to its predecessor, so neighbours sit where the gap measured them.
 * The whole line is then shifted by octaves so most tracks show their listed BPM.
 */
export function tempoLine(bpms: readonly number[]): number[] {
  const scales: number[] = []
  bpms.forEach((bpm, i) => {
    const prev = bpms[i - 1]
    const prevScale = scales[i - 1]
    scales.push(
      prev === undefined || prevScale === undefined ? 1 : prevScale * tempoMatch(prev, bpm).factor,
    )
  })
  const counts = new Map<number, number>()
  for (const s of scales) counts.set(s, (counts.get(s) ?? 0) + 1)
  let base = 1
  for (const [s, n] of counts) {
    const best = counts.get(base) ?? 0
    if (n > best || (n === best && Math.abs(Math.log2(s)) < Math.abs(Math.log2(base)))) base = s
  }
  return bpms.map((bpm, i) => (bpm * (scales[i] ?? 1)) / base)
}
