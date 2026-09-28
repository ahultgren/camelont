/** Relative tempo gap between neighbours' set tempos: |a − b| / max(a, b). */
export function tempoGap(a: number, b: number): number {
  const max = Math.max(a, b)
  return max <= 0 ? 0 : Math.abs(a - b) / max
}

const EPSILON = 1e-9
const isTempo = (bpm: number) => bpm > 0 && Number.isFinite(bpm)

/**
 * The set tempo, as a function of a track's listed BPM: halved or doubled into the
 * narrowest one-octave window that holds the whole set, placed at the octave most of
 * the set is listed in (the slower one on a tie). The window is cut at the widest gap
 * between the set's tempos on the octave circle (log2 BPM mod 1). It depends on the
 * set, not the order, so the solver can cost transitions and the arc per track.
 */
export function setTempo(bpms: readonly number[]): (bpm: number) => number {
  const listed = bpms.filter(isTempo)
  const tones = [
    ...new Set(
      listed.map((bpm) => {
        const log = Math.log2(bpm)
        return log - Math.floor(log)
      }),
    ),
  ].sort((a, b) => a - b)
  const lowest = tones[0]
  const highest = tones[tones.length - 1]
  if (lowest === undefined || highest === undefined) return (bpm) => bpm

  // The window starts just after the widest gap; the wrap-around gap is the default.
  let start = lowest
  let widest = lowest + 1 - highest
  for (let i = 1; i < tones.length; i++) {
    const tone = tones[i] ?? 0
    const gap = tone - (tones[i - 1] ?? 0)
    if (gap > widest) {
      widest = gap
      start = tone
    }
  }
  const octave = (bpm: number) => Math.floor(Math.log2(bpm) - start + EPSILON)

  const counts = new Map<number, number>()
  for (const bpm of listed) counts.set(octave(bpm), (counts.get(octave(bpm)) ?? 0) + 1)
  let home = 0
  let most = 0
  for (const [o, n] of counts) {
    if (n > most || (n === most && o < home)) {
      most = n
      home = o
    }
  }
  return (bpm) => (isTempo(bpm) ? bpm * 2 ** (home - octave(bpm)) : bpm)
}
