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

/** `bpm` halved or doubled, the way the gap matches it, until it matches `reference` as is. */
function foldTo(reference: number, bpm: number): number {
  let value = bpm
  for (let i = 0; i < 8; i++) {
    const { factor } = tempoMatch(reference, value)
    if (factor === 1) break
    value *= factor
  }
  return value
}

/**
 * The set's tempo octave, as a function from a track's BPM to its set tempo: the BPM
 * halved or doubled into the octave most of the set is listed in (the slower one on a
 * tie). It depends on the set, not the order, so the arc can score a track at any
 * position.
 */
export function setTempo(bpms: readonly number[]): (bpm: number) => number {
  const candidates = [...new Set(bpms)].filter((b) => b > 0).sort((a, b) => a - b)
  let reference: number | null = null
  let kept = -1
  for (const r of candidates) {
    const n = bpms.filter((b) => foldTo(r, b) === b).length
    if (n > kept) {
      kept = n
      reference = r
    }
  }
  const ref = reference
  return ref === null ? (bpm) => bpm : (bpm) => foldTo(ref, bpm)
}

/**
 * BPM per position as the tempo comparison saw it: each track halved or doubled the way
 * it was matched to its predecessor, so neighbours sit where the gap measured them.
 * The whole line is then shifted by octaves so most tracks sit at their set tempo, the
 * scale the arc uses.
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
  const fold = setTempo(bpms)
  const counts = new Map<number, number>()
  bpms.forEach((bpm, i) => {
    const shift = fold(bpm) / (bpm * (scales[i] ?? 1))
    counts.set(shift, (counts.get(shift) ?? 0) + 1)
  })
  let base = 1
  for (const [s, n] of counts) {
    const best = counts.get(base) ?? 0
    if (n > best || (n === best && Math.abs(Math.log2(s)) < Math.abs(Math.log2(base)))) base = s
  }
  return bpms.map((bpm, i) => bpm * (scales[i] ?? 1) * base)
}
